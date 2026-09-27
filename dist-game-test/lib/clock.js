"use strict";
/**
 * MoniMate — central simulation clock (pure functions, no React).
 *
 * The ONE source of time is `GameState.minutes`: total in-game minutes since
 * Monday 00:00 of week 1. Everything else (day, hour, lighting, shop hours,
 * NPC positions, bus arrivals, mission windows) is derived from that number.
 * Nothing in the game may keep its own timer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.lampsOn = exports.hm = exports.formatDay = exports.at = exports.DAY_NAMES = exports.TIME_SCALE = exports.MIN_PER_WEEK = exports.MIN_PER_DAY = exports.MIN_PER_HOUR = void 0;
exports.parts = parts;
exports.formatTime = formatTime;
exports.formatDuration = formatDuration;
exports.inDailyWindows = inDailyWindows;
exports.lightingAt = lightingAt;
exports.MIN_PER_HOUR = 60;
exports.MIN_PER_DAY = 24 * 60;
exports.MIN_PER_WEEK = 7 * exports.MIN_PER_DAY;
/** Real seconds -> game minutes. 1 = one game minute per real second (a 15h waking day ≈ 15 real min). */
exports.TIME_SCALE = 1;
exports.DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** Build an absolute minute stamp. day 0 = Monday week 1. */
const at = (day, hour, minute = 0) => day * exports.MIN_PER_DAY + hour * 60 + minute;
exports.at = at;
function parts(minutes) {
    const m = Math.floor(minutes);
    const day = Math.floor(m / exports.MIN_PER_DAY);
    const minuteOfDay = m - day * exports.MIN_PER_DAY;
    return {
        day,
        dayOfWeek: day % 7,
        week: Math.floor(day / 7) + 1,
        hour: Math.floor(minuteOfDay / 60),
        minute: minuteOfDay % 60,
        minuteOfDay,
    };
}
function formatTime(minutes) {
    const p = parts(minutes);
    const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
    return `${h12}:${String(p.minute).padStart(2, '0')} ${p.hour >= 12 ? 'PM' : 'AM'}`;
}
const formatDay = (minutes) => exports.DAY_NAMES[parts(minutes).dayOfWeek].toUpperCase();
exports.formatDay = formatDay;
/** "1h 05m" style duration */
function formatDuration(mins) {
    const m = Math.max(0, Math.round(mins));
    return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m} min`;
}
const hm = (h, m = 0) => h * 60 + m;
exports.hm = hm;
function inDailyWindows(minutes, windows) {
    const p = parts(minutes);
    return windows.some(w => (!w.days || w.days.includes(p.dayOfWeek)) && p.minuteOfDay >= w.open && p.minuteOfDay < w.close);
}
/** Overlay tint keyframes across the day. Linear-interpolated, so no sudden switches. */
const LIGHT_KEYS = [
    { t: hm(0), r: 10, g: 14, b: 46, a: 0.62, phase: 'late_night' },
    { t: hm(5, 30), r: 12, g: 16, b: 50, a: 0.55, phase: 'night' },
    { t: hm(6, 0), r: 255, g: 170, b: 120, a: 0.28, phase: 'dawn' },
    { t: hm(7, 30), r: 255, g: 220, b: 170, a: 0.10, phase: 'morning' },
    { t: hm(8, 0), r: 255, g: 240, b: 210, a: 0.00, phase: 'morning' },
    { t: hm(12, 0), r: 255, g: 255, b: 255, a: 0.00, phase: 'day' },
    { t: hm(16, 0), r: 255, g: 235, b: 190, a: 0.04, phase: 'day' },
    { t: hm(17, 0), r: 255, g: 200, b: 140, a: 0.14, phase: 'evening' },
    { t: hm(19, 0), r: 255, g: 120, b: 80, a: 0.30, phase: 'sunset' },
    { t: hm(20, 0), r: 90, g: 60, b: 120, a: 0.42, phase: 'dusk' },
    { t: hm(21, 0), r: 18, g: 22, b: 64, a: 0.55, phase: 'night' },
    { t: hm(23, 0), r: 10, g: 14, b: 46, a: 0.62, phase: 'late_night' },
    { t: hm(24, 0), r: 10, g: 14, b: 46, a: 0.62, phase: 'late_night' },
];
function lightingAt(minutes) {
    const t = parts(minutes).minuteOfDay;
    let i = 0;
    while (i < LIGHT_KEYS.length - 2 && t >= LIGHT_KEYS[i + 1].t)
        i++;
    const a = LIGHT_KEYS[i], b = LIGHT_KEYS[i + 1];
    const k = (t - a.t) / Math.max(1, b.t - a.t);
    const lerp = (x, y) => x + (y - x) * k;
    const alpha = lerp(a.a, b.a);
    return { r: lerp(a.r, b.r), g: lerp(a.g, b.g), b: lerp(a.b, b.b), a: alpha, phase: k < 0.5 ? a.phase : b.phase, darkness: Math.min(1, alpha / 0.62) };
}
/** Street lamps / lit windows should be on when it's this dark. */
const lampsOn = (minutes) => lightingAt(minutes).darkness > 0.45;
exports.lampsOn = lampsOn;
