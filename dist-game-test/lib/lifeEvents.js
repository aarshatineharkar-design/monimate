"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIFE_EVENTS = void 0;
exports.rollLifeEvent = rollLifeEvent;
exports.LIFE_EVENTS = [
    {
        id: 'found_coins', emoji: '🍀', text: 'You spot some loose change on the footpath outside home.',
        chance: 0.12,
        choices: [
            { id: 'keep', label: 'Pick it up ($4)', amount: 4, consequence: 'Small win — straight into your pocket.' },
            { id: 'leave', label: "Leave it, not yours", amount: 0, consequence: "You leave it for whoever dropped it.", lesson: 'Not every windfall needs taking.' },
        ],
    },
    {
        id: 'jordan_borrow', emoji: '🤝', text: "Jordan's short on cash at the canteen: \"Can I borrow $5? I'll pay you back Friday.\"",
        chance: 0.10,
        condition: s => s.lifePath === 'school',
        choices: [
            { id: 'lend', label: 'Lend $5', amount: -5, consequence: 'Jordan promises Friday.', relationship: { npc: 'Jordan', delta: 1 }, lesson: 'Lending to friends is a real financial decision, not just a favour.' },
            { id: 'decline', label: "Sorry, can't today", amount: 0, consequence: 'Jordan shrugs it off.', relationship: { npc: 'Jordan', delta: -1 } },
        ],
    },
    {
        id: 'helped_neighbour', emoji: '🧓', text: 'A neighbour asks you to help carry groceries inside.',
        chance: 0.10,
        choices: [
            { id: 'help', label: 'Help out', amount: 3, consequence: 'She insists on giving you $3 for your trouble.' },
            { id: 'skip', label: "Can't right now", amount: 0, consequence: 'You head off. No harm done.' },
        ],
    },
    {
        id: 'bike_tire', emoji: '🚲', text: 'Your bike tire is looking flat — it could go any day now.',
        chance: 0.08,
        condition: s => s.world.hasBike,
        choices: [
            { id: 'fix', label: 'Get it fixed now ($8)', amount: -8, consequence: 'Sorted before it becomes a bigger problem.', lesson: 'Small maintenance now is cheaper than a breakdown later.' },
            { id: 'wait', label: 'Risk it for now', amount: 0, consequence: "You'll deal with it if it actually goes." },
        ],
    },
    {
        id: 'flash_sale', emoji: '🏷️', text: 'The Weekend Market has a flash sale sign up — 20% off today only.',
        chance: 0.08,
        choices: [
            { id: 'browse', label: 'Just browse', amount: 0, consequence: 'Nothing you actually need. You keep walking.' },
            { id: 'impulse', label: 'Grab something anyway ($6)', amount: -6, consequence: "Not on your list, but hard to resist.", lesson: 'Sales create spending that budgets rarely plan for.' },
        ],
    },
];
/** Roll at most one life event for the new day. Never overrides an event already waiting on the
 *  player, and never fires on top of one from earlier the same day. */
function rollLifeEvent(s) {
    const eligible = exports.LIFE_EVENTS.filter(e => !e.condition || e.condition(s));
    // shuffle order each day so the same event isn't always checked (and so implicitly favoured) first
    const shuffled = [...eligible].sort(() => Math.random() - 0.5);
    for (const e of shuffled) {
        if (Math.random() < e.chance)
            return e;
    }
    return null;
}
