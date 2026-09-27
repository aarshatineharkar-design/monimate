"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const energySystem_1 = require("../systems/energySystem");
function freshEnergy(current = 80, max = 100) {
    return { current, max, recoveryPerHourAsleep: 12.5 };
}
(0, node_test_1.default)('Energy 5: consume reduces current energy', () => {
    const energy = new energySystem_1.EnergySystem(freshEnergy(80));
    energy.consume(10);
    strict_1.default.equal(energy.getState().current, 70);
});
(0, node_test_1.default)('Energy 6: cannot consume more energy than available', () => {
    const energy = new energySystem_1.EnergySystem(freshEnergy(5));
    strict_1.default.equal(energy.canConsume(10), false);
    strict_1.default.throws(() => energy.consume(10));
    strict_1.default.equal(energy.getState().current, 5); // unchanged after the rejected attempt
});
(0, node_test_1.default)('Energy 7: restore increases current energy', () => {
    const energy = new energySystem_1.EnergySystem(freshEnergy(50));
    energy.restore(20);
    strict_1.default.equal(energy.getState().current, 70);
});
(0, node_test_1.default)('Energy 8: energy never becomes invalid (never negative, never above max)', () => {
    const low = new energySystem_1.EnergySystem(freshEnergy(3));
    strict_1.default.throws(() => low.consume(10)); // would go to -7 — rejected, not clamped to 0
    strict_1.default.equal(low.getState().current, 3);
    const high = new energySystem_1.EnergySystem(freshEnergy(95, 100));
    high.restore(50); // would go to 145 — clamped to max instead
    strict_1.default.equal(high.getState().current, 100);
    strict_1.default.throws(() => low.consume(-1)); // negative "consume" is rejected, not treated as a restore
});
