// main.js
import { getSponsors } from "./sponsors.js";

let isLiveMode = false;

/* =============== DOM RIFERIMENTI HUD =============== */
const canvas = document.getElementById("view3d");
const hudLap = document.getElementById("hudLap");
const hudStatusDot = document.getElementById("hudStatusDot");
const hudStatusText = document.getElementById("hudStatusText");
const hudLeaderboard = document.getElementById("hudLeaderboard");
const hudEvents = document.getElementById("hudEvents");

/* =============== STATO GARA =============== */
let scene, camera, renderer;
let ambient, dirLight, ground;
let trackSpline = null;
let trackMesh = null;
let sponsorMeshes = [];

const drivers = [
  { code: "HAM", color: "#00d2be" },
  { code: "VER", color: "#1e5bc6" },
  { code: "LEC", color: "#e10600" },
  { code: "NOR", color: "#ff8700" },
  { code: "SAI", color: "#e10600" },
  { code: "RUS", color: "#00d2be" },
  { code: "ALO", color: "#006f62" },
  { code: "PER", color: "#1e5bc6" }
];

let cars = [];
let carStates = [];
let totalLaps = 10;
let currentLap = 0;
let running = false;
let lastTime = 0;

let cameraMode = "tv"; // "tv" | "onboard"
let cameraTimer = 0;
let nextCameraSwitch = 10;
let onboardTimer = 0;

let replayFrames = [];
let replayPlaying = false;
let replayIndex = 0;
const REPLAY_SECONDS = 5;
const REPLAY_FPS = 30;

let lastIncidentCar = null;
let lastOvertakePair = null;

/* =============== EDITOR CIRCUITO =============== */
let drawing = false;
let drawPoints = []; // in coordinate canvas (0..1)
let trackReady = false;

/* =============== UTILITY HUD =============== */
function setStatus(text, color = "green") {
  hudStatusText.textContent = text;
  let c = "#00c46b";
  if (color === "yellow") c = "#ffd800";
  if (color === "red") c = "#ff3b3b";
  hudStatusDot.style.background = c;
  hudStatusDot.style.boxShadow = "0 0 6px " + c;
}

function addHudEvent(label, detail, tag) {
  const el = document.createElement("div");
  el.className = "hud-event";
  el.innerHTML = `
    <div>
      <div class="hud-event-label">${label}</div>
      <div class="hud-event-detail">${detail}</div>
    </div>
    <div class="hud-event-tag">${tag}</div>
  `;
  hudEvents.prepend(el);
  while (hudEvents.children.length > 5) hudEvents.removeChild(hudEvents.lastChild);
  setTimeout(() => {
    if (el.parentNode === hudEvents) hudEvents.removeChild(el);
  }, 6000);
}

function updateLeaderboard() {
  const sorted = [...carStates].sort((a, b) => {
    if (a.lap !== b.lap) return b.lap - a.lap;
    return b.progress - a.progress;
  });
  const leader = sorted[0];
  sorted.forEach((c, i) => {
    if (i === 0) c.gap = "LEAD";
    else {
      const lapDiff = leader.lap - c.lap;
      if (lapDiff > 0) c.gap = lapDiff + "L";
      else {
        const diff = leader.progress - c.progress;
        c.gap = "+" + (Math.abs(diff) * 20).toFixed(1) + "s";
      }
    }
  });

  hudLeaderboard.innerHTML = "";
  sorted.forEach((c, i) => {
    const item = document.createElement("div");
    item.className = "hud-leaderboard-item";
    item.innerHTML = `
      <div class="hud-pos">${i + 1}</div>
      <div class="hud-team-bar" style="background:${c.driver.color};"></div>
      <div class="hud-driver-code">${c.driver.code}</div>
      <div class="hud-gap">${c.gap}</div>
    `;
    hudLeaderboard.appendChild(item);
  });
}

/* =============== THREE.JS SETUP =============== */
function initThree() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  camera.position.set(0, 40, 70);

  ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(50, 80, 30);
  scene.add(dirLight);

  const groundGeo = new THREE.PlaneGeometry(200, 200);
  const groundMat = new THREE.MeshPhongMaterial({
    color: 0x050509,
    side: THREE.DoubleSide
  });
  ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  createDefaultTrack();
  createCars();

  window.addEventListener("resize", resize);
  resize();
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

/* =============== TRACK & SPONSOR =============== */
function createDefaultTrack() {
  const R = 40;
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
  }
  buildTrackFromPoints(pts);
}

function buildTrackFromPoints(points) {
  if (trackMesh) {
    scene.remove(trackMesh);
    trackMesh.geometry.dispose();
    trackMesh.material.dispose();
    trackMesh = null;
  }
  sponsorMeshes.forEach(m => {
    scene.remove(m);
    if (m.material && m.material.map) m.material.map.dispose();
    if (m.material) m.material.dispose();
    if (m.geometry) m.geometry.dispose();
  });
  sponsorMeshes = [];

  if (points.length < 4) {
    trackSpline = null;
    trackReady = false;
    return;
  }

  trackSpline = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.1);
  const tubeGeo = new THREE.TubeGeometry(trackSpline, 300, 1.6, 16, true);
  const tubeMat = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    emissive: 0x111111
  });
  trackMesh = new THREE.Mesh(tubeGeo, tubeMat);
  scene.add(trackMesh);

  placeSponsorsAlongTrack();
  trackReady = true;
}

function createSponsorBillboard(emoji, name) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#050509";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 40px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, canvas.width / 2, canvas.height / 2 - 20);
  ctx.font = "bold 26px system-ui";
  ctx.fillStyle = "#ff0000";
  ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 20);
  const tex = new THREE.CanvasTexture(canvas);
  const geo = new THREE.PlaneGeometry(6, 2.5);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide
  });
  return new THREE.Mesh(geo, mat);
}

function placeSponsorsAlongTrack() {
  if (!trackSpline) return;
  const sponsors = getSponsors();
  if (!sponsors || sponsors.length === 0) return;

  const count = Math.min(12, sponsors.length * 2);
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const pos = trackSpline.getPointAt(t);
    const tangent = trackSpline.getTangentAt(t);
    const normal = new THREE.Vector3(0, 1, 0).cross(tangent).normalize();
    const offset = normal.multiplyScalar(8 + (i % 2 === 0 ? 2 : -2));
    const s = sponsors[i % sponsors.length];
    const board = createSponsorBillboard(s.emoji, s.name);
    board.position.copy(pos.clone().add(offset));
    board.lookAt(pos.clone().add(new THREE.Vector3(0, 5, 0)));
    scene.add(board);
    sponsorMeshes.push(board);
  }
}

/* =============== CARS & GARA =============== */
function createCars() {
  const geo = new THREE.BoxGeometry(1.4, 0.5, 3.2);
  cars = [];
  carStates = [];

  const usedDrivers = drivers.slice(0, 8); // max 8 per semplicità
  usedDrivers.forEach((d, i) => {
    const mat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(d.color),
      emissive: 0x111111
    });
    const car = new THREE.Mesh(geo, mat);
    scene.add(car);
    cars.push(car);
    carStates.push({
      driver: d,
      progress: i / usedDrivers.length,
      speed: 0.16 + Math.random() * 0.06,
      lap: 0,
      status: "running",
      gap: 0
    });
  });
}

function resetRaceState() {
  running = false;
  replayPlaying = false;
  replayFrames = [];
  replayIndex = 0;
  currentLap = 0;
  lastIncidentCar = null;
  lastOvertakePair = null;
  hudLap.textContent = `0 / ${totalLaps}`;
  setStatus("Pre-race", "green");
  hudEvents.innerHTML = "";
  hudLeaderboard.innerHTML = "";
}

function startRaceInternal() {
  if (!trackSpline) return;
  resetRaceState();
  running = true;
  setStatus("Green flag", "green");
  addHudEvent("Race start", "Lights out and away we go!", "START");
}

/* =============== REPLAY =============== */
function pushReplayFrame(dt) {
  if (!running) return;
  const frame = {
    dt,
    cars: cars.map(c => ({
      pos: c.position.clone(),
      quat: c.quaternion.clone()
    }))
  };
  replayFrames.push(frame);

  let totalTime = 0;
  for (let i = replayFrames.length - 1; i >= 0; i--) {
    totalTime += replayFrames[i].dt;
    if (totalTime > REPLAY_SECONDS) {
      replayFrames = replayFrames.slice(i);
      break;
    }
  }
}

function startReplay(label) {
  if (replayFrames.length === 0) return;
  replayPlaying = true;
  replayIndex = 0;
  running = false;
  setStatus("Replay", "yellow");
  addHudEvent("Replay", label, "REPLAY");
}

function stepReplay(delta) {
  if (!replayPlaying) return;
  if (replayIndex >= replayFrames.length) {
    replayPlaying = false;
    running = true;
    setStatus("Live", "green");
    return;
  }
  const frame = replayFrames[replayIndex];
  frame.cars.forEach((c, i) => {
    if (!cars[i]) return;
    cars[i].position.copy(c.pos);
    cars[i].quaternion.copy(c.quat);
  });
  replayIndex++;
}

/* =============== CAMERA TV & ONBOARD =============== */
function getCarDirection(state) {
  if (!trackSpline) return new THREE.Vector3(0, 0, 1);
  return trackSpline.getTangentAt(state.progress).clone().normalize();
}

function getLeaderCarState() {
  const sorted = [...carStates].sort((a, b) => {
    if (a.lap !== b.lap) return b.lap - a.lap;
    return b.progress - a.progress;
  });
  return sorted[0];
}

function cinematicCameraFollow(targetPos, targetDir, delta) {
  const distance = 14;
  const height = 7;
  const smooth = 0.06;

  const offset = targetDir.clone().multiplyScalar(-distance);
  offset.y = height;

  const desiredPos = targetPos.clone().add(offset);
  camera.position.lerp(desiredPos, smooth);

  const lookAtPos = targetPos.clone();
  lookAtPos.y += 1.5;
  camera.lookAt(lookAtPos);
}

function onboardCameraFollow(targetPos, targetDir, delta) {
  const offset = targetDir.clone().multiplyScalar(-3);
  offset.y = 1.4;
  const desiredPos = targetPos.clone().add(offset);
  camera.position.lerp(desiredPos, 0.15);

  const lookAhead = targetPos.clone().add(targetDir.clone().multiplyScalar(10));
  lookAhead.y += 1.2;
  camera.lookAt(lookAhead);
}

function findClosestBattle() {
  const sorted = [...carStates].sort((a, b) => {
    if (a.lap !== b.lap) return b.lap - a.lap;
    return b.progress - a.progress;
  });
  let bestPair = null;
  let bestGap = Infinity;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a.status !== "running" || b.status !== "running") continue;
    const gap = Math.abs(a.progress - b.progress);
    if (gap < 0.03 && gap < bestGap) {
      bestGap = gap;
      bestPair = { a, b };
    }
  }
  return bestPair;
}

function followIncidentCamera(state, delta) {
  const idx = carStates.indexOf(state);
  if (idx < 0) return;
  const car = cars[idx];
  const pos = car.position.clone();
  const dir = getCarDirection(state);
  cinematicCameraFollow(pos, dir, delta);
}

function followOvertakeCamera(pair, delta) {
  const idxA = carStates.indexOf(pair.a);
  const idxB = carStates.indexOf(pair.b);
  if (idxA < 0 || idxB < 0) return;
  const pos = cars[idxA].position.clone().add(cars[idxB].position).multiplyScalar(0.5);
  const dir = getCarDirection(pair.a);
  cinematicCameraFollow(pos, dir, delta);
}

function followBattleCamera(battle, delta) {
  followOvertakeCamera(battle, delta);
}

function updateCamera(delta) {
  if (!trackSpline || cars.length === 0) return;

  cameraTimer += delta;
  if (cameraMode === "onboard") {
    onboardTimer += delta;
    if (onboardTimer > 6) {
      cameraMode = "tv";
      onboardTimer = 0;
    }
  }

  if (replayPlaying) {
    // durante il replay la camera segue il leader del frame
    const leader = getLeaderCarState();
    const idx = carStates.indexOf(leader);
    const car = cars[idx];
    const pos = car.position.clone();
    const dir = getCarDirection(leader);
    cinematicCameraFollow(pos, dir, delta);
    return;
  }

  if (lastIncidentCar) {
    followIncidentCamera(lastIncidentCar, delta);
    return;
  }

  if (lastOvertakePair) {
    followOvertakeCamera(lastOvertakePair, delta);
    return;
  }

  const battle = findClosestBattle();
  if (battle) {
    followBattleCamera(battle, delta);
    return;
  }

  if (cameraTimer > nextCameraSwitch) {
    cameraTimer = 0;
    nextCameraSwitch = 10 + Math.random() * 10;
    if (Math.random() < 0.25) {
      cameraMode = "onboard";
      onboardTimer = 0;
    } else {
      cameraMode = "tv";
    }
  }

  const leader = getLeaderCarState();
  const idx = carStates.indexOf(leader);
  const car = cars[idx];
  const pos = car.position.clone();
  const dir = getCarDirection(leader);

  if (cameraMode === "tv") {
    cinematicCameraFollow(pos, dir, delta);
  } else {
    onboardCameraFollow(pos, dir, delta);
  }
}

/* =============== SIMULAZIONE GARA =============== */
function updateRace(delta) {
  if (!running || !trackSpline) return;

  const prevOrder = [...carStates].map((c, i) => ({
    i,
    lap: c.lap,
    prog: c.progress
  }));
  prevOrder.sort((a, b) => {
    if (a.lap !== b.lap) return b.lap - a.lap;
    return b.prog - a.prog;
  });

  carStates.forEach((c, i) => {
    if (c.status !== "running") return;
    const random = (Math.random() - 0.5) * 0.02;
    c.progress += (c.speed + random) * delta;
    if (c.progress >= 1) {
      c.progress -= 1;
      c.lap++;
      currentLap = Math.max(currentLap, c.lap);
      hudLap.textContent = `${currentLap} / ${totalLaps}`;
      if (c.lap >= totalLaps) {
        running = false;
        setStatus("Chequered flag", "red");
        addHudEvent("Finish", `${c.driver.code} vince la gara!`, "WIN");
      }
    }

    const pos = trackSpline.getPointAt(c.progress);
    const tan = trackSpline.getTangentAt(c.progress);
    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3().crossVectors(up, tan).normalize();
    const angle = Math.acos(up.dot(tan));
    const m = new THREE.Matrix4().makeRotationAxis(axis, angle);
    cars[i].position.copy(pos);
    cars[i].position.y = 0.6;
    cars[i].quaternion.setFromRotationMatrix(m);
    cars[i].rotateY(Math.PI / 2);
  });

  // incidenti casuali
  if (Math.random() < 0.25 * delta) {
    const runningCars = carStates.filter(c => c.status === "running");
    if (runningCars.length > 0) {
      const c = runningCars[Math.floor(Math.random() * runningCars.length)];
      c.status = "incident";
      c.speed *= 0.2;
      lastIncidentCar = c;
      addHudEvent("INCIDENT!", `${c.driver.code} coinvolto in un incidente`, "INC");
      startReplay(`Incidente ${c.driver.code}`);
    }
  }

  const newOrder = [...carStates].map((c, i) => ({
    i,
    lap: c.lap,
    prog: c.progress
  }));
  newOrder.sort((a, b) => {
    if (a.lap !== b.lap) return b.lap - a.lap;
    return b.prog - a.prog;
  });

  for (let pos = 0; pos < newOrder.length; pos++) {
    if (newOrder[pos].i !== prevOrder[pos].i) {
      const overtaker = carStates[newOrder[pos].i].driver.code;
      lastOvertakePair = {
        a: carStates[newOrder[pos].i],
        b: carStates[prevOrder[pos].i]
      };
      addHudEvent("OVERTAKE!", `${overtaker} effettua un sorpasso!`, "OVT");
      startReplay(`Sorpasso ${overtaker}`);
      break;
    }
  }

  updateLeaderboard();
}

/* =============== LOOP =============== */
function animate(t) {
  requestAnimationFrame(animate);
  if (!lastTime) lastTime = t;
  const dt = (t - lastTime) / 1000;
  lastTime = t;

  if (replayPlaying) {
    stepReplay(dt);
  } else {
    if (running) {
      updateRace(dt);
      pushReplayFrame(dt);
    }
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

/* =============== EDITOR CIRCUITO INPUT =============== */
function initCircuitEditor() {
  const overlay = document.getElementById("circuitEditorOverlay");
  if (!overlay) return;

  const active = !isLiveMode;

  function getNormPos(e) {
    const rect = canvas.getBoundingClientRect();
    let x, y;
    if (e.touches && e.touches.length > 0) {
      x = e.touches[0].clientX;
      y = e.touches[0].clientY;
    } else {
      x = e.clientX;
      y = e.clientY;
    }
    return {
      x: (x - rect.left) / rect.width,
      y: (y - rect.top) / rect.height
    };
  }

  function pointerDown(e) {
    if (!active) return;
    drawing = true;
    drawPoints = [];
    const p = getNormPos(e);
    drawPoints.push(p);
  }

  function pointerMove(e) {
    if (!active || !drawing) return;
    const p = getNormPos(e);
    drawPoints.push(p);
  }

  function pointerUp() {
    if (!active) return;
    drawing = false;
    if (drawPoints.length < 8) return;

    const pts3D = [];
    const rect = canvas.getBoundingClientRect();
    const scale = 80;
    drawPoints.forEach(p => {
      const x = (p.x - 0.5) * scale;
      const z = (p.y - 0.5) * scale;
      pts3D.push(new THREE.Vector3(x, 0, z));
    });
    buildTrackFromPoints(pts3D);
  }

  canvas.addEventListener("mousedown", pointerDown);
  canvas.addEventListener("mousemove", pointerMove);
  window.addEventListener("mouseup", pointerUp);

  canvas.addEventListener("touchstart", pointerDown, { passive: false });
  canvas.addEventListener("touchmove", pointerMove, { passive: false });
  window.addEventListener("touchend", pointerUp);
}

/* =============== API PER RACE-CONTROL =============== */
export function startRace(config) {
  if (config && config.laps) {
    totalLaps = Math.max(1, Math.min(100, config.laps));
  }
  hudLap.textContent = `0 / ${totalLaps}`;
  startRaceInternal();
}

export function clearTrack() {
  buildTrackFromPoints([]);
  createDefaultTrack();
}

export function setCameraMode(mode) {
  if (mode === "tv" || mode === "onboard") {
    cameraMode = mode;
    onboardTimer = 0;
  }
}

export function forceReplay() {
  startReplay("Replay manuale");
}

export function notifyNewSponsorAdded() {
  placeSponsorsAlongTrack();
}

/* =============== INIT PRINCIPALE =============== */
export function initMain({ isLive }) {
  isLiveMode = !!isLive;
  initThree();
  initCircuitEditor();
  resetRaceState();

  if (isLiveMode) {
    startRaceInternal();
  }

  requestAnimationFrame(animate);
  }
