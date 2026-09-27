'use client';

/**
 * MoniMate — the phone: the player's command centre (blueprint section 19). Everything that isn't
 * the world itself lives here — messages you reply to, your bank, your goal, today's plan, the
 * map, your friends, Kai and settings — so the game screen can stay clean.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameStore } from '../lib/store';
import type { MissionChoice } from '../lib/missions';
import { buildJournal, trackedMission } from '../lib/missions';
import { waypointReadout } from '../lib/render';
import { placeName, pathText } from '../lib/pathRules';
import { ACHIEVEMENTS, isUnlocked } from '../lib/achievements';
import { DAY_NAMES, formatTime, parts, at, MIN_PER_DAY } from '../lib/clock';
import { PLACES, isOpen, closedReason, distanceMetres, doorTile, pxToTile, BUS_STOPS, nextBusAt } from '../lib/world';
import { askMentorChat } from '../lib/mentor';
import { speakLine } from '../lib/tts';

export type PhoneApp = 'home' | 'messages' | 'bank' | 'goals' | 'today' | 'calendar' | 'map' | 'contacts' | 'kai' | 'settings';

const APPS: { id: Exclude<PhoneApp, 'home'>; icon: string; name: string; color: string }[] = [
  { id: 'messages', icon: '💬', name: 'Messages', color: '#3fb950' },
  { id: 'bank', icon: '🏦', name: 'Bank', color: '#2f81f7' },
  { id: 'goals', icon: '🎯', name: 'Goals', color: '#f0c038' },
  { id: 'today', icon: '📋', name: 'Today', color: '#a371f7' },
  { id: 'calendar', icon: '📅', name: 'Calendar', color: '#f78166' },
  { id: 'map', icon: '🗺️', name: 'Map', color: '#56d4dd' },
  { id: 'contacts', icon: '❤️', name: 'Friends', color: '#ff7b9c' },
  { id: 'kai', icon: '🧑‍🏫', name: 'Kai', color: '#79c0ff' },
  { id: 'settings', icon: '⚙️', name: 'Settings', color: '#8b949e' },
];

interface PhoneProps {
  store: GameStore;
  app: PhoneApp;
  setApp: (a: PhoneApp) => void;
  onClose: () => void;
  voiceOn: boolean;
  setVoiceOn: (v: boolean) => void;
  onChangePath: () => void;
  onLogout: () => void;
  playerName: string;
}

export default function Phone(props: PhoneProps) {
  const { store, app, setApp, onClose } = props;
  const s = store.state;
  const { hour, minute } = parts(s.minutes);
  const inbox = store.phoneInbox();

  // Esc: back to the home screen, then close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Backspace') return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      e.stopPropagation();
      if (app === 'home') onClose(); else setApp('home');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [app, onClose, setApp]);

  return (
    <div style={st.backdrop} onClick={onClose}>
      <div style={st.phone} onClick={e => e.stopPropagation()}>
        <div style={st.statusBar}>
          <span>{String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}</span>
          <span>💰 ${store.cash.toFixed(2)} · ⚡ {Math.round(s.energy.current)}%</span>
        </div>
        <div style={st.screen}>
          {app === 'home' ? (
            <HomeScreen store={store} inboxCount={inbox.length} open={setApp} />
          ) : (
            <>
              <div style={st.appBar}>
                <button style={st.back} onClick={() => setApp('home')}>‹</button>
                <span>{APPS.find(a => a.id === app)?.icon} {APPS.find(a => a.id === app)?.name}</span>
                <span style={{ width: 28 }} />
              </div>
              <div style={st.appBody}>
                {app === 'messages' && <MessagesApp store={store} voiceOn={props.voiceOn} />}
                {app === 'bank' && <BankApp store={store} />}
                {app === 'goals' && <GoalsApp store={store} />}
                {app === 'today' && <TodayApp store={store} />}
                {app === 'calendar' && <CalendarApp store={store} />}
                {app === 'map' && <MapApp store={store} />}
                {app === 'contacts' && <ContactsApp store={store} />}
                {app === 'kai' && <KaiApp store={store} voiceOn={props.voiceOn} />}
                {app === 'settings' && <SettingsApp {...props} />}
              </div>
            </>
          )}
        </div>
        <button style={st.homeButton} onClick={() => (app === 'home' ? onClose() : setApp('home'))} aria-label="Home" />
      </div>
    </div>
  );
}

function HomeScreen({ store, inboxCount, open }: { store: GameStore; inboxCount: number; open: (a: PhoneApp) => void }) {
  const goal = store.goalStatus();
  const p = parts(store.state.minutes);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ textAlign: 'center', margin: '8px 0 18px' }}>
        <div style={{ fontSize: 34, fontWeight: 700 }}>{formatTime(store.state.minutes)}</div>
        <div style={{ opacity: 0.7, fontSize: 12 }}>{DAY_NAMES[p.dayOfWeek]} · Week {p.week}</div>
      </div>
      {inboxCount > 0 && (
        <button style={st.notice} onClick={() => open('messages')}>
          💬 {inboxCount} new message{inboxCount === 1 ? '' : 's'} — tap to reply
        </button>
      )}
      {goal && (
        <button style={{ ...st.notice, background: '#2a2410', borderColor: '#f0c038' }} onClick={() => open('goals')}>
          {goal.def.emoji} {goal.def.name} · {goal.achieved ? 'done ✓' : goal.detail}
        </button>
      )}
      <div style={st.grid}>
        {APPS.map(a => (
          <button key={a.id} style={st.appIcon} onClick={() => open(a.id)}>
            <span style={{ ...st.iconTile, background: a.color }}>
              {a.icon}
              {a.id === 'messages' && inboxCount > 0 && <span style={st.badge}>{inboxCount}</span>}
            </span>
            <span style={{ fontSize: 11 }}>{a.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Messages ────────────────────────────────────────────────────────────────
function MessagesApp({ store, voiceOn }: { store: GameStore; voiceOn: boolean }) {
  const inbox = store.phoneInbox();
  const history = store.messageHistory();
  const [justReplied, setJustReplied] = useState<string | null>(null);
  const shownAt = useRef(performance.now());
  const first = inbox[0];
  useEffect(() => {
    if (first && voiceOn) speakLine(first.step.speaker, first.step.lines.join(' '));
    shownAt.current = performance.now();
  }, [first?.def.id, first?.rt.stepIndex, voiceOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const reply = (missionId: string, c: MissionChoice) => {
    if (performance.now() - shownAt.current < 350) return; // no accidental taps as a message arrives
    if (store.applyChoice(missionId, c)) setJustReplied(c.consequence);
  };
  return (
    <div>
      {justReplied && <div style={st.consequence}>{justReplied}</div>}
      {inbox.length === 0 && <div style={st.empty}>No new messages.</div>}
      {inbox.map(({ def, step }) => (
        <div key={def.id} style={st.thread}>
          <div style={st.from}><span style={st.avatar}>{avatarFor(step.speaker, def.emoji)}</span> {step.speaker ?? def.name}</div>
          {step.lines.map((l, i) => <div key={i} style={st.bubble}>{l}</div>)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {step.choices!.map(c => {
              const affordable = c.cost >= 0 || store.canAfford(-c.cost);
              return (
                <button key={c.id} disabled={!affordable} onClick={() => reply(def.id, c)}
                  style={{ ...st.replyBtn, ...(affordable ? {} : { opacity: 0.45, cursor: 'not-allowed' }) }}>
                  <div>{c.label}{!affordable && <span style={{ color: '#ff8080' }}> — can't afford</span>}</div>
                  {c.sublabel && <div style={{ fontSize: 10, opacity: 0.7 }}>{c.sublabel}</div>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {history.length > 0 && <div style={st.section}>EARLIER TODAY</div>}
      {history.map(h => (
        <div key={h.id} style={{ ...st.thread, opacity: 0.75 }}>
          <div style={st.from}><span style={st.avatar}>{avatarFor(h.from, h.emoji)}</span> {h.from} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {formatTime(h.at)}</span></div>
          <div style={st.bubble}>{h.text}</div>
          {h.reply && <div style={{ ...st.bubble, ...st.mine }}>{h.reply}</div>}
          {h.result && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{h.result}</div>}
        </div>
      ))}
    </div>
  );
}
function avatarFor(speaker: string | undefined, fallback: string): string {
  const map: Record<string, string> = { Mum: '👩', Jordan: '🧢', Riley: '🎒', 'Ms Patel': '👩‍🏫', 'Mr Lee': '🧔', Grandma: '👵', 'Mrs Kaur': '👵🏽', Library: '📕', 'Route 1': '🚌', StreamBox: '📺', ShopNow: '🛍️', 'Class chat': '💬', Goals: '🎯', 'Coach Rangi': '🏀', Mobile: '📶', 'Unknown number': '❓', 'Pixel Racer': '🏎️', Council: '♻️', Buyer: '📦', Neighbour: '🏡', Arjun: '📐', 'Post Office': '📮', FoodNow: '🛵', StudyLink: '🎓', Sam: '🧑', Mei: '👩‍🎓', 'Dr Hughes': '👨‍🏫', Leah: '☕', 'Student Job Search': '💼', Moodle: '💻', 'Clubs Council': '🎪', 'Psych Dept': '🧪', 'Class group': '💬', Alarm: '⏰', 'Your bank': '🏦', PayLater: '💳', 'Your list': '🛒', Bookshop: '📕', 'Student Café': '🍱' };
  return (speaker && map[speaker]) || fallback;
}

// ── Bank ────────────────────────────────────────────────────────────────────
function BankApp({ store }: { store: GameStore }) {
  const s = store.state, f = s.finance;
  const weekStart = at(parts(s.minutes).day - parts(s.minutes).dayOfWeek, 0, 0);
  const spending = f.transactions.recent.filter(t => t.timestamp >= weekStart && t.amount < 0 && t.type !== 'transfer');
  const byCat = new Map<string, number>();
  for (const t of spending) byCat.set(t.category, (byCat.get(t.category) ?? 0) - t.amount);
  const rows = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const max = rows[0]?.[1] ?? 1, total = rows.reduce((n, [, v]) => n + v, 0);
  const studentLoan = f.debt.loans.filter(l => l.kind === 'student').reduce((n, l) => n + l.principal, 0);
  const owed = f.debt.loans.filter(l => l.kind !== 'student').reduce((n, l) => n + l.principal, 0);
  const sv = store.rules.savings;
  const [, redraw] = useState(0);
  const move = (ok: boolean) => { if (ok) redraw(n => n + 1); };
  const subs = f.expenses.recurring.filter(r => r.category === 'subscription');
  const bills = f.expenses.recurring.filter(r => r.category !== 'subscription');
  const days = (t: number) => Math.max(0, Math.ceil((t - s.minutes) / MIN_PER_DAY));
  return (
    <div>
      <div style={st.bigCard}>
        <div style={{ fontSize: 11, opacity: 0.7 }}>CASH</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: '#7cfc00' }}>${f.accounts.cash.toFixed(2)}</div>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 8, fontSize: 12 }}>
          <span>{sv.emoji} ${f.accounts.savings.toFixed(2)}</span>
          <span style={{ color: owed > 0 ? '#ff8080' : undefined }}>Owed ${owed.toFixed(2)}</span>
        </div>
        {sv.atHome
          ? <div style={{ fontSize: 10, opacity: 0.6, marginTop: 6 }}>Your {sv.name.toLowerCase()} is at home — save or take money out there.</div>
          : (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 6 }}>{sv.name.toUpperCase()} — move money in, out of sight</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                <button style={st.smallBtn} disabled={f.accounts.cash < 10} onClick={() => move(store.moveToSavings(10))}>Save $10</button>
                <button style={st.smallBtn} disabled={f.accounts.cash < 50} onClick={() => move(store.moveToSavings(50))}>Save $50</button>
                <button style={st.smallBtn} disabled={f.accounts.savings <= 0} onClick={() => move(store.takeFromSavings(f.accounts.savings))}>Withdraw all</button>
              </div>
            </div>
          )}
      </div>
      {studentLoan > 0 && (
        <div style={st.row}><span>🎓 Student loan (interest-free while you study)</span><span>${studentLoan.toFixed(2)}</span></div>
      )}
      {subs.length > 0 && <div style={st.section}>SUBSCRIPTIONS</div>}
      {subs.map(r => (
        <div key={r.id} style={st.row}>
          <span>📺 {r.name} · ${r.amount.toFixed(2)} every {r.periodDays}d (next in {days(r.nextDueAt)}d)</span>
          <button style={st.smallBtn} onClick={() => store.cancelSubscription(r.id)}>Cancel</button>
        </div>
      ))}
      {bills.length > 0 && <div style={st.section}>BILLS</div>}
      {bills.map(r => <div key={r.id} style={st.row}><span>🏠 {r.name} · ${r.amount.toFixed(2)}</span><span>in {days(r.nextDueAt)}d</span></div>)}
      {s.world.busPass && s.world.busPass.validUntil > s.minutes && <div style={st.row}><span>🎫 Weekly bus pass</span><span>active</span></div>}
      <div style={st.section}>SPENT THIS WEEK — ${total.toFixed(2)}</div>
      {rows.length === 0 && <div style={st.empty}>Nothing yet.</div>}
      {rows.map(([cat, amt]) => (
        <div key={cat} style={{ marginBottom: 6 }}>
          <div style={st.row}><span>{CAT_EMOJI[cat] ?? '💳'} {cat.replace('_', ' ')}</span><span>${amt.toFixed(2)}</span></div>
          <div style={st.barTrack}><div style={{ ...st.barFill, width: `${(amt / max) * 100}%` }} /></div>
        </div>
      ))}
      <div style={st.section}>RECENT</div>
      {f.transactions.recent.filter(t => t.account === 'cash').slice(-15).reverse().map(t => (
        <div key={t.id} style={st.row}>
          <span>{CAT_EMOJI[t.category] ?? '💳'} {t.description}</span>
          <span style={{ color: t.amount < 0 ? '#ff8080' : '#7cfc00' }}>{t.amount < 0 ? '-' : '+'}${Math.abs(t.amount).toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
const CAT_EMOJI: Record<string, string> = {
  food: '🍎', shopping: '🛒', transport: '🚌', housing: '🏠', entertainment: '🕹️', gift: '🎁', income: '💵',
  mission_reward: '🎯', life_event: '🍀', transfer: '🐷', subscription: '📺', fee: '🧾', other: '💳',
};

// ── Goals ───────────────────────────────────────────────────────────────────
function GoalsApp({ store }: { store: GameStore }) {
  const g = store.goalStatus();
  const s = store.state;
  const unlocked = ACHIEVEMENTS.filter(a => isUnlocked(s, a.id)).length;
  return (
    <div>
      {g ? (
        <div style={{ ...st.bigCard, borderColor: g.achieved ? '#3fb950' : '#f0c038' }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>THIS WEEK'S GOAL</div>
          <div style={{ fontSize: 18, fontWeight: 700, margin: '4px 0' }}>{g.def.emoji} {g.def.name}</div>
          <div style={st.barTrack}><div style={{ ...st.barFill, width: `${g.progress * 100}%`, background: g.achieved ? '#3fb950' : '#f0c038' }} /></div>
          <div style={{ fontSize: 12, marginTop: 6 }}>{g.achieved ? '✓ Done!' : g.detail}</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>{store.rules.goalTips[g.def.id]}</div>
        </div>
      ) : <div style={st.empty}>You'll pick a goal on Monday morning.</div>}
      <div style={st.section}>ACHIEVEMENTS — {unlocked}/{ACHIEVEMENTS.length}</div>
      {ACHIEVEMENTS.map(a => {
        const on = isUnlocked(s, a.id);
        return <div key={a.id} style={{ ...st.row, opacity: on ? 1 : 0.45 }}><span>{on ? a.emoji : '🔒'} {a.name}</span><span style={{ fontSize: 10, maxWidth: 140, textAlign: 'right' }}>{a.description}</span></div>;
      })}
    </div>
  );
}

// ── Today ───────────────────────────────────────────────────────────────────
function TodayApp({ store }: { store: GameStore }) {
  const j = buildJournal(store.state, store.defs);
  const sec = (title: string, list: typeof j.active, dim = false) => list.length > 0 && (
    <div>
      <div style={st.section}>{title}</div>
      {list.map(e => <div key={e.id} style={{ ...st.row, opacity: dim ? 0.6 : 1 }}><span>{e.emoji} {e.name}</span>{e.deadline && <span style={{ fontSize: 10 }}>by {formatTime(e.deadline)}</span>}</div>)}
    </div>
  );
  return (
    <div>
      {sec('TO DO', j.active)}
      {sec('OPTIONAL', j.optional)}
      {sec('DONE TODAY', j.completed, true)}
      {sec('MISSED', j.missed, true)}
      {sec('COMING UP THIS WEEK', j.upcoming, true)}
      {j.active.length + j.optional.length === 0 && <div style={st.empty}>Nothing to do right now. Explore!</div>}
    </div>
  );
}

// ── Calendar ────────────────────────────────────────────────────────────────
function CalendarApp({ store }: { store: GameStore }) {
  const p = parts(store.state.minutes);
  return (
    <div>
      {DAY_NAMES.map((name, d) => {
        const today = d === p.dayOfWeek, past = d < p.dayOfWeek;
        return (
          <div key={name} style={{ ...st.thread, borderColor: today ? '#f0c038' : '#2a2d36', opacity: past ? 0.55 : 1 }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{today ? '▶ ' : ''}{name}{d < 5 ? ' · School 8:30' : ''}</div>
            {store.rules.calendar.filter(e => e.day === d).map(e => {
              const state = e.missionId ? store.runtime(e.missionId)?.state : undefined;
              const mark = past || today ? (state === 'completed' ? ' ✓' : state === 'expired' ? ' ✗' : '') : '';
              return <div key={e.text} style={{ fontSize: 12 }}>{e.icon} {e.text}{mark}</div>;
            })}
            {today && store.todaysPool().map(id => {
              const def = store.def(id);
              return def ? <div key={id} style={{ fontSize: 12, opacity: 0.85 }}>{def.emoji} {def.name} <span style={{ opacity: 0.6 }}>(today only)</span></div> : null;
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Map ─────────────────────────────────────────────────────────────────────
function MapApp({ store }: { store: GameStore }) {
  const s = store.state;
  const here = s.player.scene === 'outdoor' ? pxToTile(s.player.x, s.player.y) : doorTile(s.player.place ?? 'home');
  const nearest = Object.values(BUS_STOPS)
    .map(b => ({ b, d: Math.hypot(b.tile.x - here.x, b.tile.y - here.y) }))
    .sort((a, b) => a.d - b.d)[0]?.b;
  const bus = nearest ? nextBusAt(nearest.id, s.minutes) : null;
  const places = PLACES.filter(pl => pl.interior !== 'none' || pl.id === 'park')
    .map(pl => ({ pl, m: distanceMetres(here, doorTile(pl.id)), open: isOpen(pl.id, s.minutes) }))
    .sort((a, b) => a.m - b.m);
  const task = trackedMission(s, store.defs);
  const way = waypointReadout(s, store.defs);
  return (
    <div>
      {task && way && (
        <div style={{ ...st.bigCard, borderColor: '#ffd23f' }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>YOUR NEXT TASK</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>{task.def.emoji} {task.def.name}</div>
          <div style={{ fontSize: 13, marginTop: 4, color: '#ffd23f' }}>
            {way.here ? `📍 You're at the ${way.label}` : `${way.arrow} ${way.label} · ${way.metres}m`}
          </div>
        </div>
      )}
      {nearest && (
        <div style={st.bigCard}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>NEAREST STOP · {pathText(s.lifePath, nearest.name)}</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>🚌 {bus ? `Next Route 1 at ${formatTime(bus.arrivesAt)}` : 'No more buses today'}</div>
        </div>
      )}
      {places.map(({ pl, m, open }) => (
        <div key={pl.id} style={{ ...st.row, ...(task?.placeId === pl.id ? { color: '#ffd23f' } : {}) }}>
          <span>{task?.placeId === pl.id ? '📍' : pl.emoji} {placeName(s.lifePath, pl.id, pl.name)} <span style={{ opacity: 0.6 }}>· {m}m</span></span>
          <span style={{ fontSize: 10, color: open ? '#7cfc00' : '#ff8080', textAlign: 'right', maxWidth: 130 }}>{open ? 'Open' : closedReason(pl.id, s.minutes)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Friends ─────────────────────────────────────────────────────────────────
function ContactsApp({ store }: { store: GameStore }) {
  const rel = store.state.world.relationships;
  const people = store.rules.contacts;
  return (
    <div>
      {people.map(p => {
        const v = rel[p.key] ?? 0;
        const npc = p.id ? store.state.npcs[p.id] : undefined;
        const where = npc ? (npc.moving ? 'on the move' : getNpcPlaceName(store, npc.place)) : '';
        return (
          <div key={p.key} style={st.thread}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <b>{avatarFor(p.key, '🙂')} {p.key}</b>
              <span>{'❤️'.repeat(Math.max(0, Math.min(5, v)))}{'🤍'.repeat(Math.max(0, 5 - Math.max(0, v)))}</span>
            </div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>{p.note}{where ? ` · Now: ${where}` : ''}</div>
          </div>
        );
      })}
    </div>
  );
}
function getNpcPlaceName(store: GameStore, placeId: string): string {
  return placeName(store.state.lifePath, placeId, PLACES.find(p => p.id === placeId)?.name);
}

// ── Kai (AI mentor) ─────────────────────────────────────────────────────────
function KaiApp({ store, voiceOn }: { store: GameStore; voiceOn: boolean }) {
  const greeting = "Hey, I'm Kai. Ask me anything about budgeting, saving, or what to do this week.";
  const [msgs, setMsgs] = useState<{ from: 'you' | 'kai'; text: string }[]>([{ from: 'kai', text: greeting }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput(''); setMsgs(m => [...m, { from: 'you', text }]); setSending(true);
    const s = store.state, j = buildJournal(s, store.defs), goal = store.goalStatus();
    const reply = await askMentorChat(text, {
      lifePath: s.lifePath, day: DAY_NAMES[parts(s.minutes).dayOfWeek], balance: store.cash,
      activeMissions: [...j.active.map(a => a.name), ...(goal ? [`Goal: ${goal.def.name} (${goal.detail})`] : [])],
    });
    setMsgs(m => [...m, { from: 'kai', text: reply }]);
    if (voiceOn) speakLine('Kai', reply);
    setSending(false);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1 }}>
        {msgs.map((m, i) => <div key={i} style={{ ...st.bubble, ...(m.from === 'you' ? st.mine : {}) }}>{m.text}</div>)}
        {sending && <div style={{ fontSize: 11, opacity: 0.6 }}>Kai is typing…</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} maxLength={500}
          onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') send(); }}
          placeholder="Ask Kai…" style={st.input} />
        <button style={st.smallBtn} onClick={send} disabled={sending}>Send</button>
      </div>
    </div>
  );
}

// ── Settings ────────────────────────────────────────────────────────────────
function SettingsApp({ voiceOn, setVoiceOn, onChangePath, onLogout, playerName }: PhoneProps) {
  return (
    <div>
      <div style={st.bigCard}><div style={{ fontSize: 11, opacity: 0.7 }}>PLAYER</div><div style={{ fontSize: 16, fontWeight: 700 }}>{playerName}</div></div>
      <button style={st.settingRow} onClick={() => setVoiceOn(!voiceOn)}>{voiceOn ? '🔊' : '🔇'} Character voices <span>{voiceOn ? 'On' : 'Off'}</span></button>
      <button style={st.settingRow} onClick={onChangePath}>🔀 Change life path <span>›</span></button>
      <button style={st.settingRow} onClick={onLogout}>🚪 Log out <span>›</span></button>
      <div style={st.section}>CONTROLS</div>
      {[['Move', 'WASD / arrows'], ['Talk / interact', 'E'], ['Phone', 'P'], ['Today', 'J'], ['Back / leave building', 'Esc']].map(([a, k]) => (
        <div key={a} style={st.row}><span>{a}</span><span style={{ opacity: 0.7 }}>{k}</span></div>
      ))}
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────
const st: Record<string, React.CSSProperties> = {
  backdrop: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 45 },
  phone: {
    position: 'relative', width: 'min(360px, 94vw)', height: 'min(700px, 92dvh)', background: '#0b0d12', borderRadius: 36,
    border: '6px solid #2a2d36', boxShadow: '0 20px 60px rgba(0,0,0,0.7)', color: '#fff', fontFamily: 'monospace',
    display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'mmPhoneUp 220ms ease-out',
  },
  statusBar: { display: 'flex', justifyContent: 'space-between', padding: '10px 18px 4px', fontSize: 11, opacity: 0.85 },
  screen: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'linear-gradient(#141826, #0b0d12)' },
  appBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #222', fontWeight: 700 },
  back: { background: 'none', border: 'none', color: '#79c0ff', fontSize: 26, cursor: 'pointer', width: 28, lineHeight: 1 },
  appBody: { flex: 1, overflowY: 'auto', padding: 12, minHeight: 0 },
  homeButton: { alignSelf: 'center', width: 110, height: 5, borderRadius: 3, background: '#555', border: 'none', margin: '8px 0 10px', cursor: 'pointer' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 14 },
  appIcon: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: 'monospace' },
  iconTile: { position: 'relative', width: 54, height: 54, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.25)' },
  badge: { position: 'absolute', top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, background: '#f85149', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' },
  notice: { width: '100%', textAlign: 'left', background: '#12351c', border: '1px solid #3fb950', borderRadius: 12, padding: '10px 12px', color: '#fff', fontFamily: 'monospace', fontSize: 12, marginBottom: 8, cursor: 'pointer' },
  thread: { background: '#161b22', border: '1px solid #2a2d36', borderRadius: 12, padding: 10, marginBottom: 10 },
  from: { fontWeight: 700, fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 },
  avatar: { width: 24, height: 24, borderRadius: 12, background: '#2a2d36', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
  bubble: { background: '#2a2d36', borderRadius: '12px 12px 12px 4px', padding: '7px 10px', fontSize: 12, marginBottom: 5, lineHeight: 1.35, maxWidth: '88%' },
  mine: { background: '#1f6feb', marginLeft: 'auto', borderRadius: '12px 12px 4px 12px' },
  replyBtn: { textAlign: 'left', background: '#1c2440', border: '1px solid #3a4a7a', borderRadius: 10, color: '#fff', padding: '8px 10px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12 },
  consequence: { background: '#12351c', border: '1px solid #3fb950', borderRadius: 10, padding: '8px 10px', fontSize: 12, marginBottom: 10 },
  empty: { opacity: 0.6, fontSize: 12, textAlign: 'center', padding: 16 },
  section: { fontSize: 10, opacity: 0.6, letterSpacing: 0.5, margin: '14px 0 6px' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 6 },
  bigCard: { background: '#161b22', border: '1px solid #2a2d36', borderRadius: 14, padding: 12, textAlign: 'center', marginBottom: 8 },
  barTrack: { height: 6, background: '#2a2d36', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', background: '#ffab40', borderRadius: 4 },
  smallBtn: { background: '#21262d', color: '#fff', border: '1px solid #444', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11 },
  input: { flex: 1, background: '#0d1117', border: '1px solid #30363d', color: '#fff', borderRadius: 8, padding: 8, fontFamily: 'monospace' },
  settingRow: { width: '100%', display: 'flex', justifyContent: 'space-between', background: '#161b22', border: '1px solid #2a2d36', borderRadius: 10, padding: '12px', color: '#fff', fontFamily: 'monospace', fontSize: 13, marginBottom: 8, cursor: 'pointer' },
};
