/**
 * MoniMate 2.0 — createInitialGameState().
 *
 * Produces a valid, concrete NEW-foundation GameState with sensible School Life defaults, so the
 * future migration has a real target to test against. This does NOT replace
 * src/lib/store.ts's `createInitialState()` — the existing game keeps using that, unchanged, for
 * everything it actually runs today. This function isn't called from anywhere yet.
 */
import type { GameState } from '../types/gameState';

export function createInitialGameState(): GameState {
  // Monday 7:00 AM of week 1 — matches the existing game's actual campaign start
  // (lib/store.ts's createInitialState() spawns at Monday 7:00), so the Core Simulation begins at
  // the same point in a day the live game does, rather than an arbitrary midnight epoch.
  const startMinutes = 7 * 60;

  return {
    meta: {
      schemaVersion: 1,
      lifePath: 'school',
      createdAt: startMinutes,
      updatedAt: startMinutes,
    },
    time: {
      minutes: startMinutes,
      paused: false,
      timeMultiplier: 1,
    },
    player: {
      identity: {
        id: 'player',
        lifePath: 'school',
      },
      attributes: {
        level: 1,
        xp: 0,
        currentActivity: null,
        transportation: { hasBike: false, hasBusPass: false },
      },
      world: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        facing: Math.PI / 2,
        scene: 'interior_home',
        place: 'home',
        movementStatus: 'idle',
      },
    },
    finance: {
      // Step 3: the Core Simulation's player starts the day already holding $20 pocket money —
      // per Step 3's explicit instruction ("Money: $20 pocket money"). This is deliberately
      // different from the live game's $35/week, handed over via a Monday dialogue mission — that
      // mission system doesn't exist in this parallel foundation yet, so the Core Simulation just
      // starts with cash in hand rather than simulating how it arrived.
      accounts: { cash: 20, checking: 0, savings: 0, emergencyFund: 0 },
      income: {
        weeklyIncome: 35,
        job: { id: 'allowance', name: 'Weekly Allowance', location: 'home', payPerHour: 0, hoursPerWeek: 0, daysAvailable: [4] },
        sideIncome: 0,
        businessIncome: 0,
        investmentIncome: 0,
      },
      expenses: { recurring: [] },
      credit: { score: null, cards: [] },
      debt: { loans: [] },
      assets: { vehicles: [], property: [], investments: [], businesses: [] },
      liabilities: { items: [] },
      transactions: { recent: [], recentCap: 400 },
      totals: { totalEarned: 0, totalSpent: 0 },
    },
    energy: {
      current: 100,
      max: 100,
      recoveryPerHourAsleep: 12.5, // full recovery over an 8-hour sleep
    },
    inventory: {
      items: [],
    },
    world: {
      unlockedLocations: ['home', 'university', 'supermarket', 'dairy', 'mall', 'bus_stop'],
      flags: [],
      dailyMarks: [],
      completedWorldEvents: [],
      transportation: { hasBike: false, busPass: null },
    },
    npcs: {},
    missions: {
      active: [],
    },
    events: {
      pending: null,
      recentHistory: [],
    },
    progression: {
      xp: 0,
      level: 1,
      achievements: [],
      unlocks: [],
      milestones: { financial: [], life: [] },
    },
    goals: {
      active: [
        { id: 'save10_saturday', kind: 'financial', name: 'Save $10 for Saturday', target: 10, saved: 0 },
      ],
      completed: [],
    },
  };
}
