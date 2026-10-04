'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Core = require('../collector/core');
const Engine = require('../js/engine/rpg_engine');
const Data = require('../js/data/rpg_chapters');
const copy = value => JSON.parse(JSON.stringify(value));
const sha256 = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const now = new Date('2026-10-06T06:15:00.000Z');
const session = { id: 'synthetic-only-cap-check', chapterId: 'u03',
  opensAt: '2026-10-06T13:30:00+08:00', closesAt: '2026-10-06T15:20:00+08:00', maxEvents: 2, maxStudentEvents: 1 };

function completeAttempt() {
  const chapter = Data.chapters[2];
  const ok = result => { assert.equal(result.ok, true, result.message); return result.state; };
  let state = ok(Engine.begin(Engine.createState(chapter), chapter));
  function walk(target) {
    const queue = [{ x: state.player.x, y: state.player.y, steps: [] }], seen = new Set();
    for (let index = 0; index < queue.length; index++) {
      const tile = queue[index], key = tile.x + ',' + tile.y;
      if (seen.has(key) || tile.x < 0 || tile.x >= chapter.map.width || tile.y < 0 || tile.y >= chapter.map.height ||
          chapter.map.walls.some(w => tile.x >= w.x && tile.x < w.x + w.w && tile.y >= w.y && tile.y < w.y + w.h)) continue;
      seen.add(key);
      if (Math.abs(tile.x - target.x) + Math.abs(tile.y - target.y) <= 1) {
        for (const [dx, dy] of tile.steps) state = ok(Engine.move(state, chapter, dx, dy));
        return;
      }
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) queue.push({ x: tile.x + dx, y: tile.y + dy, steps: [...tile.steps, [dx, dy]] });
    }
    assert.fail('Trusted chapter marker unreachable');
  }
  for (const clue of chapter.clues) { walk(clue); state = ok(Engine.interact(state, chapter, clue.id)); }
  walk(chapter.map.gate); state = ok(Engine.interact(state, chapter, 'gate'));
  state = ok(Engine.choosePath(state, chapter, chapter.scenario.paths[0].id));
  while (state.phase === 'tactics') {
    const unit = state.tactical.units.find(item => !state.tactical.used.includes(item.id));
    state = ok(Engine.wait(state, chapter, { token: state.revision, unitId: unit.id }));
  }
  state = ok(Engine.interact(state, chapter, 'review'));
  state = ok(Engine.setReflection(state, chapter, { reason: 'Synthetic source explains the resource tradeoff.', revision: 'Synthetic new information changes the choice.' }));
  return ok(Engine.complete(state, chapter));
}
const attempt = completeAttempt();
function payload(number = 1, id = 'SYNTHETIC-ONLY-001') {
  return { format: Core.FORMAT, version: 1, eventId: '00000000-0000-4000-8000-' + String(number).padStart(12, '0'),
    sessionId: session.id, student: { id, name: 'Synthetic test participant' }, attempt: copy(attempt) };
}
function dependencies() {
  const rows = [], actions = [];
  const lock = { held: false, tryLock() { if (this.held) return false; actions.push('lock'); this.held = true; return true; },
    releaseLock() { assert.equal(this.held, true); this.held = false; actions.push('release'); } };
  function locked() { assert.equal(lock.held, true); }
  const store = {
    findByEventId(id) { locked(); actions.push('find'); return rows.find(row => row[0] === id) || null; },
    countEvents(sessionId, studentId) { locked(); actions.push('count'); const selected = rows.filter(row => row[3] === sessionId);
      return { sessionEvents: selected.length, studentEvents: selected.filter(row => row[4] === Core.safeCell(studentId)).length }; },
    append(row) { locked(); actions.push('append'); rows.push(copy(row)); return rows.length; },
    flush() { locked(); actions.push('flush'); },
    read(number) { locked(); actions.push('read'); return copy(rows[number - 1]); }
  };
  return { config: { enabled: true, sessions: [copy(session)] }, engine: Engine, data: Data, sha256, now: () => now,
    rows, actions, lock, store };
}
function accept(value, deps) { return Core.accept(JSON.stringify(value), deps); }
function rejects(value, deps, code) { assert.throws(() => accept(value, deps), error => error.code === code); }

test('safe defaults and configured event limits reject noninteger, zero and excessive settings', () => {
  assert.deepEqual(Core.eventLimits({}), { maxEvents: 500, maxStudentEvents: 3 });
  assert.deepEqual(Core.eventLimits({ maxEvents: 1 }), { maxEvents: 1, maxStudentEvents: 1 });
  for (const bad of [{ maxEvents: 0 }, { maxEvents: 10001 }, { maxEvents: '2' }, { maxEvents: 1.5 },
    { maxStudentEvents: 0 }, { maxStudentEvents: 101 }, { maxEvents: 2, maxStudentEvents: 3 }]) {
    const deps = dependencies(); Object.assign(deps.config.sessions[0], bad);
    rejects(payload(), deps, 'SESSION_CONFIGURATION_INVALID'); assert.deepEqual(deps.actions, []);
  }
});
test('per-student event limit rejects new IDs but permits another self-declared ID within the class cap', () => {
  const deps = dependencies(); assert.equal(accept(payload(), deps).ok, true);
  rejects(payload(2), deps, 'STUDENT_EVENT_LIMIT'); assert.equal(deps.rows.length, 1);
  const next = accept(payload(3, 'SYNTHETIC-ONLY-002'), deps);
  assert.equal(next.reviewStatus, 'pending_teacher_review'); assert.equal(deps.rows.length, 2);
});
test('session cap holds even when self-declared student IDs change and last-slot operations stay locked', () => {
  const deps = dependencies(); accept(payload(), deps); accept(payload(2, 'SYNTHETIC-ONLY-002'), deps);
  rejects(payload(3, 'SYNTHETIC-ONLY-003'), deps, 'SESSION_EVENT_LIMIT'); assert.equal(deps.rows.length, 2);
  assert.deepEqual(deps.actions.slice(0, 7), ['lock', 'find', 'count', 'append', 'flush', 'read', 'release']);
  assert.equal(deps.lock.held, false);
});
test('same event recovers its original receipt after caps and time window close without counting or appending', () => {
  const deps = dependencies(), first = accept(payload(), deps); accept(payload(2, 'SYNTHETIC-ONLY-002'), deps);
  deps.now = () => new Date('2026-10-07T06:00:00Z'); deps.actions.length = 0;
  const retry = accept(payload(), deps);
  assert.equal(retry.duplicate, true); assert.equal(retry.serverReceivedAt, first.serverReceivedAt);
  assert.deepEqual(deps.actions, ['lock', 'find', 'release']); assert.equal(deps.rows.length, 2);
});
test('conflicting event content is rejected before quota or receipt disclosure', () => {
  const deps = dependencies(); accept(payload(), deps); const changed = payload(); changed.student.name = 'Another synthetic name';
  deps.actions.length = 0; rejects(changed, deps, 'EVENT_ID_CONFLICT');
  assert.deepEqual(deps.actions, ['lock', 'find', 'release']); assert.equal(deps.rows.length, 1);
});
test('persisted row consumes a slot when readback fails and identical retry recovers it instead of adding a second', () => {
  const deps = dependencies(), read = deps.store.read;
  deps.store.read = () => { throw new Error('Synthetic transport failure'); };
  assert.throws(() => accept(payload(), deps), /Synthetic transport failure/); assert.equal(deps.rows.length, 1);
  deps.store.read = read; assert.equal(accept(payload(), deps).duplicate, true); assert.equal(deps.rows.length, 1);
});
test('missing, failed or malformed counts fail closed without appending or keeping the lock', () => {
  for (const count of [undefined, () => { throw new Error('Synthetic quota lookup failure'); }, () => ({}),
    () => ({ sessionEvents: -1, studentEvents: 0 }), () => ({ sessionEvents: 1, studentEvents: 2 }),
    () => ({ sessionEvents: 0.5, studentEvents: 0 })]) {
    const deps = dependencies(); deps.store.countEvents = count;
    assert.throws(() => accept(payload(), deps)); assert.equal(deps.rows.length, 0); assert.equal(deps.lock.held, false);
  }
});
test('wrong or missing classroom code fails before trusted replay, lock or Sheets access', () => {
  const deps = dependencies(), code = crypto.randomUUID(); deps.config.accessCodeHashes = { [session.id]: sha256(code) };
  let replays = 0; deps.engine = { validateState() { replays++; throw new Error('must not replay'); } };
  rejects(payload(), deps, 'ACCESS_CODE_REQUIRED'); deps.accessCode = crypto.randomUUID(); rejects(payload(), deps, 'ACCESS_CODE_INVALID');
  assert.equal(replays, 0); assert.deepEqual(deps.actions, []); assert.equal(deps.rows.length, 0);
});
test('correct code stays outside payload, row, public receipt and transport retry identity', () => {
  const deps = dependencies(), code = crypto.randomUUID(); deps.config.accessCodeHashes = { [session.id]: sha256(code).toUpperCase() };
  deps.accessCode = ' ' + code + ' '; const value = payload(); const receipt = accept(value, deps);
  for (const serialized of [JSON.stringify(value), JSON.stringify(deps.rows), JSON.stringify(receipt), Core.renderReceipt(receipt)]) {
    assert.equal(serialized.includes(code), false); assert.equal(serialized.includes(sha256(code)), false);
  }
  assert.equal(receipt.reviewStatus, 'pending_teacher_review'); assert.equal(accept(value, deps).duplicate, true);
});
test('secret configuration and transport shape reject unknown sessions, invalid hashes and control characters', () => {
  for (const hashes of [[], { unknown: 'f'.repeat(64) }, { [session.id]: 'not-a-digest' }]) {
    const deps = dependencies(); deps.config.accessCodeHashes = hashes;
    rejects(payload(), deps, 'ACCESS_CONFIGURATION_INVALID'); assert.deepEqual(deps.actions, []);
  }
  for (const code of [null, {}, 'a'.repeat(129), 'a\nb']) {
    const deps = dependencies(); deps.accessCode = code;
    rejects(payload(), deps, 'ACCESS_CODE_INVALID'); assert.deepEqual(deps.actions, []);
  }
  const deps = dependencies(), value = payload(); value.accessCode = crypto.randomUUID();
  rejects(value, deps, 'INVALID_PAYLOAD'); assert.equal(deps.rows.length, 0);
});
test('RAW row comparison never accepts a stripped apostrophe or an altered typed cell', () => {
  assert.equal(Core.rowMatches(["'=1+1", '00123', true], ["'=1+1", '00123', true]), true);
  assert.equal(Core.rowMatches(["'=1+1"], ['=1+1']), false);
  assert.equal(Core.rowMatches(['00123'], [123]), false);
  assert.equal(Core.rowMatches([true], ['true']), false);
});
