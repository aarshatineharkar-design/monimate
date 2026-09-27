/**
 * MoniMate 2.0 — Step 4 Monday-specific ActivityDef content.
 *
 * These are the activities School Week 1's Monday vertical slice adds on top of Step 3's four
 * worked examples (WALK_TO_SCHOOL / TAKE_BUS / BUY_LUNCH / HELP_PARENTS, imported and reused
 * below rather than redefined). Nothing here is engine code — MondayFlow (mondayFlow.ts) is what
 * sequences these through the existing systems; this file is pure content.
 *
 * Place ids follow the live game's convention (src/lib/types.ts: "matches LOCATIONS ids in the
 * map ('home','university','bus_stop',...)") — the School life path's school building is the
 * 'university' place id, same as createInitialGameState's unlockedLocations list.
 */
import type { ActivityDef } from '../../types/activity';

export { WALK_TO_SCHOOL, TAKE_BUS, BUY_LUNCH, HELP_PARENTS } from '../schoolActivities';

/** Lunch's zero-cost counterpart to BUY_LUNCH — the genuine "bring vs buy" decision the spec
 *  calls for. No financialEffect at all (not a $0 transaction) — ActivitySystem never creates a
 *  transaction record for a moneyless activity, per Step 3's design. */
export const BRING_LUNCH: ActivityDef = {
  id: 'bring_lunch',
  name: 'Eat the lunch you brought from home',
  category: 'food',
  timeCostMinutes: 10,
  energyCost: 0,
  requirement: { place: 'university' },
};

/** Establishes that not every activity is about money — a pure time/energy cost. */
export const ATTEND_CLASS: ActivityDef = {
  id: 'attend_class',
  name: 'Attend class',
  category: 'study',
  timeCostMinutes: 240,
  energyCost: 15,
  requirement: { place: 'university' },
};

/** The social after-school branch. No RelationshipSystem yet (out of scope for Step 4), but
 *  shaped so a future RelationshipSystem call can be added inside MondayFlow without touching
 *  this content or ActivitySystem — see mondayFlow.ts's comment on this activity's result. */
export const HANG_OUT_WITH_FRIEND: ActivityDef = {
  id: 'hang_out_with_friend',
  name: 'Hang out with a friend after school',
  category: 'social',
  timeCostMinutes: 60,
  energyCost: 10,
  requirement: { place: 'university' },
  movesPlayerTo: 'home',
};

/** The other after-school branch: skip the social detour, go straight home. */
export const GO_STRAIGHT_HOME: ActivityDef = {
  id: 'go_straight_home',
  name: 'Go straight home',
  category: 'travel',
  timeCostMinutes: 15,
  energyCost: 3,
  requirement: { place: 'university' },
  movesPlayerTo: 'home',
};

/** The parent errand's completion activity, offered by MondayFlow (world-driven timing) rather
 *  than freely chosen from a menu — see mondayFlow.ts's resolveErrand(). The trip to the dairy
 *  and back is abstracted into this single activity's cost rather than modeled as separate
 *  travel legs (ActivityDef has no multi-leg composition yet) — a known simplification, not a
 *  hidden one. */
export const GET_MILK_FOR_MUM: ActivityDef = {
  id: 'get_milk_for_mum',
  name: 'Get milk for Mum',
  category: 'chore',
  timeCostMinutes: 20,
  energyCost: 3,
  financialEffect: {
    account: 'cash',
    amount: -3,
    category: 'food',
    type: 'expense',
    source: 'dairy',
    description: 'Milk for Mum',
  },
  requirement: { place: 'home' },
  movesPlayerTo: 'home',
};

export const MONDAY_ACTIVITIES: ActivityDef[] = [
  BRING_LUNCH,
  ATTEND_CLASS,
  HANG_OUT_WITH_FRIEND,
  GO_STRAIGHT_HOME,
  GET_MILK_FOR_MUM,
];
