/**
 * MoniMate 2.0 — Step 3's four worked examples, as real ActivityDef configuration rather than
 * values hardcoded inside a system ("the exact values can be represented as activity
 * configuration rather than hardcoded inside the systems"). Used by the system tests and
 * available for whatever exercises the Core Simulation next — not wired into the live game.
 */
import type { ActivityDef } from '../types/activity';

export const WALK_TO_SCHOOL: ActivityDef = {
  id: 'walk_to_school',
  name: 'Walk to school',
  category: 'travel',
  timeCostMinutes: 15,
  energyCost: 3,
  // No financialEffect: walking costs no money, so ActivitySystem creates no transaction for it.
  // Step 4 addition: this is a real trip, so it actually relocates the player — Step 3's own
  // tests never checked player location for this activity, so the missing field went unnoticed
  // until Monday's flow needed the player to actually arrive at school.
  movesPlayerTo: 'university',
};

export const TAKE_BUS: ActivityDef = {
  id: 'take_bus',
  name: 'Take the bus',
  category: 'travel',
  timeCostMinutes: 5,
  energyCost: 1,
  financialEffect: {
    account: 'cash',
    amount: -2,
    category: 'transport',
    type: 'expense',
    source: 'bus',
    description: 'Bus fare',
  },
  // Step 4 addition — see WALK_TO_SCHOOL's comment above.
  movesPlayerTo: 'university',
};

export const BUY_LUNCH: ActivityDef = {
  id: 'buy_lunch',
  name: 'Buy lunch',
  category: 'food',
  timeCostMinutes: 10,
  energyCost: 0,
  financialEffect: {
    account: 'cash',
    amount: -6,
    category: 'food',
    type: 'expense',
    source: 'school food stall',
    description: 'Lunch',
  },
};

export const HELP_PARENTS: ActivityDef = {
  id: 'help_parents',
  name: 'Help parents',
  category: 'chore',
  timeCostMinutes: 30,
  energyCost: 5,
  financialEffect: {
    account: 'cash',
    amount: 5,
    category: 'income',
    type: 'income',
    source: 'parents',
    description: 'Chore payment',
  },
};

export const SCHOOL_ACTIVITIES: ActivityDef[] = [WALK_TO_SCHOOL, TAKE_BUS, BUY_LUNCH, HELP_PARENTS];
