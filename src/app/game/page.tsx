'use client';

/**
 * MoniMate — Financial Life Simulator (slim page.tsx).
 *
 * All simulation logic lives in src/lib (clock/world/missions/store/render/loop). This component
 * only: (1) handles auth/path-select screens, (2) owns one GameStore + GameLoop per session,
 * (3) runs the canvas + input loop, (4) renders HUD/journal/dialogue/minimap from current state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PlayerProfile, hashPassword, verifyPassword, loadAccounts, saveAccounts,
  loadSession, saveSession, clearSession, loadGameSave, saveGame,
} from '../../lib/auth';
import { LIFE_PATHS, LifePath, LifePathConfig, getLifePath, makeInitialFinance, makeInitialGoals } from '../../lib/gameData';
import { createInitialState, GameStore, LevelSummary } from '../../lib/store';
import { GameLoop } from '../../lib/loop';
import { askMentorChat, askMentorWeeklyRecap } from '../../lib/mentor';
import { speakLine, stopSpeaking } from '../../lib/tts';
import { MoveInput, drawDayNightOverlay, drawMinimap, hudTime, waypointReadout } from '../../lib/render';
import {
  PLACES, TILE_PX, isOpen as placeIsOpen, groundSprite,
  CHAR_FRAME_W, CHAR_FRAME_H, CHAR_RUN_FRAMES, DIR_ORDER, facingToDir, characterSheet,
  getInterior, INTERIOR_TILE_PX, DECOR_PROPS, getNpcDef,
  BUS_STOPS, BUS_ROUTE, busAtStop, nextBusAt, stopById, rideMinutes, getPlace,
} from '../../lib/world';
import { buildJournal, MissionChoice, MissionDef, trackedMission } from '../../lib/missions';
import { dayToSummaryView, weekToSummaryView } from '../../lib/summary';
import type { GameState, NpcRuntime } from '../../lib/types';
import { formatDay, formatTime, parts } from '../../lib/clock';
import { ATTEND_CLASS } from '../../game/content/school/mondayActivities';
import { LIFE_EVENTS } from '../../lib/lifeEvents';
import { ACHIEVEMENTS, isUnlocked } from '../../lib/achievements';

const MAP_W = 60, MAP_H = 44;

/** Casual, non-mission chat lines — what an NPC says if you walk up and press E/ACT when they
 *  have no active mission step for you. Picked at random so talking to the same person twice in
 *  a row doesn't feel scripted-empty. */
const NPC_IDLE_LINES: Record<string, string[]> = {
  mum: [
    "Don't forget — the $35 has to last till Friday.",
    "How's the budget looking so far this week?",
    "Love you, kiddo. Don't spend it all on snacks.",
    "Let me know if you need to talk about money — no judgment.",
  ],
  jordan: [
    "Hey! You coming to the arcade this week?",
    "I heard the cafeteria's doing something new for lunch.",
    "You seen Riley today? She's been stressed about her birthday thing.",
    "I'm saving up for new headphones — slow going.",
  ],
  riley: [
    "Hey! Thanks again for being a good friend.",
    "This market stall smells incredible, you have to try it sometime.",
    "I'm turning a year older soon, you know...",
    "School's been a lot lately, honestly.",
  ],
  teacher: [
    "Make sure that project gets handed in on time.",
    "Attendance matters more than people think.",
    "Let me know if you're stuck on anything.",
  ],
  shopkeeper: [
    "Fresh stock just came in this morning.",
    "Let me know if you can't find something.",
  ],
};
function idleLineFor(npcId: string): string {
  const pool = NPC_IDLE_LINES[npcId] ?? ["Hey."];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Sprite cache: loads each image once, draw() just reads whatever is ready this frame. ─────
const imgCache = new Map<string, HTMLImageElement>();
/** Unmistakable placeholder marker (dark outline, ground shadow, bright body) — used only when the
 *  real character sheet hasn't loaded yet, so a missing/slow sprite never reads as "nothing there". */
function drawPersonFallback(ctx: CanvasRenderingContext2D, x: number, y: number, T: number, color: string) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(x, y + 2, T * 0.26, T * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(x - T * 0.18, y - T * 0.55, T * 0.36, T * 0.45, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8c090';
  ctx.beginPath(); ctx.arc(x, y - T * 0.62, T * 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function getImg(src: string): HTMLImageElement | null {
  let img = imgCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imgCache.set(src, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

type AuthScreen = 'login' | 'register' | 'path_select';

export default function MoniMateGame() {
  const [authScreen, setAuthScreen] = useState<AuthScreen>('login');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    const email = loadSession();
    if (!email) return;
    const accounts = loadAccounts();
    const acc = accounts[email];
    if (acc) { setProfile(acc); }
  }, []);

  const login = () => {
    const accounts = loadAccounts();
    const acc = accounts[authEmail.trim().toLowerCase()];
    if (!acc || !verifyPassword(authPassword, acc.passwordHash)) { setAuthError('Wrong email or password.'); return; }
    saveSession(acc.email);
    setProfile(acc);
  };
  const register = () => {
    const email = authEmail.trim().toLowerCase();
    if (!email || !authPassword || !authName) { setAuthError('Fill in every field.'); return; }
    const accounts = loadAccounts();
    if (accounts[email]) { setAuthError('An account already exists for that email.'); return; }
    const newProfile: PlayerProfile = {
      name: authName, email, passwordHash: hashPassword(authPassword), lifePath: 'school',
      avatar: '🧑', level: 1, xp: 0, achievements: [], createdAt: Date.now(),
    };
    accounts[email] = newProfile; saveAccounts(accounts); saveSession(email);
    setProfile(newProfile);
    setAuthScreen('path_select');
  };
  const choosePath = (path: LifePath) => {
    if (!profile) return;
    const updated = { ...profile, lifePath: path };
    const accounts = loadAccounts(); accounts[profile.email] = updated; saveAccounts(accounts);
    setProfile(updated);
    setAuthScreen('login'); // clear the path_select screen so we actually drop into the game
  };
  const logout = () => { clearSession(); setProfile(null); setAuthScreen('login'); };

  if (!profile) {
    return (
      <AuthScreen
        screen={authScreen} setScreen={setAuthScreen}
        email={authEmail} setEmail={setAuthEmail}
        password={authPassword} setPassword={setAuthPassword}
        name={authName} setName={setAuthName}
        error={authError} onLogin={login} onRegister={register}
      />
    );
  }
  // profile exists but no life path confirmed yet (fresh registration) -> path select
  if (authScreen === 'path_select' || !LIFE_PATHS.find(p => p.id === profile.lifePath)?.available) {
    return <PathSelect onChoose={choosePath} />;
  }

  return <GameCanvas profile={profile} onLogout={logout} onChangePath={() => setAuthScreen('path_select')} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH / PATH SELECT SCREENS
// ─────────────────────────────────────────────────────────────────────────────

function AuthScreen(props: {
  screen: AuthScreen; setScreen: (s: AuthScreen) => void;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  name: string; setName: (v: string) => void;
  error: string; onLogin: () => void; onRegister: () => void;
}) {
  const isRegister = props.screen === 'register';
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', color: '#e6edf3', fontFamily: 'monospace' }}>
      <div style={{ width: 'min(320px, 92vw)', padding: 24, border: '1px solid #30363d', borderRadius: 10, background: '#161b22' }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>💰 MoniMate</h1>
        {isRegister && (
          <input placeholder="Name" value={props.name} onChange={e => props.setName(e.target.value)}
            style={inputStyle} />
        )}
        <input placeholder="Email" value={props.email} onChange={e => props.setEmail(e.target.value)} style={inputStyle} />
        <input placeholder="Password" type="password" value={props.password} onChange={e => props.setPassword(e.target.value)} style={inputStyle} />
        {props.error && <div style={{ color: '#ff6060', fontSize: 12, marginBottom: 8 }}>{props.error}</div>}
        <button onClick={isRegister ? props.onRegister : props.onLogin} style={btnStyle}>
          {isRegister ? 'Create account' : 'Log in'}
        </button>
        <div style={{ marginTop: 10, fontSize: 12, textAlign: 'center' }}>
          <a style={{ color: '#60b8ff', cursor: 'pointer' }} onClick={() => props.setScreen(isRegister ? 'login' : 'register')}>
            {isRegister ? 'Already have an account? Log in' : "New here? Create an account"}
          </a>
        </div>
      </div>
    </div>
  );
}
const inputStyle: React.CSSProperties = { width: '100%', padding: 8, marginBottom: 8, background: '#0d1117', border: '1px solid #30363d', color: '#e6edf3', borderRadius: 6 };
const btnStyle: React.CSSProperties = { width: '100%', padding: 10, background: '#3fb950', border: 'none', borderRadius: 6, color: '#0d1117', fontWeight: 700, cursor: 'pointer' };

function PathSelect({ onChoose }: { onChoose: (p: LifePath) => void }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#e6edf3', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 32, fontFamily: 'monospace' }}>
      <h1 style={{ marginBottom: 24 }}>Choose your life path</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, width: '100%', maxWidth: 700 }}>
        {LIFE_PATHS.map(p => (
          <div key={p.id} onClick={() => p.available && onChoose(p.id)} aria-disabled={!p.available}
            style={{ cursor: p.available ? 'pointer' : 'not-allowed', border: `2px solid ${p.color}`, borderRadius: 10, padding: 16, background: '#161b22', opacity: p.available ? 1 : 0.45, position: 'relative' }}>
            {!p.available && (
              <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#30363d', letterSpacing: 0.5 }}>COMING SOON</div>
            )}
            <div style={{ fontSize: 28 }}>{p.emoji}</div>
            <div style={{ fontWeight: 700, margin: '6px 0' }}>{p.name}</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>{p.tagline}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GAME CANVAS — the actual simulation
// ─────────────────────────────────────────────────────────────────────────────

function GameCanvas({ profile, onLogout, onChangePath }: { profile: PlayerProfile; onLogout: () => void; onChangePath: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const storeRef = useRef<GameStore | null>(null);
  const loopRef = useRef<GameLoop | null>(null);
  const [, forceTick] = useState(0);
  const [dialogueLines, setDialogueLines] = useState<{ npc?: string; text: string } | null>(null);
  useEffect(() => {
    if (!dialogueLines) return;
    const t = setTimeout(() => setDialogueLines(null), 4000);
    return () => clearTimeout(t);
  }, [dialogueLines]);
  useEffect(() => {
    if (dialogueLines && voiceOn) speakLine(dialogueLines.npc, dialogueLines.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogueLines]);
  const [showJournal, setShowJournal] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [showMentor, setShowMentor] = useState(false);
  const [showRelationships, setShowRelationships] = useState(false);
  const [achievementToast, setAchievementToast] = useState<{ id: string; name: string; emoji: string } | null>(null);
  // Step 26: a lightweight, self-dismissing notification when store.takeOffers() reports a genuinely
  // new mission — mirrors the existing achievementToast pattern exactly (same drain-a-queue,
  // auto-timeout shape) rather than inventing a second notification mechanism.
  const [missionToast, setMissionToast] = useState<{ id: string; name: string; emoji: string } | null>(null);
  const missionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [boardingAt, setBoardingAt] = useState<string | null>(null); // stopId whose destination picker is open
  // Attend Class: a message when it can't happen (e.g. too tired), shown until dismissed.
  const [classFailure, setClassFailure] = useState<string | null>(null);
  const classResolvingRef = useRef(false);
  // Help Mum: once a day, only when she's home (see helpParentsEligible). Done/declined is saved as a daily mark.
  const [helpParentsFailure, setHelpParentsFailure] = useState<string | null>(null);
  const helpParentsResolvingRef = useRef(false);
  // Help Mum sequence: 'seek' (find Mum, press E) -> 'working' (progress bar) -> done.
  const [helpParentsPhase, setHelpParentsPhase] = useState<'ask' | 'seek' | 'working' | null>(null);
  // Ref copy for the keydown handler, which is registered once and would otherwise read stale state.
  const helpParentsPhaseRef = useRef<typeof helpParentsPhase>(null);
  const setHelpParentsPhaseBoth = useCallback((p: typeof helpParentsPhase) => {
    helpParentsPhaseRef.current = p;
    setHelpParentsPhase(p);
  }, []);
  const [helpParentsProgress, setHelpParentsProgress] = useState(0);
  // Balance/energy when the chore starts, so the toast reports the real change.
  const helpParentsSnapshotRef = useRef<{ balance: number; energy: number } | null>(null);
  // Generic, reusable "what just happened" feedback toast — not specific to Help Parents. Any future
  // activity can reuse this exact shape (icon + short lines) rather than inventing its own popup.
  const [activityToast, setActivityToast] = useState<{ icon: string; lines: string[] } | null>(null);
  const activityToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [skipSignal, setSkipSignal] = useState(0); // bumped by the touch "SKIP" button to fast-forward dialogue
  useEffect(() => () => stopSpeaking(), []); // stop any speech mid-line if the page/component unmounts

  // Detect a touch/coarse-pointer device (phone/tablet) so we can show on-screen controls.
  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
  }, []);

  // ── Fullscreen viewport (this step) ─────────────────────────────────────────────────────────
  // The canvas used to render at a FIXED 1280x800 resolution with CSS `objectFit: 'contain'`
  // scaling that image to fit the page — which is exactly what makes a full-window canvas still
  // look like a small embedded box with letterboxing on wide/tall screens. draw()/drawInterior()
  // already take cw/ch as parameters on every call (camera translate, room-centering math, HUD
  // layout) rather than hardcoding 1280x800 anywhere, so the fix is purely at the canvas-sizing
  // layer: give the canvas element real pixel dimensions matching the actual viewport, and let the
  // existing camera-clamp math (SmoothCamera.update, which already handles viewW/viewH larger than
  // the world by centering) and drawInterior's `(cw - roomW) / 2` centering do the rest untouched.
  const [canvasSize, setCanvasSize] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  }));
  useEffect(() => {
    const onResize = () => setCanvasSize({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Touch-control helpers — reuse the same keysRef the keyboard handler reads from render.MoveInput,
  // so pressing a virtual button is indistinguishable from holding the matching key.
  const pressKey = useCallback((k: string) => keysRef.current.add(k), []);
  const releaseKey = useCallback((k: string) => keysRef.current.delete(k), []);

  // Create the store once, hydrating from a save if one exists.
  if (!storeRef.current) {
    const config: LifePathConfig = getLifePath(profile.lifePath);
    const saved = loadGameSave(profile.email, profile.lifePath);
    // Saves from older versions are upgraded by GameStore.hydrate (see lib/saveMigration.ts);
    // anything unreadable starts a fresh game rather than crashing.
    const restored = saved && saved.lifePath === profile.lifePath ? GameStore.hydrate(JSON.stringify(saved)) : null;
    storeRef.current = restored ?? new GameStore(createInitialState(profile.lifePath, makeInitialFinance(config), makeInitialGoals(config)));
    loopRef.current = new GameLoop(storeRef.current);
    storeRef.current.subscribe(() => forceTick(t => t + 1));
  }
  const store = storeRef.current!;
  const loop = loopRef.current!;

  // Autosave every 10s and on unmount.
  useEffect(() => {
    const id = setInterval(() => saveGame(profile.email, profile.lifePath, store.state), 10_000);
    return () => { clearInterval(id); saveGame(profile.email, profile.lifePath, store.state); };
  }, [profile.email, profile.lifePath, store]);

  // Help Mum progress bar: fills over ~1.2 real seconds, then store.helpParents() applies the real
  // time/energy/money change once.
  useEffect(() => {
    if (helpParentsPhase !== 'working') return;
    const durationMs = 1200;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const pct = Math.min(100, ((now - start) / durationMs) * 100);
      setHelpParentsProgress(pct);
      if (pct >= 100) { helpParents(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helpParentsPhase]);

  // Switching life paths: force a save under the CURRENT path's key first, so
  // nothing from this session is lost, then hand control back to path select.
  const handleChangePath = () => {
    if (!window.confirm('Switch life paths? Your progress on this path is saved and will be here if you come back to it.')) return;
    saveGame(profile.email, profile.lifePath, store.state);
    onChangePath();
  };

  // Keyboard input.
  // This step — Part 4: normalize the key once (lower-cased, same as the WASD/keysRef path already
  // did) instead of checking each letter's upper- and lower-case form separately at every call
  // site — one interaction pathway, not a duplicated one. `key` (not `e.key`) is used below, so E/e,
  // J/j, and P/p all reach the same single branch regardless of Caps Lock/Shift state.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysRef.current.add(key);
      if (key === 'escape' && store.state.player.scene !== 'outdoor' && store.state.player.scene !== 'bus') loop.exit();
      if (key === 'e') { if (!tryStartHelpParentsActivity()) handleInteract(); }
      if (key === 'j') setShowJournal(s => !s);
      if (key === 'p') setShowPhone(s => !s);
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInteract = useCallback(() => {
    const npc = store.npcNearPlayer();
    if (npc) store.talkTo(npc.id);
    const step = store.actionableStep();
    if (step) return; // handled by the main mission DialoguePanel (driven by `actionable`, not this state)
    if (npc) { setDialogueLines({ npc: getNpcDef(npc.id)?.name ?? npc.id, text: idleLineFor(npc.id) }); return; }
    // Phase 10: walk-up-and-buy shopping (Rule 27) — no dropdown, just interact with what's in reach.
    // Step 28: when this item is also a grocery-list need for the active shopping mission, the same
    // real purchase doubles as "physical pickup" — reusing the existing buy path rather than a second
    // pickup system, per Part 10/12's instruction against duplicating item catalogs or mission state.
    const item = store.nearbyShopItem();
    if (item) {
      const label = `${item.brand ? item.brand + ' ' : ''}${item.name}`;
      const progressBefore = store.shoppingProgress();
      const isGroceryPickup = !!progressBefore?.need.some(p => item.id.startsWith(p));
      const result = store.buyNearbyShopItem();
      setDialogueLines({
        npc: label,
        text: result.ok
          ? (isGroceryPickup ? `Picked up ${item.name}. Checklist updated.` : `Bought for $${item.price.toFixed(2)}. Balance updated.`)
          : (result.reason ?? 'Could not buy that.'),
      });
      return;
    }
    // Phase 14: board the bus if one is standing at the stop you're at.
    const stopId = store.playerNearBusStop();
    if (stopId) {
      // This step: freeze the clock for exactly as long as the destination picker is open — see
      // setPaused()'s own comment for why (the 1-game-minute dwell window could otherwise elapse
      // while the player is still reading the two destination choices, silently failing boardBus()
      // and looking exactly like "nothing happened, no travel graphics").
      if (busAtStop(stopId, store.state.minutes)) { store.setPaused(true); setBoardingAt(stopId); }
      else {
        const next = nextBusAt(stopId, store.state.minutes);
        setDialogueLines({
          npc: stopById(stopId).name,
          text: next ? `Next bus at ${formatTime(next.arrivesAt)}.` : 'No more buses running today.',
        });
      }
    }
  }, [store]);

  // Step 27: once the player has accepted "Help Mum" and is in the 'seek' phase, pressing E near
  // Mum (the same npcNearPlayer() check handleInteract() already uses for dialogue/idle-chat) starts
  // the activity sequence instead of the normal idle-chat fallback. This reuses the existing NPC
  // proximity system rather than inventing a new interactable-object system, per the Step 27 Part 3
  // instruction to prefer existing systems when they genuinely cover the need.
  const tryStartHelpParentsActivity = useCallback(() => {
    if (helpParentsPhaseRef.current !== 'seek') return false;
    const npc = store.npcNearPlayer();
    if (!npc || npc.id !== 'mum') return false;
    helpParentsSnapshotRef.current = { balance: store.cash, energy: store.getEnergy().current };
    setHelpParentsProgress(0);
    setHelpParentsPhaseBoth('working');
    return true;
  }, [store, setHelpParentsPhaseBoth]);

  // Attend Class: runs through store.attendClass() (ActivitySystem on the live game).
  const attendClass = useCallback(() => {
    if (classResolvingRef.current) return; // already handling a click for this prompt
    classResolvingRef.current = true;
    try {
      if (store.getEnergy().current < ATTEND_CLASS.energyCost) {
        setClassFailure("You're too exhausted to focus. Get some rest first.");
        return;
      }
      store.waitForBell(); // early? the clock runs to the 8:30 bell before the lesson starts
      const before = store.state.minutes;
      const outcome = store.attendClass(); // records attendance (a saved daily mark) on success
      if (!outcome.ok) { setClassFailure(outcome.message ?? 'That didn\'t work.'); return; }
      setClassFailure(null);
      setActivityToast({ icon: '📚', lines: ['Class done', `${formatTime(before)} → ${formatTime(store.state.minutes)} · -${outcome.energyConsumed} energy`] });
      if (activityToastTimerRef.current) clearTimeout(activityToastTimerRef.current);
      activityToastTimerRef.current = setTimeout(() => setActivityToast(null), 4000);
    } finally {
      classResolvingRef.current = false;
    }
  }, [store]);

  // Help Mum: called when the progress bar finishes; the toast shows the real before/after change.
  const helpParents = useCallback(() => {
    if (helpParentsResolvingRef.current) return; // already handling a click for this prompt
    helpParentsResolvingRef.current = true;
    try {
      const before = helpParentsSnapshotRef.current;
      const outcome = store.helpParents();
      if (!outcome.ok) {
        // Never pretend a failed activity succeeded: not marked complete, so the player remains
        // eligible to try again (e.g. after energy recovers).
        setHelpParentsFailure(outcome.message ?? 'That didn\'t work.');
        setHelpParentsPhaseBoth(null);
        return;
      }
      store.markDoneToday('helped_parents');
      setHelpParentsFailure(null);
      setHelpParentsPhaseBoth(null);
      const after = { balance: store.cash, energy: store.getEnergy().current };
      const moneyDelta = before ? after.balance - before.balance : outcome.amountEarned;
      const energyDelta = before ? before.energy - after.energy : outcome.energyConsumed;
      setActivityToast({
        icon: '🧹',
        lines: [
          'Helped around the house',
          `${moneyDelta > 0 ? '+' : ''}$${moneyDelta.toFixed(2)} · -${energyDelta.toFixed(0)} energy · Mum +1`,
        ],
      });
      if (activityToastTimerRef.current) clearTimeout(activityToastTimerRef.current);
      activityToastTimerRef.current = setTimeout(() => setActivityToast(null), 4000);
    } finally {
      helpParentsResolvingRef.current = false;
    }
  }, [store, setHelpParentsPhaseBoth]);

  // Step 27: DECLINE path. Not silent — applies a small, believable relationship consequence
  // (mirroring the -1 scale every other mission's "decline"-shaped choice already uses, e.g.
  // arcade_invite's 'home' choice), via the new adjustRelationship() method, and gives the player
  // immediate feedback for why. No money/time/energy change — declining a chore costs nothing
  // materially, only a little goodwill, which is the believable-consequence bar Step 27 set.
  const declineHelpParents = useCallback(() => {
    store.adjustRelationship('Mum', -1);
    store.markDoneToday('declined_parents');
    setHelpParentsPhaseBoth(null);
    setActivityToast({ icon: '🙁', lines: ["Mum looks a little disappointed, but doesn't push it.", 'Mum -1'] });
    if (activityToastTimerRef.current) clearTimeout(activityToastTimerRef.current);
    activityToastTimerRef.current = setTimeout(() => setActivityToast(null), 4000);
  }, [store, setHelpParentsPhaseBoth]);

  // Main loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const frame = (ts: number) => {
      const input: MoveInput = {
        up: keysRef.current.has('w') || keysRef.current.has('arrowup'),
        down: keysRef.current.has('s') || keysRef.current.has('arrowdown'),
        left: keysRef.current.has('a') || keysRef.current.has('arrowleft'),
        right: keysRef.current.has('d') || keysRef.current.has('arrowright'),
      };
      loop.frame(ts, input, { w: canvas.width, h: canvas.height }, { worldW: MAP_W * TILE_PX, worldH: MAP_H * TILE_PX });
      draw(ctx, canvas.width, canvas.height, store, loop);
      const newToasts = store.takeAchievementToasts();
      if (newToasts.length) {
        setAchievementToast(newToasts[0]);
        if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setAchievementToast(null), 4000);
      }
      // Step 26: store.takeOffers() already existed (mirrors takeAchievementToasts()) but had no
      // consumer — it drains store.offerQueue and self-clears, so each call only ever returns
      // missions that became available since the last drain, never the same one twice.
      const notices = store.takeNotices();
      if (notices.length) setDialogueLines({ text: notices[notices.length - 1] });
      const newOffers = store.takeOffers();
      if (newOffers.length) {
        setMissionToast({ id: newOffers[0].id, name: newOffers[0].name, emoji: newOffers[0].emoji });
        if (missionToastTimerRef.current) clearTimeout(missionToastTimerRef.current);
        missionToastTimerRef.current = setTimeout(() => setMissionToast(null), 4000);
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = store.state;
  const { day, time } = hudTime(s.minutes);
  const waypoint = waypointReadout(s, store.defs);
  // Step 26: reuses the existing trackedMission() (already the source waypointReadout() itself
  // calls internally) purely to read its mission name for the new Objective HUD card — no new
  // tracking/priority logic, just a second read of the same authoritative pick.
  const objective = trackedMission(s, store.defs);
  const journal = buildJournal(s, store.defs);
  const daySummary = store.pendingDaySummary ? dayToSummaryView(store.pendingDaySummary, store.defs) : null;
  const weekSummary = store.pendingWeekSummary ? weekToSummaryView(store.pendingWeekSummary) : null;
  const actionable = store.actionableStep();
  const nearbyItem = store.nearbyShopItem();
  const shopping = store.shoppingProgress();
  const nearStopId = s.player.scene === 'outdoor' ? store.playerNearBusStop() : null;
  const lifeEvent = s.pendingLifeEvent ? LIFE_EVENTS.find(e => e.id === s.pendingLifeEvent!.id) : undefined;
  // Step 28: reusable "who/what is in reach right now" reads, built entirely on existing store data
  // (npcNearPlayer(), shoppingProgress()) — no new interaction system, just new HUD consumers of it.
  const nearbyNpc = store.npcNearPlayer();
  const objectiveStep = objective ? objective.def.steps[objective.rt.stepIndex] : null;
  const objectiveNpcId = objectiveStep?.npcId;
  const objectiveNpcName = objectiveNpcId ? getNpcDef(objectiveNpcId)?.name ?? objectiveNpcId : null;
  const groceryNeedIdx = shopping && nearbyItem ? shopping.need.findIndex(p => nearbyItem.id.startsWith(p)) : -1;
  const groceryAlreadyGot = groceryNeedIdx >= 0 && shopping!.covered[groceryNeedIdx];
  const clockParts = parts(s.minutes);
  // Attend Class: every weekday, in the classroom, from the gates opening until 11:30.
  const classStatus = store.classStatus();
  const classEligible = classStatus === 'ready';
  // Help Mum: only when you're home AND Mum actually is (she's at work 8:00-17:30 on weekdays),
  // once a day. Accepting/declining is remembered in the save, so a reload can't farm it.
  const helpParentsEligible =
    profile.lifePath === 'school' &&
    s.player.place === 'home' &&
    s.npcs.mum?.place === 'home' && !s.npcs.mum?.moving &&
    !store.hasDoneToday('helped_parents') &&
    !store.hasDoneToday('declined_parents');
  const busArrived = nearStopId ? busAtStop(nearStopId, s.minutes) : null;
  const nextBus = nearStopId && !busArrived ? nextBusAt(nearStopId, s.minutes) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', background: '#000', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef} width={canvasSize.w} height={canvasSize.h}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', imageRendering: 'pixelated', touchAction: 'none' }}
      />

      {/* On-screen touch controls (phone/tablet only) */}
      {isTouch && (
        <>
          <div style={hud.dpad}>
            <div style={hud.dpadRow}>
              <div style={hud.dpadSpacer} />
              <button style={hud.dpadBtn} onPointerDown={() => pressKey('w')} onPointerUp={() => releaseKey('w')} onPointerLeave={() => releaseKey('w')} onPointerCancel={() => releaseKey('w')}>▲</button>
              <div style={hud.dpadSpacer} />
            </div>
            <div style={hud.dpadRow}>
              <button style={hud.dpadBtn} onPointerDown={() => pressKey('a')} onPointerUp={() => releaseKey('a')} onPointerLeave={() => releaseKey('a')} onPointerCancel={() => releaseKey('a')}>◀</button>
              <div style={hud.dpadSpacer} />
              <button style={hud.dpadBtn} onPointerDown={() => pressKey('d')} onPointerUp={() => releaseKey('d')} onPointerLeave={() => releaseKey('d')} onPointerCancel={() => releaseKey('d')}>▶</button>
            </div>
            <div style={hud.dpadRow}>
              <div style={hud.dpadSpacer} />
              <button style={hud.dpadBtn} onPointerDown={() => pressKey('s')} onPointerUp={() => releaseKey('s')} onPointerLeave={() => releaseKey('s')} onPointerCancel={() => releaseKey('s')}>▼</button>
              <div style={hud.dpadSpacer} />
            </div>
          </div>
          {actionable && !lifeEvent ? (
            // Mission dialogue starts itself the moment you're in the right place — there's
            // nothing to "act" on, so the touch button here fast-forwards the conversation instead.
            <button style={hud.interactBtn} onPointerDown={() => { stopSpeaking(); setSkipSignal(n => n + 1); }}>SKIP</button>
          ) : dialogueLines && !lifeEvent && !boardingAt ? (
            <button style={hud.interactBtn} onPointerDown={() => { stopSpeaking(); setDialogueLines(null); }}>SKIP</button>
          ) : (
            <button style={hud.interactBtn} onPointerDown={handleInteract}>ACT</button>
          )}
          {s.player.scene !== 'outdoor' && s.player.scene !== 'bus' && (
            <button style={hud.exitBtn} onPointerDown={() => loop.exit()}>EXIT</button>
          )}
        </>
      )}

      {/* HUD */}
      <div style={hud.bar}>
        <span style={{ color: '#7cfc00' }}>💰 ${store.cash.toFixed(2)}</span>
        <span style={{ color: '#ffe066' }}>⚡ {Math.round(s.energy.current)}</span>
        <span style={{ color: '#ffd700' }}>{day} {time}</span>
        <span style={{ color: '#aaffaa' }}>{profile.name} · Lv{profile.level}</span>
        <div style={hud.btnGroup}>
          <button style={hud.smallBtn} onClick={() => setShowJournal(v => !v)}>📔 Journal{!isTouch && ' (J)'}</button>
          <button style={hud.smallBtn} onClick={() => setShowPhone(v => !v)}>📱 Wallet{!isTouch && ' (P)'}</button>
          <button style={hud.smallBtn} onClick={() => setShowRelationships(v => !v)}>❤️ Relations</button>
          <button style={hud.smallBtn} onClick={() => setShowMentor(v => !v)}>🧑‍🏫 Mentor</button>
          <button style={hud.smallBtn} onClick={() => { setVoiceOn(v => { if (v) stopSpeaking(); return !v; }); }}>{voiceOn ? '🔊 Voice' : '🔇 Voice'}</button>
          <button style={hud.smallBtn} onClick={handleChangePath}>🔀 Path</button>
          <button style={hud.smallBtn} onClick={onLogout}>Log out</button>
        </div>
      </div>

      {/* Step 26 — Objective HUD: the "what should I care about right now?" layer, so the player
          doesn't have to open the Journal just to see the current objective. Reads the same
          trackedMission()/waypointReadout() data the minimap already used internally — no new
          mission-tracking logic, this only renders what already existed. */}
      <div style={hud.objective}>
        {objective ? (
          <>
            <div style={hud.objectiveLabel}>🎯 NEXT</div>
            <div style={hud.objectiveName}>
              {/* Step 28: when the current step's target is an NPC (e.g. "Find Mum"), name them
                  directly instead of just the mission title — closing the "told to find someone
                  I can't identify" gap. Purely a label change; waypoint targeting is unchanged. */}
              {objectiveNpcName ? `${objective.def.name} — ${objectiveNpcName}` : objective.def.name}
            </div>
            {waypoint && <div style={hud.objectiveLocation}>{waypoint.arrow} {waypoint.label} · {waypoint.metres}m</div>}
          </>
        ) : (
          <div style={hud.objectiveLabel}>🎯 NO ACTIVE OBJECTIVE</div>
        )}
      </div>

      {/* Step 26 — Relationship HUD: compact, toggled panel (not a permanent fixture) surfacing the
          existing world.relationships values. Reads whatever NPCs are actually in that object —
          nothing hardcoded, nothing invented, no change to how relationship values are computed. */}
      {showRelationships && (
        <div style={hud.relationships}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>❤️ Relationships</div>
          {Object.entries(s.world.relationships).length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>No relationships yet.</div>
          ) : (
            Object.entries(s.world.relationships).map(([name, value]) => (
              <div key={name} style={hud.phoneLine}>
                <span>{name}</span>
                <span style={{ color: value > 0 ? '#7cfc00' : value < 0 ? '#ff8080' : '#ccc' }}>
                  {value > 0 ? '+' : ''}{value}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {!isTouch && s.player.scene !== 'outdoor' && s.player.scene !== 'bus' && (
        <div style={hud.exitHint}>Press ESC to go outside</div>
      )}

      {/* Shopping-list mission (e.g. Mum's errand): a live checklist off real purchases, not a script */}
      {shopping && (
        <div style={hud.shoppingList}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{shopping.def.emoji} {shopping.def.name}</div>
          {shopping.need.map((prefix, i) => (
            <div key={prefix} style={{ fontSize: 13, marginBottom: 3, opacity: shopping.covered[i] ? 1 : 0.5 }}>
              {shopping.covered[i] ? '✅' : '⬜'} {prefix.replace(/_$/, '').replace(/^./, c => c.toUpperCase())}
            </div>
          ))}
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>Spent so far: ${shopping.total.toFixed(2)}</div>
          {shopping.covered.every(Boolean) && (
            <div style={{ fontSize: 12, color: '#7cfc00', marginTop: 4 }}>✓ GROCERIES COMPLETE — head back out!</div>
          )}
        </div>
      )}

      {/* Contextual "what can I do here" prompt (Rule 42) — only shown when something's in reach.
          Step 28: when the item in reach is also a grocery-list need, this is a physical pickup —
          same underlying buy path (buyNearbyShopItem()), just worded and gated as a collection. */}
      {nearbyItem && !actionable && (
        groceryNeedIdx >= 0 ? (
          <div style={hud.buyPrompt}>
            {groceryAlreadyGot
              ? `✓ Already picked up ${nearbyItem.name} — find what's left on the list`
              : `[E] Pick Up — ${nearbyItem.brand ? `${nearbyItem.brand} ` : ''}${nearbyItem.name} ($${nearbyItem.price.toFixed(2)})`}
          </div>
        ) : (
          <div style={hud.buyPrompt}>
            E: Buy {nearbyItem.brand ? `${nearbyItem.brand} ` : ''}{nearbyItem.name} — ${nearbyItem.price.toFixed(2)}
            {!nearbyItem.affordable && <span style={{ color: '#ff8080' }}> (not enough money)</span>}
          </div>
        )
      )}

      {/* Step 28 — Part 2/7: a generic "[E] Talk" affordance whenever an NPC is close enough to
          interact with and nothing higher-priority (a mission panel, a shop item, a bus stop) is
          already claiming the prompt slot. Reuses the same npcNearPlayer() proximity check
          handleInteract() already uses — no new detection logic, just a visible cue for it. */}
      {nearbyNpc && !actionable && !nearbyItem && !nearStopId && !dialogueLines && !lifeEvent && !boardingAt &&
        helpParentsPhase !== 'seek' && helpParentsPhase !== 'working' && (
        <div style={hud.buyPrompt}>[E] Talk — {getNpcDef(nearbyNpc.id)?.name ?? nearbyNpc.id}</div>
      )}

      {/* Phase 14 / Step 27: bus-stop prompt — arrived bus vs. a countdown to the next one. Step 27
          adds the energy cost alongside the fare, so the player sees all three affected resources
          (money/time/energy) before boarding, not just the fare — closing the Step 27 audit's
          "bus energy is applied but never shown" finding. */}
      {/* This step — Part 2: a real timetable readout, not just an arrived/next-departure line, so
          the player can see the whole route (BUS_ROUTE.name/fare, unchanged authoritative data)
          the moment they reach any stop — "make it obvious what the player can do here." */}
      {nearStopId && !actionable && !nearbyItem && (
        <div style={hud.buyPrompt}>
          <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2 }}>
            🚏 {stopById(nearStopId).name} · {BUS_ROUTE.name} · Fare ${BUS_ROUTE.fare.toFixed(2)}
          </div>
          {busArrived
            ? `E: Board the bus — $${BUS_ROUTE.fare.toFixed(2)} · -1 energy`
            : nextBus
              ? `Waiting for the bus — next arrives at ${formatTime(nextBus.arrivesAt)}`
              : 'No more buses today'}
        </div>
      )}

      {/* Step 27: while riding, a short, honest "you are travelling" banner — real time is already
          fast-forwarding via s.ride (unchanged), this just makes that visible instead of abstract,
          per the Step 27 bus-experience audit. No new rendering/animation system, no change to the
          existing ride/fare/energy validation in boardBus()/finishRide(). */}
      {s.ride && (
        <div style={hud.busRideBanner}>
          🚌 On the bus to {stopById(s.ride.toStop).name} — arriving in {Math.max(0, Math.ceil(s.ride.endsAt - s.minutes))}m
        </div>
      )}

      {/* Destination picker once you've boarded a standing bus */}
      {boardingAt && (
        <DialoguePanel
          speaker={`${stopById(boardingAt).name} — Route 1`}
          lines={['Where to?']}
          choices={Object.values(BUS_STOPS).filter(st => st.id !== boardingAt).map(st => ({
            id: st.id, label: st.name, sublabel: `~${rideMinutes(boardingAt, st.id)} min · $${BUS_ROUTE.fare.toFixed(2)} · -1 energy`,
            cost: 0, minutes: 0, consequence: '',
          }))}
          onChoose={(c) => {
            const result = store.boardBus(boardingAt, c.id);
            store.setPaused(false);
            setBoardingAt(null);
            // Surface a real failure (fare/energy/bus already gone) instead of silently doing
            // nothing — this is exactly the "no travel graphics" symptom when boardBus() refuses.
            if (!result.ok) setDialogueLines({ npc: stopById(boardingAt).name, text: result.reason ?? "Couldn't board the bus." });
          }}
          voiceOn={voiceOn}
        />
      )}

      {/* Step 10: the Step 7B "How are you getting to school today?" panel has been removed — Monday
          transport is now handled solely by the live 'get_to_school' mission's own DialoguePanel
          (rendered via the `actionable` mission-step panel elsewhere in this file), which already
          offered the identical walk/bus choice. See the Step 9/10 reports for why keeping both was
          a genuine duplicate-state risk, not a stylistic preference. */}

      {/* Step 8: Attend Class prompt — same priority pattern as the other contextual panels above. */}
      {classEligible && !actionable && !lifeEvent && !boardingAt && !classFailure && (
        <DialoguePanel
          speaker="Ms Patel"
          lines={[clockParts.minuteOfDay < 8 * 60 + 30 ? "You're early! Grab a seat — the bell goes at 8:30." : 'Take your seat — class is starting.']}
          choices={[
            { id: 'attend', label: '📚 Attend class', sublabel: `4 hours · ${ATTEND_CLASS.energyCost} energy`, cost: 0, minutes: 0, consequence: '' },
          ]}
          balance={store.cash}
          voiceOn={voiceOn}
          onChoose={() => attendClass()}
        />
      )}

      {/* Result of a rejected Attend Class attempt (e.g. not enough energy) — informational, click
          to dismiss. Does NOT mark class complete or advance the day on its own. */}
      {classFailure && (
        <div style={hud.dialogue} onClick={() => setClassFailure(null)}>
          <div style={{ fontWeight: 700, color: '#ffd700', marginBottom: 4 }}>Ms Patel</div>
          <div>{classFailure}</div>
        </div>
      )}

      {/* Where's class? A single hint in the prompt slot while you're at school but not yet in class. */}
      {!actionable && !nearbyItem && !lifeEvent && !boardingAt && (classStatus === 'go_to_classroom' || classStatus === 'too_late') && (
        <div style={hud.buyPrompt}>
          {classStatus === 'go_to_classroom'
            ? '🔔 Class is in the Classroom — first door on the left of the hallway'
            : "🔔 Too late for class today — you'll be marked absent"}
        </div>
      )}

      {/* Step 15/27: Help Parents — the Step 27 first-vertical-slice mission. Same priority pattern
          as the Attend Class panel, only shown when nothing else is active AND the player hasn't
          already been asked today (helpParentsPhase === null means "not yet accepted/declined
          today" — the panel disappears the instant a choice is made, it does not linger). */}
      {helpParentsEligible && helpParentsPhase === null && !actionable && !lifeEvent && !boardingAt &&
        !classEligible && !classFailure && !helpParentsFailure && !nearbyItem && !nearStopId && (
        <DialoguePanel
          speaker="Mum"
          lines={['Could you help out around the house for a bit?']}
          choices={[
            { id: 'help', label: 'Help Mum', sublabel: '~30 min · 5 energy · +$5', cost: 0, minutes: 0, consequence: '' },
            { id: 'decline', label: 'Not right now', sublabel: 'Mum will understand — probably', cost: 0, minutes: 0, consequence: '' },
          ]}
          balance={store.cash}
          voiceOn={voiceOn}
          onChoose={(c) => { if (c.id === 'help') setHelpParentsPhaseBoth('seek'); else declineHelpParents(); }}
        />
      )}

      {/* Step 27: 'seek' phase — the player accepted, dialogue has closed, and they keep full normal
          movement/control. This is a HUD hint only (same style as the existing shop/bus contextual
          prompts), not a menu — pressing E near Mum (handled in the keydown handler via
          tryStartHelpParentsActivity()) is what actually starts the activity. */}
      {helpParentsPhase === 'seek' && (
        <div style={hud.buyPrompt}>🧹 Find Mum and press E to start helping</div>
      )}

      {/* Step 27: 'working' phase — the reusable short activity sequence itself. A real progress
          bar (driven by the useEffect above), not a fake video and not a full mini-game. The
          player's objective/HUD stays visible underneath; this is an overlay, not a modal that
          blocks the rest of the screen. */}
      {helpParentsPhase === 'working' && (
        <div style={hud.activitySequence}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>🧹</div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>Helping around the house…</div>
          <div style={hud.activityBarTrack}>
            <div style={{ ...hud.activityBarFill, width: `${helpParentsProgress}%` }} />
          </div>
        </div>
      )}

      {/* Result of a rejected Help Parents attempt (e.g. not enough energy) — informational, click
          to dismiss. Does NOT mark the chore complete. */}
      {helpParentsFailure && (
        <div style={hud.dialogue} onClick={() => setHelpParentsFailure(null)}>
          <div style={{ fontWeight: 700, color: '#ffd700', marginBottom: 4 }}>Mum</div>
          <div>{helpParentsFailure}</div>
        </div>
      )}

      {/* Idle chat / purchase confirmation / bus-timing toast — auto-dismisses, yields to real dialogue */}
      {dialogueLines && !actionable && !lifeEvent && !boardingAt && (
        <div style={hud.dialogue} onClick={() => { stopSpeaking(); setDialogueLines(null); }}>
          {dialogueLines.npc && <div style={{ fontWeight: 700, color: '#ffd700', marginBottom: 4 }}>{dialogueLines.npc}</div>}
          <div>{dialogueLines.text}</div>
        </div>
      )}

      {/* Contextual dialogue / choice panel (life event takes priority if both somehow line up) */}
      {actionable && !lifeEvent && (
        <DialoguePanel
          speaker={actionable.step.remote && actionable.step.speaker ? `📱 ${actionable.step.speaker}` : actionable.step.speaker}
          lines={actionable.step.lines}
          choices={actionable.step.choices}
          balance={store.cash}
          voiceOn={voiceOn}
          skipSignal={skipSignal}
          onChoose={(c) => { store.applyChoice(actionable.def.id, c); setDialogueLines(null); }}
        />
      )}

      {/* Journal */}
      {showJournal && (
        <JournalPanel journal={journal} onClose={() => setShowJournal(false)} />
      )}

      {/* Phone / wallet dashboard */}
      {showPhone && (
        <PhoneDashboard state={s} onClose={() => setShowPhone(false)} />
      )}

      {/* AI Mentor chat */}
      {showMentor && (
        <MentorPanel
          context={{ lifePath: profile.lifePath, day, balance: store.cash, activeMissions: journal.active.map(a => a.name) }}
          onClose={() => setShowMentor(false)}
          voiceOn={voiceOn}
        />
      )}

      {/* Achievement toast */}
      {achievementToast && (
        <div style={hud.achievementToast}>
          <span style={{ fontSize: 22 }}>{achievementToast.emoji}</span>
          <div>
            <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 0.5 }}>ACHIEVEMENT UNLOCKED</div>
            <div style={{ fontWeight: 700 }}>{achievementToast.name}</div>
          </div>
        </div>
      )}

      {/* Step 26 — mission-availability toast: same shape as the achievement toast above (a
          non-blocking overlay that self-dismisses after 4s), fed by store.takeOffers(), which
          already existed and already de-duplicates/self-clears — so this never repeats for a
          mission that simply remains available. */}
      {missionToast && (
        <div style={hud.missionToast}>
          <span style={{ fontSize: 22 }}>{missionToast.emoji}</span>
          <div>
            <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 0.5 }}>NEW OBJECTIVE</div>
            <div style={{ fontWeight: 700 }}>{missionToast.name}</div>
          </div>
        </div>
      )}

      {/* Step 27 — generic activity/consequence-feedback toast (reusable beyond Help Parents: any
          future accepted/declined activity can call setActivityToast with its own icon/lines rather
          than each one inventing its own popup). Same non-blocking, self-dismissing shape as the
          achievement/mission toasts above. */}
      {activityToast && (
        <div style={hud.activityToast}>
          <span style={{ fontSize: 22 }}>{activityToast.icon}</span>
          <div>
            {activityToast.lines.map((line, i) => (
              <div key={i} style={i === 0 ? { fontWeight: 700 } : { fontSize: 12, opacity: 0.85 }}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* Life event (small, optional, day-to-day decision — separate from scheduled missions) */}
      {lifeEvent && s.pendingLifeEvent && (
        <DialoguePanel
          speaker={`${lifeEvent.emoji} ${lifeEvent.text}`}
          lines={[]}
          choices={lifeEvent.choices.map(c => ({
            id: c.id, label: c.label,
            sublabel: c.amount !== 0 ? (c.amount > 0 ? `+$${c.amount.toFixed(2)}` : `-$${Math.abs(c.amount).toFixed(2)}`) : '',
            cost: Math.min(0, c.amount), minutes: 0, consequence: c.consequence,
          }))}
          balance={store.cash}
          onChoose={(c) => store.resolveLifeEvent(c.id)}
        />
      )}

      {/* Day / week summaries */}
      {daySummary && (
        <SummaryModal title={daySummary.title} lines={[daySummary.moneyLine, daySummary.spentLine, daySummary.schoolLine, daySummary.missionsLine, daySummary.timeLine].filter(Boolean) as string[]}
          onClose={() => store.dismissDaySummary()} />
      )}
      {!daySummary && weekSummary && (
        <SummaryModal title={weekSummary.title} lines={[weekSummary.income, weekSummary.spending, weekSummary.savings, weekSummary.missions, weekSummary.social, weekSummary.school, ...weekSummary.decisions]}
          onClose={() => store.dismissWeekSummary()} />
      )}

      {/* "Make It to Friday" recap — real numbers computed at completion, not scripted */}
      {!daySummary && store.pendingLevelSummary && (
        <LevelSummaryModal summary={store.pendingLevelSummary} onClose={() => store.dismissLevelSummary()} />
      )}

      {/* Sleep button (only shown at home, outdoor scene excluded) */}
      {s.player.place === 'home' && (
        <button style={hud.sleepBtn} onClick={() => store.sleep(false)}>🛏️ Go to sleep</button>
      )}
    </div>
  );
}

function DialoguePanel({ speaker, lines, choices, onChoose, balance, voiceOn, skipSignal }: {
  speaker?: string; lines: string[]; choices?: MissionChoice[]; onChoose: (c: MissionChoice) => void;
  /** When given, a choice costing more than this is shown but disabled — real trade-offs mean some
   *  options genuinely aren't available, not just unwise (Rule 3/4: the game never hides the option,
   *  but it doesn't let you spend money you don't have either). */
  balance?: number;
  /** When true, each revealed line is read aloud in a voice fingerprinted to `speaker` (src/lib/tts.ts). */
  voiceOn?: boolean;
  /** Bump this (any changed number) to fast-forward straight to the choices — driven by the
   *  on-screen "SKIP" touch button, since there's no keyboard shortcut to hold down on mobile. */
  skipSignal?: number;
}) {
  // Reveal one line at a time (tap/click to advance) instead of dumping the whole exchange at
  // once — reads like an actual back-and-forth instead of a wall of text with buttons under it.
  const [shown, setShown] = useState(1);
  const key = speaker + '|' + lines.join('|');
  useEffect(() => { setShown(1); }, [key]);
  const skipSignalRef = useRef(skipSignal);
  useEffect(() => {
    if (skipSignal !== undefined && skipSignal !== skipSignalRef.current) {
      skipSignalRef.current = skipSignal;
      setShown(lines.length);
    }
  }, [skipSignal, lines.length]);
  useEffect(() => {
    if (voiceOn) speakLine(speaker, lines[shown - 1] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, shown, voiceOn]);
  const atEnd = shown >= lines.length;
  return (
    <div style={hud.dialogue} onClick={() => { if (!atEnd) setShown(n => n + 1); }}>
      {speaker && <div style={{ fontWeight: 700, color: '#ffd700', marginBottom: 4 }}>{speaker}</div>}
      {lines.slice(0, shown).map((l, i) => <div key={i} style={{ marginBottom: 4 }}>{l}</div>)}
      {!atEnd && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>▾ tap to continue</div>}
      {atEnd && choices && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {choices.map(c => {
            const affordable = balance === undefined || -c.cost <= balance;
            return (
              <button
                key={c.id}
                style={{ ...hud.choiceBtn, ...(affordable ? {} : hud.choiceBtnDisabled) }}
                disabled={!affordable}
                onClick={() => affordable && onChoose(c)}
              >
                <div>{c.label}{!affordable && <span style={{ color: '#ff8080', fontWeight: 400 }}> — can't afford</span>}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{c.sublabel}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function JournalPanel({ journal, onClose }: { journal: ReturnType<typeof buildJournal>; onClose: () => void }) {
  const section = (title: string, entries: typeof journal.active) => entries.length > 0 && (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
      {entries.map(e => (
        <div key={e.id} style={{ fontSize: 13, marginBottom: 4 }}>{e.emoji} {e.name} — {e.text}</div>
      ))}
    </div>
  );
  return (
    <div style={hud.journal}>
      <button style={{ float: 'right', ...hud.smallBtn }} onClick={onClose}>Close</button>
      <h3>Mission Journal</h3>
      {section('ACTIVE', journal.active)}
      {section('OPTIONAL', journal.optional)}
      {journal.upcoming.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, opacity: 0.75 }}>UPCOMING THIS WEEK</div>
          {journal.upcoming.map(e => (
            <div key={e.id} style={{ fontSize: 12, marginBottom: 4, opacity: 0.6 }}>{e.emoji} {e.name} — {e.text}</div>
          ))}
        </div>
      )}
      {section('COMPLETED TODAY', journal.completed)}
      {section('MISSED', journal.missed)}
      {journal.active.length + journal.optional.length === 0 && <div style={{ opacity: 0.6 }}>Nothing pending right now.</div>}
    </div>
  );
}

/** AI Mentor chat — a small in-game chat window backed by src/app/api/mentor/route.ts. */
interface MentorMsg { from: 'you' | 'kai'; text: string }
function MentorPanel({ context, onClose, voiceOn }: {
  context: { lifePath: string; day: string; balance: number; activeMissions: string[] };
  onClose: () => void;
  voiceOn?: boolean;
}) {
  const greeting = "Hey, I'm Kai — your money mentor. Ask me anything about budgeting, saving, or what to do this week.";
  const [msgs, setMsgs] = useState<MentorMsg[]>([{ from: 'kai', text: greeting }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => { if (voiceOn) speakLine('Kai', greeting); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMsgs(m => [...m, { from: 'you', text }]);
    setSending(true);
    const reply = await askMentorChat(text, context);
    setMsgs(m => [...m, { from: 'kai', text: reply }]);
    if (voiceOn) speakLine('Kai', reply);
    setSending(false);
  };

  return (
    <div style={hud.modalBackdrop}>
      <div style={{ ...hud.modal, width: 'min(380px, 92vw)', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
        <h3 style={{ margin: '0 0 10px' }}>🧑‍🏫 Kai — Money Mentor</h3>
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10, paddingRight: 4 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{
              marginBottom: 8, padding: '8px 10px', borderRadius: 8, fontSize: 13, lineHeight: 1.4,
              background: m.from === 'you' ? '#1f6feb22' : '#0d1117',
              marginLeft: m.from === 'you' ? 30 : 0, marginRight: m.from === 'you' ? 0 : 30,
            }}>
              {m.text}
            </div>
          ))}
          {sending && <div style={{ fontSize: 12, opacity: 0.6 }}>Kai is thinking…</div>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder="Ask Kai something…" style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
          />
          <button style={{ ...btnStyle, width: 'auto', padding: '0 14px' }} onClick={send} disabled={sending}>Send</button>
        </div>
        <button style={{ ...hud.smallBtn, marginTop: 10, alignSelf: 'flex-end' }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** Phone/wallet dashboard — reads straight off the one FinancialState (accounts, recurring
 *  expenses, transaction ledger) and GoalState. The spending breakdown covers the last 7 days. */
function PhoneDashboard({ state, onClose }: { state: GameState; onClose: () => void }) {
  const f = state.finance;
  const cash = f.accounts.cash;
  const weekCutoff = state.minutes - 7 * 24 * 60;
  const spending = f.transactions.recent.filter(t => t.timestamp >= weekCutoff && t.amount < 0 && t.type !== 'transfer');

  const byCategory = new Map<string, number>();
  for (const t of spending) byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + -t.amount);
  const spendRows = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
  const maxSpend = spendRows.length ? spendRows[0][1] : 1;
  const weekSpent = spendRows.reduce((sum, [, v]) => sum + v, 0);

  const recent = f.transactions.recent.slice(-12).reverse();
  const owed = f.debt.loans.reduce((sum, l) => sum + l.principal, 0);
  const daysUntil = (at: number) => Math.max(0, Math.ceil((at - state.minutes) / (24 * 60)));
  const CATEGORY_EMOJI: Record<string, string> = {
    food: '🍎', shopping: '🛒', transport: '🚌', housing: '🏠', entertainment: '🕹️', gift: '🎁',
    income: '💵', mission_reward: '🎯', life_event: '🍀', transfer: '🐷', subscription: '📄',
  };

  return (
    <div style={hud.modalBackdrop} onClick={onClose}>
      <div style={hud.phone} onClick={e => e.stopPropagation()}>
        <button style={{ float: 'right', ...hud.smallBtn }} onClick={onClose}>Close</button>
        <h3 style={{ margin: '0 0 12px' }}>📱 Wallet</h3>

        <div style={hud.phoneBalance}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#7cfc00' }}>${cash.toFixed(2)}</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>Cash</div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, fontSize: 12 }}>
          <div style={hud.phoneStat}>Savings<br /><b>${f.accounts.savings.toFixed(2)}</b></div>
          <div style={hud.phoneStat}>Emergency<br /><b>${f.accounts.emergencyFund.toFixed(2)}</b></div>
          <div style={hud.phoneStat}>Owed<br /><b style={{ color: owed > 0 ? '#ff8080' : undefined }}>${owed.toFixed(2)}</b></div>
        </div>

        {/* Bills and pay */}
        {(f.expenses.recurring.length > 0 || f.income.job) && (
          <div style={hud.phoneSection}>
            <div style={hud.phoneSectionTitle}>UPCOMING</div>
            {f.expenses.recurring.map(b => (
              <div key={b.id} style={hud.phoneLine}><span>{b.category === 'housing' ? '🏠' : '📄'} {b.name} — ${b.amount.toFixed(2)}</span><span>in {daysUntil(b.nextDueAt)}d</span></div>
            ))}
            {f.income.job && (
              <div style={hud.phoneLine}><span>💼 {f.income.job.name} pay</span><span>${(f.income.job.payPerHour * f.income.job.hoursPerWeek).toFixed(2)}/wk</span></div>
            )}
          </div>
        )}

        {/* Goals */}
        {state.goals.active.length > 0 && (
          <div style={hud.phoneSection}>
            <div style={hud.phoneSectionTitle}>GOALS</div>
            {state.goals.active.map(g => {
              const pct = g.kind === 'financial' ? Math.min(100, Math.round((g.saved / Math.max(1, g.target)) * 100)) : g.completed ? 100 : 0;
              return (
                <div key={g.id} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span>{g.kind === 'financial' ? g.name : g.description}</span>
                    {g.kind === 'financial' && <span>${g.saved.toFixed(0)} / ${g.target.toFixed(0)}</span>}
                  </div>
                  <div style={hud.phoneBarTrack}><div style={{ ...hud.phoneBarFill, width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}

        {/* Spending breakdown (last 7 days) */}
        <div style={hud.phoneSection}>
          <div style={hud.phoneSectionTitle}>SPENT THIS WEEK — ${weekSpent.toFixed(2)}</div>
          {spendRows.length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>Nothing spent yet.</div>}
          {spendRows.map(([cat, amt]) => (
            <div key={cat} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span>{CATEGORY_EMOJI[cat] ?? '💳'} {cat.replace('_', ' ')}</span><span>${amt.toFixed(2)}</span>
              </div>
              <div style={hud.phoneBarTrack}><div style={{ ...hud.phoneBarFill, width: `${Math.round((amt / maxSpend) * 100)}%`, background: '#ffab40' }} /></div>
            </div>
          ))}
        </div>

        {/* Recent transactions */}
        <div style={hud.phoneSection}>
          <div style={hud.phoneSectionTitle}>RECENT</div>
          {recent.length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>No transactions yet.</div>}
          {recent.map(e => (
            <div key={e.id} style={hud.phoneLine}>
              <span>{CATEGORY_EMOJI[e.category] ?? '💳'} {e.description}</span>
              <span style={{ color: e.amount < 0 ? '#ff8080' : '#7cfc00' }}>
                {e.amount < 0 ? '-' : '+'}${Math.abs(e.amount).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {/* Achievements */}
        <div style={hud.phoneSection}>
          <div style={hud.phoneSectionTitle}>
            ACHIEVEMENTS — {ACHIEVEMENTS.filter(a => isUnlocked(state, a.id)).length}/{ACHIEVEMENTS.length}
          </div>
          {ACHIEVEMENTS.map(a => {
            const unlocked = isUnlocked(state, a.id);
            return (
              <div key={a.id} style={{ ...hud.phoneLine, opacity: unlocked ? 1 : 0.4 }}>
                <span>{unlocked ? a.emoji : '🔒'} {a.name}</span>
                <span style={{ fontSize: 10, opacity: 0.7, maxWidth: 150, textAlign: 'right' }}>{a.description}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SummaryModal({ title, lines, onClose }: { title: string; lines: string[]; onClose: () => void }) {
  return (
    <div style={hud.modalBackdrop}>
      <div style={hud.modal}>
        <h2 style={{ marginBottom: 12 }}>{title}</h2>
        {lines.map((l, i) => <div key={i} style={{ marginBottom: 6 }}>{l}</div>)}
        <button style={{ ...btnStyle, marginTop: 16 }} onClick={onClose}>Continue</button>
      </div>
    </div>
  );
}

/** "Make It to Friday" week recap. Every line reads a real value off the summary the store computed
 *  at the moment of completion — nothing here is templated flavor text pretending to be data. */
function LevelSummaryModal({ summary: sm, onClose }: { summary: LevelSummary; onClose: () => void }) {
  const [mentorTake, setMentorTake] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setMentorTake(null);
    askMentorWeeklyRecap({
      startBalance: sm.startBalance, endBalance: sm.endBalance,
      daysAttended: sm.daysAttended, daysTotal: sm.daysTotal,
      schoolProjectDone: sm.schoolProjectDone, birthdayOutcome: sm.birthdayOutcome,
      unexpectedOutcome: sm.unexpectedOutcome, wentToArcade: sm.wentToArcade,
    }).then(reply => { if (live) setMentorTake(reply); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sm]);
  const net = sm.endBalance - sm.startBalance;
  const birthdayLine = sm.birthdayOutcome === 'full' ? "✓ Paid Riley's birthday in full"
    : sm.birthdayOutcome === 'partial' ? '~ Paid Riley part of what you promised'
    : "✗ Didn't come through for Riley's birthday";
  const projectLine = sm.schoolProjectDone ? '✓ Got the school project supplies in time' : "✗ Never got the school project supplies";
  const unexpectedLine = sm.unexpectedOutcome === 'paid' ? '⚡ Paid to top up the bus card'
    : sm.unexpectedOutcome === 'walked' ? '⚡ Walked it off instead of paying'
    : null;
  return (
    <div style={hud.modalBackdrop}>
      <div style={{ ...hud.modal, width: 'min(400px, 92vw)' }}>
        <h2 style={{ marginBottom: 4 }}>📅 Made It Through the Week</h2>
        <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 16 }}>Here's how the week actually went.</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', background: '#0d1117', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          <div><div style={{ fontSize: 11, opacity: 0.6 }}>STARTED WITH</div><div style={{ fontSize: 18, fontWeight: 700 }}>${sm.startBalance.toFixed(2)}</div></div>
          <div style={{ fontSize: 20, opacity: 0.5, alignSelf: 'center' }}>→</div>
          <div><div style={{ fontSize: 11, opacity: 0.6 }}>ENDED WITH</div><div style={{ fontSize: 18, fontWeight: 700, color: net >= 0 ? '#7cfc00' : '#ff8080' }}>${sm.endBalance.toFixed(2)}</div></div>
        </div>
        <div style={{ marginBottom: 6 }}>🏫 School: {sm.daysAttended}/{sm.daysTotal} days attended</div>
        <div style={{ marginBottom: 6 }}>{projectLine}</div>
        <div style={{ marginBottom: 6 }}>{birthdayLine}</div>
        {unexpectedLine && <div style={{ marginBottom: 6 }}>{unexpectedLine}</div>}
        <div style={{ marginBottom: 6 }}>{sm.wentToArcade ? '🕹️ Made it to the arcade with friends' : '🕹️ Skipped the arcade this week'}</div>
        <div style={{ marginBottom: 6 }}>
          {sm.busRides > 0
            ? `🚌 ${sm.busRides} bus ride${sm.busRides === 1 ? '' : 's'} — $${sm.busSpent.toFixed(2)} spent on the bus`
            : '🚶 Walked everywhere — $0 on fares'}
        </div>
        <div style={{ marginTop: 14, padding: '10px 12px', background: '#0d1117', borderRadius: 8, borderLeft: '3px solid #60b8ff' }}>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>🧑‍🏫 KAI'S TAKE</div>
          <div style={{ fontSize: 13, lineHeight: 1.4 }}>{mentorTake ?? 'Thinking it over…'}</div>
        </div>
        <button style={{ ...btnStyle, marginTop: 16 }} onClick={onClose}>Start next week</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CANVAS DRAWING
// ─────────────────────────────────────────────────────────────────────────────

function draw(ctx: CanvasRenderingContext2D, cw: number, ch: number, store: GameStore, loop: GameLoop) {
  const s = store.state;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, cw, ch);

  if (s.player.scene === 'bus') {
    drawBusRide(ctx, cw, ch, store);
    return;
  }
  if (s.player.scene !== 'outdoor') {
    drawInterior(ctx, cw, ch, store);
    return;
  }

  const camX = loop.camera.x, camY = loop.camera.y;
  ctx.save();
  ctx.translate(cw / 2 - camX, ch / 2 - camY);

  // Ground tiles (viewport-culled)
  const startTx = Math.max(0, Math.floor((camX - cw / 2) / TILE_PX));
  const endTx = Math.min(MAP_W, Math.ceil((camX + cw / 2) / TILE_PX));
  const startTy = Math.max(0, Math.floor((camY - ch / 2) / TILE_PX));
  const endTy = Math.min(MAP_H, Math.ceil((camY + ch / 2) / TILE_PX));
  for (let ty = startTy; ty < endTy; ty++) {
    for (let tx = startTx; tx < endTx; tx++) {
      const img = getImg(groundSprite(tx, ty));
      if (img) ctx.drawImage(img, tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX);
      else { ctx.fillStyle = '#5a8a4a'; ctx.fillRect(tx * TILE_PX, ty * TILE_PX, TILE_PX, TILE_PX); }
    }
  }

  // Buildings (backdrop — player can't walk onto their footprint except through the door gap,
  // so a simple "buildings first, entities after" draw order is correct without needing to
  // Y-sort buildings themselves against the player).
  for (const p of PLACES) {
    const x = p.tx * TILE_PX, y = p.ty * TILE_PX, w = p.tw * TILE_PX, h = p.th * TILE_PX;
    if (p.interior === 'none') { ctx.fillStyle = 'rgba(60,120,60,0.5)'; ctx.fillRect(x, y, w, h); continue; }
    const open = placeIsOpen(p.id, s.minutes);
    const img = p.sprite ? getImg(p.sprite) : null;
    if (img) {
      if (!open) ctx.filter = 'brightness(0.6)';
      ctx.drawImage(img, x, y, w, h);
      ctx.filter = 'none';
    } else {
      // Rule-50 gap: no supplied sprite for this building — labelled placeholder, not invented art.
      ctx.fillStyle = open ? '#7a8a6a' : '#5a5a5a';
      ctx.fillRect(x, y, w, h);
      ctx.font = `${Math.round(TILE_PX * 0.5)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.emoji, x + w / 2, y + h / 2 + 10);
    }
    ctx.font = `bold ${Math.round(TILE_PX * 0.22)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.strokeText(p.name, x + w / 2, y + h + TILE_PX * 0.3);
    ctx.fillText(p.name, x + w / 2, y + h + TILE_PX * 0.3);
  }

  // This step — Part 2: a real, visible bus stop (a sign at the stop tile) rather than an invisible
  // trigger zone the player only discovers via a HUD prompt. No new stop data — BUS_STOPS/BUS_ROUTE
  // (world.ts, Step 16) remain the sole source of stop positions/fare/timetable; this only draws
  // what's already there. When a bus is actually at the stop (busAtStop(), the same check the E-key
  // boarding prompt already uses), a simple rectangle "bus" is also drawn parked at the stop so the
  // player is never staring at an empty street while a boarding prompt claims one is available.
  for (const stop of Object.values(BUS_STOPS)) {
    const x = stop.tile.x * TILE_PX, y = stop.tile.y * TILE_PX;
    const arrived = !!busAtStop(stop.id, s.minutes);
    // sign post
    ctx.fillStyle = '#444';
    ctx.fillRect(x - 3, y - TILE_PX * 0.9, 6, TILE_PX * 0.9);
    ctx.fillStyle = '#2b6cb0';
    ctx.fillRect(x - TILE_PX * 0.32, y - TILE_PX * 1.15, TILE_PX * 0.64, TILE_PX * 0.32);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.strokeRect(x - TILE_PX * 0.32, y - TILE_PX * 1.15, TILE_PX * 0.64, TILE_PX * 0.32);
    ctx.font = `${Math.round(TILE_PX * 0.22)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('🚏', x, y - TILE_PX * 0.9);
    ctx.font = `bold ${Math.round(TILE_PX * 0.16)}px monospace`;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.strokeText(stop.name, x, y + TILE_PX * 0.35);
    ctx.fillText(stop.name, x, y + TILE_PX * 0.35);
    if (arrived) {
      // a plain rectangle "bus" (Rule 50: no supplied bus sprite) parked just beside the sign —
      // present the moment busAtStop() is true, gone the moment it isn't, so the world always
      // matches the boarding prompt's claim that a bus is here right now.
      const bx = x + TILE_PX * 0.9, by = y - TILE_PX * 0.55;
      ctx.fillStyle = '#e0a800';
      ctx.fillRect(bx, by, TILE_PX * 1.6, TILE_PX * 0.8);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, TILE_PX * 1.6, TILE_PX * 0.8);
      ctx.fillStyle = '#bde3ff';
      for (let i = 0; i < 3; i++) ctx.fillRect(bx + 8 + i * 26, by + 8, 18, 16);
      ctx.font = `${Math.round(TILE_PX * 0.3)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🚌', bx + TILE_PX * 0.8, by + TILE_PX * 0.65);
    }
  }

  // Phase 8: school-exterior decoration (fence line, sign, lamps) — visual only, drawn on the
  // ground layer since these props sit outside any building footprint that already has collision.
  for (const prop of DECOR_PROPS) {
    const img = getImg(prop.sprite);
    if (!img) continue;
    const w = img.naturalWidth, h = img.naturalHeight;
    const px = prop.tx * TILE_PX, py = prop.ty * TILE_PX;
    const drawY = prop.anchorBottom ? py - h : py;
    ctx.drawImage(img, px, drawY, w, h);
  }

  // Player + NPCs, Y-sorted by their base (feet) position so whoever is "lower" on screen draws
  // on top — this is the depth-sort the master doc asks for among characters.
  const runFrame = Math.floor((performance.now() / 90) % CHAR_RUN_FRAMES);
  type Entity = { x: number; y: number; facing: number; moving: boolean; sheetName: string; npcId?: string };
  const entities: Entity[] = [
    ...(Object.values(s.npcs) as NpcRuntime[]).filter(n => n.visible).map(n => ({
      // npc.facing is already the real per-step walking direction the store computed in stepNpcs()
      x: n.x, y: n.y, facing: n.facing, moving: n.moving, sheetName: getNpcDef(n.id)?.sheet ?? 'alex', npcId: n.id,
    })),
    { x: s.player.x, y: s.player.y, facing: s.player.facing, moving: Math.hypot(s.player.vx, s.player.vy) > 4, sheetName: 'adam' },
  ];
  entities.sort((a, b) => a.y - b.y);
  // Step 28 — Part 2: a subtle world-space indicator over whichever NPC the current objective
  // targets, reusing trackedMission() (already the source of the Objective HUD/waypoint) rather
  // than a second "who matters right now" lookup. Deliberately just a small bobbing marker + label,
  // not a debug-style highlight, per Part 2's "should not make the game look like a debug tool".
  const targetNpcId = trackedMission(s, store.defs)?.def.steps[trackedMission(s, store.defs)!.rt.stepIndex]?.npcId;
  const bob = Math.sin(performance.now() / 300) * 3;
  const wantsToTalk = store.npcsWantingToTalk();
  for (const e of entities) {
    const dir = facingToDir(e.facing);
    const dirIdx = DIR_ORDER.indexOf(dir);
    const sheet = getImg(characterSheet(e.sheetName, e.moving ? 'run' : 'idle'));
    const drawH = TILE_PX * 1.25, drawW = drawH * (CHAR_FRAME_W / CHAR_FRAME_H);
    if (sheet) {
      const sx = e.moving ? (dirIdx * CHAR_RUN_FRAMES + runFrame) * CHAR_FRAME_W : dirIdx * CHAR_FRAME_W;
      ctx.drawImage(sheet, sx, 0, CHAR_FRAME_W, CHAR_FRAME_H, e.x - drawW / 2, e.y - drawH + TILE_PX * 0.15, drawW, drawH);
    } else {
      drawPersonFallback(ctx, e.x, e.y, TILE_PX, e.sheetName === 'adam' ? '#3a6aaa' : '#d68ac0');
    }
    if (e.npcId) {
      // name tag, so the player can tell Jordan from Riley at a glance
      ctx.font = `bold ${Math.round(TILE_PX * 0.17)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      const tag = getNpcDef(e.npcId)?.name ?? e.npcId;
      ctx.strokeText(tag, e.x, e.y + TILE_PX * 0.38);
      ctx.fillText(tag, e.x, e.y + TILE_PX * 0.38);
    }
    if (e.npcId && (e.npcId === targetNpcId || wantsToTalk.has(e.npcId))) {
      ctx.font = `${Math.round(TILE_PX * 0.4)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(wantsToTalk.has(e.npcId) ? '💬' : '📍', e.x, e.y - drawH + TILE_PX * 0.15 - 6 + bob);
    }
  }

  ctx.restore();

  // Day/night overlay (screen space, after world draw)
  drawDayNightOverlay(ctx, s.minutes, cw, ch);

  // Minimap (bottom-right)
  drawMinimap(ctx, cw - 190, ch - 190, { size: 170, worldW: MAP_W * TILE_PX, worldH: MAP_H * TILE_PX }, s, store.defs, loop.pulseT);
}

/** Phase 7: a real explorable interior room — its own small tile grid, camera-centred (rooms are
 *  small enough not to need scrolling), real floor sprite + collision, furniture drawn as sliced
 *  sprites where confirmed or a labelled placeholder block where not (see world.ts INTERIORS). */
function drawInterior(ctx: CanvasRenderingContext2D, cw: number, ch: number, store: GameStore) {
  const s = store.state;
  const interior = getInterior(s.player.scene);
  if (!interior) return;
  const T = INTERIOR_TILE_PX;
  const roomW = interior.widthTiles * T, roomH = interior.heightTiles * T;
  // This step: interiors used to draw at native tile size and simply center that (usually small)
  // room on the canvas — correct at the old fixed 1280x800 canvas, but on a real fullscreen viewport
  // (now often much larger, see the canvas-resize fix) the room looked like a small box floating in
  // a sea of black, i.e. "not fullscreen". Scale the room up to actually fill the viewport instead of
  // just centering it at native size — clamped to [1, 3] so a tiny window never shrinks it below
  // native size and a huge monitor never blows it up into blurry oversized tiles. Every draw call
  // below this point still uses plain room-local pixel coordinates (tx*T, ty*T, …) — only the
  // translate/scale setup changes, so nothing else in this function needed to move.
  const scale = Math.min(3, Math.max(1, Math.min((cw * 0.92) / roomW, (ch * 0.85) / roomH)));
  const ox = Math.round((cw - roomW * scale) / 2), oy = Math.round((ch - roomH * scale) / 2);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  // walls (room bounding rect) + floor
  ctx.fillStyle = interior.wallColor;
  ctx.fillRect(-8, -8, roomW + 16, roomH + 16);
  const floorImg = getImg(interior.floorSprite.src);
  for (let ty = 0; ty < interior.heightTiles; ty++) {
    for (let tx = 0; tx < interior.widthTiles; tx++) {
      if (floorImg) {
        const f = interior.floorSprite;
        ctx.drawImage(floorImg, f.sx, f.sy, f.sw, f.sh, tx * T, ty * T, T, T);
      } else { ctx.fillStyle = '#7a5a3a'; ctx.fillRect(tx * T, ty * T, T, T); }
    }
  }

  // door markers — one per link (leave the building, or hop to another room in it)
  for (const link of interior.links) {
    ctx.fillStyle = link.toScene === 'outside' ? 'rgba(255,215,63,0.35)' : 'rgba(120,200,255,0.35)';
    ctx.fillRect(link.tile.x * T - T / 2, link.tile.y * T - T / 4, T, T * 0.7);
    ctx.font = `${Math.round(T * 0.28)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.strokeText(link.label, link.tile.x * T, link.tile.y * T - T * 0.4);
    ctx.fillText(link.label, link.tile.x * T, link.tile.y * T - T * 0.4);
  }

  // shop products (Phase 10) — a real price tag at each product's spot on the shelf, not a menu
  if (interior.shopItems) {
    for (const item of interior.shopItems) {
      const x = item.tx * T, y = item.ty * T;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
      const w = T * 0.62, h = T * 0.32;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);
      ctx.font = `bold ${Math.round(T * 0.16)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#222';
      ctx.fillText(item.name, x, y - T * 0.02);
      ctx.fillStyle = '#0a7a3a';
      ctx.fillText(`$${item.price.toFixed(2)}`, x, y + T * 0.14);
    }
  }

  // furniture (Y-sorted with the player below)
  type Drawable = { y: number; draw: () => void };
  const drawables: Drawable[] = interior.furniture.map(f => ({
    y: (f.ty + f.th) * T,
    draw: () => {
      const x = f.tx * T, y = f.ty * T, w = f.tw * T, h = f.th * T;
      if (f.sprite) {
        const img = getImg(f.sprite.src);
        if (img) { ctx.drawImage(img, f.sprite.sx, f.sprite.sy, f.sprite.sw, f.sprite.sh, x, y, w, h); return; }
      }
      // Rule-50 placeholder: not yet sliced from the furniture sheet — labelled block, no invented art.
      ctx.fillStyle = 'rgba(120,100,80,0.55)';
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
      ctx.font = `${Math.round(T * 0.5)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(f.emoji, x + w / 2, y + h / 2);
      ctx.textBaseline = 'alphabetic';
    },
  }));
  // NPCs currently in this same building (e.g. Mum at home, Jordan/Riley in the school hallway) —
  // previously nothing drew them indoors at all, so mission dialogue popped up with nobody on
  // screen to have it with. Anchored near the middle of the room, offset per NPC so two people in
  // the same room don't stack on the same tile.
  // NPCs in THIS room, at the positions the store also uses for "who's in talking range".
  const indoorTargetNpcId = trackedMission(s, store.defs)?.def.steps[trackedMission(s, store.defs)!.rt.stepIndex]?.npcId;
  const indoorWantsToTalk = store.npcsWantingToTalk();
  const indoorBob = Math.sin(performance.now() / 300) * 3;
  for (const { npc, x: anchorX, y: anchorY } of store.interiorNpcs()) {
    drawables.push({
      y: anchorY,
      draw: () => {
        const sheet = getImg(characterSheet(getNpcDef(npc.id)?.sheet ?? 'alex', 'idle'));
        const dirIdx = DIR_ORDER.indexOf('down');
        const drawH = T * 1.25, drawW = drawH * (CHAR_FRAME_W / CHAR_FRAME_H);
        if (sheet) {
          ctx.drawImage(sheet, dirIdx * CHAR_FRAME_W, 0, CHAR_FRAME_W, CHAR_FRAME_H, anchorX - drawW / 2, anchorY - drawH + T * 0.15, drawW, drawH);
        } else {
          drawPersonFallback(ctx, anchorX, anchorY, T, '#d68ac0');
        }
        ctx.font = `bold ${Math.round(T * 0.22)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        const name = getNpcDef(npc.id)?.name ?? npc.id;
        ctx.strokeText(name, anchorX, anchorY + T * 0.3);
        ctx.fillText(name, anchorX, anchorY + T * 0.3);
        if (npc.id === indoorTargetNpcId || indoorWantsToTalk.has(npc.id)) {
          ctx.font = `${Math.round(T * 0.4)}px sans-serif`;
          ctx.fillText(indoorWantsToTalk.has(npc.id) ? '💬' : '📍', anchorX, anchorY - drawH + T * 0.15 - 6 + indoorBob);
        }
      },
    });
  }

  drawables.push({
    y: s.player.y,
    draw: () => {
      const dir = facingToDir(s.player.facing);
      const dirIdx = DIR_ORDER.indexOf(dir);
      const moving = Math.hypot(s.player.vx, s.player.vy) > 4;
      const sheet = getImg(characterSheet('adam', moving ? 'run' : 'idle'));
      const runFrame = Math.floor((performance.now() / 90) % CHAR_RUN_FRAMES);
      const drawH = T * 1.25, drawW = drawH * (CHAR_FRAME_W / CHAR_FRAME_H);
      if (sheet) {
        const sx = moving ? (dirIdx * CHAR_RUN_FRAMES + runFrame) * CHAR_FRAME_W : dirIdx * CHAR_FRAME_W;
        ctx.drawImage(sheet, sx, 0, CHAR_FRAME_W, CHAR_FRAME_H, s.player.x - drawW / 2, s.player.y - drawH + T * 0.15, drawW, drawH);
      } else {
        drawPersonFallback(ctx, s.player.x, s.player.y, T, '#3a6aaa');
      }
    },
  });
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  ctx.restore();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(interior.name.toUpperCase(), cw / 2, oy - 16);
}

/** Phase 14: a real "riding the bus" screen — no matching bus-interior sprite was supplied in the
 *  asset packs (Rule 50), so this is drawn as plain shapes (seat rows, a window strip, a progress
 *  bar) rather than an instant scene-flip with nothing to look at while the clock fast-forwards. */
function drawBusRide(ctx: CanvasRenderingContext2D, cw: number, ch: number, store: GameStore) {
  const s = store.state;
  const ride = s.ride;
  ctx.fillStyle = '#1a1d24';
  ctx.fillRect(0, 0, cw, ch);
  if (!ride) return;

  const from = stopById(ride.fromStop), to = stopById(ride.toStop);
  const pct = Math.min(1, Math.max(0, (s.minutes - ride.startedAt) / Math.max(1, ride.endsAt - ride.startedAt)));
  const cx = cw / 2, panelW = Math.min(560, cw - 80), panelY = ch / 2 - 140;

  // window strip up top — a moving pale-sky band with silhouette "buildings" drifting past
  ctx.fillStyle = '#7fa8c9';
  ctx.fillRect(cx - panelW / 2, panelY, panelW, 90);
  ctx.save();
  ctx.beginPath(); ctx.rect(cx - panelW / 2, panelY, panelW, 90); ctx.clip();
  ctx.fillStyle = '#4c6f8f';
  const scroll = (performance.now() / 40) % 80;
  for (let i = -1; i < panelW / 80 + 1; i++) {
    const bx = cx - panelW / 2 + i * 80 - scroll;
    ctx.fillRect(bx, panelY + 30, 46, 60);
    ctx.fillRect(bx + 50, panelY + 50, 26, 40);
  }
  ctx.restore();
  ctx.strokeStyle = '#0d0f13'; ctx.lineWidth = 4;
  ctx.strokeRect(cx - panelW / 2, panelY, panelW, 90);

  // a couple of seat-back rows below the window, just enough to read as "inside a bus"
  ctx.fillStyle = '#3a4a63';
  for (const row of [0, 1]) {
    for (const side of [-1, 1]) {
      const sx = cx + side * panelW * 0.28 - 22;
      ctx.fillRect(sx, panelY + 110 + row * 46, 44, 34);
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`${BUS_ROUTE.name}`, cx, panelY - 34);
  ctx.font = '14px monospace';
  ctx.fillStyle = '#cfd8e3';
  ctx.fillText(`${from.name} → ${to.name}`, cx, panelY - 12);

  // progress bar with the two stop names anchored at each end
  const barY = panelY + 220, barW = panelW;
  ctx.fillStyle = '#2b2f3a';
  ctx.fillRect(cx - barW / 2, barY, barW, 10);
  ctx.fillStyle = '#3fb950';
  ctx.fillRect(cx - barW / 2, barY, barW * pct, 10);
  ctx.beginPath(); ctx.arc(cx - barW / 2 + barW * pct, barY + 5, 7, 0, Math.PI * 2); ctx.fill();
  ctx.font = '12px monospace';
  ctx.fillStyle = '#9aa4b2';
  ctx.textAlign = 'left'; ctx.fillText(from.name, cx - barW / 2, barY + 26);
  ctx.textAlign = 'right'; ctx.fillText(to.name, cx + barW / 2, barY + 26);

  const remaining = Math.max(0, Math.ceil(ride.endsAt - s.minutes));
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 15px monospace';
  ctx.fillText(`Arriving in ${remaining} min`, cx, barY + 52);
  ctx.fillStyle = '#7cfc00';
  ctx.font = '12px monospace';
  ctx.fillText(ride.fare > 0 ? `Fare paid: $${ride.fare.toFixed(2)}` : 'Riding on your bus pass', cx, barY + 72);
}

const hud: Record<string, React.CSSProperties> = {
  bar: {
    position: 'absolute', top: 0, left: 0, right: 0, minHeight: 38, background: 'rgba(0,0,0,0.75)',
    display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, rowGap: 4, padding: '4px 10px', color: '#fff',
    fontFamily: 'monospace', fontSize: 13, zIndex: 10,
  },
  btnGroup: { marginLeft: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6 },
  smallBtn: { background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 12 },
  waypoint: { position: 'absolute', top: 44, left: 12, color: '#ffd23f', fontFamily: 'monospace', fontSize: 13, textShadow: '0 1px 2px #000', zIndex: 10 },
  // Step 26: compact "what should I care about right now?" card — deliberately small (no border/
  // background box beyond a soft shadow) so it reads as part of the game HUD, not a debug panel.
  objective: {
    position: 'absolute', top: 44, left: 12, zIndex: 10, fontFamily: 'monospace',
    textShadow: '0 1px 2px #000', maxWidth: 220,
  },
  objectiveLabel: { fontSize: 11, color: '#ffd23f', letterSpacing: 0.5, opacity: 0.9 },
  objectiveName: { fontSize: 14, color: '#fff', fontWeight: 700, marginTop: 1 },
  objectiveLocation: { fontSize: 12, color: '#ffd23f', marginTop: 1 },
  relationships: {
    position: 'absolute', top: 48, right: 12, width: 'min(200px, 60vw)',
    background: 'rgba(10,10,20,0.92)', border: '1px solid #444', borderRadius: 10, padding: 12,
    color: '#fff', fontFamily: 'monospace', zIndex: 20,
  },
  exitHint: { position: 'absolute', bottom: 12, left: 12, color: '#fff', fontFamily: 'monospace', fontSize: 12, background: 'rgba(0,0,0,0.6)', padding: '6px 10px', borderRadius: 6, zIndex: 10 },
  buyPrompt: { position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', color: '#ffd700', fontFamily: 'monospace', fontSize: 13, background: 'rgba(0,0,0,0.75)', padding: '8px 14px', borderRadius: 8, zIndex: 10 },
  sleepBtn: { position: 'absolute', bottom: 12, left: 12, ...btnStyle, width: 'auto', padding: '8px 14px', zIndex: 10 },
  dialogue: {
    position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', width: 'min(480px, 92vw)',
    background: 'rgba(10,10,20,0.92)', border: '1px solid #444', borderRadius: 10, padding: 16,
    color: '#fff', fontFamily: 'monospace', fontSize: 13, zIndex: 20,
  },
  choiceBtn: { textAlign: 'left', background: '#1c2440', border: '1px solid #3a4a7a', borderRadius: 6, color: '#fff', padding: '8px 10px', cursor: 'pointer' },
  choiceBtnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  journal: {
    position: 'absolute', top: 48, right: 12, width: 'min(280px, 90vw)', maxHeight: '60vh', overflowY: 'auto',
    background: 'rgba(10,10,20,0.92)', border: '1px solid #444', borderRadius: 10, padding: 14,
    color: '#fff', fontFamily: 'monospace', zIndex: 20,
  },
  shoppingList: {
    position: 'absolute', top: 48, left: 12, width: 'min(200px, 55vw)',
    background: 'rgba(10,10,20,0.92)', border: '1px solid #444', borderRadius: 10, padding: 12,
    color: '#fff', fontFamily: 'monospace', zIndex: 15,
  },
  dpad: {
    position: 'absolute', left: 16, bottom: 16, display: 'flex', flexDirection: 'column', gap: 4,
    zIndex: 25, touchAction: 'none', userSelect: 'none',
  },
  dpadRow: { display: 'flex', gap: 4 },
  dpadSpacer: { width: 52, height: 52 },
  dpadBtn: {
    width: 52, height: 52, borderRadius: 10, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)',
    color: '#fff', fontSize: 20, touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
  },
  interactBtn: {
    position: 'absolute', right: 20, bottom: 30, width: 74, height: 74, borderRadius: '50%',
    background: 'rgba(63,185,80,0.75)', border: '2px solid rgba(255,255,255,0.5)', color: '#fff',
    fontFamily: 'monospace', fontWeight: 700, fontSize: 14, zIndex: 25, touchAction: 'none', userSelect: 'none',
  },
  exitBtn: {
    position: 'absolute', right: 20, bottom: 116, width: 60, height: 40, borderRadius: 8,
    background: 'rgba(200,60,60,0.8)', border: '1px solid rgba(255,255,255,0.5)', color: '#fff',
    fontFamily: 'monospace', fontWeight: 700, fontSize: 11, zIndex: 25, touchAction: 'none', userSelect: 'none',
  },
  modalBackdrop: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30 },
  modal: { width: 'min(360px, 92vw)', maxHeight: '85vh', overflowY: 'auto', background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: 24, color: '#fff', fontFamily: 'monospace' },
  phone: {
    width: 'min(320px, 92vw)', maxHeight: '85vh', overflowY: 'auto', background: '#14161c',
    border: '3px solid #2a2d36', borderRadius: 22, padding: 18,
    color: '#fff', fontFamily: 'monospace', boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
  },
  phoneBalance: { textAlign: 'center', background: '#1c1f27', borderRadius: 12, padding: '12px 8px', marginBottom: 12 },
  phoneStat: { flex: 1, background: '#1c1f27', borderRadius: 8, padding: '6px 8px', textAlign: 'center' },
  phoneSection: { background: '#1a1c23', borderRadius: 10, padding: '10px 12px', marginBottom: 10 },
  phoneSectionTitle: { fontSize: 11, opacity: 0.6, marginBottom: 6, letterSpacing: 0.5 },
  phoneLine: { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5, gap: 8 },
  phoneBarTrack: { height: 6, background: '#2a2d36', borderRadius: 4, overflow: 'hidden' },
  phoneBarFill: { height: '100%', background: '#3fb950', borderRadius: 4 },
  achievementToast: {
    position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'rgba(20,16,30,0.95)', border: '1px solid #ffd23f', borderRadius: 10,
    padding: '8px 16px', color: '#fff', fontFamily: 'monospace', zIndex: 40,
    boxShadow: '0 4px 20px rgba(255,210,63,0.25)',
  },
  // Step 26: same shape as achievementToast, positioned lower so the (rare) case of both firing at
  // once stacks rather than overlaps. Non-blocking overlay — it never intercepts input or pauses
  // the game, and self-dismisses via the same setTimeout pattern.
  missionToast: {
    position: 'absolute', top: 96, left: '50%', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'rgba(20,16,30,0.95)', border: '1px solid #7cc7ff', borderRadius: 10,
    padding: '8px 16px', color: '#fff', fontFamily: 'monospace', zIndex: 40,
    boxShadow: '0 4px 20px rgba(124,199,255,0.25)',
  },
  // Step 27: a third toast slot, stacked below the other two so all three can never overlap even
  // in the (very rare) case they all fire close together.
  activityToast: {
    position: 'absolute', top: 144, left: '50%', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'rgba(20,16,30,0.95)', border: '1px solid #7cfc00', borderRadius: 10,
    padding: '8px 16px', color: '#fff', fontFamily: 'monospace', zIndex: 40,
    boxShadow: '0 4px 20px rgba(124,252,0,0.2)',
  },
  // Step 27 — the reusable short activity sequence overlay (Help Parents today; any future
  // Level 1-2 activity per the Step 27 audit can reuse this same box+progress-bar shape).
  // Deliberately small and non-blocking-looking (no full-screen backdrop) — an overlay, not a modal.
  activitySequence: {
    position: 'absolute', top: '38%', left: '50%', transform: 'translate(-50%, -50%)',
    width: 200, textAlign: 'center', background: 'rgba(10,10,20,0.9)', border: '1px solid #444',
    borderRadius: 10, padding: '14px 16px', color: '#fff', fontFamily: 'monospace', zIndex: 35,
  },
  activityBarTrack: { height: 8, background: '#2a2d36', borderRadius: 4, overflow: 'hidden' },
  activityBarFill: { height: '100%', background: '#7cfc00', borderRadius: 4, transition: 'width 60ms linear' },
  // Step 27 — the "you are travelling" bus-ride banner (see the bus-experience audit).
  busRideBanner: {
    position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
    color: '#cbe8ff', fontFamily: 'monospace', fontSize: 13, background: 'rgba(0,0,40,0.7)',
    padding: '6px 14px', borderRadius: 8, zIndex: 10,
  },
};
