/**
 * MoniMate — lightweight in-browser text-to-speech for mission/NPC dialogue lines.
 * Uses the built-in Web Speech API (`window.speechSynthesis`) — no API key, no network call,
 * works fully offline. Every speaker gets a small deterministic "voice fingerprint" (pitch/rate
 * derived from their name, plus a consistently-picked system voice) so the same character always
 * sounds the same without hardcoding exact voice names, which vary wildly across OS/browser.
 */

function supported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let cachedVoices: SpeechSynthesisVoice[] = [];
function loadVoices() {
  if (!supported()) return;
  cachedVoices = window.speechSynthesis.getVoices();
}
if (supported()) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

function fingerprint(speaker: string) {
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) hash = (hash * 31 + speaker.charCodeAt(i)) >>> 0;
  const pitch = 0.85 + (hash % 30) / 100;       // ~0.85–1.15
  const rate = 0.95 + ((hash >> 3) % 15) / 100; // ~0.95–1.10
  return { hash, pitch, rate };
}

function pickVoice(speaker: string): SpeechSynthesisVoice | undefined {
  if (!cachedVoices.length) loadVoices();
  const enVoices = cachedVoices.filter(v => v.lang.toLowerCase().startsWith('en'));
  const pool = enVoices.length ? enVoices : cachedVoices;
  if (!pool.length) return undefined;
  const { hash } = fingerprint(speaker);
  return pool[hash % pool.length];
}

/** Speak one line as the given speaker. Cancels whatever was being said before — only one voice
 * talks at a time, and a new line always takes priority over a stale one. */
export function speakLine(speaker: string | undefined, text: string) {
  if (!supported() || !text) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const name = speaker ?? 'Narrator';
  const { pitch, rate } = fingerprint(name);
  utter.pitch = pitch;
  utter.rate = rate;
  const voice = pickVoice(name);
  if (voice) utter.voice = voice;
  window.speechSynthesis.speak(utter);
}

export function stopSpeaking(): void {
  if (supported()) window.speechSynthesis.cancel();
}

export function isSpeechSupported(): boolean {
  return supported();
}
