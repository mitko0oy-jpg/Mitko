// Two voices for the same script: Елена (the agent's own voice) and Александра.
// Mitko picks Александра's voice in Telegram (/aleksandra 1|2|3). From then on
// order calls are split half/half by order, so the evening report and /ab show
// which one confirms more orders and sells more plasters. /aleksandra off stops it.
import { createHash } from "node:crypto";

export const PERSONAS = { elena: "Елена", aleksandra: "Александра" };

/** Voices that can be Александра (all Bulgarian, from the ElevenLabs library). */
export const ALEKSANDRA_VOICES = [
  { key: "alexandra", label: "Alexandra – Smooth and Diplomatic", id: "pREMn4INXSs2KOPsNcsD" },
  { key: "monica", label: "Monica – Bulgarian", id: "cTXJb50tSXn699uH54p6" },
  { key: "milena", label: "Milena – Optimistic, Clear, and Balanced", id: "M1ydWt7KnBCiuv4CnEDC" },
];

/** "1", "monica", "моника" … → one of ALEKSANDRA_VOICES, or null. */
export function voiceFromText(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return null;
  const n = Number(t);
  if (n >= 1 && n <= ALEKSANDRA_VOICES.length) return ALEKSANDRA_VOICES[n - 1];
  const names = { alexandra: ["alexandra", "aleksandra", "александра"], monica: ["monica", "monika", "моника"], milena: ["milena", "милена"] };
  return ALEKSANDRA_VOICES.find((v) => names[v.key].some((w) => t.startsWith(w))) || null;
}

/** "elena" | "aleksandra" | null for whatever Mitko typed after /test. */
export function personaFromText(text) {
  const t = String(text || "").trim().toLowerCase();
  if (/^(elena|елена)/.test(t)) return "elena";
  if (/^(aleksandra|alexandra|александра)$/.test(t) || voiceFromText(t)) return "aleksandra";
  return null;
}

/** The same order always gets the same voice (a retry is not a new test). */
export function pickPersona(key, { aleksandraVoiceId } = {}) {
  if (!aleksandraVoiceId) return "elena";
  return createHash("sha256").update(String(key)).digest()[0] % 2 ? "aleksandra" : "elena";
}

/** The script and first sentence are written for Елена; Александра gets her own name. */
export function renamePersona(text, persona) {
  if (persona !== "aleksandra" || !text) return text;
  return String(text).replace(/Елена/g, PERSONAS.aleksandra);
}
