// race-control.js
import { startRace, clearTrack, setCameraMode, forceReplay, notifyNewSponsorAdded } from "./main.js";
import { addSponsor, isBrandReal } from "./sponsors.js";

export function initRaceControl() {

  /* ==========================
     RIFERIMENTI DOM
  ========================== */
  const startRaceBtn = document.getElementById("startRaceBtn");
  const raceModeSelect = document.getElementById("raceModeSelect");
  const lapsInput = document.getElementById("lapsInput");

  const clearTrackBtn = document.getElementById("clearTrackBtn");

  const sponsorEmojiInput = document.getElementById("sponsorEmojiInput");
  const sponsorNameInput = document.getElementById("sponsorNameInput");
  const addSponsorBtn = document.getElementById("addSponsorBtn");

  const cameraModeBtn = document.getElementById("cameraModeBtn");
  const forceReplayBtn = document.getElementById("forceReplayBtn");

  const eventsEl = document.getElementById("events");

  /* ==========================
     EVENT FEED
  ========================== */
  function logEvent(tag, msg) {
    const div = document.createElement("div");
    div.className = "event";
    div.innerHTML = `<span class="tag">${tag}</span>${msg}`;
    eventsEl.prepend(div);
    while (eventsEl.children.length > 40) eventsEl.removeChild(eventsEl.lastChild);
  }

  /* ==========================
     START GARA
  ========================== */
  startRaceBtn.addEventListener("click", () => {
    const mode = raceModeSelect.value;
    let laps = parseInt(lapsInput.value);

    if (mode === "sprint" && laps > 15) laps = 15;
    if (mode === "full" && laps > 100) laps = 100;
    if (laps < 1) laps = 1;

    startRace({ laps });
    logEvent("START", `Gara avviata (${laps} giri)`);
  });

  /* ==========================
     CLEAR CIRCUITO
  ========================== */
  clearTrackBtn.addEventListener("click", () => {
    clearTrack();
    logEvent("TRACK", "Circuito cancellato");
  });

  /* ==========================
     AGGIUNTA SPONSOR (con controllo marchi reali)
  ========================== */
  addSponsorBtn.addEventListener("click", async () => {
    const emoji = sponsorEmojiInput.value.trim();
    const name = sponsorNameInput.value.trim();

    if (!emoji || !name) {
      alert("Inserisci emoji e nome dello sponsor.");
      return;
    }

    // 🔍 Controllo anti-copyright
    const real = await isBrandReal(name);

    if (real) {
      alert("❌ Questo nome risulta essere un marchio registrato. Scegli un nome inventato.");
      logEvent("BLOCK", `Sponsor bloccato: ${name}`);
      return;
    }

    addSponsor(emoji, name);
    notifyNewSponsorAdded();

    logEvent("SPONSOR", `Aggiunto sponsor: ${emoji} ${name}`);
    alert("✔ Sponsor aggiunto correttamente!");

    sponsorEmojiInput.value = "";
    sponsorNameInput.value = "";
  });

  /* ==========================
     CAMERA MODE
  ========================== */
  let currentCamera = "tv";

  cameraModeBtn.addEventListener("click", () => {
    currentCamera = currentCamera === "tv" ? "onboard" : "tv";
    setCameraMode(currentCamera);

    cameraModeBtn.textContent = "Camera: " + (currentCamera === "tv" ? "TV" : "Onboard");
    logEvent("CAM", `Camera cambiata: ${currentCamera}`);
  });

  /* ==========================
     REPLAY MANUALE
  ========================== */
  forceReplayBtn.addEventListener("click", () => {
    forceReplay();
    logEvent("REPLAY", "Replay manuale attivato");
  });

}
