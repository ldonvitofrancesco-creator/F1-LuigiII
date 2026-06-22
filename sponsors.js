// sponsors.js

/* ============================================================
   LISTA SPONSOR DI BASE (tutti inventati e sicuri legalmente)
============================================================ */
let SPONSORS = [
  { emoji: "🏎️🔥", name: "SpeedX" },
  { emoji: "⚡",    name: "Volt Energy" },
  { emoji: "🍕",    name: "Pizza Racing" },
  { emoji: "🧃",    name: "Turbo Juice" },
  { emoji: "🐂",    name: "Red Fury" }
];

/* ============================================================
   FUNZIONE: restituisce la lista sponsor
============================================================ */
export function getSponsors() {
  return SPONSORS;
}

/* ============================================================
   FUNZIONE: aggiunge sponsor inventati
   (viene chiamata solo dopo il controllo anti‑copyright)
============================================================ */
export function addSponsor(emoji, name) {
  SPONSORS.push({ emoji, name });
}

/* ============================================================
   CONTROLLO ANTI‑COPYRIGHT
   - Cerca su internet se il nome è un marchio registrato
   - Se trova parole tipiche dei brand → blocca
   - Se non trova nulla → ok
============================================================ */
export async function isBrandReal(name) {

  // Query per cercare se è un marchio registrato
  const query = encodeURIComponent(name + " official brand trademark company");
  const url = `https://www.bing.com/search?q=${query}`;

  try {
    const response = await fetch(url);
    const text = await response.text();

    // Parole chiave che indicano marchi reali
    const blacklist = [
      "official site",
      "brand",
      "company",
      "corporation",
      "registered trademark",
      "™",
      "®",
      "store",
      "franchise",
      "headquarters",
      "wikipedia",
      "sito ufficiale",
      "marchio registrato"
    ];

    const lower = text.toLowerCase();

    // Se una parola chiave appare → è un marchio reale
    return blacklist.some(word => lower.includes(word));

  } catch (err) {
    console.warn("Errore durante il controllo marchio:", err);
    // In caso di errore → per sicurezza blocchiamo
    return true;
  }
}

/* ============================================================
   INIZIALIZZAZIONE (non fa nulla ma serve per index.html)
============================================================ */
export function initSponsors() {
  // placeholder per eventuali estensioni future
}
