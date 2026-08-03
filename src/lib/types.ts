export interface GameState {
  level: number;
  week: number;
  day: number;
  wallet: number;
  piggyBank: number;
  bankAccount: number;
  totalSpent: number;
  totalEarned: number;
  financialHealth: number;
  location: string;
  missionsDone: number[];
}

export interface ShopItem {
  name: string;
  price: number;
  emoji: string;
  category: string;
}

export interface Mission {
  id: number;
  level: number;
  title: string;
  description: string;
  triggerWeek: number;
  triggerLocation: string | null;
  skillTaught: string;
  xpReward: number;
}

export interface NPC {
  id: string;
  name: string;
  emoji: string;
  personality: string;
}

export interface Location {
  id: string;
  label: string;
  emoji: string;
  x: number;
  y: number;
  description: string;
}

export interface Notification {
  text: string;
  color: string;
}
