import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerSystem } from '../systems/playerSystem';
import { createInitialGameState } from '../state/createInitialGameState';

test('PlayerSystem: initial School location is home', () => {
  const state = createInitialGameState();
  const player = new PlayerSystem(state.player);
  assert.equal(player.getLocation(), 'home');
});

test('PlayerSystem: changeLocation updates place only', () => {
  const state = createInitialGameState();
  const player = new PlayerSystem(state.player);
  const xBefore = state.player.world.x;
  player.changeLocation('university');
  assert.equal(player.getLocation(), 'university');
  assert.equal(state.player.world.x, xBefore); // changeLocation doesn't touch x/y (out of scope)
});

test('PlayerSystem: setCurrentActivity updates attributes.currentActivity', () => {
  const state = createInitialGameState();
  const player = new PlayerSystem(state.player);
  player.setCurrentActivity('studying');
  assert.equal(state.player.attributes.currentActivity, 'studying');
});
