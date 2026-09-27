'use client';

/**
 * MoniMate — the game page.
 *
 * All simulation logic lives in src/lib and src/game. This component: (1) loads the signed-in
 * Supabase player and their newest save (src/proxy.ts already guarantees someone is signed in),
 * (2) owns one GameStore + GameLoop, (3) runs the canvas + input loop, (4) renders the HUD, the
 * phone and dialogue from current state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '../../lib/supabase/client';
import { loadSave, writeSave, takeLegacySave, listSaves, deleteSave, type SaveSummary } from '../../lib/persistence/cloudSave';
import { signOut } from '../login/actions';
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
  BUS_STOPS, BUS_ROUTE, busAtStop, nextBusAt, stopById, rideMinutes, getPlace, type ShopItemDef,
} from '../../lib/world';
import { buildJournal, MissionChoice, MissionDef, trackedMission } from '../../lib/missions';
import { dayToSummaryView, weekToSummaryView } from '../../lib/summary';
import type { GameState, NpcRuntime } from '../../lib/types';
import { formatDay, formatTime, parts } from '../../lib/clock';
import { pathRules, pathText, placeName } from '../../lib/pathRules';
import { LIFE_EVENTS } from '../../lib/lifeEvents';
import Phone, { type PhoneApp } from '../../components/Phone';

const MAP_W = 60, MAP_H = 44;

/** Small talk when an NPC has nothing mission-related to say. Lines depend on the day, the time,
 *  your money, your goal and how things stand with them — so chatting never feels canned. */
function idleLineFor(npcId: string, store: GameStore): string {
  const s = store.state, p = parts(s.minutes), cash = store.cash;
  const flags = s.world.flags, rel = s.world.relationships;
  const goal = store.weekGoalId();
  const morning = p.hour < 12, evening = p.hour >= 17, weekend = p.dayOfWeek >= 5;
  const lines: string[] = [];
  const add = (cond: boolean, ...l: string[]) => { if (cond) lines.push(...l); };
  switch (npcId) {
    case 'mum':
      add(morning && !weekend, 'Have a good day, love. Got everything?', "Don't forget — lunch doesn't buy itself.");
      add(evening, 'How was school?', "Dinner's at seven.");
      add(cash < 3, "Running low? I'll pay you to help around the house.", 'Money tight this week? Happens to everyone.');
      add(cash > 15, "Look at you, still with money left. I'm impressed.");
      add(goal === 'save_event', "How's the fair fund going?");
      add(goal === 'buy_headphones', 'Those headphones… are they worth a whole week of lunches?');
      add(s.finance.accounts.savings > 0, `$${s.finance.accounts.savings.toFixed(0)} in the piggy bank? That's my kid.`);
      add(weekend, 'No school today — enjoy it.');
      add(true, "Love you, kiddo.", 'Let me know if you need to talk about money — no judgment.');
      break;
    case 'jordan':
      add(p.dayOfWeek === 3, 'Arcade later?? You in?');
      add(p.dayOfWeek === 4, 'Weekend plans? The fair is Saturday!');
      add(weekend, "Fair's actually good this year.");
      add(cash < 3, "Broke too? Same. Payday can't come fast enough.");
      add((rel.Jordan ?? 0) <= 0, '…hey.', 'Oh. Hi.');
      add((rel.Jordan ?? 0) >= 4, "You're a legend, you know that?");
      add(flags.includes('shared_game'), 'Pixel Racer is SO good. Your turn Saturday!');
      add(true, "I'm saving up for new headphones — slow going.", 'You seen Riley today?');
      break;
    case 'riley':
      add(p.dayOfWeek <= 3 && !flags.includes('birthday_resolved'), "My birthday's this week 👀", "You're still coming to my birthday thing?");
      add(flags.includes('birthday_contributed'), 'Thanks again for chipping in for my birthday!');
      add(flags.includes('birthday_declined'), 'Oh. Hi.');
      add(goal === 'save_event', "Are you coming to the fair? I've saved $6 so far.");
      add(weekend, 'The market has the best dumplings.');
      add(true, "School's been a lot lately, honestly.", 'Have you done the maths homework?');
      break;
    case 'teacher':
      add(!weekend && !store.hasDoneToday('at_school') && p.hour < 12, "Class is starting — find a seat.");
      add(!weekend && store.hasDoneToday('at_school'), 'Good work today.');
      add(!flags.includes('school_project_done') && p.dayOfWeek <= 2, 'Have you got your project supplies yet?');
      add(weekend, 'Enjoying the fair? The raffle draws at one.');
      add(true, 'Let me know if you are stuck on anything.');
      break;
    // ── University cast ──
    case 'sam':
      add(morning && !weekend, "Lecture at 10? I'm going back to sleep.", 'Did you take my milk? …Fine, it was old anyway.');
      add(evening, "What's for dinner? Please say it's not noodles again.", 'Flat meeting on Sunday about the dishes 😤');
      add(flags.includes('wk_rent_late') || flags.includes('wk_rent_owed'), 'So… about that rent.', "Not to be weird, but I'm still out of pocket for your rent.");
      add(flags.includes('wk_rent_paid'), 'Cheers for paying rent on time. Honestly rare.');
      add(flags.includes('wk_sky_yes'), 'Sky Sport was the best decision this flat has ever made 🏉');
      add(flags.includes('wk_power_owed'), "Power's still $45 short, just saying.");
      add(cash < 30, "Broke? The Psych department pays $20 for studies. Easy money.");
      add(weekend, "Raglan's the best. Or the park. Anywhere but here.");
      add(true, 'Flatting is just paying bills with friends.', "I'm cooking pasta again. It's always pasta.");
      break;
    case 'mei':
      add(!weekend && p.hour < 12, "Did you do the reading? I did the reading. Twice.");
      add(!flags.includes('wk_textbook_told') && p.dayOfWeek <= 1, 'Dr Hughes talks about the textbook after the first lecture — stay till the end!');
      add(flags.includes('wk_club_joined'), 'See you at the club this week!');
      add(flags.includes('wk_textbook_used'), "Second-hand textbook? Smart. I paid full price like a fool.");
      add((rel.Mei ?? 0) >= 3, "Honestly, you're the best part of ECON101.");
      add(weekend, 'The market has the best dumplings. Trust me.');
      add(true, 'Supply and demand is just vibes with graphs.', 'The library is open till 8 if you need a quiet spot.');
      break;
    case 'lecturer':
      add(!weekend && !store.hasDoneToday('at_school') && p.hour < 11, 'Lecture starts at ten — the Lecture Theatre, first door on the left.');
      add(!flags.includes('wk_quiz_done') && p.dayOfWeek === 4, "Don't forget, Quiz 1 closes at midnight.");
      add(true, 'Economics is really about choices: what you give up to get what you want.', 'Office hours are Thursdays. Nobody ever comes.');
      break;
    case 'leah':
      add(flags.includes('wk_job_offer'), "Good to have you on the team! Rosters go out Sunday.");
      add(flags.includes('wk_trial_offered') && !flags.includes('wk_job_offer'), 'See you Friday at 1 for your trial!');
      add(flags.includes('wk_applied') && !flags.includes('wk_trial_offered'), 'Interviews are Wednesday afternoon — come by between 1 and 4:30.');
      add(true, 'Flat white? $5.50. Staff get them free, just saying.', 'Busiest café near campus. We are always hiring.');
      break;
    case 'shopkeeper':
      add(p.dayOfWeek === 3, 'Delivery day. My back is already sore.');
      add(flags.includes('dairy_shift_done'), 'Best shelf-stocker I have had!');
      add(true, 'Fresh bread came in this morning.', "Let me know if you can't find something.");
      break;
  }
  const pool = lines.length ? lines : ['Hey.'];
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

/** The signed-in player, from Supabase Auth + the `profiles` table. */
interface Player {
  id: string;
  email: string;
  name: string;
  lifePath: LifePath;
  level: number;
}

export default function MoniMateGame() {
  const supabase = useMemo(() => createClient(), []);
  const [player, setPlayer] = useState<Player | null>(null);
  const [choosingPath, setChoosingPath] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/login?next=/game'; return; }
      const { data: prof, error } = await supabase
        .from('profiles').select('username, life_path, level').eq('id', user.id).maybeSingle();
      if (error) setLoadError(`Couldn't load your profile (${error.message}). Your game still works; progress saves on this device.`);
      setPlayer({
        id: user.id,
        email: user.email ?? '',
        name: prof?.username ?? user.user_metadata?.username ?? (user.email ?? 'Player').split('@')[0],
        lifePath: (prof?.life_path as LifePath | undefined) ?? 'school',
        level: prof?.level ?? 1,
      });
    })();
  }, [supabase]);

  const choosePath = async (path: LifePath) => {
    if (!player) return;
    setPlayer({ ...player, lifePath: path });
    setChoosingPath(false);
    await supabase.from('profiles').update({ life_path: path, updated_at: new Date().toISOString() }).eq('id', player.id);
  };

  if (!player) return <LoadingScreen text="Loading your life…" />;
  const currentPlayable = !!LIFE_PATHS.find(p => p.id === player.lifePath)?.available;
  if (choosingPath || !currentPlayable) {
    return (
      <PathSelect
        supabase={supabase} userId={player.id}
        current={choosingPath && currentPlayable ? player.lifePath : null}
        onChoose={choosePath}
        onBack={choosingPath && currentPlayable ? () => setChoosingPath(false) : undefined}
      />
    );
  }
  return (
    <GameLoader
      key={`${player.id}:${player.lifePath}`}
      supabase={supabase} player={player} notice={loadError}
      onChangePath={() => setChoosingPath(true)}
    />
  );
}

/** Loads the newest save (cloud or this device), importing an old pre-Supabase save once. */
function GameLoader({ supabase, player, notice, onChangePath }: { supabase: SupabaseClient; player: Player; notice: string; onChangePath: () => void }) {
  const [initial, setInitial] = useState<{ state: GameState | null } | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const cloud = await loadSave(supabase, player.id, player.lifePath);
      const state = cloud ?? (player.email ? takeLegacySave(player.email, player.lifePath) : null);
      if (live) setInitial({ state });
    })();
    return () => { live = false; };
  }, [supabase, player.id, player.email, player.lifePath]);
  if (!initial) return <LoadingScreen text="Loading your save…" />;
  return <GameCanvas supabase={supabase} player={player} initialState={initial.state} notice={notice} onChangePath={onChangePath} />;
}

function LoadingScreen({ text }: { text: string }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#1a1a2e', color: '#f0c038', fontFamily: "'Press Start 2P', monospace", fontSize: 14 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16, animation: 'mmPulse 1.2s ease-in-out infinite' }}>🐷</div>
        {text}
        <style>{'@keyframes mmPulse { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.12) } }'}</style>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = { width: '100%', padding: 10, background: '#3fb950', border: 'none', borderRadius: 6, color: '#0d1117', fontWeight: 700, cursor: 'pointer' };

/** "Where are you up to?" — one card per life path. Each path keeps its own save, so a card shows
 *  exactly where that life was left (week, day, time, money) and continues from there. */
function PathSelect({ supabase, userId, current, onChoose, onBack }: {
  supabase: SupabaseClient; userId: string; current: LifePath | null;
  onChoose: (p: LifePath) => void; onBack?: () => void;
}) {
  const [saves, setSaves] = useState<Partial<Record<LifePath, SaveSummary>> | null>(null);
  const [confirmReset, setConfirmReset] = useState<LifePath | null>(null);
  useEffect(() => {
    let live = true;
    void listSaves(supabase, userId).then(r => { if (live) setSaves(r); });
    return () => { live = false; };
  }, [supabase, userId]);
  const where = (sv: SaveSummary) => {
    const p = parts(sv.minutes);
    return `Week ${p.week} · ${DAY_SHORT[p.dayOfWeek]} ${formatTime(sv.minutes)}${sv.cash !== null ? ` · $${sv.cash.toFixed(2)}` : ''}`;
  };
  const reset = async (path: LifePath) => {
    await deleteSave(supabase, userId, path);
    setSaves(sv => { const next = { ...(sv ?? {}) }; delete next[path]; return next; });
    setConfirmReset(null);
  };
  return (
    <div style={ps.screen}>
      <div style={ps.sky} aria-hidden />
      <div style={ps.wrap}>
        {onBack && current && (
          <button style={ps.back} onClick={onBack}>← Back to {LIFE_PATHS.find(p => p.id === current)?.name}</button>
        )}
        <h1 style={ps.title}>{current ? 'SWITCH LIFE' : 'CHOOSE YOUR LIFE'}</h1>
        <p style={ps.sub}>Every life keeps its own save. Switch whenever you like — each one waits exactly where you left it.</p>
        <div style={ps.grid}>
          {LIFE_PATHS.map(p => {
            const sv = saves?.[p.id];
            const here = p.id === current;
            return (
              <div key={p.id} style={{ ...ps.card, borderColor: p.available ? p.color : '#30363d', opacity: p.available ? 1 : 0.5 }}>
                {here && <div style={{ ...ps.badge, background: p.color, color: '#0d1117' }}>YOU ARE HERE</div>}
                {!p.available && <div style={ps.badge}>COMING SOON</div>}
                <div style={{ fontSize: 34 }}>{p.emoji}</div>
                <div style={ps.name}>{p.name}</div>
                <div style={ps.tagline}>{p.tagline}</div>
                <div style={ps.desc}>{p.description}</div>
                {p.available && (
                  <div style={ps.level}>LEVEL 1 · {p.levelNames[0].toUpperCase()}</div>
                )}
                {p.available && (
                  <>
                    <button style={{ ...ps.cta, background: p.color }} onClick={() => (here && onBack ? onBack() : onChoose(p.id))}>
                      {sv ? `▶ ${here ? 'KEEP PLAYING' : 'CONTINUE'}` : '✦ START THIS LIFE'}
                    </button>
                    <div style={ps.progress}>{saves === null ? 'Checking your saves…' : sv ? where(sv) : 'New game'}</div>
                    {sv && !here && (confirmReset === p.id ? (
                      <div style={ps.confirm}>
                        Start {p.name} over? This deletes that save.
                        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                          <button style={ps.dangerBtn} onClick={() => reset(p.id)}>Yes, start over</button>
                          <button style={ps.ghostBtn} onClick={() => setConfirmReset(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button style={ps.link} onClick={() => setConfirmReset(p.id)}>Start over</button>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ps: Record<string, React.CSSProperties> = {
  screen: { position: 'relative', minHeight: '100dvh', background: '#1a1a2e', color: '#e6edf3', overflowX: 'hidden', fontFamily: "'VT323', monospace" },
  sky: { position: 'absolute', inset: 0, background: 'linear-gradient(#2b2d6e 0%, #6b4a8a 55%, #f0a060 100%)', opacity: 0.45 },
  wrap: { position: 'relative', maxWidth: 1040, margin: '0 auto', padding: '28px 16px 40px' },
  back: { fontFamily: "'Press Start 2P', monospace", fontSize: 10, background: '#14161c', color: '#ffd23f', border: '3px solid #000', boxShadow: '3px 3px 0 #000', padding: '8px 10px', cursor: 'pointer', marginBottom: 18 },
  title: { fontFamily: "'Press Start 2P', monospace", fontSize: 22, color: '#f0c038', textShadow: '3px 3px 0 #000', margin: '0 0 8px', textAlign: 'center' },
  sub: { fontSize: 22, textAlign: 'center', margin: '0 auto 22px', maxWidth: 620, color: '#cfd8e3' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 },
  card: { position: 'relative', background: '#14161c', border: '4px solid', boxShadow: '6px 6px 0 #000', padding: '18px 14px 14px', display: 'flex', flexDirection: 'column', gap: 6 },
  badge: { position: 'absolute', top: 8, right: 8, fontFamily: "'Press Start 2P', monospace", fontSize: 7, padding: '4px 6px', background: '#30363d', color: '#e6edf3' },
  name: { fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: '#fff', marginTop: 2 },
  tagline: { fontSize: 20, color: '#ffd23f' },
  desc: { fontSize: 18, color: '#aeb8c6', lineHeight: 1.05, flex: 1 },
  level: { fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: '#7cfc00', marginTop: 4 },
  cta: { fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#0d1117', border: '3px solid #000', boxShadow: '3px 3px 0 #000', padding: '10px 6px', cursor: 'pointer', marginTop: 6 },
  progress: { fontSize: 18, color: '#cfd8e3', textAlign: 'center' },
  link: { background: 'none', border: 'none', color: '#8b949e', textDecoration: 'underline', cursor: 'pointer', fontFamily: "'VT323', monospace", fontSize: 17, alignSelf: 'center' },
  confirm: { fontSize: 17, color: '#ffa0a0', background: '#2a1416', padding: 8, border: '2px solid #5a2328' },
  dangerBtn: { flex: 1, fontFamily: "'VT323', monospace", fontSize: 17, background: '#ff6b6b', color: '#0d1117', border: '2px solid #000', cursor: 'pointer' },
  ghostBtn: { flex: 1, fontFamily: "'VT323', monospace", fontSize: 17, background: '#30363d', color: '#e6edf3', border: '2px solid #000', cursor: 'pointer' },
};

// ─────────────────────────────────────────────────────────────────────────────
// GAME CANVAS — the actual simulation
// ─────────────────────────────────────────────────────────────────────────────

function GameCanvas({ supabase, player, initialState, notice, onChangePath }: {
  supabase: SupabaseClient; player: Player; initialState: GameState | null; notice: string; onChangePath: () => void;
}) {
  const profile = player; // name, lifePath, level
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
  // The phone (null = closed). Journal, wallet, relationships, Kai and settings all live in it.
  const [phoneApp, setPhoneApp] = useState<PhoneApp | null>(null);
  const phoneOpenRef = useRef(false);
  phoneOpenRef.current = phoneApp !== null;
  // One notification queue for everything (achievements, new messages, results, notices).
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pushToast = useCallback((t: Omit<Toast, 'key'>) => {
    const key = Math.random().toString(36).slice(2);
    setToasts(q => [...q.slice(-2), { ...t, key }]);
    setTimeout(() => setToasts(q => q.filter(x => x.key !== key)), t.ms ?? 3800);
  }, []);
  const seenInboxRef = useRef<Set<string>>(new Set());
  const [showPiggy, setShowPiggy] = useState(false);
  const [dayCard, setDayCard] = useState<ReturnType<GameStore['todaySummary']> | null>(null);
  const [transition, setTransition] = useState<{ title: string; sub: string; moon: boolean } | null>(null);
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

  // Create the store once, from the loaded save if there is one. Older saves are upgraded by
  // GameStore.hydrate (lib/saveMigration.ts); anything unreadable starts a fresh game.
  if (!storeRef.current) {
    const config: LifePathConfig = getLifePath(player.lifePath);
    const restored = initialState && initialState.lifePath === player.lifePath ? GameStore.hydrate(JSON.stringify(initialState)) : null;
    storeRef.current = restored ?? new GameStore(createInitialState(player.lifePath, makeInitialFinance(config), makeInitialGoals(config)));
    loopRef.current = new GameLoop(storeRef.current);
    storeRef.current.subscribe(() => forceTick(t => t + 1));
  }
  const store = storeRef.current!;
  const loop = loopRef.current!;
  const rules = store.rules;
  const stopName = (id: string) => pathText(store.state.lifePath, stopById(id).name);

  // Saving: every 30 s, when the tab is hidden, at the end of every day, and on leaving the page.
  // writeSave() writes this device first (instant) and then the cloud (best effort).
  const save = useCallback(() => { void writeSave(supabase, player.id, store.state); }, [supabase, player.id, store]);
  useEffect(() => {
    const id = setInterval(save, 30_000);
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    const offEvent = store.onEvent(e => { if (e.type === 'day_end' || e.type === 'week_end') save(); });
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide); offEvent(); save(); };
  }, [save, store]);
  const logout = async () => { await writeSave(supabase, player.id, store.state); await signOut(); };
  useEffect(() => { if (notice) pushToast({ icon: '⚠️', lines: [notice], ms: 8000 }); }, [notice, pushToast]);

  // Blueprint day loop: WAKE UP -> PHONE. The very first time, the phone opens by itself on Mum's message.
  useEffect(() => {
    if (store.state.world.flags.includes('phone_intro') || store.phoneInbox().length === 0) return;
    store.state.world.flags.push('phone_intro');
    setPhoneApp('messages');
  }, [store]);

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
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const handleChangePath = () => { setPhoneApp(null); setConfirmSwitch(true); store.setPaused(true); };
  const switchPath = async () => {
    store.setPaused(false);
    await writeSave(supabase, player.id, store.state);
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
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      keysRef.current.add(key);
      if (phoneOpenRef.current) return; // the phone has the keyboard (its own Esc/back handling)
      if (key === 'escape' && store.state.player.scene !== 'outdoor' && store.state.player.scene !== 'bus') loop.exit();
      if (key === 'e') { if (!tryStartHelpParentsActivity()) handleInteract(); }
      if (key === 'j') setPhoneApp(a => (a === 'today' ? null : 'today'));
      if (key === 'p') setPhoneApp(a => (a ? null : 'home'));
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
    const step = store.actionableStep('inPerson');
    if (step) return; // handled by the main mission DialoguePanel (driven by `actionable`, not this state)
    if (npc) { setDialogueLines({ npc: getNpcDef(npc.id)?.name ?? npc.id, text: idleLineFor(npc.id, store) }); return; }
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
          npc: stopName(stopId),
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
      if (store.getEnergy().current < (store.rules.study?.energy ?? 0)) {
        setClassFailure("You're too exhausted to focus. Get some rest first.");
        return;
      }
      store.waitForBell(); // early? the clock runs to the 8:30 bell before the lesson starts
      const before = store.state.minutes;
      const outcome = store.attendClass(); // records attendance (a saved daily mark) on success
      if (!outcome.ok) { setClassFailure(outcome.message ?? 'That didn\'t work.'); return; }
      setClassFailure(null);
      const noun = store.rules.study?.noun ?? 'class';
      pushToast({ icon: '📚', lines: [`${noun[0].toUpperCase()}${noun.slice(1)} done`, `${formatTime(before)} → ${formatTime(store.state.minutes)} · -${outcome.energyConsumed} energy`] });
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
      pushToast({ icon: '🧹', lines: ['Helped around the house',
          `${moneyDelta > 0 ? '+' : ''}$${moneyDelta.toFixed(2)} · -${energyDelta.toFixed(0)} energy · Mum +1`,] });
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
    pushToast({ icon: '🙁', lines: ["Mum looks a little disappointed, but doesn't push it.", 'Mum -1'] });
  }, [store, setHelpParentsPhaseBoth]);

  // Main loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const frame = (ts: number) => {
      const frozen = phoneOpenRef.current;
      const input: MoveInput = frozen ? { up: false, down: false, left: false, right: false } : {
        up: keysRef.current.has('w') || keysRef.current.has('arrowup'),
        down: keysRef.current.has('s') || keysRef.current.has('arrowdown'),
        left: keysRef.current.has('a') || keysRef.current.has('arrowleft'),
        right: keysRef.current.has('d') || keysRef.current.has('arrowright'),
      };
      loop.frame(ts, input, { w: canvas.width, h: canvas.height }, { worldW: MAP_W * TILE_PX, worldH: MAP_H * TILE_PX });
      draw(ctx, canvas.width, canvas.height, store, loop);
      for (const t of store.takeAchievementToasts()) pushToast({ icon: t.emoji, label: 'ACHIEVEMENT UNLOCKED', lines: [t.name], tone: 'gold' });
      for (const n of store.takeNotices()) pushToast({ icon: 'ℹ️', lines: [n], ms: 5000 });
      // In-person objectives get a small "new objective" card; phone messages get a notification.
      for (const d of store.takeOffers()) {
        if (!d.steps[0]?.remote) pushToast({ icon: d.emoji, label: 'NEW OBJECTIVE', lines: [d.name], tone: 'blue' });
      }
      for (const m of store.phoneInbox()) {
        const k = `${m.def.id}:${m.rt.stepIndex}:${parts(store.state.minutes).day}`;
        if (seenInboxRef.current.has(k)) continue;
        seenInboxRef.current.add(k);
        pushToast({ icon: '📱', label: m.step.speaker ?? m.def.name, lines: [m.step.lines[0] ?? m.def.journalText], tone: 'green', onClick: () => setPhoneApp('messages'), ms: 6000 });
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(80);
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
  const goal = store.goalStatus();
  const journal = buildJournal(s, store.defs);
  const daySummary = store.pendingDaySummary ? dayToSummaryView(store.pendingDaySummary, store.defs) : null;
  const weekSummary = store.pendingWeekSummary ? weekToSummaryView(store.pendingWeekSummary) : null;
  const actionable = store.actionableStep('inPerson');
  const inbox = store.phoneInbox();
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
    clockParts.minuteOfDay >= 6 * 60 + 30 && clockParts.minuteOfDay < 21 * 60 && // not at midnight
    !store.hasDoneToday('helped_parents') &&
    !store.hasDoneToday('declined_parents');
  const busArrived = nearStopId ? busAtStop(nearStopId, s.minutes) : null;
  // "That's everything for today": once nothing is left and no other panel is open.
  const dayDoneNow = !dayCard && !transition && !actionable && !lifeEvent && !boardingAt && !daySummary
    && !weekSummary && !store.pendingLevelSummary && helpParentsPhase === null && store.dayComplete();
  useEffect(() => {
    if (!dayDoneNow) return;
    store.markDayDoneShown();
    setDayCard(store.todaySummary());
  }, [dayDoneNow, store]);
  /** Fade out, run `during` behind the curtain, fade back in. */
  const playTransition = (title: string, sub: string, during: () => void, moon = true) => {
    setDayCard(null);
    setTransition({ title, sub, moon });
    store.setPaused(true);
    setTimeout(() => {
      during();
      store.setPaused(false);
      setTimeout(() => setTransition(null), 1300);
    }, 1700);
  };
  const nextBus = nearStopId && !busArrived ? nextBusAt(nearStopId, s.minutes) : null;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', background: '#000', overflow: 'hidden' }}>
      <style>{TRANSITION_CSS}</style>
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

      {/* HUD — blueprint section 20: time + objective top-left, money/energy/goal top-right, the
          phone bottom-right. Everything else lives in the phone. */}
      <div style={hud.topLeft}>
        <div style={hud.clock}>{day.slice(0, 3)} <b>{time}</b></div>
        <div style={hud.objective}>
          {inbox.length > 0 ? (
            <button style={hud.objectiveBtn} onClick={() => setPhoneApp('messages')}>
              <div style={hud.objectiveLabel}>📱 NEW MESSAGE{inbox.length > 1 ? `S (${inbox.length})` : ''}</div>
              <div style={hud.objectiveName}>Reply to {inbox[0].step.speaker ?? inbox[0].def.name}</div>
            </button>
          ) : objective ? (
            <>
              <div style={hud.objectiveLabel}>🎯 NEXT</div>
              <div style={hud.objectiveName}>{objectiveNpcName ? `${objective.def.name} — ${objectiveNpcName}` : objective.def.name}</div>
              {waypoint && (
                <div style={hud.objectiveLocation}>
                  {waypoint.here ? `📍 You're at the ${waypoint.label}` : `${waypoint.arrow} ${waypoint.label} · ${waypoint.metres}m`}
                </div>
              )}
            </>
          ) : (
            <div style={hud.objectiveLabel}>🎯 {rules.freeTimeHint}</div>
          )}
        </div>
      </div>

      <div style={hud.topRight}>
        <div style={hud.money}>💰 ${store.cash.toFixed(2)}</div>
        <div style={hud.energyRow} title={store.exhausted ? 'Exhausted — eat or sleep' : 'Energy'}>
          <span>⚡</span>
          <div style={hud.energyTrack}>
            <div style={{ ...hud.energyFill, width: `${Math.round((s.energy.current / s.energy.max) * 100)}%`, background: store.exhausted ? '#ff6060' : '#ffd23f' }} />
          </div>
        </div>
        {goal && (
          <button style={hud.goalChip} title={goal.detail} onClick={() => setPhoneApp('goals')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{goal.def.emoji} {goal.def.name}</span>
              <span style={{ color: goal.achieved ? '#7cfc00' : '#ffd23f' }}>{goal.achieved ? '✓' : goal.def.target ? `${Math.round(goal.progress * 100)}%` : ''}</span>
            </div>
            <div style={hud.phoneBarTrack}><div style={{ ...hud.phoneBarFill, width: `${Math.round(goal.progress * 100)}%`, background: goal.achieved ? '#7cfc00' : '#ffd23f' }} /></div>
            <div style={{ fontSize: 10, opacity: 0.75, marginTop: 3, textAlign: 'left' }}>{goal.detail}</div>
          </button>
        )}
      </div>

      <button style={hud.phoneBtn} onClick={() => setPhoneApp(a => (a ? null : 'home'))} aria-label="Phone">
        📱{inbox.length > 0 && <span style={hud.phoneBadge}>{inbox.length}</span>}
        {!isTouch && <span style={hud.phoneKey}>P</span>}
      </button>

      {/* Notifications: one queue, newest at the bottom, tap a message to open it */}
      <div style={hud.toastStack}>
        {toasts.map(t => (
          <div key={t.key} onClick={t.onClick} style={{ ...hud.toast, borderColor: TOAST_COLORS[t.tone ?? 'plain'], cursor: t.onClick ? 'pointer' : 'default' }}>
            <span style={{ fontSize: 22 }}>{t.icon}</span>
            <div style={{ minWidth: 0 }}>
              {t.label && <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: 0.5 }}>{t.label}</div>}
              {t.lines.map((l, i) => <div key={i} style={i === 0 ? { fontWeight: 700 } : { fontSize: 12, opacity: 0.85 }}>{l}</div>)}
            </div>
          </div>
        ))}
      </div>

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
            🚏 {stopName(nearStopId)} · {BUS_ROUTE.name} · Fare ${BUS_ROUTE.fare.toFixed(2)}
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
          🚌 On the bus to {stopName(s.ride.toStop)} — arriving in {Math.max(0, Math.ceil(s.ride.endsAt - s.minutes))}m
        </div>
      )}

      {/* Destination picker once you've boarded a standing bus */}
      {boardingAt && (
        <DialoguePanel
          speaker={`${stopName(boardingAt)} — Route 1`}
          lines={['Where to?']}
          choices={Object.values(BUS_STOPS).filter(st => st.id !== boardingAt).map(st => ({
            id: st.id, label: pathText(s.lifePath, st.name), sublabel: `~${rideMinutes(boardingAt, st.id)} min · $${BUS_ROUTE.fare.toFixed(2)} · -1 energy`,
            cost: 0, minutes: 0, consequence: '',
          }))}
          onChoose={(c) => {
            const result = store.boardBus(boardingAt, c.id);
            store.setPaused(false);
            setBoardingAt(null);
            // Surface a real failure (fare/energy/bus already gone) instead of silently doing
            // nothing — this is exactly the "no travel graphics" symptom when boardBus() refuses.
            if (!result.ok) setDialogueLines({ npc: stopName(boardingAt), text: result.reason ?? "Couldn't board the bus." });
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
      {classEligible && rules.study && !actionable && !lifeEvent && !boardingAt && !classFailure && (
        <DialoguePanel
          speaker={rules.study.teacher}
          lines={[clockParts.minuteOfDay < rules.study.bell
            ? `You're early! Grab a seat — we start at ${formatTime(clockParts.day * 1440 + rules.study.bell)}.`
            : `Take your seat — the ${rules.study.noun} is starting.`]}
          choices={[
            { id: 'attend', label: `📚 Attend ${rules.study.noun}`, sublabel: `${rules.study.minutes / 60} hours · ${rules.study.energy} energy`, cost: 0, minutes: 0, consequence: '' },
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
          <div style={{ fontWeight: 700, color: '#ffd700', marginBottom: 4 }}>{rules.study?.teacher}</div>
          <div>{classFailure}</div>
        </div>
      )}

      {/* Where's class? A single hint in the prompt slot while you're at school but not yet in class. */}
      {!actionable && !nearbyItem && !lifeEvent && !boardingAt && (classStatus === 'go_to_classroom' || classStatus === 'too_late') && (
        <div style={hud.buyPrompt}>
          {classStatus === 'go_to_classroom'
            ? `🔔 ${rules.study?.roomHint}`
            : `🔔 Too late for the ${rules.study?.noun} today — you'll be marked absent`}
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

      {/* The phone */}
      {phoneApp && (
        <Phone
          store={store} app={phoneApp} setApp={setPhoneApp} onClose={() => setPhoneApp(null)}
          voiceOn={voiceOn} setVoiceOn={v => { if (!v) stopSpeaking(); setVoiceOn(v); }}
          onChangePath={handleChangePath} onLogout={logout} playerName={profile.name}
        />
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

      {/* All done for today */}
      {dayCard && (
        <div style={hud.modalBackdrop}>
          <div style={{ ...hud.modal, width: 'min(380px, 92vw)', textAlign: 'center', animation: 'mmPop 260ms ease-out' }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <h2 style={{ margin: '4px 0' }}>That's everything for today!</h2>
            <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 12 }}>{day} · {time}</div>
            <div style={{ textAlign: 'left', background: '#0d1117', borderRadius: 8, padding: '10px 12px', marginBottom: 10, maxHeight: 180, overflowY: 'auto' }}>
              {dayCard.done.map((t, i) => <div key={'d' + i} style={{ fontSize: 13, marginBottom: 3 }}>✓ {t.emoji} {t.name}</div>)}
              {dayCard.missed.map((t, i) => <div key={'m' + i} style={{ fontSize: 13, marginBottom: 3, color: '#ff8080' }}>✗ {t.emoji} {t.name}</div>)}
              {dayCard.done.length + dayCard.missed.length === 0 && <div style={{ fontSize: 13, opacity: 0.7 }}>A quiet day.</div>}
            </div>
            <div style={{ fontSize: 13, marginBottom: 14 }}>
              <span style={{ color: '#7cfc00' }}>+${dayCard.earned.toFixed(2)}</span> earned · <span style={{ color: '#ff8080' }}>-${dayCard.spent.toFixed(2)}</span> spent · 💰 ${store.cash.toFixed(2)} left
            </div>
            {s.player.place === 'home' ? (
              <>
                <button style={btnStyle} onClick={() => playTransition('Goodnight…', `${day} is done. See you tomorrow.`, () => store.sleep(false))}>🛏️ Sleep till tomorrow</button>
                <button style={{ ...hud.smallBtn, marginTop: 8, width: '100%', padding: 8 }} onClick={() => setDayCard(null)}>Stay up a bit</button>
              </>
            ) : (
              <>
                <button style={btnStyle} onClick={() => playTransition('Heading home…', '', () => {
                  const mins = store.goHome();
                  setTransition({ title: 'Home sweet home', sub: `${mins} min walk · everything's done for today`, moon: true });
                })}>🏠 Head home</button>
                <button style={{ ...hud.smallBtn, marginTop: 8, width: '100%', padding: 8 }} onClick={() => setDayCard(null)}>Keep exploring</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Scene transition: night sky, a little runner, fade in/out */}
      {transition && (
        <div style={hud.transition}>
          {transition.moon && <div className="mm-moon" />}
          <div className="mm-stars" />
          <div className="mm-runner" />
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 18, color: '#ffd23f', textShadow: '3px 3px 0 #000', marginBottom: 12 }}>{transition.title}</div>
          <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#cfd8e3' }}>{transition.sub}</div>
        </div>
      )}

      {/* Day / week summaries */}
      {daySummary && (
        <SummaryModal title={daySummary.title} lines={[daySummary.moneyLine, daySummary.spentLine, daySummary.schoolLine, daySummary.missionsLine, daySummary.timeLine].filter(Boolean) as string[]}
          onClose={() => store.dismissDaySummary()} />
      )}
      {!daySummary && weekSummary && (
        <SummaryModal title={weekSummary.title} lines={[weekSummary.income, weekSummary.spending, weekSummary.savings, weekSummary.missions, weekSummary.social, weekSummary.school.replace('School', rules.study?.noun === 'lecture' ? 'Lectures' : 'School'), ...weekSummary.decisions]}
          onClose={() => store.dismissWeekSummary()} />
      )}

      {/* "Make It to Friday" recap — real numbers computed at completion, not scripted */}
      {!daySummary && store.pendingLevelSummary && (
        <LevelSummaryModal summary={store.pendingLevelSummary} onClose={() => store.dismissLevelSummary()} />
      )}

      {/* Switch life path: everything on this path is saved first, then the path picker opens. */}
      {confirmSwitch && (
        <div style={hud.modalBackdrop}>
          <div style={{ ...hud.modal, width: 'min(360px, 92vw)', textAlign: 'center', animation: 'mmPop 220ms ease-out' }}>
            <div style={{ fontSize: 38 }}>🔀</div>
            <h2 style={{ margin: '4px 0 6px' }}>Switch life path?</h2>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 14 }}>
              Your {getLifePath(player.lifePath).name} life is saved right here — {day}, {time}, ${store.cash.toFixed(2)}.
              Come back any time and carry on.
            </div>
            <button style={btnStyle} onClick={() => { void switchPath(); }}>🔀 Choose another life</button>
            <button style={{ ...hud.smallBtn, marginTop: 8, width: '100%', padding: 8 }} onClick={() => { setConfirmSwitch(false); store.setPaused(false); }}>Keep playing</button>
          </div>
        </div>
      )}

      {/* Sleep button (only shown at home, outdoor scene excluded) */}
      {s.player.place === 'home' && (
        <div style={hud.homeBtns}>
          <button style={{ ...hud.sleepBtn, position: 'static' }} onClick={() => store.sleep(false)}>🛏️ Go to sleep</button>
          {rules.savings.atHome
            ? <button style={{ ...hud.sleepBtn, position: 'static', background: '#f0a0c0' }} onClick={() => setShowPiggy(true)}>{rules.savings.emoji} {rules.savings.name} · ${s.finance.accounts.savings.toFixed(2)}</button>
            : <button style={{ ...hud.sleepBtn, position: 'static', background: '#79c0ff' }} onClick={() => setPhoneApp('bank')}>{rules.savings.emoji} Savings · ${s.finance.accounts.savings.toFixed(2)}</button>}
        </div>
      )}
      {showPiggy && s.player.place === 'home' && <PiggyBank store={store} onClose={() => setShowPiggy(false)} />}
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
  // Choices appear right where the player was clicking to advance; ignore clicks on them for a
  // moment so a fast click-through can't pick an option by accident.
  const choicesShownAt = useRef(0);
  useEffect(() => { if (atEnd) choicesShownAt.current = performance.now(); }, [atEnd, key]);
  const choiceReady = () => performance.now() - choicesShownAt.current > 350;
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
                onClick={(e) => { e.stopPropagation(); if (affordable && choiceReady()) onChoose(c); }}
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

/** The piggy bank at home: move cash into savings so it isn't spent by accident, and back out
 *  when you need it. Every move is a pair of transfers in the ledger. */
function PiggyBank({ store, onClose }: { store: GameStore; onClose: () => void }) {
  const f = store.state.finance.accounts;
  const [, redraw] = useState(0);
  const move = (fn: () => boolean) => { fn(); redraw(n => n + 1); };
  const goal = store.goalStatus();
  return (
    <div style={hud.modalBackdrop} onClick={onClose}>
      <div style={{ ...hud.modal, width: 'min(320px, 92vw)', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 44 }}>🐷</div>
        <h3 style={{ margin: '4px 0 2px' }}>Piggy bank</h3>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#f0a0c0' }}>${f.savings.toFixed(2)}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>Cash in your pocket: ${f.cash.toFixed(2)}</div>
        {goal?.def.id === 'save_event' && !goal.achieved && (
          <div style={{ fontSize: 12, color: '#ffd23f', marginBottom: 10 }}>🎟️ Fair goal: $10 saved by Saturday</div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button style={hud.choiceBtn} disabled={f.cash < 1} onClick={() => move(() => store.moveToSavings(1))}>Save $1</button>
          <button style={hud.choiceBtn} disabled={f.cash < 5} onClick={() => move(() => store.moveToSavings(5))}>Save $5</button>
          <button style={hud.choiceBtn} disabled={f.savings < 1} onClick={() => move(() => store.takeFromSavings(1))}>Take $1</button>
          <button style={hud.choiceBtn} disabled={f.savings <= 0} onClick={() => move(() => store.takeFromSavings(f.savings))}>Take it all</button>
        </div>
        <button style={{ ...btnStyle, marginTop: 14 }} onClick={onClose}>Done</button>
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
      lifePath: sm.path, highlights: sm.highlights.map(h => h.text),
      startBalance: sm.startBalance, endBalance: sm.endBalance,
      daysAttended: sm.daysAttended, daysTotal: sm.daysTotal,
      schoolProjectDone: sm.schoolProjectDone, birthdayOutcome: sm.birthdayOutcome,
      unexpectedOutcome: sm.unexpectedOutcome, wentToArcade: sm.wentToArcade,
      goalName: sm.goal?.name, goalAchieved: sm.goal?.achieved, savings: sm.savings, busSpent: sm.busSpent,
    }).then(reply => { if (live) setMentorTake(reply); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sm]);
  const net = sm.endBalance - sm.startBalance;
  const birthdayLine = sm.birthdayOutcome === 'full' ? "✓ Paid Riley's birthday in full"
    : sm.birthdayOutcome === 'partial' ? '~ Paid Riley part of what you promised'
    : "✗ Didn't come through for Riley's birthday";
  const projectLine = sm.schoolProjectDone ? '✓ Got the school project supplies in time' : "✗ Never got the school project supplies";
  const unexpectedLine = sm.unexpectedKind === 'bus'
    ? (sm.unexpectedOutcome === 'paid' ? '⚡ Paid $3 to top up the bus card' : '⚡ Walked home instead of topping up the bus card')
    : sm.unexpectedKind === 'shoe'
      ? (sm.unexpectedOutcome === 'paid' ? '👟 Paid $4 to fix your shoe' : '👟 Taped your shoe instead of paying')
      : null;
  return (
    <div style={hud.modalBackdrop}>
      <div style={{ ...hud.modal, width: 'min(400px, 92vw)' }}>
        <h2 style={{ marginBottom: 4 }}>📅 Your Week</h2>
        <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 12 }}>Here's how the week actually went.</div>
        {sm.goal && (
          <div style={{ padding: '10px 12px', borderRadius: 8, marginBottom: 12, background: sm.goal.achieved ? '#12351c' : '#3a1c1c', border: `1px solid ${sm.goal.achieved ? '#3fb950' : '#ff8080'}` }}>
            <div style={{ fontSize: 11, opacity: 0.7 }}>YOUR GOAL</div>
            <div style={{ fontWeight: 700 }}>{sm.goal.emoji} {sm.goal.name} — {sm.goal.achieved ? 'DONE ✓' : 'NOT THIS TIME'}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{sm.goal.detail}</div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', background: '#0d1117', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
          <div><div style={{ fontSize: 11, opacity: 0.6 }}>STARTED WITH</div><div style={{ fontSize: 18, fontWeight: 700 }}>${sm.startBalance.toFixed(2)}</div></div>
          <div style={{ fontSize: 20, opacity: 0.5, alignSelf: 'center' }}>→</div>
          <div><div style={{ fontSize: 11, opacity: 0.6 }}>ENDED WITH</div><div style={{ fontSize: 18, fontWeight: 700, color: net >= 0 ? '#7cfc00' : '#ff8080' }}>${sm.endBalance.toFixed(2)}</div></div>
        </div>
        <div style={{ marginBottom: 6 }}>💵 Earned ${sm.earned.toFixed(2)} · Spent ${sm.spent.toFixed(2)}{sm.savings > 0 ? ` · ${pathRules(sm.path).savings.emoji} $${sm.savings.toFixed(2)} saved` : ''}</div>
        {sm.path !== 'school' ? (
          sm.highlights.map((h, i) => (
            <div key={i} style={{ marginBottom: 6, color: h.tone === 'good' ? '#aef0a0' : h.tone === 'bad' ? '#ffa0a0' : undefined }}>
              {h.icon} {h.text}
            </div>
          ))
        ) : (<>
        <div style={{ marginBottom: 6 }}>🏫 School: {sm.daysAttended}/{sm.daysTotal} days attended</div>
        <div style={{ marginBottom: 6 }}>{projectLine}</div>
        <div style={{ marginBottom: 6 }}>{birthdayLine}</div>
        {unexpectedLine && <div style={{ marginBottom: 6 }}>{unexpectedLine}</div>}
        <div style={{ marginBottom: 6 }}>{sm.wentToArcade ? '🕹️ Made it to the arcade with friends' : '🕹️ Skipped the arcade this week'}</div>
        {sm.dairyShift && <div style={{ marginBottom: 6 }}>📦 Worked a shift at the Dairy (+$8)</div>}
        <div style={{ marginBottom: 6 }}>{sm.fairAttended ? '🎟️ Went to the school fair' : '🎟️ Missed the school fair'}</div>
        <div style={{ marginBottom: 6 }}>
          {sm.busRides > 0
            ? `🚌 ${sm.busRides} bus ride${sm.busRides === 1 ? '' : 's'} — $${sm.busSpent.toFixed(2)} spent on the bus`
            : '🚶 Walked everywhere — $0 on fares'}
        </div>
        </>)}
        <div style={{ marginTop: 14, padding: '10px 12px', background: '#0d1117', borderRadius: 8, borderLeft: '3px solid #60b8ff' }}>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>🧑‍🏫 KAI'S TAKE</div>
          <div style={{ fontSize: 13, lineHeight: 1.4 }}>{mentorTake ?? 'Thinking it over…'}</div>
        </div>
        <button style={{ ...btnStyle, marginTop: 16 }} onClick={onClose}>Back to Sunday</button>
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
    const label = placeName(s.lifePath, p.id, p.name);
    ctx.strokeText(label, x + w / 2, y + h + TILE_PX * 0.3);
    ctx.fillText(label, x + w / 2, y + h + TILE_PX * 0.3);
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
    ctx.strokeText(pathText(s.lifePath, stop.name), x, y + TILE_PX * 0.35);
    ctx.fillText(pathText(s.lifePath, stop.name), x, y + TILE_PX * 0.35);
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
    ctx.strokeText(pathText(s.lifePath, link.label), link.tile.x * T, link.tile.y * T - T * 0.4);
    ctx.fillText(pathText(s.lifePath, link.label), link.tile.x * T, link.tile.y * T - T * 0.4);
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
  // Shop products: a price card with the product's icon, sitting on the front edge of its shelf.
  // Sorted just after the furniture it sits on (so the shelf never hides it) but before a player
  // standing in front of it. The item in reach is outlined; items on the active shopping list glow.
  if (interior.shopItems) {
    const nearId = store.nearbyShopItem()?.id;
    const list = store.shoppingProgress();
    const tagPulse = 0.55 + Math.sin(performance.now() / 260) * 0.25;
    for (const item of interior.shopItems) {
      const under = interior.furniture.filter(f => item.tx >= f.tx - 0.3 && item.tx <= f.tx + f.tw + 0.3 && item.ty >= f.ty - 0.3 && item.ty <= f.ty + f.th + 0.3);
      const sortY = Math.max(item.ty, ...under.map(f => f.ty + f.th)) * T + 0.5;
      const needIdx = list ? list.need.findIndex(p => item.id.startsWith(p)) : -1;
      const wanted = needIdx >= 0 && !list!.covered[needIdx];
      drawables.push({ y: sortY, draw: () => drawPriceTag(ctx, item, T, item.id === nearId, wanted ? tagPulse : 0) });
    }
  }

  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  ctx.restore();

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(pathText(s.lifePath, interior.name).toUpperCase(), cw / 2, oy - 16);
}

/** One product's shelf tag: icon on the left, name and price on the right. */
function drawPriceTag(ctx: CanvasRenderingContext2D, item: ShopItemDef, T: number, near: boolean, glow: number) {
  const x = item.tx * T, y = item.ty * T;
  const w = T * 0.94, h = T * 0.5, left = x - w / 2, top = y - h / 2;
  if (glow > 0) {
    ctx.fillStyle = `rgba(124,252,0,${glow * 0.55})`;
    ctx.fillRect(left - 4, top - 4, w + 8, h + 8);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(left + 2, top + 3, w, h);                      // drop shadow
  ctx.fillStyle = near ? '#fff7cf' : '#fdfdf8';
  ctx.fillRect(left, top, w, h);
  ctx.lineWidth = near ? 2.5 : 1;
  ctx.strokeStyle = near ? '#f0c038' : '#3a3a3a';
  ctx.strokeRect(left, top, w, h);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = `${Math.round(T * 0.26)}px sans-serif`;
  ctx.fillText(item.icon ?? '🏷️', left + T * 0.17, y + 1);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1e1e1e';
  // Shrink long names (e.g. "Poster Board") until they fit inside the card.
  const avail = w - T * 0.36;
  let size = T * 0.135;
  ctx.font = `bold ${size}px monospace`;
  while (ctx.measureText(item.name).width > avail && size > T * 0.085) {
    size -= 0.5;
    ctx.font = `bold ${size}px monospace`;
  }
  ctx.fillText(item.name, left + T * 0.33, y - h * 0.2, avail);
  ctx.fillStyle = '#0a7a3a';
  ctx.font = `bold ${Math.round(T * 0.15)}px monospace`;
  ctx.fillText(`$${item.price.toFixed(2)}`, left + T * 0.33, y + h * 0.22);
  ctx.textBaseline = 'alphabetic';
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
  ctx.fillText(`${pathText(s.lifePath, from.name)} → ${pathText(s.lifePath, to.name)}`, cx, panelY - 12);

  // progress bar with the two stop names anchored at each end
  const barY = panelY + 220, barW = panelW;
  ctx.fillStyle = '#2b2f3a';
  ctx.fillRect(cx - barW / 2, barY, barW, 10);
  ctx.fillStyle = '#3fb950';
  ctx.fillRect(cx - barW / 2, barY, barW * pct, 10);
  ctx.beginPath(); ctx.arc(cx - barW / 2 + barW * pct, barY + 5, 7, 0, Math.PI * 2); ctx.fill();
  ctx.font = '12px monospace';
  ctx.fillStyle = '#9aa4b2';
  ctx.textAlign = 'left'; ctx.fillText(pathText(s.lifePath, from.name), cx - barW / 2, barY + 26);
  ctx.textAlign = 'right'; ctx.fillText(pathText(s.lifePath, to.name), cx + barW / 2, barY + 26);

  const remaining = Math.max(0, Math.ceil(ride.endsAt - s.minutes));
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23f';
  ctx.font = 'bold 15px monospace';
  ctx.fillText(`Arriving in ${remaining} min`, cx, barY + 52);
  ctx.fillStyle = '#7cfc00';
  ctx.font = '12px monospace';
  ctx.fillText(ride.fare > 0 ? `Fare paid: $${ride.fare.toFixed(2)}` : 'Riding on your bus pass', cx, barY + 72);
}

interface Toast {
  key: string;
  icon: string;
  label?: string;
  lines: string[];
  tone?: 'plain' | 'gold' | 'blue' | 'green';
  ms?: number;
  onClick?: () => void;
}
const TOAST_COLORS: Record<NonNullable<Toast['tone']>, string> = { plain: '#555', gold: '#ffd23f', blue: '#7cc7ff', green: '#3fb950' };

/** Keyframes for the go-home / goodnight transition. The runner uses the player's real run sheet
 *  (6 frames × 16px per direction; "right" is the 4th direction), scaled 4×. */
const TRANSITION_CSS = `
@keyframes mmFade { 0% { opacity: 0 } 15% { opacity: 1 } 85% { opacity: 1 } 100% { opacity: 0 } }
@keyframes mmPop { from { transform: scale(0.85); opacity: 0 } to { transform: scale(1); opacity: 1 } }
@keyframes mmPhoneUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
@keyframes mmToastIn { from { transform: translateY(-12px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
@keyframes mmPulse { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.08) } }
@keyframes mmRunFrames { from { background-position: -1152px 0 } to { background-position: -1536px 0 } }
@keyframes mmRunAcross { from { left: -80px } to { left: 100% } }
@keyframes mmTwinkle { 0%, 100% { opacity: .35 } 50% { opacity: 1 } }
.mm-runner { position: absolute; bottom: 22%; width: 64px; height: 128px; image-rendering: pixelated;
  background: url(/characters/adam/run.png) 0 0 / 1536px 128px no-repeat;
  animation: mmRunFrames .54s steps(6) infinite, mmRunAcross 3s linear forwards; }
.mm-moon { position: absolute; top: 12%; right: 16%; width: 56px; height: 56px; border-radius: 50%;
  background: #fdf4c4; box-shadow: 0 0 40px 8px rgba(253,244,196,.35); }
.mm-stars { position: absolute; inset: 0; animation: mmTwinkle 1.6s ease-in-out infinite;
  background-image: radial-gradient(2px 2px at 10% 20%, #fff, transparent), radial-gradient(2px 2px at 30% 10%, #fff, transparent),
    radial-gradient(2px 2px at 55% 25%, #fff, transparent), radial-gradient(2px 2px at 75% 8%, #fff, transparent),
    radial-gradient(2px 2px at 88% 30%, #fff, transparent), radial-gradient(2px 2px at 20% 40%, #fff, transparent); }
`;

const hud: Record<string, React.CSSProperties> = {
  transition: {
    position: 'absolute', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(#0b1030 0%, #1b1f4a 60%, #2c2350 100%)', overflow: 'hidden', animation: 'mmFade 3s ease-in-out forwards',
  },
  topLeft: { position: 'absolute', top: 12, left: 12, zIndex: 10, fontFamily: 'monospace', color: '#fff', textShadow: '0 1px 2px #000', maxWidth: 260 },
  clock: { display: 'inline-block', background: 'rgba(10,10,20,0.75)', border: '1px solid #444', borderRadius: 8, padding: '4px 10px', fontSize: 13, color: '#ffd23f', marginBottom: 8 },
  objectiveBtn: { background: 'rgba(18,53,28,0.9)', border: '1px solid #3fb950', borderRadius: 8, padding: '6px 10px', color: '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'monospace', animation: 'mmPulse 1.6s ease-in-out infinite' },
  topRight: { position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, fontFamily: 'monospace' },
  money: { background: 'rgba(10,10,20,0.75)', border: '1px solid #444', borderRadius: 8, padding: '4px 12px', fontSize: 18, fontWeight: 700, color: '#7cfc00', textShadow: '0 1px 2px #000' },
  energyRow: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(10,10,20,0.75)', border: '1px solid #444', borderRadius: 8, padding: '4px 10px' },
  energyTrack: { width: 110, height: 8, background: '#2a2d36', borderRadius: 4, overflow: 'hidden' },
  energyFill: { height: '100%', borderRadius: 4, transition: 'width 300ms' },
  phoneBtn: {
    position: 'absolute', right: 24, bottom: 206, width: 58, height: 58, borderRadius: 16, zIndex: 26, fontSize: 28,
    background: 'linear-gradient(#2a2d36, #14161c)', border: '2px solid #555', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
  },
  phoneBadge: { position: 'absolute', top: -6, right: -6, minWidth: 22, height: 22, borderRadius: 11, background: '#f85149', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', animation: 'mmPulse 1.2s ease-in-out infinite' },
  phoneKey: { position: 'absolute', bottom: -18, left: 0, right: 0, fontSize: 10, fontFamily: 'monospace', opacity: 0.7, textShadow: '0 1px 2px #000' },
  toastStack: { position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 40, display: 'flex', flexDirection: 'column', gap: 6, width: 'min(380px, 60vw)' },
  toast: {
    display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(20,16,30,0.95)', border: '1px solid', borderRadius: 10,
    padding: '8px 14px', color: '#fff', fontFamily: 'monospace', fontSize: 13, animation: 'mmToastIn 220ms ease-out', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
  },
  smallBtn: { background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 12 },
  // Step 26: compact "what should I care about right now?" card — deliberately small (no border/
  // background box beyond a soft shadow) so it reads as part of the game HUD, not a debug panel.
  objective: { fontFamily: 'monospace', textShadow: '0 1px 2px #000', maxWidth: 240 },
  objectiveLabel: { fontSize: 11, color: '#ffd23f', letterSpacing: 0.5, opacity: 0.9 },
  objectiveName: { fontSize: 14, color: '#fff', fontWeight: 700, marginTop: 1 },
  objectiveLocation: { fontSize: 12, color: '#ffd23f', marginTop: 1 },
  exitHint: { position: 'absolute', bottom: 12, left: 12, color: '#fff', fontFamily: 'monospace', fontSize: 12, background: 'rgba(0,0,0,0.6)', padding: '6px 10px', borderRadius: 6, zIndex: 10 },
  buyPrompt: { position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', color: '#ffd700', fontFamily: 'monospace', fontSize: 13, background: 'rgba(0,0,0,0.75)', padding: '8px 14px', borderRadius: 8, zIndex: 10 },
  sleepBtn: { position: 'absolute', bottom: 12, left: 12, ...btnStyle, width: 'auto', padding: '8px 14px', zIndex: 10 },
  homeBtns: { position: 'absolute', bottom: 48, left: 12, display: 'flex', gap: 8, zIndex: 10 },
  goalChip: {
    width: 'min(230px, 55vw)', cursor: 'pointer', textAlign: 'left',
    background: 'rgba(10,10,20,0.8)', border: '1px solid #444', borderRadius: 8, padding: '6px 10px',
    color: '#fff', fontFamily: 'monospace', fontSize: 12,
  },
  dialogue: {
    position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', width: 'min(480px, 92vw)',
    background: 'rgba(10,10,20,0.92)', border: '1px solid #444', borderRadius: 10, padding: 16,
    color: '#fff', fontFamily: 'monospace', fontSize: 13, zIndex: 20,
  },
  choiceBtn: { textAlign: 'left', background: '#1c2440', border: '1px solid #3a4a7a', borderRadius: 6, color: '#fff', padding: '8px 10px', cursor: 'pointer' },
  choiceBtnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  shoppingList: {
    position: 'absolute', top: 132, left: 12, width: 'min(200px, 55vw)',
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
  phoneBarTrack: { height: 6, background: '#2a2d36', borderRadius: 4, overflow: 'hidden' },
  phoneBarFill: { height: '100%', background: '#3fb950', borderRadius: 4 },
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
