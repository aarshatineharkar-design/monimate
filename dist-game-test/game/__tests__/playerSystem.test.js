"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const playerSystem_1 = require("../systems/playerSystem");
const createInitialGameState_1 = require("../state/createInitialGameState");
(0, node_test_1.default)('PlayerSystem: initial School location is home', () => {
    const state = (0, createInitialGameState_1.createInitialGameState)();
    const player = new playerSystem_1.PlayerSystem(state.player);
    strict_1.default.equal(player.getLocation(), 'home');
});
(0, node_test_1.default)('PlayerSystem: changeLocation updates place only', () => {
    const state = (0, createInitialGameState_1.createInitialGameState)();
    const player = new playerSystem_1.PlayerSystem(state.player);
    const xBefore = state.player.world.x;
    player.changeLocation('university');
    strict_1.default.equal(player.getLocation(), 'university');
    strict_1.default.equal(state.player.world.x, xBefore); // changeLocation doesn't touch x/y (out of scope)
});
(0, node_test_1.default)('PlayerSystem: setCurrentActivity updates attributes.currentActivity', () => {
    const state = (0, createInitialGameState_1.createInitialGameState)();
    const player = new playerSystem_1.PlayerSystem(state.player);
    player.setCurrentActivity('studying');
    strict_1.default.equal(state.player.attributes.currentActivity, 'studying');
});
