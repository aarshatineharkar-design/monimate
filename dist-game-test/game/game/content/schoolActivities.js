"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHOOL_ACTIVITIES = exports.HELP_PARENTS = exports.BUY_LUNCH = exports.TAKE_BUS = exports.WALK_TO_SCHOOL = void 0;
exports.WALK_TO_SCHOOL = {
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
exports.TAKE_BUS = {
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
exports.BUY_LUNCH = {
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
exports.HELP_PARENTS = {
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
exports.SCHOOL_ACTIVITIES = [exports.WALK_TO_SCHOOL, exports.TAKE_BUS, exports.BUY_LUNCH, exports.HELP_PARENTS];
