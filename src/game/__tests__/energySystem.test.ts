import test from 'node:test';
import assert from 'node:assert/strict';
import { EnergySystem } from '../systems/energySystem';
import type { EnergyState } from '../types/energy';

function freshEnergy(current = 80, max = 100): EnergyState {
  return { current, max, recoveryPerHourAsleep: 12.5 };
}

test('Energy 5: consume reduces current energy', () => {
  const energy = new EnergySystem(freshEnergy(80));
  energy.consume(10);
  assert.equal(energy.getState().current, 70);
});

test('Energy 6: cannot consume more energy than available', () => {
  const energy = new EnergySystem(freshEnergy(5));
  assert.equal(energy.canConsume(10), false);
  assert.throws(() => energy.consume(10));
  assert.equal(energy.getState().current, 5); // unchanged after the rejected attempt
});

test('Energy 7: restore increases current energy', () => {
  const energy = new EnergySystem(freshEnergy(50));
  energy.restore(20);
  assert.equal(energy.getState().current, 70);
});

test('Energy 8: energy never becomes invalid (never negative, never above max)', () => {
  const low = new EnergySystem(freshEnergy(3));
  assert.throws(() => low.consume(10)); // would go to -7 — rejected, not clamped to 0
  assert.equal(low.getState().current, 3);

  const high = new EnergySystem(freshEnergy(95, 100));
  high.restore(50); // would go to 145 — clamped to max instead
  assert.equal(high.getState().current, 100);

  assert.throws(() => low.consume(-1)); // negative "consume" is rejected, not treated as a restore
});
