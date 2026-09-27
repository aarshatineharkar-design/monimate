import test from 'node:test';
import assert from 'node:assert/strict';
import { ClockSystem } from '../systems/clockSystem';
import type { TimeState } from '../types/time';

function freshTime(minutes: number): TimeState {
  return { minutes, paused: false, timeMultiplier: 1 };
}

test('Clock 1: advance 15 minutes — Monday 7:30 AM -> 7:45 AM', () => {
  const clock = new ClockSystem(freshTime(7 * 60 + 30)); // Monday 7:30
  clock.advance(15);
  const d = clock.getDerivedTime();
  assert.equal(d.hour, 7);
  assert.equal(d.minute, 45);
  assert.equal(d.dayOfWeek, 0);
});

test('Clock 2: advance across an hour — 7:45 AM + 30 min -> 8:15 AM', () => {
  const clock = new ClockSystem(freshTime(7 * 60 + 45));
  clock.advance(30);
  const d = clock.getDerivedTime();
  assert.equal(d.hour, 8);
  assert.equal(d.minute, 15);
});

test('Clock 3: advance across midnight — Sunday 11:50 PM + 20 min -> Monday 12:10 AM', () => {
  // day 6 = Sunday (0=Monday..6=Sunday); 23:50 on day 6
  const sunday2350 = 6 * 24 * 60 + 23 * 60 + 50;
  const clock = new ClockSystem(freshTime(sunday2350));
  clock.advance(20);
  const d = clock.getDerivedTime();
  assert.equal(d.day, 7);          // rolled into day 7 = the next Monday
  assert.equal(d.dayOfWeek, 0);    // Monday
  assert.equal(d.hour, 0);
  assert.equal(d.minute, 10);
});

test('Clock 4: day rollover is detected correctly via hasNewDayStarted', () => {
  const clock = new ClockSystem(freshTime(23 * 60 + 50)); // Monday 11:50 PM
  const before = clock.getTime().minutes;
  clock.advance(20); // -> Tuesday 12:10 AM
  assert.equal(clock.hasNewDayStarted(before), true);

  const clock2 = new ClockSystem(freshTime(8 * 60)); // Monday 8:00 AM
  const before2 = clock2.getTime().minutes;
  clock2.advance(30); // -> Monday 8:30 AM, same day
  assert.equal(clock2.hasNewDayStarted(before2), false);
});

test('Clock: advance rejects negative/non-finite input without mutating time', () => {
  const clock = new ClockSystem(freshTime(100));
  assert.throws(() => clock.advance(-5));
  assert.throws(() => clock.advance(NaN));
  assert.equal(clock.getTime().minutes, 100); // unchanged
});
