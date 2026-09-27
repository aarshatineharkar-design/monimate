"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const clockSystem_1 = require("../systems/clockSystem");
function freshTime(minutes) {
    return { minutes, paused: false, timeMultiplier: 1 };
}
(0, node_test_1.default)('Clock 1: advance 15 minutes — Monday 7:30 AM -> 7:45 AM', () => {
    const clock = new clockSystem_1.ClockSystem(freshTime(7 * 60 + 30)); // Monday 7:30
    clock.advance(15);
    const d = clock.getDerivedTime();
    strict_1.default.equal(d.hour, 7);
    strict_1.default.equal(d.minute, 45);
    strict_1.default.equal(d.dayOfWeek, 0);
});
(0, node_test_1.default)('Clock 2: advance across an hour — 7:45 AM + 30 min -> 8:15 AM', () => {
    const clock = new clockSystem_1.ClockSystem(freshTime(7 * 60 + 45));
    clock.advance(30);
    const d = clock.getDerivedTime();
    strict_1.default.equal(d.hour, 8);
    strict_1.default.equal(d.minute, 15);
});
(0, node_test_1.default)('Clock 3: advance across midnight — Sunday 11:50 PM + 20 min -> Monday 12:10 AM', () => {
    // day 6 = Sunday (0=Monday..6=Sunday); 23:50 on day 6
    const sunday2350 = 6 * 24 * 60 + 23 * 60 + 50;
    const clock = new clockSystem_1.ClockSystem(freshTime(sunday2350));
    clock.advance(20);
    const d = clock.getDerivedTime();
    strict_1.default.equal(d.day, 7); // rolled into day 7 = the next Monday
    strict_1.default.equal(d.dayOfWeek, 0); // Monday
    strict_1.default.equal(d.hour, 0);
    strict_1.default.equal(d.minute, 10);
});
(0, node_test_1.default)('Clock 4: day rollover is detected correctly via hasNewDayStarted', () => {
    const clock = new clockSystem_1.ClockSystem(freshTime(23 * 60 + 50)); // Monday 11:50 PM
    const before = clock.getTime().minutes;
    clock.advance(20); // -> Tuesday 12:10 AM
    strict_1.default.equal(clock.hasNewDayStarted(before), true);
    const clock2 = new clockSystem_1.ClockSystem(freshTime(8 * 60)); // Monday 8:00 AM
    const before2 = clock2.getTime().minutes;
    clock2.advance(30); // -> Monday 8:30 AM, same day
    strict_1.default.equal(clock2.hasNewDayStarted(before2), false);
});
(0, node_test_1.default)('Clock: advance rejects negative/non-finite input without mutating time', () => {
    const clock = new clockSystem_1.ClockSystem(freshTime(100));
    strict_1.default.throws(() => clock.advance(-5));
    strict_1.default.throws(() => clock.advance(NaN));
    strict_1.default.equal(clock.getTime().minutes, 100); // unchanged
});
