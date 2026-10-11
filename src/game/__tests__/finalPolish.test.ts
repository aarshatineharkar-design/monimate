/**
 * MoniMate — stage 3 polish: a chat per person on the phone, a money card after every night, small
 * talk you can answer, and an analogue touch joystick.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GameStore, createInitialState, contactName } from '../../lib/store';
import { makeInitialFinance, makeInitialGoals, getLifePath, LIFE_PATHS } from '../../lib/gameData';
import type { LifePath } from '../../lib/gameData';
import { at } from '../../lib/clock';
import { MONEY_FACTS, factsFor } from '../../lib/content/moneyFacts';
import { repliesFor, splitAtQuestion } from '../../lib/smallTalk';
import { stepMovement } from '../../lib/render';

function newGame(path: LifePath = 'school'): GameStore {
  const cfg = getLifePath(path);
  return new GameStore(createInitialState(path, makeInitialFinance(cfg), makeInitialGoals(cfg)));
}

/** Let the day run until a phone message is waiting (or give up at bedtime). */
function untilMessage(store: GameStore) {
  for (let i = 0; i < 16 * 60 && store.phoneInbox().length === 0; i++) store.advance(1);
  return store.phoneInbox()[0];
}

// ── Phone conversations ─────────────────────────────────────────────────────────────────────────

test('Messages: notes-to-self share one Reminders thread; people keep their own name', () => {
  assert.equal(contactName('You'), 'Reminders');
  assert.equal(contactName('Your list'), 'Reminders');
  assert.equal(contactName('Mum'), 'Mum');
});

test('Messages: a text lands in its sender\'s own conversation, unread until you answer it', () => {
  for (const path of ['school', 'university'] as LifePath[]) {
    const store = newGame(path);
    const m = untilMessage(store);
    if (!m) continue;
    const contact = contactName(m.step.speaker ?? m.def.name);
    const thread = store.chatThreads().find(t => t.contact === contact);
    assert.ok(thread, `${path}: ${contact} should have a conversation`);
    assert.ok(thread!.unread >= 1, `${path}: the message counts as unread`);
    assert.ok(store.chatWith(contact).some(e => !e.me && m.step.lines.includes(e.text)), 'their message is in the thread');
    // Every entry in this thread belongs to this contact only
    assert.ok(store.chatWith(contact).every(e => e.contact === contact));

    const choice = m.step.choices?.find(c => -c.cost <= store.cash);
    if (!choice) continue;
    store.applyChoice(m.def.id, choice);
    const after = store.chatWith(contact);
    assert.ok(after.some(e => e.me), `${path}: your reply shows in the thread`);
    // Logging is idempotent: asking again does not duplicate messages
    const n = store.chatWith(contact).length;
    store.chatThreads(); store.chatThreads();
    assert.equal(store.chatWith(contact).length, n);
  }
});

test('Messages: the conversation history survives a save and reload', () => {
  const store = newGame();
  const m = untilMessage(store);
  assert.ok(m, 'a school day brings at least one text');
  store.chatThreads();
  const back = GameStore.hydrate(store.serialize())!;
  assert.deepEqual(back.state.chatLog, store.state.chatLog);
});

// ── Money cards ────────────────────────────────────────────────────────────────────────────────

test('Money cards: every path has its own deck, ids are unique, and nothing is empty', () => {
  const ids = new Set<string>();
  for (const f of MONEY_FACTS) {
    assert.ok(!ids.has(f.id), `duplicate fact id ${f.id}`);
    ids.add(f.id);
    assert.ok(f.title.length >= 3 && f.body.length > 30, `${f.id} is too thin`);
  }
  for (const p of LIFE_PATHS) {
    assert.ok(factsFor(p.id as LifePath, 6).length >= 8, `${p.id} needs a proper deck of cards`);
  }
});

test('Money cards: school cards grow with the level — a Level 1 kid does not get Level 6 terms', () => {
  const l1 = factsFor('school', 1), l6 = factsFor('school', 6);
  assert.ok(l1.length >= 3);
  assert.ok(l6.length > l1.length);
  assert.ok(l1.every(f => (f.minLevel ?? 1) <= 1));
});

test('Money cards: a new card after each night, never the same one twice in a row, and kept in Notes', () => {
  const store = newGame();
  const seen: string[] = [];
  for (let night = 0; night < 3; night++) {
    store.advance(at(night, 22, 0) - store.state.minutes);
    store.sleep();
    const card = store.pendingFact;
    assert.ok(card, `night ${night + 1} brings a card`);
    assert.equal(card!.path, 'school');
    assert.ok(!seen.includes(card!.id), 'not a repeat while there are unseen cards');
    seen.push(card!.id);
    store.dismissFact();
    assert.equal(store.pendingFact, null);
  }
  assert.deepEqual(store.factsLearned().map(f => f.id), seen, 'Money Notes keeps every card, in order');
  const back = GameStore.hydrate(store.serialize())!;
  assert.deepEqual(back.factsLearned().map(f => f.id), seen, 'and remembers them after a reload');
});

// ── Answering people ───────────────────────────────────────────────────────────────────────────

test('Replies: every answerable question is a line someone actually says', () => {
  const src = readFileSync(join(process.cwd(), 'src/lib/smallTalk.ts'), 'utf8');
  const table = src.slice(src.indexOf('const REPLIES'));
  const keys = [...table.matchAll(/^ {2}(['"])(.+?)\1: \[/gm)].map(m => m[2]);
  assert.ok(keys.length >= 15, 'a good number of questions can be answered');
  const said = src.slice(0, src.indexOf('const REPLIES'));
  for (const k of keys) assert.ok(said.includes(k), `nobody says "${k}"`);
});

test('Replies: each question offers 2-3 answers, each with its own response', () => {
  const r = repliesFor('How was school?');
  assert.ok(r && r.length >= 2 && r.length <= 3);
  assert.equal(new Set(r!.map(x => x.response)).size, r!.length);
  assert.ok(repliesFor('The bank app pinged — "arcade"? Was it worth it?'), 'Mum\'s splurge question can be answered too');
  assert.equal(repliesFor('Fresh bread came in this morning.'), null, 'statements are not questions');
});

test('Replies: a chat stops at the question and keeps the rest for after you answer', () => {
  const s = splitAtQuestion(['Hey!', 'How was school?', "Dinner's at seven."]);
  assert.deepEqual(s.lines, ['Hey!', 'How was school?']);
  assert.ok(s.replies?.length);
  assert.deepEqual(s.rest, ["Dinner's at seven."]);
  const none = splitAtQuestion(['Fresh bread came in this morning.']);
  assert.equal(none.replies, null);
  assert.deepEqual(none.rest, []);
});

// ── Touch joystick ─────────────────────────────────────────────────────────────────────────────

function walk(ax: number, ay: number, seconds = 1) {
  const pos = { x: 0, y: 0, vx: 0, vy: 0, facing: 0 };
  for (let i = 0; i < seconds * 60; i++) stepMovement(pos, { up: false, down: false, left: false, right: false, ax, ay }, 1 / 60);
  return pos;
}

test('Joystick: push right to walk right; a gentle push walks slower than a full one', () => {
  const full = walk(1, 0), half = walk(0.5, 0);
  assert.ok(full.x > 0 && Math.abs(full.y) < 1e-6);
  assert.ok(half.x > 0 && half.x < full.x * 0.8, 'analogue speed');
});

test('Joystick: a tiny wobble of the thumb does not move you (dead zone)', () => {
  const p = walk(0.05, 0.05);
  assert.equal(p.x, 0);
  assert.equal(p.y, 0);
});

test('Joystick: diagonal at full push is no faster than straight (top speed)', () => {
  const d = walk(Math.SQRT1_2, Math.SQRT1_2), s = walk(1, 0);
  assert.ok(Math.hypot(d.vx, d.vy) <= Math.hypot(s.vx, s.vy) * 1.01);
});
