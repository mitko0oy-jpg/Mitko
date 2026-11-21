// Two voices for the same script: Елена (the agent's own voice) and Александра.
// Mitko picks Александра's voice in Telegram (/aleksandra 1|2|3). From then on
// order calls are split half/half by order, so the evening report and /ab show
// which one confirms more orders and sells more plasters. /aleksandra off stops it.
// Feedback calls (Mitko's idea, 21 Nov): a woman gets Николай (a man's voice) or Елена,
// half/half, so the sales show whether a man's voice sells more to women. Men get Елена.
import { createHash } from "node:crypto";
import { formalNameBG } from "./format.mjs";

export const PERSONAS = { elena: "Елена", aleksandra: "Александра", nikolay: "Николай" };

/** Николай's voice: Kosta, a conversational middle-aged Bulgarian man (ElevenLabs library). */
export const NIKOLAY_VOICE = { key: "kosta", label: "Kosta – Conversational Bulgarian male", id: "gdk0ZsvfAOobfbTtnx6p" };

/**
 * Who makes a feedback call: for a woman (her surname says so) Николай or Елена, half/half
 * by order (a retry keeps the voice); for a man or a name we cannot read, Елена.
 * @returns {"nikolay"|"elena"}
 */
export function feedbackPersona(name, key) {
  if (!/^госпожа /.test(formalNameBG(name))) return "elena";
  return createHash("sha256").update(`nikolay:${key}`).digest()[0] % 2 ? "nikolay" : "elena";
}

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

/** The script and first sentence are written for Елена; the others get their own name. */
export function renamePersona(text, persona) {
  if (!text || persona === "elena" || !PERSONAS[persona]) return text;
  return String(text).replace(/Елена/g, PERSONAS[persona]);
}

/** Added to the script when a man speaks: Bulgarian needs the masculine forms. */
export function personaNote(persona) {
  if (persona !== "nikolay") return "";
  return "\n\n# Ти си мъж\n\nТи си Николай. За себе си говориш в мъжки род: „благодарен съм“, „сигурен съм“, „записах си“. Никога не казвай, че си Елена.";
}
