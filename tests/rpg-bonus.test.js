'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const B = require('../js/engine/rpg_bonus');
const C = require('../js/data/rpg_bonus_content');
const copy = value => JSON.parse(JSON.stringify(value));
const started = (chapter = 'u03', marker = 'u03-quest') => B.interact(B.createState(), chapter, marker).state;
const correctSort = puzzle => Object.fromEntries(puzzle.cards.map(card => [card.id, card.category]));
const correctOrder = puzzle => {
  const result = [], left = puzzle.cards.map(card => card.id);
  while (left.length) {
    const id = left.find(candidate => puzzle.constraints.filter(rule => rule.after === candidate).every(rule => result.includes(rule.before)));
    assert.ok(id, 'Dependency graph must be acyclic'); result.push(id); left.splice(left.indexOf(id), 1);
  }
  return result;
};
const feasiblePlans = puzzle => {
  const result = [];
  for (let mask = 1; mask < (1 << puzzle.choices.length); mask++) {
    const selected = puzzle.choices.filter((_, i) => (mask & (1 << i)) !== 0);
    if (Object.keys(puzzle.budget).some(key => selected.reduce((sum, item) => sum + (item.cost[key] || 0), 0) > puzzle.budget[key])) continue;
    const covered = new Set(selected.flatMap(item => item.covers));
    if (puzzle.requirements.every(item => covered.has(item.id))) result.push(selected.map(item => item.id));
  }
  return result;
};
const solution = puzzle => puzzle.kind === 'evidence-sort' ? correctSort(puzzle) : puzzle.kind === 'dependency-order' ? correctOrder(puzzle) : feasiblePlans(puzzle)[0];
const submit = (state, chapterId, puzzleId, answer) => { const result = B.answer(state, chapterId, puzzleId, answer); assert.equal(result.ok, true, result.feedback.text); return result; };

test('content has exactly 13 chapter-specific optional quests and collectibles; u03 has 3 puzzle types', () => {
  assert.equal(C.chapters.length, 13);
  assert.equal(new Set(C.chapters.map(ch => ch.id)).size, 13);
  assert.equal(C.chapters.reduce((n, ch) => n + ch.markers.length, 0), 28);
  assert.deepEqual(C.getChapter('u03').puzzles.map(p => p.kind).sort(), ['dependency-order', 'evidence-sort', 'resource-plan']);
  assert.equal(new Set(C.chapters.map(ch => ch.markers[0].story)).size, 13);
  const ids = new Set();
  for (const ch of C.chapters) {
    assert.equal(ch.optional, true); assert.match(ch.notice, /不影響.*出席/);
    assert.equal(ch.easterEggs.length, 1);
    assert.ok(Object.isFrozen(ch));
    for (const marker of ch.markers) {
      assert.equal(ids.has(marker.id), false); ids.add(marker.id);
      assert.ok(['puzzle', 'egg', 'errand', 'order'].includes(marker.suggestedZone));
      assert.equal(own(marker, 'x'), false); assert.equal(own(marker, 'y'), false);
      if (marker.puzzleId) assert.ok(ch.puzzles.some(p => p.id === marker.puzzleId));
    }
    for (const puzzle of ch.puzzles) {
      assert.equal(ids.has(puzzle.id), false); ids.add(puzzle.id);
      assert.ok(puzzle.rationale && puzzle.hints.length > 0);
      if (puzzle.kind === 'resource-plan') assert.ok(feasiblePlans(puzzle).length >= 2, 'multiple valid plans');
      if (puzzle.kind === 'dependency-order') correctOrder(puzzle);
    }
  }
});
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

test('all chapter activities solve, replay, reload, and have a fixed total award', () => {
  let state = B.createState(), expectedPoints = 0;
  for (const chapter of C.chapters) {
    for (const marker of chapter.markers) {
      let result = B.interact(state, chapter.id, marker.id); assert.equal(result.ok, true); state = result.state;
      if (marker.puzzleId) {
        result = submit(state, chapter.id, marker.puzzleId, solution(chapter.puzzles.find(p => p.id === marker.puzzleId)));
        assert.equal(result.correct, true); state = result.state;
      }
      expectedPoints += marker.reward.points;
      const repeated = B.interact(state, chapter.id, marker.id);
      assert.equal(repeated.awarded.points, 0); assert.equal(repeated.changed, false);
    }
  }
  const summary = B.getSummary(state);
  assert.equal(summary.points, expectedPoints); assert.equal(summary.points, 191);
  assert.equal(summary.completed, 28); assert.equal(summary.puzzles, 15); assert.equal(summary.collections, 13);
  assert.equal(B.validateState(copy(state)), true);
  const replayed = B.replayEvents(B.exportEvents(state)); assert.equal(replayed.ok, true);
  assert.deepEqual(B.getSummary(replayed.state), summary);
});

test('correct evidence solution awards once and leaves prior state immutable', () => {
  const initial = started(), before = copy(initial), puzzle = C.getChapter('u03').puzzles[0];
  const result = submit(initial, 'u03', puzzle.id, correctSort(puzzle));
  assert.equal(result.correct, true); assert.equal(result.awarded.points, 10);
  assert.deepEqual(initial, before); assert.ok(Object.isFrozen(result.state.events));
  const repeated = submit(result.state, 'u03', puzzle.id, correctSort(puzzle));
  assert.equal(repeated.awarded.points, 0); assert.equal(repeated.changed, false);
  assert.equal(B.getSummary(repeated.state, 'u03').points, 10);
});

test('incorrect feedback, sequential hints, retry and reload preserve progress without score penalty', () => {
  const puzzle = C.getChapter('u03').puzzles[0], wrong = correctSort(puzzle); wrong.arrived = 'supported';
  let result = submit(started(), 'u03', puzzle.id, wrong);
  assert.equal(result.correct, false); assert.equal(result.awarded.points, 0); assert.match(result.feedback.details[0], /沒有到場/);
  result = B.hint(result.state, 'u03', puzzle.id); assert.equal(result.ok, true); assert.match(result.feedback.details[0], /不扣分/);
  let state = copy(result.state); assert.equal(B.validateState(state), true);
  let progress = B.getSummary(state, 'u03').progress[puzzle.id];
  assert.equal(progress.attempts, 1); assert.equal(progress.hintsShown, 1); assert.deepEqual(progress.lastAnswer, wrong);
  result = B.hint(state, 'u03', puzzle.id); assert.equal(result.ok, true); state = result.state;
  const extraHint = B.hint(state, 'u03', puzzle.id); assert.equal(extraHint.changed, false);
  result = submit(state, 'u03', puzzle.id, correctSort(puzzle));
  assert.equal(result.correct, true); assert.equal(result.awarded.points, 10);
  progress = B.getSummary(result.state, 'u03').progress[puzzle.id]; assert.equal(progress.attempts, 2); assert.equal(progress.hintsShown, 2);
});

test('empty, partial, duplicate-card, unknown-card and invalid-category answers do not create attempts', () => {
  let state = started(); const puzzle = C.getChapter('u03').puzzles[0];
  for (const value of [null, {}, [], { ...correctSort(puzzle), extra: 'pending' }, { ...correctSort(puzzle), scope: 'whatever' }]) {
    const result = B.answer(state, 'u03', puzzle.id, value); assert.equal(result.ok, false); assert.equal(result.state, state);
  }
  state = started('u03', 'u03-handover-quest');
  for (const value of [[], ['scope', 'time'], ['scope', 'scope', 'contact', 'summary', 'followup'], ['scope', 'time', 'contact', 'summary', 'unknown']]) assert.equal(B.answer(state, 'u03', 'u03-handover', value).ok, false);
  state = started('u03', 'u03-support-quest');
  for (const value of [[], ['scope', 'scope'], ['secret'], { score: 99 }]) assert.equal(B.answer(state, 'u03', 'u03-support', value).ok, false);
  assert.equal(B.getSummary(state).puzzles, 0);
});

test('two valid dependency orders and two resource plans are accepted equally', () => {
  const first = ['scope', 'time', 'contact', 'summary', 'followup'], second = ['scope', 'contact', 'time', 'summary', 'followup'];
  for (const answer of [first, second]) {
    const result = submit(started('u03', 'u03-handover-quest'), 'u03', 'u03-handover', answer);
    assert.equal(result.correct, true); assert.equal(result.awarded.points, 10);
  }
  const wrongOrder = submit(started('u03', 'u03-handover-quest'), 'u03', 'u03-handover', [...first].reverse());
  assert.equal(wrongOrder.correct, false); assert.ok(wrongOrder.feedback.details.length > 0);
  for (const answer of [['scope', 'queue', 'contact', 'followup'], ['scope', 'queue', 'bundle']]) {
    const result = submit(started('u03', 'u03-support-quest'), 'u03', 'u03-support', answer);
    assert.equal(result.correct, true); assert.equal(result.awarded.points, 12);
  }
});

test('resource plan reports missing requirements and budget overflow separately', () => {
  const state = started('u03', 'u03-support-quest');
  const missing = submit(state, 'u03', 'u03-support', ['scope']); assert.equal(missing.correct, false); assert.ok(missing.feedback.details.some(s => /尚缺/.test(s)));
  const over = submit(state, 'u03', 'u03-support', ['scope', 'queue', 'contact', 'followup', 'banner']);
  assert.equal(over.correct, false); assert.ok(over.feedback.details.some(s => /上限是 6/.test(s)));
});

test('unstarted, cross-chapter, malformed, and stale operations are rejected without mutation', () => {
  const state = B.createState(), puzzle = C.getChapter('u03').puzzles[0];
  assert.equal(B.answer(state, 'u03', puzzle.id, correctSort(puzzle)).code, 'not-started');
  assert.equal(B.hint(state, 'u03', puzzle.id).code, 'not-started');
  assert.equal(B.interact(state, 'u99', 'u03-quest').code, 'chapter');
  assert.equal(B.interact(state, 'u02', 'u03-quest').code, 'target');
  const first = B.interact(state, 'u03', 'u03-quest');
  const stale = B.interact(first.state, 'u03', 'u03-egg', { token: 0 }); assert.equal(stale.code, 'stale'); assert.equal(stale.state, first.state);
  assert.equal(B.interact(first.state, 'u03', 'u03-egg', { id: 'private name@email' }).ok, false);
  assert.equal(B.interact(first.state, 'u03', 'u03-egg', { unsupported: true }).ok, false);
});

test('duplicate event IDs are idempotent even with old token; changed payload is a conflict', () => {
  const first = B.interact(B.createState(), 'u03', 'u03-egg', { id: 'demo-1' });
  const duplicate = B.transition(first.state, first.event);
  assert.equal(duplicate.ok, true); assert.equal(duplicate.duplicate, true); assert.equal(duplicate.awarded.points, 0); assert.equal(duplicate.state, first.state);
  const conflict = B.transition(first.state, { ...first.event, targetId: 'u03-quest' });
  assert.equal(conflict.ok, false); assert.equal(conflict.code, 'event-conflict');
  const newIdSameDiscovery = B.interact(first.state, 'u03', 'u03-egg', { id: 'demo-2' });
  assert.equal(newIdSameDiscovery.changed, false); assert.equal(B.getSummary(newIdSameDiscovery.state).points, 3);
});

test('same incorrect answer and replay after success cannot farm attempts or awards', () => {
  const puzzle = C.getChapter('u03').puzzles[0], wrong = correctSort(puzzle); wrong.scope = 'pending';
  let result = submit(started(), 'u03', puzzle.id, wrong);
  const twice = B.answer(result.state, 'u03', puzzle.id, wrong, { id: 'different-id' });
  assert.equal(twice.changed, false); assert.equal(B.getSummary(twice.state).progress[puzzle.id].attempts, 1);
  result = submit(result.state, 'u03', puzzle.id, correctSort(puzzle));
  const practice = B.answer(result.state, 'u03', puzzle.id, wrong, { id: 'practice-id' });
  assert.equal(practice.ok, true); assert.equal(practice.practice, true); assert.equal(practice.correct, false); assert.equal(practice.changed, false);
  assert.equal(B.getSummary(practice.state).points, 10);
});

test('replay validates events, ignores client score fields, and returns an atomic-commit boundary', () => {
  const result = B.interact(B.createState(), 'u03', 'u03-egg');
  const envelope = B.exportEvents(result.state);
  const replay = B.replayEvents(envelope); assert.equal(replay.ok, true); assert.equal(replay.summary.points, 3);
  const claims = copy(envelope); claims.score = 999; assert.equal(B.replayEvents(claims).ok, false);
  const badEvent = copy(result.event); badEvent.id = 'fake-score'; badEvent.payload = { score: 999 };
  const mixed = B.replayEvents([result.event, badEvent]); assert.equal(mixed.ok, false); assert.equal(mixed.rejectedIndex, 1);
  assert.equal(mixed.accepted, 0); assert.equal(B.getSummary(mixed.state).points, 0); // Batch failure returns the untouched initial state.
  assert.equal(B.getSummary(result.state).points, 3);
});

test('server merge can rebase independent device event histories against trusted state, with no duplicate awards', () => {
  const a = B.interact(B.createState(), 'u03', 'u03-egg');
  const b = B.interact(B.createState(), 'u02', 'u02-egg');
  assert.equal(B.replayEvents([b.event], { initialState: a.state }).ok, false);
  const merged = B.replayEvents([b.event, a.event], { initialState: a.state, rebase: true });
  assert.equal(merged.ok, true); assert.equal(merged.accepted, 1); assert.equal(merged.duplicates, 1); assert.equal(merged.summary.points, 6);
  const retry = B.replayEvents([b.event, a.event], { initialState: merged.state, rebase: true });
  assert.equal(retry.ok, true); assert.equal(retry.accepted, 0); assert.equal(retry.summary.points, 6);
});

test('unknown or future versions, forged aggregates, duplicate history, invalid revision and unsafe keys are rejected', () => {
  const state = B.interact(B.createState(), 'u03', 'u03-egg').state;
  const invalid = [ { ...copy(state), version: 2 }, { ...copy(state), contentVersion: 'future' }, { ...copy(state), score: 100 }, { ...copy(state), revision: 5 },
    { ...copy(state), events: [...copy(state.events), copy(state.events[0])], revision: 2 }, JSON.parse('{"__proto__":{"polluted":true}}') ];
  for (const item of invalid) assert.throws(() => B.validateState(item));
  assert.equal({}.polluted, undefined); assert.equal(B.getSummary(state).points, 3);
  const tooMany = { ...B.createState(), revision: B.MAX_EVENTS + 1, events: Array(B.MAX_EVENTS + 1).fill(null) };
  assert.throws(() => B.validateState(tooMany), /數量/);
});

test('personal leaderboard derives deterministic dense ties with no names, identities, speed or moral metric', () => {
  let state = B.interact(B.createState(), 'u03', 'u03-egg').state;
  state = B.interact(state, 'u02', 'u02-egg').state;
  const collection = B.getLeaderboard(state, 'collection'); assert.equal(collection.scope, 'personal-local');
  assert.equal(collection.rows[0].chapterId, 'u02'); assert.equal(collection.rows[0].rank, 1); assert.equal(collection.rows[1].rank, 1); assert.equal(collection.rows[2].rank, 2);
  assert.equal(B.getLeaderboard(state, 'exploration').rows[0].score, 50);
  assert.equal(B.getLeaderboard(state, 'puzzles').metric, 'puzzle');
  assert.throws(() => B.getLeaderboard(state, 'fastest')); assert.throws(() => B.getLeaderboard(state, 'morality'));
  for (const row of collection.rows) for (const key of ['studentId', 'name', 'nickname', 'email', 'duration', 'reflection']) assert.equal(own(row, key), false);
});

test('browser UMD globals operate without module loader, DOM, fetch, Date or storage', () => {
  const context = vm.createContext({});
  for (const file of ['js/data/rpg_bonus_content.js', 'js/engine/rpg_bonus.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  assert.equal(vm.runInContext('RPGBonusContent.chapters.length', context), 13);
  assert.equal(vm.runInContext("RPGBonus.getSummary(RPGBonus.interact(RPGBonus.createState(), 'u03', 'u03-egg').state).points", context), 3);
  assert.equal(vm.runInContext('RPGBonus.validateState(RPGBonus.createState())', context), true);
});

test('sparse arrays and array metadata cannot earn awards or poison a saved history', () => {
  const state = started('u03', 'u03-handover-quest');
  const sparse = [, 'time', 'contact', 'summary', 'followup'];
  const result = B.answer(state, 'u03', 'u03-handover', sparse);
  assert.equal(result.ok, false); assert.equal(result.state, state); assert.equal(B.validateState(result.state), true);
  const direct = { id: 'sparse', type: 'answer', chapterId: 'u03', targetId: 'u03-handover', payload: { answer: sparse }, token: state.revision };
  assert.equal(B.transition(state, direct).ok, false);
  assert.equal(B.replayEvents([direct], { initialState: state }).ok, false);
  const decorated = ['scope', 'time', 'contact', 'summary', 'followup']; decorated.score = 999;
  assert.equal(B.answer(state, 'u03', 'u03-handover', decorated).ok, false);
  const sparseHistory = { ...copy(state), events: Array(1) }; assert.throws(() => B.validateState(sparseHistory));
});

test('a long atomic batch handles set-equivalent resource answers without attempt farming', () => {
  const state = started('u03', 'u03-support-quest');
  const ids = ['scope', 'queue', 'contact', 'followup', 'bundle', 'banner'];
  const permutations = values => values.length === 1 ? [values] : values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map(rest => [value, ...rest]));
  const events = permutations(ids).map((answer, i) => ({ id: 'long-' + i, type: 'answer', chapterId: 'u03', targetId: 'u03-support', payload: { answer }, token: state.revision + i }));
  const replay = B.replayEvents(events, { initialState: state, rebase: true });
  assert.equal(replay.ok, true); assert.equal(replay.accepted, 1); assert.equal(replay.duplicates, 719); assert.equal(replay.summary.points, 0);
  assert.equal(B.validateState(copy(replay.state)), true);
  assert.equal(replay.summary.progress['u03-support'].attempts, 1);
});

test('success and atomic failure never freeze or otherwise mutate caller-owned loaded state', () => {
  const original = copy(started());
  const before = copy(original);
  const event = { id: 'second', type: 'interact', chapterId: 'u03', targetId: 'u03-egg', payload: {}, token: original.revision };
  const successful = B.transition(original, event); assert.equal(successful.ok, true);
  assert.equal(Object.isFrozen(original), false); assert.equal(Object.isFrozen(original.events[0]), false); assert.deepEqual(original, before);
  const bad = { id: 'invalid-after-valid', type: 'interact', chapterId: 'u03', targetId: 'not-a-marker', payload: {}, token: original.revision + 1 };
  const failed = B.replayEvents([event, bad], { initialState: original }); assert.equal(failed.ok, false);
  assert.equal(failed.state, original); assert.equal(Object.isFrozen(original.events[0]), false); assert.deepEqual(original, before);
  const replay = B.replayEvents([event], { initialState: original }); assert.equal(replay.ok, true);
  assert.equal(Object.isFrozen(original.events[0]), false); assert.ok(Object.isFrozen(replay.state.events[0]));
});

test('explicit invalid initial states and explicit invalid IDs are never silently replaced', () => {
  for (const initialState of [false, null, 0, '', undefined, {}]) assert.equal(B.replayEvents([], { initialState }).ok, false);
  for (const id of ['', null, false, 0]) assert.equal(B.interact(B.createState(), 'u03', 'u03-egg', { id }).ok, false);
  assert.equal(B.replayEvents([]).ok, true);
});

test('mixed successful operations always return a valid replayable state with bounded awards', () => {
  let state = B.createState(), seed = 32948;
  const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let i = 0; i < 180; i++) {
    const ch = C.chapters[random(C.chapters.length)], marker = ch.markers[random(ch.markers.length)];
    let result = B.interact(state, ch.id, marker.id, { id: 'probe-interact-' + i });
    if (result.ok) state = result.state;
    if (marker.puzzleId) {
      const p = ch.puzzles.find(p => p.id === marker.puzzleId);
      let value = solution(p);
      if (random(3) === 0) value = p.kind === 'evidence-sort' ? Object.fromEntries(p.cards.map(card => [card.id, p.categories[random(p.categories.length)].id])) : p.kind === 'dependency-order' ? [...value].reverse() : [p.choices[random(p.choices.length)].id];
      result = random(5) === 0 ? B.hint(state, ch.id, p.id) : B.answer(state, ch.id, p.id, value, { id: 'probe-answer-' + i });
      if (result.ok) state = result.state;
    }
    assert.equal(B.validateState(state), true);
    const replay = B.replayEvents(B.exportEvents(state)); assert.equal(replay.ok, true);
    assert.deepEqual(replay.summary, B.getSummary(state)); assert.ok(replay.summary.points <= 191);
  }
});
