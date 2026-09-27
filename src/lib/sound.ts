// lib/sound.ts
// Synthesized SFX + a funky looped background groove using the Web Audio API,
// plus real spoken dialogue using the browser's built-in SpeechSynthesis
// engine. No external audio files needed anywhere.
// IMPORTANT: every exported function is wrapped so it can NEVER throw —
// sound failures must never block navigation or game logic.
'use client';

let ctx: AudioContext | null = null;
let muted = false;
let masterGain: GainNode | null = null;

function getCtx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, duration: number, type: OscillatorType, startGain = 0.15, delay = 0) {
  try {
    const ac = getCtx();
    if (!ac || !masterGain || muted) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(startGain, ac.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(ac.currentTime + delay);
    osc.stop(ac.currentTime + delay + duration);
  } catch {
    // Never let a sound failure break the caller
  }
}

// ===== FUNKY BACKGROUND GROOVE =====
// A proper little sequenced loop instead of a pad: syncopated bass line,
// closed hi-hats on the 16ths, and a filtered "wah" clav-style chord stab on
// the offbeats. Uses standard lookahead scheduling so timing stays tight.

interface GrooveHandle {
  gain: GainNode;
  stopped: boolean;
  timerId: ReturnType<typeof setTimeout> | null;
}

let currentGroove: GrooveHandle | null = null;
let grooveVolume = 0.09;
let currentMood: string | null = null;

const BPM = 104;
const SIXTEENTH = 60 / BPM / 4; // seconds per 16th note

// Root note per mood — same funky pattern, different key/color so indoor
// scenes feel a touch moodier than outdoor ones.
const GROOVE_ROOTS: Record<string, number> = {
  outdoor: 98.0,  // G2 — bright, driving
  indoor: 87.31,  // F2 — a bit warmer/moodier
};

// Classic syncopated funk bass pattern over 16 steps (1 bar of 16ths).
// Values are scale-degree multipliers off the root (1 = root, 1.5 = fifth, 2 = octave).
// null = rest.
const BASS_PATTERN: (number | null)[] = [
  1, null, 1, null, null, 1.5, null, 1,
  null, null, 2, null, 1.5, null, null, 1,
];

// Hi-hat hits — funky groove leaves gaps rather than straight 16ths.
const HAT_PATTERN: (number | null)[] = [
  1, 0.6, null, 0.8, 1, 0.6, 0.8, null,
  1, 0.6, null, 0.8, 1, null, 0.8, 0.6,
];

// Clav/chord stabs on the classic offbeat funk accents.
const STAB_STEPS = new Set([3, 7, 11, 14]);

function playBassNote(ac: AudioContext, dest: AudioNode, freq: number, time: number) {
  try {
    const osc = ac.createOscillator();
    const filter = ac.createBiquadFilter();
    const gain = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(500, time);
    filter.frequency.exponentialRampToValueAtTime(180, time + 0.12);
    filter.Q.value = 4;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.28, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.18);
  } catch {
    // ignore
  }
}

function playHat(ac: AudioContext, dest: AudioNode, vel: number, time: number) {
  try {
    // Short bright noise burst approximates a closed hi-hat
    const bufferSize = ac.sampleRate * 0.03;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ac.createBufferSource();
    noise.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.05 * vel, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.start(time);
  } catch {
    // ignore
  }
}

function playStab(ac: AudioContext, dest: AudioNode, freq: number, time: number) {
  try {
    // Wah-style clav stab: sawtooth through a swept bandpass
    [1, 1.25, 1.5].forEach((mult) => {
      const osc = ac.createOscillator();
      const filter = ac.createBiquadFilter();
      const gain = ac.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq * mult, time);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(900, time);
      filter.frequency.exponentialRampToValueAtTime(2200, time + 0.08);
      filter.Q.value = 6;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.05, time + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start(time);
      osc.stop(time + 0.12);
    });
  } catch {
    // ignore
  }
}

function startGrooveLoop(handle: GrooveHandle, root: number) {
  const ac = getCtx();
  if (!ac) return;
  let step = 0;
  let nextStepTime = ac.currentTime + 0.05;
  const lookahead = 0.1; // schedule 100ms ahead

  function scheduler() {
    if (handle.stopped) return;
    const ac2 = getCtx();
    if (!ac2) return;
    while (nextStepTime < ac2.currentTime + lookahead) {
      const bassDeg = BASS_PATTERN[step % BASS_PATTERN.length];
      if (bassDeg !== null && !muted) playBassNote(ac2, handle.gain, root * bassDeg, nextStepTime);

      const hatVel = HAT_PATTERN[step % HAT_PATTERN.length];
      if (hatVel !== null && !muted) playHat(ac2, handle.gain, hatVel, nextStepTime);

      if (STAB_STEPS.has(step % 16) && !muted) playStab(ac2, handle.gain, root * 4, nextStepTime);

      nextStepTime += SIXTEENTH;
      step++;
    }
    handle.timerId = setTimeout(scheduler, 25);
  }
  scheduler();
}

function buildGroove(mood: string): GrooveHandle | null {
  try {
    const ac = getCtx();
    if (!ac || !masterGain) return null;
    const gain = ac.createGain();
    gain.gain.value = 0;
    gain.connect(masterGain);
    gain.gain.linearRampToValueAtTime(muted ? 0 : grooveVolume, ac.currentTime + 1.2);

    const handle: GrooveHandle = { gain, stopped: false, timerId: null };
    const root = GROOVE_ROOTS[mood] ?? GROOVE_ROOTS.outdoor;
    startGrooveLoop(handle, root);
    return handle;
  } catch {
    return null;
  }
}

function teardownGroove(handle: GrooveHandle) {
  try {
    handle.stopped = true;
    if (handle.timerId) clearTimeout(handle.timerId);
    const ac = getCtx();
    if (!ac) return;
    const now = ac.currentTime;
    handle.gain.gain.cancelScheduledValues(now);
    handle.gain.gain.setValueAtTime(handle.gain.gain.value, now);
    handle.gain.gain.linearRampToValueAtTime(0, now + 0.4);
  } catch {
    // ignore
  }
}

export const ambience = {
  /** Start (or switch) the funky background loop. mood: 'outdoor' | 'indoor' */
  start(mood: keyof typeof GROOVE_ROOTS = 'outdoor') {
    try {
      const ac = getCtx();
      if (!ac) return;
      if (currentGroove && currentMood === mood) return;
      if (currentGroove) teardownGroove(currentGroove);
      currentGroove = buildGroove(mood);
      currentMood = mood;
    } catch {
      // ignore
    }
  },

  stop() {
    try {
      if (currentGroove) {
        teardownGroove(currentGroove);
        currentGroove = null;
        currentMood = null;
      }
    } catch {
      // ignore
    }
  },

  setVolume(v: number) {
    try {
      grooveVolume = Math.max(0, Math.min(0.25, v));
      if (currentGroove && !muted) {
        const ac = getCtx();
        if (ac) currentGroove.gain.gain.linearRampToValueAtTime(grooveVolume, ac.currentTime + 0.3);
      }
    } catch {
      // ignore
    }
  },
};

// ===== SPOKEN DIALOGUE (real TTS via the browser's SpeechSynthesis API) =====
// Speaks the exact on-screen text aloud. Each speaker gets a consistent
// pitch/rate/voice so characters sound distinct from one another.

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

const ADULT_NAMES = new Set(['Mum', 'Dad', 'Mr. Thompson', 'Mrs. Chen']);

let cachedVoices: SpeechSynthesisVoice[] = [];
let voicesLoaded = false;

function loadVoices() {
  try {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const v = window.speechSynthesis.getVoices();
    if (v && v.length) {
      cachedVoices = v;
      voicesLoaded = true;
    }
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined' && (window as any).speechSynthesis) {
  try {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  } catch {
    // ignore
  }
}

function pickVoiceFor(speaker?: string): SpeechSynthesisVoice | null {
  if (!voicesLoaded || cachedVoices.length === 0) return null;
  // Prefer English voices where available, but fall back to whatever's there
  const englishVoices = cachedVoices.filter(v => /en/i.test(v.lang));
  const pool = englishVoices.length ? englishVoices : cachedVoices;
  const h = hashName(speaker || 'narrator');
  return pool[h % pool.length] || null;
}

function voiceSettingsFor(speaker?: string): { pitch: number; rate: number } {
  if (!speaker) return { pitch: 1.0, rate: 1.02 };
  const isAdult = ADULT_NAMES.has(speaker);
  const h = hashName(speaker);
  const jitter = (h % 100) / 100; // 0–1, deterministic per name
  if (isAdult) {
    return { pitch: 0.75 + jitter * 0.15, rate: 0.95 + jitter * 0.08 };
  }
  return { pitch: 1.05 + jitter * 0.25, rate: 1.0 + jitter * 0.12 };
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

export const voice = {
  /** Speak the exact text aloud. Strips surrounding quote marks if present. */
  speak(text: string, speaker?: string) {
    try {
      if (typeof window === 'undefined' || !window.speechSynthesis || muted) return;
      window.speechSynthesis.cancel(); // stop anything currently speaking
      const clean = text.replace(/^"|"$/g, '');
      const utter = new SpeechSynthesisUtterance(clean);
      const { pitch, rate } = voiceSettingsFor(speaker);
      utter.pitch = pitch;
      utter.rate = rate;
      utter.volume = 0.9;
      const v = pickVoiceFor(speaker);
      if (v) utter.voice = v;
      currentUtterance = utter;
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore
    }
  },

  stop() {
    try {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      currentUtterance = null;
    } catch {
      // ignore
    }
  },

  isSpeaking() {
    try {
      return typeof window !== 'undefined' && !!window.speechSynthesis?.speaking;
    } catch {
      return false;
    }
  },
};

// ===== ONE-SHOT SFX =====

export const sfx = {
  setMuted(v: boolean) {
    try {
      muted = v;
      const ac = getCtx();
      if (ac && masterGain) {
        masterGain.gain.linearRampToValueAtTime(v ? 0 : 1, ac.currentTime + 0.15);
      }
      if (v) voice.stop();
    } catch {
      // ignore
    }
  },
  isMuted() { return muted; },

  click() {
    tone(220, 0.05, 'square', 0.08);
  },

  step() {
    tone(140, 0.04, 'square', 0.04);
  },

  spend() {
    tone(400, 0.08, 'triangle', 0.12);
    tone(300, 0.08, 'triangle', 0.1, 0.05);
  },

  coin() {
    tone(523, 0.06, 'square', 0.12);
    tone(784, 0.1, 'square', 0.12, 0.06);
  },

  achievement() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.1, i * 0.08));
  },

  whoosh() {
    tone(150, 0.15, 'sawtooth', 0.06);
  },

  chime() {
    [659, 784, 988].forEach((f, i) => tone(f, 0.15, 'sine', 0.1, i * 0.1));
  },
};