'use client';

import { useState, useEffect } from 'react';
import { getDayData, formatTime, getTimeOfDay, TimeEvent, TimeChoice, DayData, CAMP_GOAL } from '@/lib/dayTimeline';

interface PlayerState {
  wallet: number;
  piggyBank: number;
  totalSpent: number;
  totalEarned: number;
  totalSaved: number;
  financialHealth: number;
  reputation: number;
  currentTime: number;
  currentLocation: string;
  flags: Record<string, boolean>;
  streak: number;
  bestStreak: number;
  daySpending: number;
  achievements: string[];
  weeklyStars: number[];
}

interface Achievement {
  id: string;
  title: string;
  emoji: string;
  desc: string;
  check: (s: PlayerState) => boolean;
}

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-save', title: 'Piggy Bank Pioneer', emoji: '🐷', desc: 'First save', check: s => s.piggyBank > 0 },
  { id: 'save-10', title: 'Double Digits', emoji: '💰', desc: 'Save $10+', check: s => s.piggyBank >= 10 },
  { id: 'save-25', title: 'Quarter Century', emoji: '🏆', desc: 'Save $25+', check: s => s.piggyBank >= 25 },
  { id: 'no-spend', title: 'Iron Will', emoji: '💪', desc: 'Finish a day spending $0', check: s => s.flags['no_spend_day'] === true },
  { id: 'earned', title: 'Self Made', emoji: '🔨', desc: 'Earn money from a job', check: s => s.flags['did_job_d4'] === true },
  { id: 'streak3', title: 'Three-peat', emoji: '🔥', desc: '3-day smart streak', check: s => s.bestStreak >= 3 },
  { id: 'said-no', title: 'Peer Proof', emoji: '🛡️', desc: 'Say no to peer pressure', check: s => s.flags['denied_liam_d2'] === true || s.flags['denied_liam_w1'] === true },
  { id: 'helper', title: 'Good Kid', emoji: '⭐', desc: 'Complete a mom errand', check: s => s.flags['bought_milk_d1'] === true || s.flags['got_tape_d2'] === true },
];

function createInitialState(): PlayerState {
  return {
    wallet: 15, piggyBank: 0, totalSpent: 0, totalEarned: 15, totalSaved: 0,
    financialHealth: 100, reputation: 50, currentTime: 0, currentLocation: 'home',
    flags: {}, streak: 0, bestStreak: 0, daySpending: 0, achievements: [], weeklyStars: [],
  };
}

// ============ COMPONENTS ============

function TimeBar({ time, deadline = 720 }: { time: number; deadline?: number }) {
  const pct = Math.min(100, (time / deadline) * 100);
  const timeOfDay = getTimeOfDay(time);
  const bgColor = timeOfDay === 'morning' ? '#f0c038' : timeOfDay === 'afternoon' ? '#e8a44c' : timeOfDay === 'evening' ? '#e94560' : '#4ecca3';
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] mb-1" style={{ color: '#8892a4' }}>
        <span>🕐 {formatTime(time)}</span>
        <span>{timeOfDay === 'morning' ? '🌅' : timeOfDay === 'school' ? '🏫' : timeOfDay === 'lunch' ? '🍽️' : timeOfDay === 'afternoon' ? '☀️' : '🌙'} {timeOfDay}</span>
        <span>Home by {formatTime(deadline)}</span>
      </div>
      <div className="h-[6px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, background: bgColor }} />
      </div>
    </div>
  );
}

function LocationBadge({ location }: { location: string }) {
  const icons: Record<string, string> = {
    home: '🏠', school: '🏫', dairy: '🏪', mall: '🛍️', library: '📚', cafe: '☕', stationery: '📎',
  };
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(255,255,255,0.08)', color: '#8892a4' }}>
      {icons[location] || '📍'} {location.charAt(0).toUpperCase() + location.slice(1)}
    </span>
  );
}

function CampProgress({ saved, goal }: { saved: number; goal: number }) {
  const pct = Math.min(100, (saved / goal) * 100);
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px]" style={{ color: '#8892a4' }}>⛺</span>
      <div className="flex-1 h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #f0c038, #4ecca3)' }} />
      </div>
      <span className="text-[10px] font-bold" style={{ color: '#f0c038' }}>${saved.toFixed(0)}/${goal}</span>
    </div>
  );
}

function AchievementModal({ a, onClose }: { a: Achievement; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="rounded-2xl p-8 text-center max-w-[300px] mx-4" style={{ background: '#16213e', border: '2px solid #f0c038' }}>
        <div className="text-5xl mb-3">{a.emoji}</div>
        <div className="text-xs tracking-[3px] uppercase mb-1" style={{ color: '#f0c038' }}>Achievement!</div>
        <div className="text-lg font-bold mb-1">{a.title}</div>
        <div className="text-sm mb-5" style={{ color: '#8892a4' }}>{a.desc}</div>
        <button onClick={onClose} className="px-6 py-2 rounded-full text-sm font-bold cursor-pointer border-none" style={{ background: '#f0c038', color: '#1a1a2e' }}>Nice!</button>
      </div>
    </div>
  );
}

function DaySummary({ state, dayData, onNext }: { state: PlayerState; dayData: DayData; onNext: () => void }) {
  const smartDay = state.daySpending <= 5;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="rounded-2xl p-6 text-center max-w-[360px] mx-4" style={{ background: '#16213e' }}>
        <div className="text-xs tracking-[3px] uppercase mb-2" style={{ color: '#8892a4' }}>{dayData.dayName} Summary</div>
        <div className="text-4xl mb-3">{smartDay ? '⭐' : '📊'}</div>
        <div className="flex justify-around mb-4">
          {([['Spent', `$${state.daySpending.toFixed(0)}`, '#e94560'], ['Wallet', `$${state.wallet.toFixed(0)}`, '#4ecca3'], ['Saved', `$${state.piggyBank.toFixed(0)}`, '#f0c038']] as const).map(([l, v, c]) => (
            <div key={l}>
              <div className="text-[10px] uppercase" style={{ color: '#8892a4' }}>{l}</div>
              <div className="text-xl font-bold" style={{ color: c }}>{v}</div>
            </div>
          ))}
        </div>
        {smartDay && <div className="text-sm mb-2" style={{ color: '#4ecca3' }}>🔥 Smart spending day! Streak: {state.streak + 1}</div>}
        <div className="mb-4"><CampProgress saved={state.piggyBank} goal={CAMP_GOAL} /></div>
        <div className="text-[13px] mb-4" style={{ color: '#8892a4' }}>
          {state.piggyBank >= 8 ? "Good progress toward camp! Keep this up." :
           state.piggyBank > 0 ? "You've started saving — but the target is $50. Pick up the pace." :
           "Nothing saved yet. Camp is getting closer every day."}
        </div>
        <button onClick={onNext} className="px-8 py-2.5 rounded-full text-sm font-bold cursor-pointer border-none" style={{ background: '#f0c038', color: '#1a1a2e' }}>
          Next Day →
        </button>
      </div>
    </div>
  );
}

// ============ MAIN GAME ============

export default function GamePage() {
  const [screen, setScreen] = useState<'intro' | 'play' | 'day-summary' | 'complete'>('intro');
  const [state, setState] = useState<PlayerState>(createInitialState());
  const [currentWeek, setCurrentWeek] = useState(1);
  const [currentDay, setCurrentDay] = useState(1);
  const [eventIndex, setEventIndex] = useState(0);
  const [choiceResponse, setChoiceResponse] = useState<string | null>(null);
  const [showAchievement, setShowAchievement] = useState<Achievement | null>(null);
  const [particles, setParticles] = useState<{ id: number; emoji: string; x: number; y: number }[]>([]);

  const dayData = getDayData(currentWeek, currentDay);
  const events = dayData?.events || [];
  const currentEvent = events[eventIndex];

  // Filter events by location and conditions
  const validEvent = currentEvent && (
    currentEvent.location === state.currentLocation ||
    currentEvent.location === 'school' && state.currentLocation === 'school' ||
    currentEvent.type === 'alert'
  );

  // Check achievements
  useEffect(() => {
    if (screen !== 'play') return;
    for (const a of ACHIEVEMENTS) {
      if (!state.achievements.includes(a.id) && a.check(state)) {
        setState(prev => ({ ...prev, achievements: [...prev.achievements, a.id] }));
        setTimeout(() => setShowAchievement(a), 400);
        break;
      }
    }
  }, [state.piggyBank, state.flags, state.bestStreak]);

  function spawnParticles(emoji: string, count: number = 3) {
    const p = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i, emoji, x: 100 + Math.random() * 200, y: 80 + Math.random() * 60,
    }));
    setParticles(prev => [...prev, ...p]);
    setTimeout(() => setParticles(prev => prev.filter(pp => !p.find(np => np.id === pp.id))), 1200);
  }

  function advanceEvent() {
    setChoiceResponse(null);
    let next = eventIndex + 1;
    // Skip events that don't match current location or whose conditions fail
    while (next < events.length) {
      const e = events[next];
      const locMatch = e.location === state.currentLocation || e.type === 'alert';
      const condMatch = true; // simplified condition check
      if (locMatch && condMatch) break;
      next++;
    }
    if (next >= events.length) {
      // Day is done — show summary
      const smartDay = state.daySpending <= 5;
      const newStreak = smartDay ? state.streak + 1 : 0;
      if (state.daySpending === 0) {
        setState(prev => ({ ...prev, flags: { ...prev.flags, no_spend_day: true }, streak: newStreak, bestStreak: Math.max(prev.bestStreak, newStreak) }));
      } else {
        setState(prev => ({ ...prev, streak: newStreak, bestStreak: Math.max(prev.bestStreak, newStreak) }));
      }
      setScreen('day-summary');
    } else {
      setEventIndex(next);
    }
  }

  function handleChoice(choice: TimeChoice) {
    const newWallet = +(state.wallet + choice.walletChange).toFixed(2);
    const newTime = state.currentTime + choice.timeCost;
    const spending = choice.walletChange < 0 ? Math.abs(choice.walletChange) : 0;
    const saving = choice.label.toLowerCase().includes('save') ? Math.abs(choice.walletChange) : 0;

    setState(prev => ({
      ...prev,
      wallet: newWallet,
      piggyBank: saving > 0 ? +(prev.piggyBank + saving).toFixed(2) : prev.piggyBank,
      totalSpent: +(prev.totalSpent + spending).toFixed(2),
      totalEarned: choice.walletChange > 0 && !choice.label.toLowerCase().includes('save') ? +(prev.totalEarned + choice.walletChange).toFixed(2) : prev.totalEarned,
      totalSaved: saving > 0 ? +(prev.totalSaved + saving).toFixed(2) : prev.totalSaved,
      financialHealth: Math.max(0, Math.min(100, prev.financialHealth + choice.healthChange)),
      reputation: Math.max(0, Math.min(100, prev.reputation + choice.reputationChange)),
      currentTime: newTime,
      currentLocation: choice.travelTo || prev.currentLocation,
      daySpending: +(prev.daySpending + spending).toFixed(2),
      flags: choice.flag ? { ...prev.flags, [choice.flag]: true } : prev.flags,
    }));

    if (choice.walletChange < 0 && !choice.label.toLowerCase().includes('save')) {
      spawnParticles('💸', 2);
    }
    if (saving > 0 || choice.label.toLowerCase().includes('save')) {
      // Fix: recalculate piggy for save choices
      const actualSave = Math.abs(choice.walletChange);
      setState(prev => ({
        ...prev,
        wallet: +(prev.wallet).toFixed(2), // already set above
        piggyBank: +(prev.piggyBank + actualSave).toFixed(2),
        totalSaved: +(prev.totalSaved + actualSave).toFixed(2),
      }));
      spawnParticles('✨', 4);
    }
    if (choice.walletChange > 0 && !choice.label.toLowerCase().includes('save')) {
      spawnParticles('💰', 3);
    }

    setChoiceResponse(choice.response);
  }

  // Fix double piggy counting - handle save in handleChoice properly
  function handleChoiceFixed(choice: TimeChoice) {
    const isSave = choice.emoji === '🐷';
    const spending = (!isSave && choice.walletChange < 0) ? Math.abs(choice.walletChange) : 0;
    const earning = choice.walletChange > 0 ? choice.walletChange : 0;

    setState(prev => ({
      ...prev,
      wallet: +(prev.wallet + choice.walletChange).toFixed(2),
      piggyBank: isSave ? +(prev.piggyBank + Math.abs(choice.walletChange)).toFixed(2) : prev.piggyBank,
      totalSpent: +(prev.totalSpent + spending).toFixed(2),
      totalEarned: earning > 0 ? +(prev.totalEarned + earning).toFixed(2) : prev.totalEarned,
      totalSaved: isSave ? +(prev.totalSaved + Math.abs(choice.walletChange)).toFixed(2) : prev.totalSaved,
      financialHealth: Math.max(0, Math.min(100, prev.financialHealth + choice.healthChange)),
      reputation: Math.max(0, Math.min(100, prev.reputation + choice.reputationChange)),
      currentTime: prev.currentTime + choice.timeCost,
      currentLocation: choice.travelTo || prev.currentLocation,
      daySpending: +(prev.daySpending + spending).toFixed(2),
      flags: choice.flag ? { ...prev.flags, [choice.flag]: true } : prev.flags,
    }));

    if (spending > 0) spawnParticles('💸', 2);
    if (isSave) spawnParticles('✨', 4);
    if (earning > 0) spawnParticles('💰', 3);

    setChoiceResponse(choice.response);
  }

  function handleNextDay() {
    const nextDay = currentDay + 1;
    if (nextDay > 4) {
      // Only have 4 days built
      setScreen('complete');
      return;
    }
    setCurrentDay(nextDay);
    setEventIndex(0);
    setChoiceResponse(null);
    setState(prev => ({ ...prev, currentTime: 0, currentLocation: 'home', daySpending: 0 }));
    setScreen('play');
  }

  const wrapStyle = { background: '#1a1a2e', color: '#eee', fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif" };

  // ===== INTRO =====
  if (screen === 'intro') {
    return (
      <div className="max-w-[480px] mx-auto rounded-2xl overflow-hidden min-h-[580px]" style={wrapStyle}>
        <style>{`
          @keyframes floatUp { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-60px); opacity: 0; } }
          @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
          @keyframes slideUp { 0% { transform: translateY(16px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
        `}</style>
        <div className="p-8 text-center">
          <div className="text-5xl mb-3" style={{ animation: 'pulse 2s infinite' }}>⛺</div>
          <div className="text-xs tracking-[3px] uppercase mb-1" style={{ color: '#f0c038' }}>Level 1 — School Days</div>
          <div className="text-[24px] font-bold mb-2">The Camp Trip</div>
          <p className="text-[13px] leading-relaxed mb-5" style={{ color: '#8892a4' }}>
            School camp in Queenstown is 6 weeks away. Jet boating. Hiking. Night markets.
            Everyone&apos;s going. The catch? You need <span style={{ color: '#f0c038', fontWeight: 700 }}>$50 spending money</span>.
            Mum gives you $15/week. Do the maths.
          </p>
          <div className="rounded-xl p-4 mb-4 text-left text-[12px]" style={{ background: '#16213e' }}>
            <div className="font-semibold mb-2 text-sm" style={{ color: '#eee' }}>Your world:</div>
            <div className="grid grid-cols-2 gap-2" style={{ color: '#8892a4' }}>
              <div>🏠 Home — piggy bank, mum&apos;s errands</div>
              <div>🏫 School — classes, tuck shop, jobs</div>
              <div>🏪 Dairy — snacks, peer pressure</div>
              <div>🛍️ Mall — big temptations</div>
              <div>☕ Café — social hangouts</div>
              <div>📚 Library — free, safe, quiet</div>
            </div>
          </div>
          <div className="rounded-xl p-3 mb-4 text-left text-[12px]" style={{ background: '#16213e' }}>
            <div className="font-semibold mb-1.5" style={{ color: '#eee' }}>People:</div>
            <div className="space-y-1" style={{ color: '#8892a4' }}>
              <div>😎 <strong style={{ color: '#eee' }}>Jake</strong> — Rich, spends freely, always pressuring you</div>
              <div>🤓 <strong style={{ color: '#eee' }}>Mia</strong> — Smart saver, your voice of reason</div>
              <div>😅 <strong style={{ color: '#eee' }}>Liam</strong> — Always broke, always borrowing</div>
              <div>👩 <strong style={{ color: '#eee' }}>Mum</strong> — Errands, curfew, and pocket money</div>
              <div>👨‍🏫 <strong style={{ color: '#eee' }}>Mr. Thompson</strong> — Teacher, job opportunities</div>
            </div>
          </div>
          <div className="rounded-xl p-3 mb-5 text-[11px] flex items-center justify-center gap-4" style={{ background: '#16213e', color: '#8892a4' }}>
            <span>🕐 Manage time</span>
            <span>💰 Manage money</span>
            <span>👥 Manage friendships</span>
          </div>
          <button onClick={() => { setScreen('play'); setState(createInitialState()); }}
            className="px-10 py-3.5 rounded-full text-[15px] font-bold cursor-pointer border-none hover:scale-105 transition-transform"
            style={{ background: '#f0c038', color: '#1a1a2e' }}>
            Start Week 1
          </button>
        </div>
      </div>
    );
  }

  // ===== DAY SUMMARY =====
  if (screen === 'day-summary' && dayData) {
    return (
      <>
        <div className="max-w-[480px] mx-auto rounded-2xl overflow-hidden" style={wrapStyle} />
        <DaySummary state={state} dayData={dayData} onNext={handleNextDay} />
      </>
    );
  }

  // ===== COMPLETE =====
  if (screen === 'complete') {
    const grade = state.piggyBank >= 30 ? 'A' : state.piggyBank >= 20 ? 'B' : state.piggyBank >= 10 ? 'C' : 'D';
    const gradeColor = grade === 'A' ? '#4ecca3' : grade === 'B' ? '#f0c038' : grade === 'C' ? '#e8a44c' : '#e94560';
    return (
      <div className="max-w-[480px] mx-auto rounded-2xl overflow-hidden" style={wrapStyle}>
        <div className="p-8 text-center">
          <div className="text-5xl mb-3">📊</div>
          <div className="text-xs tracking-[3px] uppercase mb-1" style={{ color: '#f0c038' }}>Week 1 Complete</div>
          <div className="text-2xl font-bold mb-4">4 Days Down</div>
          <div className="text-5xl font-bold mb-1" style={{ color: gradeColor }}>{grade}</div>
          <div className="text-[10px] uppercase tracking-wider mb-4" style={{ color: '#8892a4' }}>Financial Grade</div>
          <div className="flex justify-around mb-4">
            {([['Earned', `$${state.totalEarned.toFixed(0)}`, '#8892a4'], ['Spent', `$${state.totalSpent.toFixed(0)}`, '#e94560'],
               ['Saved', `$${state.piggyBank.toFixed(0)}`, '#f0c038'], ['Wallet', `$${state.wallet.toFixed(0)}`, '#4ecca3']] as const).map(([l, v, c]) => (
              <div key={l}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: '#8892a4' }}>{l}</div>
                <div className="text-xl font-bold" style={{ color: c }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="mb-4"><CampProgress saved={state.piggyBank} goal={CAMP_GOAL} /></div>
          {state.achievements.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-4">
              {ACHIEVEMENTS.filter(a => state.achievements.includes(a.id)).map(a => (
                <span key={a.id} className="px-2 py-1 rounded-lg text-[11px]" style={{ background: 'rgba(240,192,56,0.15)' }}>
                  {a.emoji} {a.title}
                </span>
              ))}
            </div>
          )}
          <div className="rounded-xl p-4 text-left text-[13px] leading-relaxed mb-4" style={{ background: '#16213e' }}>
            {state.piggyBank >= 25
              ? "Incredible start. If you keep this pace, Queenstown is a lock. You're learning that every small decision adds up."
              : state.piggyBank >= 15
              ? "Solid week. You're tracking toward camp — but six weeks of this consistency is the real test."
              : state.piggyBank >= 5
              ? "You've started saving, which is more than Liam can say. But $50 in 6 weeks needs a faster pace."
              : "Rough week for saving. But hey — you learned where the money goes. That awareness is worth something. Week 2 is a fresh start."}
          </div>
          <div className="rounded-xl p-3 text-[12px]" style={{ background: 'rgba(240,192,56,0.1)', color: '#f0c038' }}>
            🔜 More days coming soon — the story continues!
          </div>
        </div>
      </div>
    );
  }

  // ===== PLAY =====
  if (!dayData || !currentEvent) {
    return <div className="max-w-[480px] mx-auto p-8 text-center" style={wrapStyle}>Loading...</div>;
  }

  return (
    <div className="max-w-[480px] mx-auto rounded-2xl overflow-hidden min-h-[520px]" style={wrapStyle}>
      <style>{`
        @keyframes floatUp { 0% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(-60px); opacity: 0; } }
        @keyframes slideUp { 0% { transform: translateY(16px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
      `}</style>

      {/* Particles */}
      <div className="fixed inset-0 pointer-events-none z-50">
        {particles.map(p => (
          <div key={p.id} className="absolute text-lg" style={{ left: p.x, top: p.y, animation: 'floatUp 1s ease-out forwards' }}>{p.emoji}</div>
        ))}
      </div>

      {/* Achievement popup */}
      {showAchievement && <AchievementModal a={showAchievement} onClose={() => setShowAchievement(null)} />}

      {/* Header */}
      <div className="px-4 pt-3 pb-1.5 space-y-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-bold">{dayData.dayName}, Week {currentWeek}</div>
          <div className="flex items-center gap-2">
            <LocationBadge location={state.currentLocation} />
            {state.streak >= 2 && <span className="text-[11px] font-bold" style={{ color: '#e94560' }}>🔥{state.streak}</span>}
          </div>
        </div>
        <TimeBar time={state.currentTime} />
        <div className="flex gap-3">
          <div className="flex-1">
            <div className="flex justify-between text-[10px] uppercase mb-0.5" style={{ color: '#8892a4' }}>
              <span>Wallet</span><span style={{ color: '#4ecca3' }}>${state.wallet.toFixed(2)}</span>
            </div>
            <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (state.wallet / 20) * 100)}%`, background: '#4ecca3' }} />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-[10px] uppercase mb-0.5" style={{ color: '#8892a4' }}>
              <span>Piggy Bank</span><span style={{ color: '#f0c038' }}>${state.piggyBank.toFixed(2)}</span>
            </div>
            <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (state.piggyBank / CAMP_GOAL) * 100)}%`, background: '#f0c038' }} />
            </div>
          </div>
        </div>
        <CampProgress saved={state.piggyBank} goal={CAMP_GOAL} />
      </div>

      {/* Event content */}
      <div className="px-5 py-4" style={{ animation: 'slideUp 0.3s ease-out' }}>
        {/* Speaker */}
        {currentEvent.speaker && (
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{currentEvent.speakerEmoji || '💬'}</span>
            <span className="text-sm font-bold">{currentEvent.speaker}</span>
          </div>
        )}

        {/* Text */}
        <div className="text-[14px] leading-relaxed mb-4 whitespace-pre-line" style={{ color: currentEvent.speaker ? '#ccc' : '#eee' }}>
          {currentEvent.speaker ? `"${currentEvent.text}"` : currentEvent.text}
        </div>

        {/* Choice response */}
        {choiceResponse && (
          <div className="rounded-xl p-3.5 mb-4 text-[13px] leading-relaxed" style={{ background: '#16213e', color: '#aaa', animation: 'slideUp 0.3s ease-out' }}>
            {choiceResponse}
          </div>
        )}

        {/* Choices (if not yet responded) */}
        {currentEvent.choices && !choiceResponse && (
          <div className="flex flex-col gap-2 mb-3">
            {currentEvent.choices.map((choice, i) => (
              <button key={i} onClick={() => handleChoiceFixed(choice)}
                className="text-left px-4 py-3 rounded-xl text-[13px] cursor-pointer hover:brightness-125 transition-all border-none"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#eee' }}>
                <span className="mr-2">{choice.emoji}</span>
                {choice.label}
                {choice.walletChange !== 0 && (
                  <span className="ml-2 text-[11px] font-bold" style={{ color: choice.walletChange < 0 ? '#e94560' : '#4ecca3' }}>
                    {choice.walletChange < 0 ? `-$${Math.abs(choice.walletChange)}` : `+$${choice.walletChange}`}
                  </span>
                )}
                {choice.timeCost > 0 && (
                  <span className="ml-1 text-[11px]" style={{ color: '#8892a4' }}>
                    · {choice.timeCost}min
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Continue button */}
        {(!currentEvent.choices || choiceResponse) && (
          <button onClick={advanceEvent}
            className="w-full py-3 rounded-xl text-[13px] font-bold cursor-pointer border-none hover:brightness-110 transition-all active:scale-[0.98]"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#aaa' }}>
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}
