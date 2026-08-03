import { GameState, ShopItem, Mission } from './types';
import { WEEKLY_POCKET_MONEY, TOTAL_WEEKS, MISSIONS } from './gameData';

export function createInitialState(): GameState {
  return {
    level: 1,
    week: 1,
    day: 1,
    wallet: WEEKLY_POCKET_MONEY,
    piggyBank: 0,
    bankAccount: 0,
    totalSpent: 0,
    totalEarned: WEEKLY_POCKET_MONEY,
    financialHealth: 100,
    location: 'home',
    missionsDone: [],
  };
}

export function buyItem(state: GameState, item: ShopItem): GameState | null {
  if (state.wallet < item.price) return null;
  
  const newWallet = +(state.wallet - item.price).toFixed(2);
  const newTotalSpent = +(state.totalSpent + item.price).toFixed(2);
  
  return {
    ...state,
    wallet: newWallet,
    totalSpent: newTotalSpent,
    financialHealth: calculateFinancialHealth({
      ...state,
      wallet: newWallet,
      totalSpent: newTotalSpent,
    }),
  };
}

export function saveToBank(state: GameState, amount: number): GameState | null {
  if (state.wallet < amount) return null;
  
  return {
    ...state,
    wallet: +(state.wallet - amount).toFixed(2),
    piggyBank: +(state.piggyBank + amount).toFixed(2),
    financialHealth: calculateFinancialHealth({
      ...state,
      piggyBank: state.piggyBank + amount,
    }),
  };
}

export function takeFromBank(state: GameState, amount: number): GameState | null {
  if (state.piggyBank < amount) return null;
  
  return {
    ...state,
    wallet: +(state.wallet + amount).toFixed(2),
    piggyBank: +(state.piggyBank - amount).toFixed(2),
  };
}

export function advanceDay(state: GameState): GameState {
  if (state.day < 5) {
    return { ...state, day: state.day + 1, location: 'home' };
  }
  
  // End of week — advance to next week
  if (state.week >= TOTAL_WEEKS) {
    return { ...state, day: 6 }; // signals level complete
  }
  
  const newWallet = +(state.wallet + WEEKLY_POCKET_MONEY).toFixed(2);
  const newTotalEarned = +(state.totalEarned + WEEKLY_POCKET_MONEY).toFixed(2);
  
  return {
    ...state,
    week: state.week + 1,
    day: 1,
    wallet: newWallet,
    totalEarned: newTotalEarned,
    location: 'home',
  };
}

export function isLevelComplete(state: GameState): boolean {
  return state.day > 5 && state.week >= TOTAL_WEEKS;
}

export function calculateFinancialHealth(state: GameState): number {
  let health = 100;

  // Savings bonus: +1 per $5 saved
  health += Math.floor(state.piggyBank / 5);

  // Overspending penalty: if spent more than 70% of total earned
  const spendRatio = state.totalEarned > 0 ? state.totalSpent / state.totalEarned : 0;
  if (spendRatio > 0.7) {
    health -= Math.floor((spendRatio - 0.7) * 100);
  }

  // Bonus for having cash reserves
  if (state.wallet > 10) health += 5;

  return Math.max(0, Math.min(100, health));
}

export function getAvailableMission(state: GameState): Mission | null {
  return MISSIONS.find(m =>
    m.level === state.level &&
    m.triggerWeek === state.week &&
    !state.missionsDone.includes(m.id) &&
    (m.triggerLocation === null || m.triggerLocation === state.location)
  ) || null;
}

export function completeMission(state: GameState, missionId: number): GameState {
  return {
    ...state,
    missionsDone: [...state.missionsDone, missionId],
  };
}

export function getMentorTip(state: GameState): string | null {
  // Context-aware tips based on player's financial state
  if (state.week >= 2 && state.wallet < 3 && state.day >= 4) {
    return "Running low before the weekend? Check what ate through your money fastest — was it the tuck shop or the dairy?";
  }
  if (state.piggyBank >= 10 && state.missionsDone.length <= 2) {
    return "Nice — your piggy bank just hit double digits. Most kids your age spend everything the day they get it. You're already ahead.";
  }
  if (state.piggyBank >= 30) {
    return `$${state.piggyBank.toFixed(0)} saved. At this rate, that game you wanted is getting closer every week.`;
  }
  if (state.totalSpent > state.totalEarned * 0.8 && state.week >= 3) {
    return "You've spent over 80% of everything you've earned so far. It's not too late to change the pattern — even saving $2 this week helps.";
  }
  if (state.week === 4 && state.piggyBank === 0) {
    return "Four weeks in and nothing saved yet. The birthday present mission is coming — surprise expenses are way easier with even a small buffer.";
  }
  return null;
}
