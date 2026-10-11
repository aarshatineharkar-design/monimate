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
import { createInitialState, GameStore, LevelSummary, BUS_HOLD_REAL_SECONDS } from '../../lib/store';
import { GameLoop } from '../../lib/loop';
import { askMentorChat, askMentorWeeklyRecap } from '../../lib/mentor';
import { speakLine, stopSpeaking, estimateSpeechMs, isSpeechSupported } from '../../lib/tts';
import { sfx } from '../../lib/sound';
import { MoveInput, drawDayNightOverlay, drawMinimap, hudTime, waypointReadout } from '../../lib/render';
import {
  PLACES, TILE_PX, isOpen as placeIsOpen, groundSprite,
  CHAR_FRAME_W, CHAR_FRAME_H, CHAR_RUN_FRAMES, DIR_ORDER, facingToDir, characterSheet,
  getInterior, INTERIOR_TILE_PX, DECOR_PROPS, getNpcDef, ERRAND_HOSTS,
  BUS_STOPS, BUS_ROUTE, busAtStop, nextBusAt, stopById, rideMinutes, getPlace, type ShopItemDef,
} from '../../lib/world';
import { buildJournal, MissionChoice, MissionDef, trackedMission } from '../../lib/missions';
import { dayToSummaryView, weekToSummaryView } from '../../lib/summary';
import { HOME_JOBS, type HomeJob } from '../../lib/content/homeJobs';
import { chatLinesFor, splitAtQuestion, type ChatReply } from '../../lib/smallTalk';
import { FACT_KIND_LABEL, type MoneyFact } from '../../lib/content/moneyFacts';
const HOME_JOB_BY_ID = new Map(HOME_JOBS.map(j => [j.id, j]));
import type { DayRecord, DecisionRecord, GameState, NpcRuntime } from '../../lib/types';
import { formatDay, formatTime, parts } from '../../lib/clock';
import { pathText, placeName, pathUnlocked, maxLevel, LEVELS_TO_UNLOCK } from '../../lib/pathRules';
import { LIFE_EVENTS } from '../../lib/lifeEvents';
import Phone, { type PhoneApp } from '../../components/Phone';

const MAP_W = 60, MAP_H = 44;

/** Returns `value` only once it has stayed the same for `ms` — closing (null) is instant. Used so
 *  panels don't snap open the same frame something else closes: each beat gets a breath. */
function useSettled<T>(value: T | null, ms: number): T | null {
  const [settled, setSettled] = useState<T | null>(value);
  useEffect(() => {
    if (value === null) { setSettled(null); return; }
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** A white name tag with a dark outline, centred under a character. */
function labelUnder(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.font = `bold ${Math.round(size)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

/** Biscuit: a 16x14 two-frame sprite (scripts/art/build_characters.py), mirrored when facing left. */
function drawDog(ctx: CanvasRenderingContext2D, x: number, y: number, T: number, facing: number, moving: boolean) {
  const img = getImg('/characters/dog/biscuit.png');
  const w = T * 0.62, h = w * 14 / 16;
  const frame = moving ? Math.floor(performance.now() / 140) % 2 : 0;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(x, y + 1, w * 0.38, w * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  if (img) {
    const left = Math.cos(facing) < 0;
    ctx.translate(x, y - h + 3);
    if (left) ctx.scale(-1, 1);
    ctx.drawImage(img, frame * 16, 0, 16, 14, -w / 2, 0, w, h);
  }
  ctx.restore();
}

/** A little pile of cans and a crisp packet for the litter pick. */
function drawLitter(ctx: CanvasRenderingContext2D, x: number, y: number, T: number, seed: number) {
  const u = T / 16;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(x, y + u, u * 6, u * 1.8, 0, 0, Math.PI * 2); ctx.fill();
  const cans = [[-3, 0, '#c8cdd6', '#d23a3a'], [1, -1, '#c8cdd6', '#3a7bd2'], [3.5, 1, '#c8cdd6', '#3fb950']] as const;
  cans.forEach(([dx, dy, metal, band], i) => {
    if ((seed + i) % 4 === 3) return;
    ctx.fillStyle = metal; ctx.fillRect(x + dx * u, y + (dy - 3) * u, u * 2.4, u * 3.4);
    ctx.fillStyle = band; ctx.fillRect(x + dx * u, y + (dy - 2) * u, u * 2.4, u * 1.2);
    ctx.strokeStyle = '#3a3a50'; ctx.lineWidth = 1; ctx.strokeRect(x + dx * u, y + (dy - 3) * u, u * 2.4, u * 3.4);
  });
  ctx.fillStyle = '#f0b429'; ctx.fillRect(x - u * 1.5, y + u * 0.2, u * 3, u * 1.6);
  ctx.restore();
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
  // Every play session starts on the pathway screen (choose / continue a life) — never straight in.
  const [choosingPath, setChoosingPath] = useState(true);
  const [switchingFromGame, setSwitchingFromGame] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    (async () => {
      // A play session starts with signing in: arriving from the sign-in page (?fresh=1) starts one
      // for this tab; reloading keeps it; opening the game fresh (new tab, browser restarted) asks
      // the player to sign in again.
      if (!(await startOrResumeSession(supabase))) return;
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
        supabase={supabase} userId={player.id} playerName={player.name}
        current={switchingFromGame && currentPlayable ? player.lifePath : null}
        onChoose={p => { setSwitchingFromGame(false); void choosePath(p); }}
        onBack={switchingFromGame && currentPlayable ? () => { setSwitchingFromGame(false); setChoosingPath(false); } : undefined}
        onLogout={() => { endPlaySession(); void signOut(); }}
      />
    );
  }
  return (
    <GameLoader
      key={`${player.id}:${player.lifePath}`}
      supabase={supabase} player={player} notice={loadError}
      onChangePath={() => { setSwitchingFromGame(true); setChoosingPath(true); }}
    />
  );
}

const SESSION_KEY = 'monimate_play_session';
/** Begin (arriving from sign-in with ?fresh=1) or continue (a reload) this tab's play session.
 *  Anything else — a new tab, a restarted browser, an old bookmark — signs out and goes to the
 *  sign-in page, so every time someone starts the game they sign in first. */
async function startOrResumeSession(supabase: SupabaseClient): Promise<boolean> {
  const url = new URL(window.location.href);
  let active = false;
  try { active = window.sessionStorage.getItem(SESSION_KEY) === '1'; } catch { /* storage blocked */ }
  if (url.searchParams.get('fresh') === '1') {
    try { window.sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* storage blocked */ }
    url.searchParams.delete('fresh');
    window.history.replaceState(null, '', url.pathname + url.search);
    return true;
  }
  if (active) return true;
  await supabase.auth.signOut();
  window.location.href = '/login?next=/game&reason=start';
  return false;
}
function endPlaySession() {
  try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* storage blocked */ }
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
function PathSelect({ supabase, userId, current, onChoose, onBack, playerName, onLogout }: {
  supabase: SupabaseClient; userId: string; current: LifePath | null;
  onChoose: (p: LifePath) => void; onBack?: () => void;
  playerName?: string; onLogout?: () => void;
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
        {(playerName || onLogout) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, fontFamily: 'monospace', color: '#cfd8e3', fontSize: 13 }}>
            <span>👋 Kia ora, <b style={{ color: '#ffd23f' }}>{playerName}</b></span>
            {onLogout && <button style={{ ...ps.back, position: 'static', margin: 0 }} onClick={onLogout}>Log out</button>}
          </div>
        )}
        <h1 style={ps.title}>{current ? 'SWITCH LIFE' : 'CHOOSE YOUR LIFE'}</h1>
        <p style={ps.sub}>Every life keeps its own save. Switch whenever you like — each one waits exactly where you left it.</p>
        <div style={ps.grid}>
          {LIFE_PATHS.map(p => {
            const sv = saves?.[p.id];
            const here = p.id === current;
            const done: Partial<Record<LifePath, number>> = { school: saves?.school?.levelsCompleted ?? 0, university: saves?.university?.levelsCompleted ?? 0 };
            const unlocked = pathUnlocked(p.id, done);
            const playable = p.available && unlocked;
            const level = sv?.level ?? 1;
            return (
              <div key={p.id} style={{ ...ps.card, borderColor: playable ? p.color : '#30363d', opacity: playable ? 1 : 0.62 }}>
                {here && <div style={{ ...ps.badge, background: p.color, color: '#0d1117' }}>YOU ARE HERE</div>}
                {!unlocked && <div style={ps.badge}>🔒 LOCKED</div>}
                {unlocked && !p.available && <div style={ps.badge}>COMING SOON</div>}
                <div style={{ fontSize: 34, filter: unlocked ? undefined : 'grayscale(1)' }}>{unlocked ? p.emoji : '🔒'}</div>
                <div style={ps.name}>{p.name}</div>
                <div style={ps.tagline}>{p.tagline}</div>
                <div style={ps.desc}>{p.description}</div>
                {!unlocked && (
                  <div style={ps.lockBox}>
                    <div style={{ marginBottom: 6 }}>Finish {LEVELS_TO_UNLOCK} levels in School and University to unlock.</div>
                    {(['school', 'university'] as LifePath[]).map(k => {
                      const n = Math.min(LEVELS_TO_UNLOCK, done[k] ?? 0);
                      return (
                        <div key={k} style={{ marginBottom: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{k === 'school' ? '🧑‍🎓 School' : '🎓 University'}</span><span>{n}/{LEVELS_TO_UNLOCK}</span></div>
                          <div style={ps.track}><div style={{ ...ps.fill, width: `${(n / LEVELS_TO_UNLOCK) * 100}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {playable && (
                  <>
                    <div style={ps.level}>LEVEL {level} · {(p.levelNames[level - 1] ?? p.levelNames[p.levelNames.length - 1]).toUpperCase()}</div>
                    <div style={ps.levels} aria-label="Levels">
                      {p.levelNames.map((name, i) => {
                        const stars = sv?.stars?.[i + 1] ?? 0;
                        const built = i + 1 <= maxLevel(p.id);
                        const reached = built && i + 1 <= Math.max(level, (sv?.levelsCompleted ?? 0) + 1);
                        return (
                          <div key={name} title={`Level ${i + 1}: ${name}${built ? '' : ' (coming soon)'}`} style={{ ...ps.levelDot, borderColor: reached ? p.color : '#30363d', color: reached ? '#fff' : '#555', borderStyle: built ? 'solid' : 'dashed' }}>
                            <div>{i + 1}</div>
                            <div style={{ fontSize: 9, letterSpacing: -1 }}>{stars ? '★'.repeat(stars) : reached ? '·' : built ? '🔒' : '⏳'}</div>
                          </div>
                        );
                      })}
                    </div>
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
  lockBox: { fontSize: 17, color: '#cfd8e3', background: '#0d1117', border: '2px solid #30363d', padding: 8, marginTop: 6 },
  track: { height: 6, background: '#30363d' },
  fill: { height: '100%', background: '#7cfc00' },
  levels: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 },
  levelDot: { width: 30, height: 32, border: '2px solid', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#fff', background: '#0d1117' },
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
  // A short non-mission conversation (small talk, a purchase receipt, a bus notice). Its lines play
  // one after another in step with the voice; E / Enter / tap moves it on and it closes by itself
  // after the last line.
  // When someone asks you something, the chat stops at the question with `replies` to pick from,
  // and `rest` is what they were going to say next.
  type Chat = { npc?: string; lines: string[]; chatWith?: string; replies?: ChatReply[] | null; rest?: string[] };
  const [dialogueLines, setChat] = useState<Chat | null>(null);
  const dialogueLinesRef = useRef<Chat | null>(null);
  dialogueLinesRef.current = dialogueLines;
  const setDialogueLines = useCallback((c: { npc?: string; text?: string; lines?: string[]; chatWith?: string } | null) => {
    if (!c) { setChat(null); return; }
    const all = c.lines ?? (c.text ? [c.text] : []);
    // Only real conversations (small talk) ask you things; receipts and notices just play.
    const split = c.chatWith ? splitAtQuestion(all) : { lines: all, replies: null, rest: [] };
    setChat({ npc: c.npc, lines: split.lines, chatWith: c.chatWith, replies: split.replies, rest: split.rest });
  }, []);
  // You answered: your reply, their response, then the rest of what they had to say (which may hold
  // another question).
  const answerChat = useCallback((r: ChatReply) => {
    const c = dialogueLinesRef.current;
    if (!c) return;
    const st = storeRef.current;
    if (r.rel && c.chatWith && st) st.adjustRelationship(getNpcDef(c.chatWith)?.name ?? c.chatWith, r.rel);
    const next = splitAtQuestion([r.response, ...(c.rest ?? [])]);
    setChat({ npc: c.npc, chatWith: c.chatWith, lines: [`${PLAYER_LINE}${r.label}`, ...next.lines], replies: next.replies, rest: next.rest });
  }, []);
  // People you've just chatted with won't start the same small talk again for a while (game minutes).
  const chattedAtRef = useRef<Map<string, number>>(new Map());
  const recentlyChatted = (npcId: string) => {
    const t = chattedAtRef.current.get(npcId);
    return t !== undefined && (storeRef.current?.state.minutes ?? 0) - t < 90;
  };
  const closeChat = useCallback(() => {
    const c = dialogueLinesRef.current;
    if (c?.chatWith && storeRef.current) chattedAtRef.current.set(c.chatWith, storeRef.current.state.minutes);
    stopSpeaking();
    setChat(null);
  }, []);
  // E / Enter / the NEXT button: move whichever conversation is open on by one beat.
  const [advanceSignal, setAdvanceSignal] = useState(0);
  const conversationOpenRef = useRef(false);
  // The phone (null = closed). Journal, wallet, relationships, Kai and settings all live in it.
  const [phoneApp, setPhoneApp] = useState<PhoneApp | null>(null);
  const phoneOpenRef = useRef(false);
  phoneOpenRef.current = phoneApp !== null;
  // One notification queue for everything (achievements, new messages, results, notices). They're
  // released one at a time, a beat apart, and held while someone is talking or a card/menu is up —
  // so a message never lands on top of Mum mid-sentence. `urgent` ones (can't afford, etc.) skip the hold.
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastsRef = useRef<Toast[]>([]);
  toastsRef.current = toasts;
  const toastQueueRef = useRef<Omit<Toast, 'key'>[]>([]);
  const lastToastAtRef = useRef(0);
  const busyRef = useRef(false);
  const pushToast = useCallback((t: Omit<Toast, 'key'>) => {
    const sig = (x: Omit<Toast, 'key'>) => x.icon + '|' + x.lines.join('|');
    if (toastQueueRef.current.some(x => sig(x) === sig(t))) return;
    toastQueueRef.current.push(t);
  }, []);
  useEffect(() => {
    const id = setInterval(() => {
      const q = toastQueueRef.current;
      while (q.length && q[0].isStale?.()) q.shift();
      if (!q.length) return;
      const now = performance.now();
      if (now - lastToastAtRef.current < 1100) return;
      if (busyRef.current && !q[0].urgent) return;
      const t = q.shift()!;
      lastToastAtRef.current = now;
      const key = Math.random().toString(36).slice(2);
      setToasts(cur => [...cur.slice(-1), { ...t, key }]);
      try { sfx.notify(); } catch { /* audio is optional */ }
      setTimeout(() => setToasts(cur => cur.filter(x => x.key !== key)), t.ms ?? 4200);
    }, 200);
    return () => clearInterval(id);
  }, []);

  // Decision cards: every money choice gets a moment of feedback — smart move / trade-off / costly —
  // with what happened and the lesson. One at a time; tap to dismiss early.
  const [decisionCard, setDecisionCard] = useState<(DecisionRecord & { uid: number }) | null>(null);
  const decisionQueueRef = useRef<DecisionRecord[]>([]);
  const decisionUidRef = useRef(0);
  const decisionCardRef = useRef<DecisionRecord | null>(null);
  const modalOpenRef = useRef(false); // a full-screen card is up — decision cards wait their turn
  decisionCardRef.current = decisionCard;
  useEffect(() => {
    const id = setInterval(() => {
      if (decisionCardRef.current || modalOpenRef.current || !decisionQueueRef.current.length) return;
      const d = decisionQueueRef.current.shift()!;
      const card = { ...d, uid: ++decisionUidRef.current };
      decisionCardRef.current = card;
      // Notifications on screen step aside for the card and come back after it.
      if (toastsRef.current.length) {
        toastQueueRef.current.unshift(...toastsRef.current.map(t => {
          const rest: Omit<Toast, 'key'> & { key?: string } = { ...t };
          delete rest.key;
          return { ...rest, ms: Math.max(2500, (t.ms ?? 4200) - 1500) };
        }));
        setToasts([]);
      }
      setDecisionCard(card);
      try {
        if (d.verdict === 'good') sfx.goodMove();
        else if (d.verdict === 'bad') sfx.badMove();
        else sfx.tradeoff();
      } catch { /* audio is optional */ }
    }, 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!decisionCard) return;
    const ms = 5500 + (decisionCard.lesson ? Math.min(5000, decisionCard.lesson.length * 45) : 0);
    const t = setTimeout(() => setDecisionCard(null), ms);
    return () => clearTimeout(t);
  }, [decisionCard]);
  const seenInboxRef = useRef<Set<string>>(new Set());
  const [showPiggy, setShowPiggy] = useState(false);
  const [dayCard, setDayCard] = useState<ReturnType<GameStore['todaySummary']> | null>(null);
  const [transition, setTransition] = useState<{ title: string; sub: string; moon: boolean } | null>(null);
  const [boardingAt, setBoardingAt] = useState<string | null>(null); // stopId whose destination picker is open
  // Attend Class: a message when it can't happen (e.g. too tired), shown until dismissed.
  const [classFailure, setClassFailure] = useState<string | null>(null);
  const classResolvingRef = useRef(false);
  // Jobs board (home): which job is being done right now, and how far along the progress bar is.
  const [jobsOpen, setJobsOpen] = useState(false);
  const [jobWork, setJobWork] = useState<{ job: HomeJob; pct: number } | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
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

  // Touch: a floating joystick. Put a thumb down anywhere on the game and drag — the stick appears
  // under it, and how far you drag sets how fast you walk. A quick tap (no drag) acts like E.
  const JOY_RADIUS = 56;
  const joyRef = useRef<{ id: number; ox: number; oy: number; dx: number; dy: number; t: number; moved: boolean } | null>(null);
  const [joyView, setJoyView] = useState<{ ox: number; oy: number; dx: number; dy: number } | null>(null);
  const tapActionRef = useRef<() => void>(() => {});
  const onStickDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' || joyRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    joyRef.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0, t: performance.now(), moved: false };
    setJoyView({ ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 });
  }, []);
  const onStickMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const j = joyRef.current;
    if (!j || j.id !== e.pointerId) return;
    let vx = e.clientX - j.ox, vy = e.clientY - j.oy;
    const d = Math.hypot(vx, vy);
    if (d > 10) j.moved = true;
    if (d > JOY_RADIUS) { vx = vx / d * JOY_RADIUS; vy = vy / d * JOY_RADIUS; }
    j.dx = vx / JOY_RADIUS; j.dy = vy / JOY_RADIUS;
    setJoyView({ ox: j.ox, oy: j.oy, dx: vx, dy: vy });
  }, []);
  const onStickUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const j = joyRef.current;
    if (!j || j.id !== e.pointerId) return;
    joyRef.current = null;
    setJoyView(null);
    if (!j.moved && performance.now() - j.t < 300) tapActionRef.current();
  }, []);

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
  const loggingOutRef = useRef(false);
  const save = useCallback(() => { if (!loggingOutRef.current) void writeSave(supabase, player.id, store.state); }, [supabase, player.id, store]);
  useEffect(() => {
    const id = setInterval(save, 30_000);
    const onHide = () => { if (document.visibilityState === 'hidden') save(); };
    document.addEventListener('visibilitychange', onHide);
    const offEvent = store.onEvent(e => {
      if (e.type === 'day_end' || e.type === 'week_end') save();
      if (e.type === 'level_started') {
        const info = store.levelInfo;
        pushToast({ icon: '⬆️', label: 'NEW LEVEL', lines: [`Level ${e.level} · ${info.name}`, info.blurb], tone: 'gold', ms: 9000 });
      }
    });
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide); offEvent(); save(); };
  }, [save, store]);
  const logout = async () => {
    loggingOutRef.current = true;
    await writeSave(supabase, player.id, store.state);
    endPlaySession();
    await signOut();
  };
  useEffect(() => { if (notice) pushToast({ icon: '⚠️', lines: [notice], ms: 8000 }); }, [notice, pushToast]);

  // Blueprint day loop: WAKE UP -> PHONE. The very first time, the phone opens by itself on Mum's message.
  useEffect(() => {
    if (store.state.world.flags.includes('phone_intro') || store.phoneInbox().length === 0) return;
    // A beat after waking up, the phone buzzes — instead of everything appearing on the first frame.
    const t = setTimeout(() => {
      if (store.state.world.flags.includes('phone_intro')) return;
      store.state.world.flags.push('phone_intro');
      setPhoneApp('messages');
    }, 1400);
    return () => clearTimeout(t);
  }, [store]);
  // Doing a job from the board: a short progress bar, then the store applies the real time, energy
  // and pay in one go (and the decision card explains the hourly rate).
  const startJob = useCallback((job: HomeJob) => {
    setJobsOpen(false);
    setJobWork({ job, pct: 0 });
  }, []);
  const jobId = jobWork?.job.id;
  useEffect(() => {
    if (!jobId) return;
    const job = HOME_JOB_BY_ID.get(jobId)!;
    const durationMs = 1600, start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const pct = Math.min(100, ((now - start) / durationMs) * 100);
      setJobWork(w => (w && w.job.id === jobId ? { ...w, pct } : w));
      if (pct < 100) { raf = requestAnimationFrame(tick); return; }
      const out = store.doHomeJob(job.id);
      setJobWork(null);
      if (!out.ok) { setDialogueLines({ npc: 'Jobs board', text: out.message ?? "That didn't work." }); return; }
      pushToast({ icon: job.emoji, lines: [job.name, `${job.pay > 0 ? `+$${job.pay.toFixed(2)} · ` : ''}${job.minutes} min · -${out.energyConsumed} energy`] });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

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
      if (key === 'escape' && dialogueLinesRef.current?.chatWith) { closeChat(); return; } // end the chat, stay put
      if (key === 'escape' && store.state.player.scene !== 'outdoor' && store.state.player.scene !== 'bus') loop.exit();
      if (key === 'e' || key === 'enter') {
        if (e.repeat) return; // holding the key down shouldn't skip a whole conversation
        if (conversationOpenRef.current) { setAdvanceSignal(n => n + 1); return; }
        if (key === 'e') handleInteract();
      }
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
    const host = store.hostsHere().find(h => store.hostNearPlayer(h.hostId));
    if (host && !host.waiting) {
      const st = store.errandStatus();
      setDialogueLines({ npc: ERRAND_HOSTS[host.hostId].name, text: host.hostId === 'kaur'
        ? `Biscuit still wants his walk! ${st?.detail ?? ''}`.trim()
        : `Keep going — ${st?.detail ?? 'nearly there'}.` });
      return;
    }
    if (npc && !recentlyChatted(npc.id)) {
      setDialogueLines({ npc: getNpcDef(npc.id)?.name ?? npc.id, lines: chatLinesFor(npc.id, store), chatWith: npc.id });
      return;
    }
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
  // A quick tap on the map (touch) = E: move the conversation on if someone is talking, else interact.
  tapActionRef.current = () => {
    if (conversationOpenRef.current) setAdvanceSignal(n => n + 1);
    else handleInteract();
  };

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
        ax: joyRef.current?.dx, ay: joyRef.current?.dy,
      };
      loop.frame(ts, input, { w: canvas.width, h: canvas.height }, { worldW: MAP_W * TILE_PX, worldH: MAP_H * TILE_PX });
      draw(ctx, canvas.width, canvas.height, store, loop);
      for (const t of store.takeAchievementToasts()) pushToast({ icon: t.emoji, label: 'ACHIEVEMENT UNLOCKED', lines: [t.name], tone: 'gold' });
      for (const n of store.takeNotices()) pushToast({ icon: 'ℹ️', lines: [n], ms: 5000, urgent: true });
      for (const d of store.takeDecisions()) decisionQueueRef.current.push(d);
      for (const t of store.takeTips()) pushToast({ icon: '📋', label: 'JOBS BOARD', lines: [t], tone: 'gold', ms: 6500 });
      // In-person objectives get a small "new objective" card; phone messages get a notification.
      for (const d of store.takeOffers()) {
        if (!d.steps[0]?.remote) pushToast({ icon: d.emoji, label: 'NEW OBJECTIVE', lines: [d.name], tone: 'blue' });
      }
      for (const m of store.phoneInbox()) {
        const k = `${m.def.id}:${m.rt.stepIndex}:${parts(store.state.minutes).day}`;
        if (seenInboxRef.current.has(k)) continue;
        seenInboxRef.current.add(k);
        pushToast({ icon: '📱', label: m.step.speaker ?? m.def.name, lines: [m.step.lines[0] ?? m.def.journalText], tone: 'green', onClick: () => setPhoneApp('messages'), ms: 6000,
          isStale: () => !store.phoneInbox().some(x => x.def.id === m.def.id && x.rt.stepIndex === m.rt.stepIndex) });
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
  // Jobs board: School path, at home.
  const jobsHere = profile.lifePath === 'school' && s.player.place === 'home' ? store.homeJobs() : [];
  const openJobs = jobsHere.filter(j => j.status === 'open').length;
  const errand = store.errandStatus();
  const busArrived = nearStopId ? busAtStop(nearStopId, s.minutes) : null;

  // ── Pacing: one conversation at a time, each opening a beat after the last one closes ──
  // Nobody starts talking behind a full-screen card (day recap, goodnight, level summary…).
  const screenCovered = !!(dayCard || transition || store.pendingDaySummary || store.pendingWeekSummary
    || store.pendingLevelSummary || store.pendingFact || confirmSwitch || showPiggy || jobsOpen || jobWork);
  modalOpenRef.current = screenCovered;
  const missionKey = actionable && !lifeEvent && !phoneApp && !screenCovered ? `${actionable.def.id}:${actionable.rt.stepIndex}` : null;
  const settledMission = useSettled(missionKey, 650);
  const missionPanel = missionKey && settledMission === missionKey ? actionable : null;
  const classWanted = !screenCovered && classEligible && !!rules.study && !actionable && !lifeEvent && !boardingAt && !classFailure && !phoneApp && !dialogueLines;
  const classShown = useSettled(classWanted ? 'class' : null, 500) === 'class' && classWanted;
  const chatShown = !!dialogueLines && !actionable && !lifeEvent && !boardingAt && !screenCovered;
  conversationOpenRef.current = !!missionPanel || chatShown;
  busyRef.current = !!(missionPanel || chatShown || lifeEvent || boardingAt || transition || dayCard || store.pendingDaySummary
    || store.pendingWeekSummary || store.pendingLevelSummary || store.pendingFact || phoneApp || decisionCard || confirmSwitch);
  // A mission conversation takes over from small talk (and the small talk doesn't come back after).
  useEffect(() => { if (settledMission && dialogueLinesRef.current) closeChat(); }, [settledMission, closeChat]);
  // Walk away from someone mid-chat and the conversation ends (they won't keep asking your back).
  const chatPartnerGone = !!dialogueLines?.chatWith && store.npcDistanceTiles(dialogueLines.chatWith) > 3.5;
  useEffect(() => { if (chatPartnerGone) closeChat(); }, [chatPartnerGone, closeChat]);
  // "That's everything for today": once nothing is left and no other panel is open.
  const dayDoneNow = !dayCard && !transition && !actionable && !lifeEvent && !boardingAt && !daySummary
    && !weekSummary && !store.pendingLevelSummary && !jobWork && store.dayComplete();
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
        onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp}
      />
      {joyView && (
        <div style={{ position: 'absolute', left: joyView.ox - JOY_RADIUS, top: joyView.oy - JOY_RADIUS, width: JOY_RADIUS * 2, height: JOY_RADIUS * 2, borderRadius: '50%', background: 'rgba(255,255,255,0.10)', border: '2px solid rgba(255,255,255,0.35)', pointerEvents: 'none', zIndex: 30 }}>
          <div style={{ position: 'absolute', left: JOY_RADIUS - 24 + joyView.dx, top: JOY_RADIUS - 24 + joyView.dy, width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.55)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }} />
        </div>
      )}

      {/* On-screen touch controls (phone/tablet only). Movement is the floating joystick: put a thumb
          anywhere on the map and drag. A quick tap on the map does what E does. */}
      {isTouch && (
        <>
          {missionPanel || chatShown ? (
            // While someone's talking, the button moves the conversation on one line at a time.
            <button style={hud.interactBtn} onPointerDown={() => setAdvanceSignal(n => n + 1)}>NEXT</button>
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
        <div style={hud.clock}>{day.slice(0, 3)} <b>{time}</b> <span style={{ color: '#ffd23f', fontSize: 11, marginLeft: 6 }}>LV {store.level}</span></div>
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

      <button style={{ ...hud.phoneBtn, bottom: isTouch ? 206 : 24 }} onClick={() => setPhoneApp(a => (a ? null : 'home'))} aria-label="Phone">
        📱{inbox.length > 0 && <span style={hud.phoneBadge}>{inbox.length}</span>}
        {!isTouch && <span style={hud.phoneKey}>P</span>}
      </button>

      {/* Notifications: one queue, newest at the bottom, tap a message to open it */}
      <div style={hud.toastStack}>
        {/* Decision card — how that choice went, money-wise, and what it teaches. Shares the stack
            with notifications so the two can never land on top of each other. */}
        {decisionCard && <DecisionCard key={decisionCard.uid} d={decisionCard} onClose={() => setDecisionCard(null)} />}
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
          <div style={{ ...hud.buyPrompt, bottom: isTouch ? 196 : 12, pointerEvents: 'auto', cursor: 'pointer' }} onClick={handleInteract}>
            {groceryAlreadyGot
              ? `✓ Already picked up ${nearbyItem.name} — find what's left on the list`
              : `${isTouch ? '👆 Tap to pick up' : '[E] Pick Up'} — ${nearbyItem.brand ? `${nearbyItem.brand} ` : ''}${nearbyItem.name} ($${nearbyItem.price.toFixed(2)})`}
          </div>
        ) : (
          <div style={{ ...hud.buyPrompt, bottom: isTouch ? 196 : 12, pointerEvents: 'auto', cursor: 'pointer' }} onClick={handleInteract}>
            {isTouch ? '👆 Tap to buy' : 'E: Buy'} {nearbyItem.brand ? `${nearbyItem.brand} ` : ''}{nearbyItem.name} — ${nearbyItem.price.toFixed(2)}
            {!nearbyItem.affordable && <span style={{ color: '#ff8080' }}> (not enough money)</span>}
          </div>
        )
      )}

      {/* Step 28 — Part 2/7: a generic "[E] Talk" affordance whenever an NPC is close enough to
          interact with and nothing higher-priority (a mission panel, a shop item, a bus stop) is
          already claiming the prompt slot. Reuses the same npcNearPlayer() proximity check
          handleInteract() already uses — no new detection logic, just a visible cue for it. */}
      {nearbyNpc && !actionable && !nearbyItem && !nearStopId && !dialogueLines && !lifeEvent && !boardingAt && !recentlyChatted(nearbyNpc.id) && !jobWork && (
        <div style={{ ...hud.buyPrompt, bottom: isTouch ? 196 : 12, pointerEvents: 'auto', cursor: 'pointer' }} onClick={handleInteract}>{isTouch ? '👆 Tap to talk' : '[E] Talk'} — {getNpcDef(nearbyNpc.id)?.name ?? nearbyNpc.id}</div>
      )}

      {/* Phase 14 / Step 27: bus-stop prompt — arrived bus vs. a countdown to the next one. Step 27
          adds the energy cost alongside the fare, so the player sees all three affected resources
          (money/time/energy) before boarding, not just the fare — closing the Step 27 audit's
          "bus energy is applied but never shown" finding. */}
      {/* This step — Part 2: a real timetable readout, not just an arrived/next-departure line, so
          the player can see the whole route (BUS_ROUTE.name/fare, unchanged authoritative data)
          the moment they reach any stop — "make it obvious what the player can do here." */}
      {nearStopId && !actionable && !nearbyItem && (
        <div style={{ ...hud.buyPrompt, bottom: isTouch ? 196 : 12, pointerEvents: 'auto', cursor: 'pointer' }} onClick={handleInteract}>
          <div style={{ fontSize: 11, opacity: 0.8, marginBottom: 2 }}>
            🚏 {stopName(nearStopId)} · {BUS_ROUTE.name} · Fare ${store.busFare().toFixed(2)}{(s.world.rideCredits ?? 0) > 0 ? ` · 🎫 ${s.world.rideCredits} rides left` : ''}
          </div>
          {busArrived
            ? <>
                <div style={{ fontWeight: 700 }}>🚌 Bus is here! {isTouch ? 'Tap' : 'E'}: Board — {(s.world.rideCredits ?? 0) > 0 ? '1 ride from your card' : `$${store.busFare().toFixed(2)}`} · -1 energy</div>
                {(() => {
                  const left = store.busHoldSecondsLeft();
                  return left > 0 ? (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 11, opacity: 0.85 }}>Driver waits {Math.ceil(left)}s…</div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, marginTop: 2 }}>
                        <div style={{ height: 4, width: `${(left / BUS_HOLD_REAL_SECONDS) * 100}%`, background: left < 5 ? '#ff7a59' : '#7bd88f', borderRadius: 2, transition: 'width 0.25s linear' }} />
                      </div>
                    </div>
                  ) : <div style={{ fontSize: 11, opacity: 0.85 }}>Doors closing!</div>;
                })()}
              </>
            : nextBus
              ? (nextBus.arrivesAt - s.minutes <= 3
                  ? `🚌 Bus arriving in ~${Math.max(1, Math.ceil(nextBus.arrivesAt - s.minutes))} min — stay at the stop`
                  : `Waiting for the bus — next arrives at ${formatTime(nextBus.arrivesAt)}`)
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
            id: st.id, label: pathText(s.lifePath, st.name), sublabel: `~${rideMinutes(boardingAt, st.id)} min · ${(s.world.rideCredits ?? 0) > 0 ? '🎫 1 ride' : `$${store.busFare().toFixed(2)}`} · -1 energy`,
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
          style={isTouch ? { bottom: 196 } : undefined}
        />
      )}

      {/* Step 10: the Step 7B "How are you getting to school today?" panel has been removed — Monday
          transport is now handled solely by the live 'get_to_school' mission's own DialoguePanel
          (rendered via the `actionable` mission-step panel elsewhere in this file), which already
          offered the identical walk/bus choice. See the Step 9/10 reports for why keeping both was
          a genuine duplicate-state risk, not a stylistic preference. */}

      {/* Step 8: Attend Class prompt — same priority pattern as the other contextual panels above. */}
      {classShown && rules.study && (
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
          style={isTouch ? { bottom: 196 } : undefined}
        />
      )}

      {/* Result of a rejected Attend Class attempt (e.g. not enough energy) — informational, click
          to dismiss. Does NOT mark class complete or advance the day on its own. */}
      {classFailure && (
        <div style={{ ...hud.dialogue, ...(isTouch ? { bottom: 196 } : {}) }} onClick={() => setClassFailure(null)}>
          <div style={{ fontWeight: 700, color: '#ffd700', marginBottom: 4 }}>{rules.study?.teacher}</div>
          <div>{classFailure}</div>
        </div>
      )}

      {/* Where's class? A single hint in the prompt slot while you're at school but not yet in class. */}
      {!actionable && !nearbyItem && !lifeEvent && !boardingAt && (classStatus === 'go_to_classroom' || classStatus === 'too_late') && (
        <div style={{ ...hud.buyPrompt, bottom: isTouch ? 196 : 12 }}>
          {classStatus === 'go_to_classroom'
            ? `🔔 ${rules.study?.roomHint}`
            : `🔔 Too late for the ${rules.study?.noun} today — you'll be marked absent`}
        </div>
      )}

      {/* A job from the board in progress */}
      {jobWork && (
        <div style={hud.activitySequence}>
          <div style={{ fontSize: 22, marginBottom: 4 }}>{jobWork.job.emoji}</div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>{jobWork.job.name}…</div>
          <div style={hud.activityBarTrack}>
            <div style={{ ...hud.activityBarFill, width: `${jobWork.pct}%` }} />
          </div>
        </div>
      )}

      {/* The jobs board on the fridge */}
      {jobsOpen && (
        <JobsBoard jobs={jobsHere} energy={store.getEnergy().current} weekJobs={s.world.flags.filter(f => f.startsWith('wk_job:')).length}
          bonusPaid={s.world.flags.includes('wk_job_bonus')} onDo={startJob} onClose={() => setJobsOpen(false)} />
      )}

      {/* Hands-on errand in progress: what's next */}
      {errand && (
        <div style={{ ...hud.errandChip, top: isTouch ? 108 : 118 }}>
          <div style={{ fontSize: 11, color: '#ffd23f', letterSpacing: 0.5 }}>{errand.emoji} {errand.title.toUpperCase()}</div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{errand.detail}</div>
          <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
            {Array.from({ length: errand.total }, (_, i) => (
              <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < errand.done ? '#3fb950' : 'rgba(255,255,255,0.2)' }} />
            ))}
          </div>
        </div>
      )}

      {/* Small talk / purchase receipt / bus notice — plays its lines in step with the voice, then
          closes itself. Yields to real (mission) dialogue. */}
      {chatShown && dialogueLines && (
        <DialoguePanel
          key={dialogueLines.lines.join('|')}
          speaker={dialogueLines.npc}
          lines={dialogueLines.lines}
          choices={dialogueLines.replies?.map((r, i) => ({ id: `reply_${i}`, label: `💬 ${r.label}`, sublabel: '', cost: 0, minutes: 0, consequence: '' }))}
          onChoose={(c) => { const r = dialogueLines.replies?.[Number(c.id.slice(6))]; if (r) answerChat(r); }}
          numberKeys={!isTouch}
          voiceOn={voiceOn}
          advanceSignal={advanceSignal}
          onDone={closeChat}
          hint={isTouch ? 'tap' : 'E'}
          style={isTouch ? { bottom: 196 } : undefined}
        />
      )}

      {/* Contextual dialogue / choice panel (life event takes priority if both somehow line up) */}
      {missionPanel && (
        <DialoguePanel
          key={missionKey ?? undefined}
          speaker={missionPanel.step.remote && missionPanel.step.speaker ? `📱 ${missionPanel.step.speaker}` : missionPanel.step.speaker}
          lines={missionPanel.step.lines}
          choices={missionPanel.step.choices}
          balance={store.cash}
          voiceOn={voiceOn}
          advanceSignal={advanceSignal}
          numberKeys={!isTouch}
          hint={isTouch ? 'tap' : 'E'}
          onChoose={(c) => { store.applyChoice(missionPanel.def.id, c); setDialogueLines(null); }}
          style={isTouch ? { bottom: 196 } : undefined}
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
          style={isTouch ? { bottom: 196 } : undefined}
        />
      )}

      {/* All done for today */}
      {dayCard && (
        <div style={hud.modalBackdrop}>
          <div style={{ ...hud.modal, width: 'min(380px, 92vw)', textAlign: 'center', animation: 'mmPop 260ms ease-out' }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <h2 style={{ margin: '4px 0' }}>That&apos;s everything for today!</h2>
            <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 12 }}>{day} · {time}</div>
            <div style={{ textAlign: 'left', background: '#0d1117', borderRadius: 8, padding: '10px 12px', marginBottom: 10, maxHeight: 180, overflowY: 'auto' }}>
              {dayCard.done.map((t, i) => <div key={'d' + i} style={{ fontSize: 13, marginBottom: 3 }}>✓ {t.emoji} {t.name}</div>)}
              {dayCard.missed.map((t, i) => <div key={'m' + i} style={{ fontSize: 13, marginBottom: 3, color: '#ff8080' }}>✗ {t.emoji} {t.name}</div>)}
              {dayCard.done.length + dayCard.missed.length === 0 && <div style={{ fontSize: 13, opacity: 0.7 }}>A quiet day.</div>}
            </div>
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              <span style={{ color: '#7cfc00' }}>+${dayCard.earned.toFixed(2)}</span> earned · <span style={{ color: '#ff8080' }}>-${dayCard.spent.toFixed(2)}</span> spent · 💰 ${store.cash.toFixed(2)} left
            </div>
            <DecisionTally decisions={s.today.decisions ?? []} />
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
      {daySummary && store.pendingDaySummary && (
        <DayRecapModal view={daySummary} rec={store.pendingDaySummary} onClose={() => store.dismissDaySummary()} />
      )}
      {!daySummary && weekSummary && (
        <SummaryModal title={weekSummary.title} lines={[weekSummary.income, weekSummary.spending, weekSummary.savings, weekSummary.missions, weekSummary.social, weekSummary.school.replace('School', rules.study?.noun === 'lecture' ? 'Lectures' : 'School'), ...weekSummary.decisions]}
          onClose={() => store.dismissWeekSummary()} />
      )}

      {/* The day's money card: after the recap, before the new day starts */}
      {!daySummary && !weekSummary && !store.pendingLevelSummary && store.pendingFact && (
        <MoneyFactCard fact={store.pendingFact} path={s.lifePath} onClose={() => store.dismissFact()} />
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
        <div style={isTouch ? { ...hud.homeBtns, bottom: 'auto', top: 116, flexDirection: 'column', alignItems: 'flex-start' } : hud.homeBtns}>
          <button style={{ ...hud.sleepBtn, position: 'static' }} onClick={() => store.sleep(false)}>🛏️ Go to sleep</button>
          {jobsHere.length > 0 && (
            <button style={{ ...hud.sleepBtn, position: 'static', background: '#ffd23f' }} onClick={() => setJobsOpen(true)}>
              📋 Jobs board{openJobs > 0 ? ` · ${openJobs}` : ''}
            </button>
          )}
          {store.savingsInfo.atHome
            ? <button style={{ ...hud.sleepBtn, position: 'static', background: '#f0a0c0' }} onClick={() => setShowPiggy(true)}>{store.savingsInfo.emoji} {store.savingsInfo.name} · ${s.finance.accounts.savings.toFixed(2)}</button>
            : <button style={{ ...hud.sleepBtn, position: 'static', background: '#79c0ff' }} onClick={() => setPhoneApp('bank')}>{store.savingsInfo.emoji} {store.savingsInfo.name} · ${s.finance.accounts.savings.toFixed(2)}</button>}
        </div>
      )}
      {showPiggy && s.player.place === 'home' && <PiggyBank store={store} onClose={() => setShowPiggy(false)} />}
    </div>
  );
}

/** A line YOU said in a conversation (shown in your colour, not read in their voice). */
const PLAYER_LINE = 'You: ';

function DialoguePanel({ speaker, lines, choices, onChoose, balance, voiceOn, advanceSignal, onDone, numberKeys, hint, style }: {
  speaker?: string; lines: string[]; choices?: MissionChoice[]; onChoose?: (c: MissionChoice) => void;
  /** When given, a choice costing more than this is shown but disabled — real trade-offs mean some
   *  options genuinely aren't available, not just unwise (Rule 3/4: the game never hides the option,
   *  but it doesn't let you spend money you don't have either). */
  balance?: number;
  /** When true, each revealed line is read aloud in a voice fingerprinted to `speaker` (src/lib/tts.ts). */
  voiceOn?: boolean;
  /** Bump this (any changed number) to move the conversation on one beat — E / Enter / the NEXT button. */
  advanceSignal?: number;
  /** A conversation without choices calls this after its last line (it closes itself). */
  onDone?: () => void;
  /** Desktop: 1–9 pick a choice. */
  numberKeys?: boolean;
  /** What to press to continue, shown in the hint ('E' or 'tap'). */
  hint?: string;
  /** Optional style overrides (e.g. bottom offset on mobile to clear the d-pad). */
  style?: React.CSSProperties;
}) {
  // One line at a time, typed out while it's spoken. A line is "done" once the typing has finished
  // AND the voice has finished saying it (or, with voice off, once there's been time to read it) —
  // then the next line follows on its own after a short pause. So text, voice and pacing stay in
  // step, and E / tap only ever hurries things along; it never restarts anything.
  const [shown, setShown] = useState(1);
  const [charCount, setCharCount] = useState(0);
  const [spoken, setSpoken] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const doneCalledRef = useRef(false);
  const total = lines.length;
  const currentLine = lines[shown - 1] ?? '';
  const typewriterDone = charCount >= currentLine.length;
  const atEnd = shown >= total && typewriterDone;

  // Typewriter for the current line
  useEffect(() => {
    setCharCount(0);
    if (!currentLine) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setCharCount(i);
      if (i >= currentLine.length) clearInterval(interval);
    }, 24);
    return () => clearInterval(interval);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  // Voice (or reading time) for the current line
  useEffect(() => {
    setSpoken(false);
    if (!currentLine) { setSpoken(true); return; }
    let live = true;
    const finish = () => { if (live) setSpoken(true); };
    const mine = currentLine.startsWith(PLAYER_LINE);
    const voiced = !!voiceOn && isSpeechSupported() && !mine;
    if (voiced) speakLine(speaker, currentLine, { onEnd: finish });
    const t = voiced ? null : setTimeout(finish, estimateSpeechMs(currentLine, speaker) * 0.8 + 400);
    return () => { live = false; if (t) clearTimeout(t); };
  }, [shown, voiceOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop talking if the panel goes away mid-line
  useEffect(() => () => stopSpeaking(), []);

  const finishConversation = () => {
    if (doneCalledRef.current) return;
    doneCalledRef.current = true;
    onDoneRef.current?.();
  };

  // Move on by itself once a line has been typed and said
  const lineDone = typewriterDone && spoken;
  useEffect(() => {
    if (!lineDone) return;
    if (shown < total) {
      const t = setTimeout(() => setShown(n => Math.min(n + 1, total)), 550);
      return () => clearTimeout(t);
    }
    if (!choices?.length && onDoneRef.current) {
      const t = setTimeout(finishConversation, 1500);
      return () => clearTimeout(t);
    }
  }, [lineDone, shown, total]); // eslint-disable-line react-hooks/exhaustive-deps

  // E / Enter / NEXT / tap: finish typing → next line → (no choices) close
  const advance = () => {
    if (!typewriterDone) { setCharCount(currentLine.length); return; }
    if (shown < total) { stopSpeaking(); setShown(n => n + 1); return; }
    if (!choices?.length) { stopSpeaking(); finishConversation(); }
  };
  const lastAdvance = useRef(advanceSignal);
  useEffect(() => {
    if (advanceSignal === undefined || advanceSignal === lastAdvance.current) return;
    lastAdvance.current = advanceSignal;
    advance();
  }, [advanceSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Choices appear right where the player was clicking to advance; ignore clicks on them for a
  // moment so a fast click-through can't pick an option by accident.
  const choicesShownAt = useRef(0);
  useEffect(() => { if (atEnd) choicesShownAt.current = performance.now(); }, [atEnd]);
  const choiceReady = () => performance.now() - choicesShownAt.current > 450;
  const pick = (c: MissionChoice) => {
    const affordable = balance === undefined || -c.cost <= balance;
    if (!affordable || !choiceReady() || !onChoose) return;
    stopSpeaking();
    onChoose(c);
  };

  // Desktop: number keys pick a choice once they're on screen
  useEffect(() => {
    if (!numberKeys || !atEnd || !choices?.length) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || e.repeat) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= choices.length) pick(choices[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // re-bound each render so it always sees the current choices/balance

  return (
    <div style={{ ...hud.dialogue, animation: 'mmDialogIn 240ms ease-out', ...style }} onClick={advance}>
      {speaker && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontWeight: 700, color: '#ffd700' }}>{speaker}</span>
          {total > 1 && (
            <span style={{ display: 'flex', gap: 4 }} aria-hidden>
              {lines.map((_, i) => (
                <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: i < shown ? '#ffd700' : 'rgba(255,255,255,0.25)', transition: 'background 200ms' }} />
              ))}
            </span>
          )}
        </div>
      )}
      {lines.slice(0, shown - 1).map((l, i) => <div key={i} style={{ marginBottom: 4, opacity: 0.7, ...(l.startsWith(PLAYER_LINE) ? hud.playerLine : {}) }}>{l}</div>)}
      {currentLine && (
        <div key={shown} style={{ marginBottom: 4, animation: 'mmLineIn 200ms ease-out', ...(currentLine.startsWith(PLAYER_LINE) ? hud.playerLine : {}) }}>
          {currentLine.slice(0, charCount)}{!typewriterDone && <span style={{ opacity: 0.7 }}>▌</span>}
        </div>
      )}
      {!atEnd && typewriterDone && (
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>▾ {hint ? `${hint} to continue` : 'tap to continue'}</div>
      )}
      {atEnd && !choices?.length && onDone && (
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>{hint ? `${hint} to close` : 'tap to close'}</div>
      )}
      {atEnd && !!choices?.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, animation: 'mmLineIn 220ms ease-out' }}>
          {choices.map((c, i) => {
            const affordable = balance === undefined || -c.cost <= balance;
            return (
              <button
                key={c.id}
                style={{ ...hud.choiceBtn, ...(affordable ? {} : hud.choiceBtnDisabled), display: 'flex', gap: 8, alignItems: 'flex-start' }}
                disabled={!affordable}
                onClick={(e) => { e.stopPropagation(); pick(c); }}
              >
                {numberKeys && <span style={{ fontSize: 10, opacity: 0.55, border: '1px solid rgba(255,255,255,0.3)', borderRadius: 3, padding: '0 4px', marginTop: 1 }}>{i + 1}</span>}
                <span>
                  <div>{c.label}{!affordable && <span style={{ color: '#ff8080', fontWeight: 400 }}> — can&apos;t afford</span>}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{c.sublabel}</div>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const VERDICT_STYLE: Record<'good' | 'bad' | 'tradeoff' | 'none', { label: string; icon: string; color: string; bg: string }> = {
  good:     { label: 'SMART MOVE',  icon: '✅', color: '#3fb950', bg: 'linear-gradient(135deg, #12261a 0%, #0b170f 100%)' },
  bad:      { label: 'COSTLY MOVE', icon: '⚠️', color: '#ff6b6b', bg: 'linear-gradient(135deg, #2a1414 0%, #1a0b0b 100%)' },
  tradeoff: { label: 'TRADE-OFF',   icon: '⚖️', color: '#f0b429', bg: 'linear-gradient(135deg, #2a2210 0%, #19140a 100%)' },
  none:     { label: 'DECISION',    icon: '📝', color: '#79c0ff', bg: 'linear-gradient(135deg, #111c2a 0%, #0b1119 100%)' },
};
const money2 = (n: number) => `${n < 0 ? '-' : '+'}$${Math.abs(n).toFixed(2)}`;
const cleanLabel = (l: string) => l.replace(/^\P{L}+/u, '').trim();

/** The card that pops up right after a money decision: smart / trade-off / costly, what it did to
 *  your money, what happened, and the lesson. Tap to dismiss; it also fades on its own. */
function DecisionCard({ d, onClose }: { d: DecisionRecord; onClose: () => void }) {
  const v = VERDICT_STYLE[d.verdict ?? 'none'];
  return (
    <div onClick={onClose} role="status" style={{
      width: '100%', boxSizing: 'border-box', background: v.bg, border: `2px solid ${v.color}`, borderRadius: 12,
      padding: '10px 14px', color: '#fff', fontFamily: 'monospace', cursor: 'pointer',
      boxShadow: `0 6px 24px ${v.color}40`, animation: 'mmCardDrop 280ms cubic-bezier(.2,1.3,.4,1)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: v.color }}>{v.icon} {v.label}</span>
        {d.amount !== 0 && (
          <span style={{ fontSize: 13, fontWeight: 700, color: d.amount > 0 ? '#7cfc00' : '#ff8080' }}>{money2(d.amount)}</span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{cleanLabel(d.choice)}</div>
      <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.45 }}>{d.consequence}</div>
      {d.lesson && (
        <div style={{ marginTop: 8, paddingTop: 7, borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: 12, lineHeight: 1.5, color: '#e8f5e9' }}>
          <span style={{ color: '#ffd23f', fontWeight: 700 }}>💡 Money lesson · </span>{d.lesson}
        </div>
      )}
    </div>
  );
}

/** "Today so far" strip on the end-of-day card: how many smart / trade-off / costly decisions, and
 *  the lesson of the day. */
function DecisionTally({ decisions }: { decisions: DecisionRecord[] }) {
  if (!decisions.length) return null;
  const n = (v: DecisionRecord['verdict']) => decisions.filter(d => d.verdict === v).length;
  const lesson = lessonOfTheDay(decisions);
  return (
    <div style={{ background: '#0d1117', borderRadius: 8, padding: '8px 12px', marginBottom: 12, textAlign: 'left' }}>
      <div style={{ fontSize: 12, display: 'flex', gap: 12, justifyContent: 'center', marginBottom: lesson ? 6 : 0 }}>
        <span style={{ color: '#3fb950' }}>✅ {n('good')} smart</span>
        <span style={{ color: '#f0b429' }}>⚖️ {n('tradeoff')} trade-off</span>
        <span style={{ color: '#ff6b6b' }}>⚠️ {n('bad')} costly</span>
      </div>
      {lesson && <div style={{ fontSize: 12, lineHeight: 1.45 }}><span style={{ color: '#ffd23f', fontWeight: 700 }}>💡 Today: </span>{lesson}</div>}
    </div>
  );
}

/** The day's headline lesson: the one from your costliest slip if there was one (that's the one
 *  worth remembering), otherwise from your best move. */
function lessonOfTheDay(decisions: DecisionRecord[]): string | null {
  const withLesson = decisions.filter(d => d.lesson);
  const bad = withLesson.filter(d => d.verdict === 'bad').sort((a, b) => a.amount - b.amount)[0];
  const good = withLesson.filter(d => d.verdict === 'good').sort((a, b) => b.amount - a.amount)[0];
  return (bad ?? good ?? withLesson[0])?.lesson ?? null;
}

/** The morning-after recap of yesterday: money in/out, every decision colour-coded, and the
 *  lessons it taught — so each day ends on what you learned, not just a balance. */
function DayRecapModal({ view, rec, onClose }: { view: ReturnType<typeof dayToSummaryView>; rec: DayRecord; onClose: () => void }) {
  const decisions = rec.decisions ?? [];
  const lessons = [...new Set(decisions.filter(d => d.lesson).map(d => d.lesson!))];
  const headline = lessonOfTheDay(decisions);
  const n = (v: DecisionRecord['verdict']) => decisions.filter(d => d.verdict === v).length;
  const scored = n('good') + n('bad') + n('tradeoff');
  const delta = rec.endBalance - rec.startBalance;
  return (
    <div style={hud.modalBackdrop}>
      <div style={{ ...hud.modal, width: 'min(440px, 94vw)', maxHeight: '88dvh', overflowY: 'auto', animation: 'mmPop 260ms ease-out' }}>
        <h2 style={{ margin: '0 0 4px', textAlign: 'center' }}>{view.title}</h2>
        <div style={{ textAlign: 'center', fontSize: 13, marginBottom: 12 }}>
          {view.moneyLine} <span style={{ color: delta >= 0 ? '#7cfc00' : '#ff8080', fontWeight: 700 }}>({money2(delta)})</span>
          <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>{view.spentLine}</div>
        </div>

        {scored > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#21262d' }}>
              <div style={{ width: `${(n('good') / scored) * 100}%`, background: '#3fb950' }} />
              <div style={{ width: `${(n('tradeoff') / scored) * 100}%`, background: '#f0b429' }} />
              <div style={{ width: `${(n('bad') / scored) * 100}%`, background: '#ff6b6b' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4, opacity: 0.85 }}>
              <span style={{ color: '#3fb950' }}>✅ {n('good')} smart</span>
              <span style={{ color: '#f0b429' }}>⚖️ {n('tradeoff')} trade-off</span>
              <span style={{ color: '#ff6b6b' }}>⚠️ {n('bad')} costly</span>
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, opacity: 0.7, marginBottom: 6 }}>YOUR DECISIONS</div>
        {decisions.length === 0 && <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 10 }}>No big money decisions today.</div>}
        {decisions.map((d, i) => {
          const v = VERDICT_STYLE[d.verdict ?? 'none'];
          return (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', marginBottom: 4, borderRadius: 6, background: '#0d1117', borderLeft: `3px solid ${v.color}` }}>
              <span style={{ fontSize: 13 }}>{v.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{cleanLabel(d.choice)}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{d.consequence}</div>
              </div>
              {d.amount !== 0 && <span style={{ fontSize: 12, fontWeight: 700, color: d.amount > 0 ? '#7cfc00' : '#ff8080', whiteSpace: 'nowrap' }}>{money2(d.amount)}</span>}
            </div>
          );
        })}

        {lessons.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, opacity: 0.7, margin: '12px 0 6px' }}>💡 WHAT YOU LEARNED</div>
            {headline && (
              <div style={{ fontSize: 13, lineHeight: 1.5, padding: '8px 10px', borderRadius: 8, background: '#1f1a08', border: '1px solid #ffd23f', marginBottom: 6 }}>
                <span style={{ color: '#ffd23f', fontWeight: 700 }}>Lesson of the day: </span>{headline}
              </div>
            )}
            {lessons.filter(l => l !== headline).slice(0, 4).map((l, i) => (
              <div key={i} style={{ fontSize: 12, lineHeight: 1.45, marginBottom: 4, paddingLeft: 10, borderLeft: '2px solid #4caf50' }}>{l}</div>
            ))}
          </>
        )}

        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 12, textAlign: 'center' }}>
          {[view.schoolLine, view.missionsLine, view.timeLine].filter(Boolean).join(' · ')}
        </div>
        <button style={{ ...btnStyle, marginTop: 14 }} onClick={onClose}>Start the day</button>
      </div>
    </div>
  );
}

/** The family jobs board on the fridge: today's three jobs with pay, time, effort and — the point —
 *  the hourly rate, so picking one is a real "is this worth my time?" decision. */
function JobsBoard({ jobs, energy, weekJobs, bonusPaid, onDo, onClose }: {
  jobs: { job: HomeJob; status: 'open' | 'done' | 'later'; reason?: string }[];
  energy: number; weekJobs: number; bonusPaid: boolean;
  onDo: (job: HomeJob) => void; onClose: () => void;
}) {
  const best = Math.max(...jobs.filter(j => j.job.pay > 0).map(j => j.job.pay / j.job.minutes * 60));
  return (
    <div style={hud.modalBackdrop} onClick={onClose}>
      <div style={{ ...hud.modal, width: 'min(420px, 94vw)', background: '#f6efd9', color: '#2b2418', border: '3px solid #8a6a3a', animation: 'mmPop 220ms ease-out' }} onClick={e => e.stopPropagation()}>
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 30 }}>📋</div>
          <h3 style={{ margin: '2px 0 0' }}>Family jobs board</h3>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Pick a job, earn some money. New jobs every day.</div>
        </div>
        {jobs.map(({ job, status, reason }) => {
          const perHour = job.pay > 0 ? job.pay / job.minutes * 60 : 0;
          const tooTired = energy < job.energy;
          const canDo = status === 'open' && !tooTired;
          return (
            <div key={job.id} style={{ background: status === 'done' ? '#e4ddc4' : '#fffaf0', border: '1px solid #c9b88f', borderRadius: 8, padding: '8px 10px', marginBottom: 8, opacity: status === 'done' ? 0.7 : 1, transform: `rotate(${job.id.length % 2 ? -0.6 : 0.5}deg)` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <b style={{ fontSize: 14 }}>{job.emoji} {job.name}</b>
                <b style={{ fontSize: 14, color: job.pay > 0 ? '#1f7a33' : '#7a5a1f', whiteSpace: 'nowrap' }}>{job.pay > 0 ? `$${job.pay.toFixed(2)}` : 'Dinner!'}</b>
              </div>
              <div style={{ fontSize: 12, opacity: 0.8, margin: '2px 0 4px' }}>{job.blurb}</div>
              <div style={{ fontSize: 11, display: 'flex', gap: 10, flexWrap: 'wrap', opacity: 0.85 }}>
                <span>⏱ {job.minutes} min</span><span>⚡ {job.energy} energy</span>
                {perHour > 0 && <span style={{ fontWeight: 700, color: perHour >= best - 0.01 ? '#1f7a33' : undefined }}>= ${perHour.toFixed(2)}/hour{perHour >= best - 0.01 && jobs.length > 1 ? ' · best rate' : ''}</span>}
                {job.energyRestore ? <span>🍽 +{job.energyRestore} energy back</span> : null}
              </div>
              <div style={{ marginTop: 6 }}>
                {status === 'done' ? <span style={{ fontSize: 12, fontWeight: 700 }}>✅ Done today</span>
                  : status === 'later' ? <span style={{ fontSize: 12, opacity: 0.75 }}>🕒 {reason}</span>
                  : tooTired ? <span style={{ fontSize: 12, color: '#a33' }}>😴 Too tired — needs {job.energy} energy</span>
                  : <button style={{ ...btnStyle, padding: 6, width: 'auto', paddingInline: 14 }} disabled={!canDo} onClick={() => onDo(job)}>Do it</button>}
              </div>
            </div>
          );
        })}
        <div style={{ fontSize: 12, textAlign: 'center', margin: '4px 0 10px' }}>
          {bonusPaid ? '⭐ Reliability bonus earned this week!' : `⭐ Do 3 different jobs this week for a $3 reliability bonus (${Math.min(weekJobs, 3)}/3)`}
        </div>
        <button style={{ ...btnStyle, background: '#8a6a3a', color: '#fff' }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** End-of-day money card: a fact, a money word or a real-life tip, pitched at this life path. */
function MoneyFactCard({ fact, path, onClose }: { fact: MoneyFact; path: string; onClose: () => void }) {
  const k = FACT_KIND_LABEL[fact.kind];
  const who = path === 'school' ? 'for school life' : path === 'university' ? 'for uni life' : path === 'international' ? 'for studying in NZ' : 'for working life';
  return (
    <div style={hud.modalBackdrop}>
      <div style={{ ...hud.modal, width: 'min(400px, 92vw)', border: `2px solid ${k.color}`, animation: 'mmPop 300ms ease-out', textAlign: 'left' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: k.color }}>{k.icon} {k.label}</div>
        <h2 style={{ margin: '6px 0 8px', fontSize: 20 }}>{fact.title}</h2>
        <div style={{ fontSize: 14, lineHeight: 1.55 }}>{fact.body}</div>
        {fact.example && (
          <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: '#0d1117', borderLeft: `3px solid ${k.color}`, fontSize: 13, lineHeight: 1.5 }}>
            {fact.example}
          </div>
        )}
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 12 }}>📚 Saved to Money Notes on your phone · {who}</div>
        <button style={{ ...btnStyle, marginTop: 12 }} onClick={onClose}>Got it</button>
      </div>
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
      lifePath: `${sm.path} (level ${sm.level}: ${sm.levelName})`, highlights: sm.highlights.map(h => h.text),
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
        <div style={{ fontSize: 11, letterSpacing: 1, color: '#ffd23f' }}>LEVEL {sm.level} COMPLETE · {sm.levelName.toUpperCase()}</div>
        <div style={{ fontSize: 30, margin: '2px 0 4px' }} aria-label={`${sm.stars} of 3 stars`}>
          {[1, 2, 3].map(n => <span key={n} style={{ opacity: n <= sm.stars ? 1 : 0.2 }}>⭐</span>)}
        </div>
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 12 }}>
          ⭐ finished the week · ⭐ hit your goal · ⭐ a clean week with money left
        </div>
        {sm.next && (
          <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#161b22', border: `1px solid ${sm.next.isNew ? '#ffd23f' : '#30363d'}` }}>
            {sm.next.isNew
              ? <><div style={{ fontSize: 11, color: '#ffd23f' }}>UNLOCKED · STARTS MONDAY</div><div style={{ fontWeight: 700 }}>Level {sm.next.level}: {sm.next.name}</div></>
              : <><div style={{ fontSize: 11, opacity: 0.7 }}>COMING SOON</div><div>Level {sm.next.level}: {sm.next.name} — until then, replay this level for more stars.</div></>}
          </div>
        )}
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
        <div style={{ marginBottom: 6 }}>💵 Earned ${sm.earned.toFixed(2)} · Spent ${sm.spent.toFixed(2)}{sm.savings > 0 ? ` · ${sm.savingsEmoji} $${sm.savings.toFixed(2)} saved` : ''}</div>
        {sm.path !== 'school' || sm.level > 1 ? (
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
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 4 }}>🧑‍🏫 KAI&apos;S TAKE</div>
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
    if (p.interior === 'none') {
      const parkImg = p.id === 'park' ? getImg(p.sprite ?? '') : null;
      if (parkImg) ctx.drawImage(parkImg, x, y, w, h);
      else { ctx.fillStyle = 'rgba(60,120,60,0.5)'; ctx.fillRect(x, y, w, h); }
      continue;
    }
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
  type Entity = { x: number; y: number; facing: number; moving: boolean; sheetName: string; npcId?: string; label?: string; bubble?: string; dog?: boolean };
  // Hands-on errand points: the next stop on Biscuit's walk, or the litter still lying around.
  if (s.errand) {
    const t = performance.now();
    s.errand.points.forEach((pt, i) => {
      if (s.errand!.done[i]) return;
      if (s.errand!.kind === 'walk') {
        if (s.errand!.done.indexOf(false) !== i) return;
        const r = TILE_PX * (0.45 + 0.08 * Math.sin(t / 250));
        ctx.strokeStyle = 'rgba(255,214,90,0.9)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(pt.x, pt.y, r, r * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.font = `${Math.round(TILE_PX * 0.36)}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText('🐾', pt.x, pt.y - TILE_PX * 0.35 + Math.sin(t / 300) * 3);
      } else {
        drawLitter(ctx, pt.x, pt.y, TILE_PX, i);
      }
    });
  }
  const hostEntities: Entity[] = [];
  for (const h of store.hostsHere()) {
    const def = ERRAND_HOSTS[h.hostId];
    hostEntities.push({ x: h.x, y: h.y, facing: Math.PI / 2, moving: false, sheetName: def.sheet, label: def.name, bubble: h.waiting ? '💬' : '⏳' });
    if (def.companion === 'dog' && !s.errand) hostEntities.push({ x: h.x + TILE_PX * 0.8, y: h.y + TILE_PX * 0.12, facing: Math.PI, moving: false, sheetName: '', dog: true });
  }
  if (s.errand?.follower) {
    const f = s.errand.follower;
    hostEntities.push({ x: f.x, y: f.y, facing: f.facing, moving: f.moving, sheetName: '', dog: true });
  }
  const entities: Entity[] = [
    ...hostEntities,
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
    if (e.dog) {
      drawDog(ctx, e.x, e.y, TILE_PX, e.facing, e.moving);
      if (e.label) labelUnder(ctx, e.label, e.x, e.y + TILE_PX * 0.3, TILE_PX * 0.15);
      continue;
    }
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
    if (e.label) labelUnder(ctx, e.label, e.x, e.y + TILE_PX * 0.38, TILE_PX * 0.17);
    if (e.bubble) {
      ctx.font = `${Math.round(TILE_PX * 0.4)}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(e.bubble, e.x, e.y - drawH + TILE_PX * 0.15 - 6 + bob);
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
  // A back wall (wallpaper strip) sits above row 0 — it's part of the picture, so fit it in too.
  const wallH = interior.wall ? T * 1.5 : 0;
  const scale = Math.min(3, Math.max(1, Math.min((cw * 0.92) / roomW, (ch * 0.85) / (roomH + wallH))));
  const ox = Math.round((cw - roomW * scale) / 2), oy = Math.round((ch - (roomH + wallH) * scale) / 2 + wallH * scale);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  // walls (room bounding rect) + floor
  ctx.fillStyle = interior.wallColor;
  ctx.fillRect(-8, -8 - wallH, roomW + 16, roomH + 16 + wallH);
  if (interior.wall) {
    const wallImg = getImg('/sprites/interiors/room_builder.png');
    if (wallImg) {
      for (let tx = 0; tx < interior.widthTiles; tx++) {
        ctx.drawImage(wallImg, interior.wall.sx, interior.wall.sy, 48, 96, tx * T, -wallH, T, wallH);
      }
    }
    for (const d of interior.wallDecor ?? []) {
      const img = getImg(d.sprite.src);
      if (img) ctx.drawImage(img, d.sprite.sx, d.sprite.sy, d.sprite.sw, d.sprite.sh, d.tx * T, -wallH + (wallH - d.th * T) * 0.45, d.tw * T, d.th * T);
    }
  }
  const floorImg = getImg(interior.floorSprite.src);
  for (let ty = 0; ty < interior.heightTiles; ty++) {
    for (let tx = 0; tx < interior.widthTiles; tx++) {
      if (floorImg) {
        const f = interior.floorSprite;
        ctx.drawImage(floorImg, f.sx, f.sy, f.sw, f.sh, tx * T, ty * T, T, T);
      } else { ctx.fillStyle = '#7a5a3a'; ctx.fillRect(tx * T, ty * T, T, T); }
    }
  }
  if (interior.wall) {
    // a soft shadow where the back wall meets the floor
    const g = ctx.createLinearGradient(0, 0, 0, T * 0.35);
    g.addColorStop(0, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, roomW, T * 0.35);
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
    y: (f.sortY ?? f.ty + f.th) * T,
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

  for (const h of store.hostsHere()) {
    const def = ERRAND_HOSTS[h.hostId];
    drawables.push({
      y: h.y,
      draw: () => {
        const sheet = getImg(characterSheet(def.sheet, 'idle'));
        const drawH = T * 1.25, drawW = drawH * (CHAR_FRAME_W / CHAR_FRAME_H);
        if (sheet) ctx.drawImage(sheet, 0, 0, CHAR_FRAME_W, CHAR_FRAME_H, h.x - drawW / 2, h.y - drawH + T * 0.15, drawW, drawH);
        else drawPersonFallback(ctx, h.x, h.y, T, '#8ac0d6');
        labelUnder(ctx, def.name, h.x, h.y + T * 0.3, T * 0.22);
        ctx.font = `${Math.round(T * 0.4)}px sans-serif`; ctx.textAlign = 'center';
        ctx.fillText(h.waiting ? '💬' : '⏳', h.x, h.y - drawH + T * 0.15 - 6 + indoorBob);
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
  /** Shown even while a conversation is open (e.g. "You can't afford that"). */
  urgent?: boolean;
  /** Dropped from the queue if it no longer applies by the time it would show (a message already read). */
  isStale?: () => boolean;
  onClick?: () => void;
}
const TOAST_COLORS: Record<NonNullable<Toast['tone']>, string> = { plain: '#555', gold: '#ffd23f', blue: '#7cc7ff', green: '#3fb950' };

/** Keyframes for the go-home / goodnight transition. The runner uses the player's real run sheet
 *  (6 frames × 16px per direction; "right" is the 4th direction), scaled 4×. */
const TRANSITION_CSS = `
@keyframes mmFade { 0% { opacity: 0 } 15% { opacity: 1 } 85% { opacity: 1 } 100% { opacity: 0 } }
@keyframes mmPop { from { transform: scale(0.85); opacity: 0 } to { transform: scale(1); opacity: 1 } }
@keyframes mmPhoneUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
@keyframes mmDialogIn { from { transform: translate(-50%, 14px); opacity: 0 } to { transform: translate(-50%, 0); opacity: 1 } }
@keyframes mmLineIn { from { transform: translateY(4px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
@keyframes mmCardDrop { from { transform: translateY(-14px) scale(0.95); opacity: 0 } to { transform: translateY(0) scale(1); opacity: 1 } }
@keyframes mmCardIn { from { transform: translate(-50%, -16px) scale(0.94); opacity: 0 } to { transform: translate(-50%, 0) scale(1); opacity: 1 } }
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
  topLeft: { position: 'absolute', top: 12, left: 12, zIndex: 10, fontFamily: 'monospace', color: '#fff', textShadow: '0 1px 2px #000', maxWidth: 'min(260px, calc(50vw - 16px))' },
  clock: { display: 'inline-block', background: 'rgba(10,10,20,0.75)', border: '1px solid #444', borderRadius: 8, padding: '4px 10px', fontSize: 13, color: '#ffd23f', marginBottom: 8 },
  objectiveBtn: { background: 'rgba(18,53,28,0.9)', border: '1px solid #3fb950', borderRadius: 8, padding: '6px 10px', color: '#fff', textAlign: 'left', cursor: 'pointer', fontFamily: 'monospace', animation: 'mmPulse 1.6s ease-in-out infinite' },
  topRight: { position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, fontFamily: 'monospace' },
  money: { background: 'rgba(10,10,20,0.75)', border: '1px solid #444', borderRadius: 8, padding: '4px 12px', fontSize: 18, fontWeight: 700, color: '#7cfc00', textShadow: '0 1px 2px #000' },
  energyRow: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(10,10,20,0.75)', border: '1px solid #444', borderRadius: 8, padding: '4px 10px' },
  energyTrack: { width: 'clamp(70px, 20vw, 110px)', height: 8, background: '#2a2d36', borderRadius: 4, overflow: 'hidden' },
  energyFill: { height: '100%', borderRadius: 4, transition: 'width 300ms' },
  phoneBtn: {
    position: 'absolute', right: 24, bottom: 206, width: 58, height: 58, borderRadius: 16, zIndex: 26, fontSize: 28,
    background: 'linear-gradient(#2a2d36, #14161c)', border: '2px solid #555', color: '#fff', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
  },
  phoneBadge: { position: 'absolute', top: -6, right: -6, minWidth: 22, height: 22, borderRadius: 11, background: '#f85149', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', animation: 'mmPulse 1.2s ease-in-out infinite' },
  phoneKey: { position: 'absolute', bottom: -18, left: 0, right: 0, fontSize: 10, fontFamily: 'monospace', opacity: 0.7, textShadow: '0 1px 2px #000' },
  toastStack: { position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 60, display: 'flex', flexDirection: 'column', gap: 6, width: 'min(380px, 90vw)' },
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
  errandChip: { position: 'absolute', left: 12, zIndex: 11, width: 'min(230px, 55vw)', background: 'rgba(10,10,20,0.85)', border: '1px solid #3fb950', borderRadius: 8, padding: '6px 10px', color: '#fff', fontFamily: 'monospace' },
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
  playerLine: { color: '#8fd3ff', textAlign: 'right' as const, fontStyle: 'italic' as const },
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