"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MONDAY_ACTIVITIES = exports.GET_MILK_FOR_MUM = exports.GO_STRAIGHT_HOME = exports.HANG_OUT_WITH_FRIEND = exports.ATTEND_CLASS = exports.BRING_LUNCH = exports.HELP_PARENTS = exports.BUY_LUNCH = exports.TAKE_BUS = exports.WALK_TO_SCHOOL = void 0;
var schoolActivities_1 = require("../schoolActivities");
Object.defineProperty(exports, "WALK_TO_SCHOOL", { enumerable: true, get: function () { return schoolActivities_1.WALK_TO_SCHOOL; } });
Object.defineProperty(exports, "TAKE_BUS", { enumerable: true, get: function () { return schoolActivities_1.TAKE_BUS; } });
Object.defineProperty(exports, "BUY_LUNCH", { enumerable: true, get: function () { return schoolActivities_1.BUY_LUNCH; } });
Object.defineProperty(exports, "HELP_PARENTS", { enumerable: true, get: function () { return schoolActivities_1.HELP_PARENTS; } });
/** Lunch's zero-cost counterpart to BUY_LUNCH — the genuine "bring vs buy" decision the spec
 *  calls for. No financialEffect at all (not a $0 transaction) — ActivitySystem never creates a
 *  transaction record for a moneyless activity, per Step 3's design. */
exports.BRING_LUNCH = {
    id: 'bring_lunch',
    name: 'Eat the lunch you brought from home',
    category: 'food',
    timeCostMinutes: 10,
    energyCost: 0,
    requirement: { place: 'university' },
};
/** Establishes that not every activity is about money — a pure time/energy cost. */
exports.ATTEND_CLASS = {
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
exports.HANG_OUT_WITH_FRIEND = {
    id: 'hang_out_with_friend',
    name: 'Hang out with a friend after school',
    category: 'social',
    timeCostMinutes: 60,
    energyCost: 10,
    requirement: { place: 'university' },
    movesPlayerTo: 'home',
};
/** The other after-school branch: skip the social detour, go straight home. */
exports.GO_STRAIGHT_HOME = {
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
exports.GET_MILK_FOR_MUM = {
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
exports.MONDAY_ACTIVITIES = [
    exports.BRING_LUNCH,
    exports.ATTEND_CLASS,
    exports.HANG_OUT_WITH_FRIEND,
    exports.GO_STRAIGHT_HOME,
    exports.GET_MILK_FOR_MUM,
];
