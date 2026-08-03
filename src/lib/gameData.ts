import { ShopItem, Location, NPC, Mission } from './types';

export const LOCATIONS: Location[] = [
  { id: 'home', label: 'Home', emoji: '🏠', x: 15, y: 62, description: 'Your room & piggy bank' },
  { id: 'school', label: 'School', emoji: '🏫', x: 50, y: 20, description: 'Tuck shop & vending' },
  { id: 'dairy', label: 'Dairy', emoji: '🏪', x: 82, y: 55, description: 'After-school snacks' },
  { id: 'mall', label: 'Mall', emoji: '🛍️', x: 50, y: 78, description: 'Games, clothes & gifts' },
];

export const TUCKSHOP_ITEMS: ShopItem[] = [
  { name: 'Mince Pie', price: 5.50, emoji: '🥧', category: 'school' },
  { name: 'Sushi Pack', price: 5.00, emoji: '🍣', category: 'school' },
  { name: 'Cheese Roll', price: 2.50, emoji: '🧀', category: 'school' },
  { name: 'Cup Noodles', price: 4.00, emoji: '🍜', category: 'school' },
  { name: 'Juice Box', price: 3.00, emoji: '🧃', category: 'school' },
  { name: 'Cookie', price: 2.00, emoji: '🍪', category: 'school' },
];

export const DAIRY_ITEMS: ShopItem[] = [
  { name: 'Chips', price: 2.50, emoji: '🍟', category: 'dairy' },
  { name: 'Ice Block', price: 2.00, emoji: '🧊', category: 'dairy' },
  { name: 'Lollies', price: 3.00, emoji: '🍬', category: 'dairy' },
  { name: 'Drink Bottle', price: 4.00, emoji: '🥤', category: 'dairy' },
  { name: 'Chocolate Bar', price: 3.50, emoji: '🍫', category: 'dairy' },
];

export const MALL_ITEMS: ShopItem[] = [
  { name: 'Phone Case', price: 25.00, emoji: '📱', category: 'mall' },
  { name: 'Video Game', price: 40.00, emoji: '🎮', category: 'mall' },
  { name: 'T-Shirt', price: 30.00, emoji: '👕', category: 'mall' },
  { name: 'Movie Ticket', price: 18.00, emoji: '🎬', category: 'mall' },
  { name: 'Birthday Gift', price: 15.00, emoji: '🎁', category: 'mall' },
];

export const NPCS: NPC[] = [
  { id: 'rich-kid', name: 'Jake', emoji: '😎', personality: 'Always has money, buys the expensive option every time' },
  { id: 'saver', name: 'Mia', emoji: '🤓', personality: 'Brings lunch from home, always has money when it matters' },
  { id: 'borrower', name: 'Liam', emoji: '😅', personality: 'Always asking to borrow money, rarely pays it back' },
  { id: 'mentor', name: 'Mentor', emoji: '🧑‍💼', personality: 'Your financial guide — pops up with contextual advice' },
];

export const MISSIONS: Mission[] = [
  {
    id: 1, level: 1, title: "Your First Week's Money",
    description: "Mum hands you $15 for the week. \"Make it last — that's all till next Monday.\"",
    triggerWeek: 1, triggerLocation: 'home', skillTaught: 'budgeting basics', xpReward: 10,
  },
  {
    id: 2, level: 1, title: 'The Dairy Run',
    description: "Your mates are all grabbing chips and drinks after school. Jake's buying a drink and chips — \"Come on, just get something!\"",
    triggerWeek: 2, triggerLocation: 'dairy', skillTaught: 'social pressure', xpReward: 15,
  },
  {
    id: 3, level: 1, title: 'Saving For Something',
    description: "You REALLY want that $40 game everyone's playing. At $15/week, that's almost 3 full weeks of saving — if you don't spend anything.",
    triggerWeek: 3, triggerLocation: 'home', skillTaught: 'delayed gratification', xpReward: 20,
  },
  {
    id: 4, level: 1, title: 'The Birthday Present',
    description: "Your best mate's birthday is Saturday. A decent present is $10-15. This wasn't in the plan.",
    triggerWeek: 5, triggerLocation: null, skillTaught: 'unexpected expenses', xpReward: 15,
  },
  {
    id: 5, level: 1, title: 'The School Trip',
    description: "School trip coming up in 3 weeks. You need $30 spending money. Can you save enough while still eating at school?",
    triggerWeek: 3, triggerLocation: null, skillTaught: 'goal-based saving', xpReward: 25,
  },
  {
    id: 6, level: 1, title: 'Your First Bank Account',
    description: "The Mentor thinks you're ready. Time to learn what a savings account actually does — and what interest means.",
    triggerWeek: 6, triggerLocation: 'home', skillTaught: 'savings accounts', xpReward: 30,
  },
];

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export const WEEKLY_POCKET_MONEY = 15;
export const TOTAL_WEEKS = 6;

export function getItemsForLocation(locationId: string): ShopItem[] {
  switch (locationId) {
    case 'school': return TUCKSHOP_ITEMS;
    case 'dairy': return DAIRY_ITEMS;
    case 'mall': return MALL_ITEMS;
    default: return [];
  }
}

export function getLocationName(locationId: string): string {
  switch (locationId) {
    case 'school': return '🏫 Tuck Shop';
    case 'dairy': return '🏪 The Dairy';
    case 'mall': return '🛍️ The Mall';
    case 'home': return '🏠 Your Room';
    default: return '';
  }
}
