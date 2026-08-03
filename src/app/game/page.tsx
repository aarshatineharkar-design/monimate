'use client';

import { useState, useEffect } from 'react';
import { GameState, Notification, ShopItem } from '@/lib/types';
import { Mission } from '@/lib/types';
import {
  createInitialState, buyItem, saveToBank, takeFromBank,
  advanceDay, isLevelComplete, getAvailableMission,
  completeMission, getMentorTip,
} from '@/lib/gameEngine';
import {
  LOCATIONS, DAYS, TOTAL_WEEKS,
  getItemsForLocation, getLocationName,
} from '@/lib/gameData';

function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="flex-1">
      <div className="flex justify-between text-[10px] tracking-wide uppercase mb-1" style={{ color: '#8892a4' }}>
        <span>{label}</span>
        <span style={{ color }}>${value.toFixed(2)}</span>
      </div>
      <div className="h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <div className="h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function PiggyBank({ amount }: { amount: number }) {
  const fill = Math.min(1, amount / 80);
  return (
    <div className="text-center">
      <div className="relative w-20 h-20 mx-auto text-[44px] leading-[80px]"
        style={{ filter: `drop-shadow(0 4px 12px rgba(240,192,56,${0.2 + fill * 0.4}))` }}>
        🐷
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[11px] font-bold" style={{ color: '#f0c038' }}>
          ${amount.toFixed(0)}
        </div>
      </div>
      <div className="w-[70px] h-[6px] rounded-full mx-auto mt-1 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${fill * 100}%`, background: 'linear-gradient(90deg, #f0c038, #f7d774)' }} />
      </div>
    </div>
  );
}

export default function GamePage() {
  const [screen, setScreen] = useState<'intro' | 'play' | 'complete'>('intro');
  const [state, setState] = useState<GameState>(createInitialState());
  const [notification, setNotification] = useState<Notification | null>(null);
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [mentorMsg, setMentorMsg] = useState<string | null>(null);
  const [mentorShown, setMentorShown] = useState<Set<string>>(new Set());

  // Check for missions when location or week changes
  useEffect(() => {
    if (screen !== 'play') return;
    const m = getAvailableMission(state);
    if (m) setActiveMission(m);
  }, [state.week, state.day, state.location, screen]);

  // Check for mentor tips
  useEffect(() => {
    if (screen !== 'play') return;
    const tip = getMentorTip(state);
    if (tip && !mentorShown.has(tip)) {
      setTimeout(() => {
        setMentorMsg(tip);
        setMentorShown(prev => new Set(prev).add(tip));
      }, 600);
    }
  }, [state.wallet, state.piggyBank, state.week, state.day, screen]);

  function handleBuy(item: ShopItem) {
    const newState = buyItem(state, item);
    if (!newState) {
      setNotification({ text: `Not enough cash! You need $${item.price} but only have $${state.wallet.toFixed(2)}`, color: '#e94560' });
      return;
    }
    setState(newState);
    setNotification({ text: `Bought ${item.emoji} ${item.name} for $${item.price.toFixed(2)}`, color: '#4ecca3' });
  }

  function handleSave(amount: number) {
    const newState = saveToBank(state, amount);
    if (!newState) return;
    setState(newState);
    setNotification({ text: `Put $${amount.toFixed(2)} in the piggy bank 🐷`, color: '#f0c038' });
  }

  function handleTake(amount: number) {
    const newState = takeFromBank(state, amount);
    if (!newState) return;
    setState(newState);
    setNotification({ text: `Took $${amount.toFixed(2)} from the piggy bank`, color: '#8892a4' });
  }

  function handleNextDay() {
    setNotification(null);
    setMentorMsg(null);
    const newState = advanceDay(state);
    setState(newState);

    if (isLevelComplete(newState)) {
      setScreen('complete');
      return;
    }

    if (newState.day === 1) {
      setNotification({ text: "Monday! Mum gave you $15 for the week 💰", color: '#f0c038' });
    }
  }

  function handleCompleteMission() {
    if (!activeMission) return;
    setState(completeMission(state, activeMission.id));
    setNotification({ text: `✅ Mission complete: ${activeMission.title}`, color: '#4ecca3' });
    setActiveMission(null);
  }

  const shopItems = getItemsForLocation(state.location);

  // ===== INTRO SCREEN =====
  if (screen === 'intro') {
    return (
      <div className="max-w-[480px] mx-auto rounded-2xl overflow-hidden min-h-[520px]" style={{ background: '#1a1a2e', color: '#eee', fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <div className="p-9 text-center">
          <div className="text-5xl mb-2">🐷</div>
          <div className="text-xs tracking-[3px] uppercase mb-1" style={{ color: '#f0c038' }}>Level 1</div>
          <div className="text-[26px] font-bold mb-1">School Days</div>
          <p className="text-sm leading-relaxed mb-5" style={{ color: '#8892a4' }}>
            You&apos;re a Year 10 student. Mum gives you $15 pocket money every Monday.
            No job, no bank account — just cash and a piggy bank. Make it through 6 weeks.
          </p>
          <div className="rounded-xl p-4 mb-5 text-left text-[13px] leading-relaxed" style={{ background: '#16213e', color: '#8892a4' }}>
            <div className="font-semibold mb-1" style={{ color: '#eee' }}>What you&apos;ll learn:</div>
            • Budgeting when money is limited<br />
            • Saving up for bigger things<br />
            • Handling social pressure to spend<br />
            • Dealing with surprise expenses
          </div>
          <button
            onClick={() => setScreen('play')}
            className="px-9 py-3.5 rounded-full text-[15px] font-bold cursor-pointer border-none hover:opacity-90 transition-opacity"
            style={{ background: '#f0c038', color: '#1a1a2e' }}
          >
            Start School Days
          </button>
        </div>
      </div>
    );
  }

  // ===== COMPLETE SCREEN =====
  if (screen === 'complete') {
    const total = state.wallet + state.piggyBank;
    return (
      <div className="max-w-[480px] mx-auto rounded-2xl overflow-hidden" style={{ background: '#1a1a2e', color: '#eee', fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <div className="p-8 text-center">
          <div className="text-[44px] mb-2">🎓</div>
          <div className="text-xs tracking-[3px] uppercase mb-1" style={{ color: '#f0c038' }}>Level complete</div>
          <div className="text-2xl font-bold mb-5">Term&apos;s Over!</div>
          <div className="flex justify-around mb-6">
            {([
              ['Total Earned', `$${state.totalEarned.toFixed(0)}`, '#8892a4'],
              ['Total Spent', `$${state.totalSpent.toFixed(0)}`, '#e94560'],
              ['Piggy Bank', `$${state.piggyBank.toFixed(0)}`, '#f0c038'],
              ['Cash Left', `$${state.wallet.toFixed(0)}`, '#4ecca3'],
            ] as const).map(([label, value, color]) => (
              <div key={label}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: '#8892a4' }}>{label}</div>
                <div className="text-xl font-bold" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl p-4 text-left text-sm leading-relaxed mb-5" style={{ background: '#16213e' }}>
            {state.piggyBank >= 30
              ? "You saved over $30 — that's real discipline for a school student. You're starting uni with a head start most people don't have."
              : state.piggyBank >= 10
              ? "You put some money aside, which is more than most. Uni life will test this muscle a lot harder."
              : "Spent most of it? That's honest. Now you know what happens — and Level 2 is where you learn to change the pattern."}
          </div>
          <div className="rounded-xl p-3.5 text-[13px] font-bold" style={{ background: 'rgba(240,192,56,0.12)', color: '#f0c038' }}>
            🔓 Level 2 — Uni Life — unlocking...
            <div className="font-normal text-xs mt-1" style={{ color: '#8892a4' }}>
              Your piggy bank balance of ${state.piggyBank.toFixed(0)} transfers to your new bank account
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== PLAY SCREEN =====
  return (
    <div className="max-w-[480px] mx-auto rounded-2xl overflow-hidden min-h-[520px]" style={{ background: '#1a1a2e', color: '#eee', fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif" }}>
      {/* Stats Header */}
      <div className="flex gap-3 p-4 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <StatBar label="Wallet" value={state.wallet} max={30} color="#4ecca3" />
        <StatBar label="Piggy Bank" value={state.piggyBank} max={80} color="#f0c038" />
        <StatBar label="Spent" value={state.totalSpent} max={90} color="#e94560" />
      </div>

      {/* Week/Day Bar */}
      <div className="flex items-center justify-between px-5 py-2">
        <span className="text-xs" style={{ color: '#8892a4' }}>Week {state.week} of {TOTAL_WEEKS}</span>
        <div className="flex gap-1.5">
          {DAYS.map((d, i) => (
            <div key={d} className="w-8 h-[22px] rounded-md text-[10px] font-semibold flex items-center justify-center"
              style={{
                background: i + 1 === state.day ? '#f0c038' : i + 1 < state.day ? '#4ecca3' : 'rgba(255,255,255,0.06)',
                color: i + 1 <= state.day ? '#1a1a2e' : '#8892a4',
              }}>
              {d}
            </div>
          ))}
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div className="mx-5 px-3.5 py-2 rounded-lg text-[13px] font-medium"
          style={{ background: `${notification.color}18`, border: `1px solid ${notification.color}40`, color: notification.color }}>
          {notification.text}
        </div>
      )}

      {/* Mission Popup */}
      {activeMission && (
        <div className="mx-5 mt-2.5 p-4 rounded-xl" style={{ background: 'linear-gradient(135deg, #2a1f3d, #1a1a2e)', border: '1px solid rgba(240,192,56,0.25)' }}>
          <div className="text-[11px] tracking-widest uppercase mb-1.5" style={{ color: '#f0c038' }}>
            📋 Mission: {activeMission.title}
          </div>
          <p className="text-sm leading-relaxed mb-3">{activeMission.description}</p>
          <button onClick={handleCompleteMission}
            className="px-5 py-2 rounded-2xl text-[13px] font-bold cursor-pointer border-none hover:opacity-90"
            style={{ background: '#f0c038', color: '#1a1a2e' }}>
            Got it
          </button>
        </div>
      )}

      {/* Mentor Bubble */}
      {mentorMsg && (
        <div className="mx-5 mt-2.5 p-3.5 rounded-xl flex gap-2.5 items-start" style={{ background: '#16213e', border: '1px solid rgba(78,204,163,0.2)' }}>
          <div className="w-[30px] h-[30px] rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ background: '#4ecca3' }}>
            🧑
          </div>
          <div>
            <div className="text-[11px] tracking-wider uppercase font-bold mb-0.5" style={{ color: '#4ecca3' }}>Mentor</div>
            <div className="text-[13px] leading-relaxed" style={{ color: '#8892a4' }}>{mentorMsg}</div>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="relative h-[200px] mx-5 mt-2.5 rounded-xl overflow-hidden" style={{ background: '#16213e' }}>
        <div className="absolute top-2 left-3 text-[10px] tracking-wider uppercase" style={{ color: '#8892a4' }}>
          Tap a location to visit
        </div>
        {LOCATIONS.map((loc) => {
          const active = state.location === loc.id;
          return (
            <button key={loc.id}
              onClick={() => setState({ ...state, location: loc.id })}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-xl px-3.5 py-2.5 flex flex-col items-center gap-0.5 cursor-pointer transition-all duration-200"
              style={{
                left: `${loc.x}%`, top: `${loc.y}%`,
                background: active ? 'rgba(240,192,56,0.2)' : 'rgba(255,255,255,0.04)',
                border: active ? '2px solid #f0c038' : '2px solid rgba(255,255,255,0.1)',
              }}>
              <span className="text-2xl">{loc.emoji}</span>
              <span className="text-[10px] font-semibold" style={{ color: active ? '#f0c038' : '#8892a4' }}>{loc.label}</span>
            </button>
          );
        })}
      </div>

      {/* Location Content */}
      <div className="px-5 py-1.5">
        {/* HOME */}
        {state.location === 'home' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-base font-bold">Your Room</div>
                <div className="text-xs" style={{ color: '#8892a4' }}>Piggy bank is on the shelf</div>
              </div>
              <PiggyBank amount={state.piggyBank} />
            </div>
            <div className="flex gap-2 mb-2">
              {[2, 5, 10].map((amt) => (
                <button key={amt} onClick={() => handleSave(amt)} disabled={state.wallet < amt}
                  className="flex-1 py-2.5 rounded-lg border-none font-bold text-[13px] cursor-pointer disabled:cursor-default disabled:opacity-40 hover:opacity-90 transition-opacity"
                  style={{ background: state.wallet >= amt ? '#f0c038' : 'rgba(255,255,255,0.05)', color: state.wallet >= amt ? '#1a1a2e' : '#8892a4' }}>
                  Save ${amt}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {[2, 5, 10].map((amt) => (
                <button key={amt} onClick={() => handleTake(amt)} disabled={state.piggyBank < amt}
                  className="flex-1 py-2.5 rounded-lg font-semibold text-xs cursor-pointer disabled:cursor-default disabled:opacity-40 hover:opacity-90 transition-opacity"
                  style={{ background: 'transparent', border: '1px solid rgba(136,146,164,0.2)', color: state.piggyBank >= amt ? '#eee' : '#8892a4' }}>
                  Take ${amt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SHOP LOCATIONS */}
        {shopItems.length > 0 && (
          <div>
            <div className="text-base font-bold mb-1">{getLocationName(state.location)}</div>
            <div className="text-xs mb-3" style={{ color: '#8892a4' }}>
              You&apos;ve got ${state.wallet.toFixed(2)} in your pocket
            </div>
            <div className="flex flex-col gap-1.5">
              {shopItems.map((item) => (
                <div key={item.name} className="flex items-center justify-between px-3.5 py-2.5 rounded-xl" style={{ background: '#16213e' }}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{item.emoji}</span>
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <button onClick={() => handleBuy(item)} disabled={state.wallet < item.price}
                    className="px-3.5 py-1.5 rounded-2xl border-none font-bold text-[13px] cursor-pointer disabled:cursor-default disabled:opacity-50 hover:opacity-90 transition-opacity"
                    style={{ background: state.wallet >= item.price ? '#4ecca3' : 'rgba(255,255,255,0.06)', color: state.wallet >= item.price ? '#1a1a2e' : '#8892a4' }}>
                    ${item.price.toFixed(2)}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Next Day Button */}
      <div className="px-5 pb-4 pt-2">
        <button onClick={handleNextDay}
          className="w-full py-3 rounded-xl border-none font-bold text-sm cursor-pointer hover:opacity-90 transition-opacity"
          style={{
            background: state.day === 5 ? '#f0c038' : 'rgba(255,255,255,0.08)',
            color: state.day === 5 ? '#1a1a2e' : '#eee',
          }}>
          {state.day === 5
            ? (state.week >= TOTAL_WEEKS ? 'Finish Term →' : 'Next Week →')
            : `Next Day → ${DAYS[state.day] || ''}`}
        </button>
      </div>
    </div>
  );
}
