'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const Core = require('../collector/core.js');
const ReceiptClient = require('../js/receipt_client.js');
const Engine = require('../js/engine/rpg_engine.js');
const Data = require('../js/data/rpg_chapters.js');

const NOW = new Date('2026-10-06T06:15:00.000Z');
const CONFIG = { enabled: true, sessions: [{ id: 'synthetic-only-20261006', chapterId: 'u03',
  opensAt: '2026-10-06T13:30:00+08:00', closesAt: '2026-10-06T15:20:00+08:00' }] };
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
function ok(result) { assert.equal(result.ok, true, result.message); return result.state; }
function walkNear(state, chapter, target) {
  const queue = [{ x: state.player.x, y: state.player.y, steps: [] }], seen = new Set();
  const blocked = (x, y) => x < 0 || x >= chapter.map.width || y < 0 || y >= chapter.map.height ||
    chapter.map.walls.some(w => x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h);
  for (let i = 0; i < queue.length; i++) {
    const tile = queue[i], key = tile.x + ',' + tile.y;
    if (seen.has(key) || blocked(tile.x, tile.y)) continue;
    seen.add(key);
    if (Math.abs(tile.x - target.x) + Math.abs(tile.y - target.y) <= 1) {
      for (const [dx, dy] of tile.steps) state = ok(Engine.move(state, chapter, dx, dy));
      return state;
    }
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      queue.push({ x: tile.x + dx, y: tile.y + dy, steps: [...tile.steps, [dx, dy]] });
    }
  }
  assert.fail('Real trusted chapter marker must be reachable.');
}
function completed(chapterId = 'u03') {
  const chapter = Data.chapters.find(item => item.id === chapterId);
  let state = ok(Engine.begin(Engine.createState(chapter), chapter));
  for (const clue of chapter.clues) {
    state = walkNear(state, chapter, clue);
    state = ok(Engine.interact(state, chapter, clue.id));
  }
  state = walkNear(state, chapter, chapter.map.gate);
  state = ok(Engine.interact(state, chapter, 'gate'));
  state = ok(Engine.choosePath(state, chapter, chapter.scenario.paths[0].id));
  while (state.phase === 'tactics') {
    const unit = state.tactical.units.find(item => !state.tactical.used.includes(item.id));
    state = ok(Engine.wait(state, chapter, { token: state.revision, unitId: unit.id }));
  }
  state = ok(Engine.interact(state, chapter, 'review'));
  state = ok(Engine.setReflection(state, chapter, { reason: 'Synthetic fixture: source supports checking consent.',
    revision: 'Synthetic fixture: revise after new evidence.' }));
  state = ok(Engine.complete(state, chapter));
  assert.equal(Engine.validateState(state, chapter), true);
  return state;
}
const COMPLETE = completed();
function payload() {
  return { format: Core.FORMAT, version: 1,
    eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sessionId: CONFIG.sessions[0].id,
    student: { id: 'SYNTHETIC-ONLY-001', name: 'Synthetic Student' }, attempt: copy(COMPLETE) };
}
function dependencies(options = {}) {
  const rows = [], actions = [], lock = { locked: false,
    tryLock() { actions.push('lock'); if (options.lockFails) return false; this.locked = true; return true; },
    releaseLock() { actions.push('release'); this.locked = false; } };
  const store = {
    findByEventId(id) { assert.equal(lock.locked, true); actions.push('find'); return rows.find(row => row[0] === id) || null; },
    countEvents(sessionId, studentId) { assert.equal(lock.locked, true); actions.push('count'); return { sessionEvents: rows.filter(row => row[3] === sessionId).length, studentEvents: rows.filter(row => row[3] === sessionId && row[4] === Core.safeCell(studentId)).length }; },
    append(row) { assert.equal(lock.locked, true); actions.push('append'); if (options.appendFails) throw new Error('write failed'); rows.push(copy(row)); return rows.length; },
    flush() { assert.equal(lock.locked, true); actions.push('flush'); if (options.flushFails) throw new Error('flush failed'); },
    read(number) { assert.equal(lock.locked, true); actions.push('read'); if (options.readFails) throw new Error('read failed');
      const row = copy(rows[number - 1]); if (options.corruptReadback) row[2] = 'not persisted'; return row; }
  };
  return { config: copy(CONFIG), engine: Engine, data: Data, sha256,
    now: () => options.now || NOW, lock, store, rows, actions };
}
function accept(value, deps = dependencies()) { return Core.accept(JSON.stringify(value), deps); }
function rejects(value, code, deps = dependencies()) {
  assert.throws(() => accept(value, deps), error => error.code === code);
  assert.equal(deps.rows.length, 0, 'Rejected requests must not append game records.');
}

test('trusted replay accepts a completed tactical failure with both reflections; receipt follows append flush readback', () => {
  const deps = dependencies();
  assert.equal(COMPLETE.tactical.result.success, false);
  const receipt = accept(payload(), deps);
  assert.deepEqual(deps.actions, ['lock', 'find', 'count', 'append', 'flush', 'read', 'release']);
  assert.deepEqual(receipt, { ok: true, eventId: payload().eventId, serverReceivedAt: NOW.toISOString(),
    reviewStatus: 'pending_teacher_review', duplicate: false });
  assert.equal(deps.rows[0][7], true); assert.equal(deps.rows[0][8], true);
  assert.equal(deps.rows[0][9], false); assert.equal(deps.rows[0][10], 'pending_teacher_review');
  assert.equal(deps.rows[0][12], COMPLETE.reflection.reason);
  assert.deepEqual(JSON.parse(deps.rows[0][14]), COMPLETE);
  assert.equal('student' in receipt, false); assert.equal('attempt' in receipt, false);
});

test('completion booleans, fake phase, unfinished state and missing same-attempt reflection cannot establish eligibility', () => {
  let value = payload(); value.completed = true; rejects(value, 'INVALID_PAYLOAD');
  value = payload(); value.attempt = Engine.createState(Data.chapters[2]); rejects(value, 'ATTEMPT_INCOMPLETE');
  value = payload(); value.attempt.phase = 'review'; value.attempt.completedAt = null; rejects(value, 'ATTEMPT_INCOMPLETE');
  for (const field of ['reason', 'revision']) {
    value = payload(); value.attempt.reflection[field] = '  \n\t  '; rejects(value, 'INVALID_ATTEMPT');
  }
  value = payload(); value.attempt.tactical.log = []; rejects(value, 'INVALID_ATTEMPT');
  value = payload(); value.attempt.clues.pop(); rejects(value, 'INVALID_ATTEMPT');
});

test('server chapter definitions reject forged resources/results even if client marks completion', () => {
  for (const mutate of [state => state.tactical.resources.time++, state => state.tactical.result.success = true,
    state => state.tactical.flags.push('fabricated'), state => state.revision = 1]) {
    const value = payload(); mutate(value.attempt); rejects(value, 'INVALID_ATTEMPT');
  }
});

test('all 13 trusted chapter definitions are usable; assigned chapter mismatch is rejected', () => {
  for (const chapter of Data.chapters) {
    const value = payload(), deps = dependencies();
    value.attempt = completed(chapter.id); deps.config.sessions[0].chapterId = chapter.id;
    assert.equal(accept(value, deps).ok, true);
  }
  const value = payload(); value.attempt = completed('u04'); rejects(value, 'WRONG_CHAPTER');
});

test('only explicit server configuration enables sessions; no first/demo chapter or unknown session fallback', () => {
  const value = payload(); value.sessionId = 'unconfigured'; rejects(value, 'UNKNOWN_SESSION');
  for (const configuration of [{ enabled: false, sessions: CONFIG.sessions }, { enabled: true, sessions: [] },
    { enabled: true, sessions: [{ ...CONFIG.sessions[0], chapterId: 'u99' }] },
    { enabled: true, sessions: [{ ...CONFIG.sessions[0], opensAt: 'today' }] },
    { enabled: true, sessions: [CONFIG.sessions[0], CONFIG.sessions[0]] }]) {
    const deps = dependencies(); deps.config = configuration;
    assert.throws(() => accept(payload(), deps)); assert.deepEqual(deps.actions, []);
  }
});

test('server receipt time governs the configured window; client completion timestamp is explicitly untrusted', () => {
  rejects(payload(), 'SESSION_NOT_OPEN', dependencies({ now: new Date('2026-10-06T05:29:59Z') }));
  rejects(payload(), 'SESSION_CLOSED', dependencies({ now: new Date('2026-10-06T07:20:01Z') }));
  for (const boundary of ['2026-10-06T05:30:00Z', '2026-10-06T07:20:00Z']) assert.equal(accept(payload(), dependencies({ now: new Date(boundary) })).ok, true);
  const value = payload(); value.attempt.completedAt = '2020-01-01T00:00:00.000Z';
  const deps = dependencies(); const receipt = accept(value, deps);
  assert.equal(receipt.serverReceivedAt, NOW.toISOString()); assert.equal(deps.rows[0][11], value.attempt.completedAt);
  assert.equal(receipt.reviewStatus, 'pending_teacher_review', 'Replay does not prove when/how the person played.');
});

test('same event and canonical payload is idempotent, including a retry after the submission window', () => {
  const value = payload(), deps = dependencies(), first = accept(value, deps);
  const reordered = Object.fromEntries(Object.entries(value).reverse());
  reordered.eventId = reordered.eventId.toUpperCase();
  deps.now = () => new Date('2026-10-06T08:00:00Z');
  const second = accept(reordered, deps);
  assert.equal(second.duplicate, true); assert.equal(second.serverReceivedAt, first.serverReceivedAt);
  assert.equal(deps.rows.length, 1); assert.equal(deps.actions.filter(action => action === 'append').length, 1);
});

test('same event with a different valid identity or reflection is rejected as a conflict', () => {
  for (const change of [value => value.student.id = 'SYNTHETIC-ONLY-002', value => value.attempt.reflection.reason = 'Another synthetic reflection.']) {
    const value = payload(), deps = dependencies(); accept(value, deps); change(value);
    assert.throws(() => accept(value, deps), error => error.code === 'EVENT_ID_CONFLICT');
    assert.equal(deps.rows.length, 1); assert.equal(deps.lock.locked, false);
  }
});

test('busy lock prevents writes; append, flush, read and readback failures never produce success and release lock', () => {
  const busy = dependencies({ lockFails: true }); rejects(payload(), 'COLLECTOR_BUSY', busy);
  assert.deepEqual(busy.actions, ['lock']);
  for (const option of ['appendFails', 'flushFails', 'readFails', 'corruptReadback']) {
    const deps = dependencies({ [option]: true }); assert.throws(() => accept(payload(), deps));
    assert.equal(deps.lock.locked, false); assert.equal(deps.actions.at(-1), 'release');
  }
});

test('retry after uncertain flush/read response reuses already persisted event rather than duplicating it', () => {
  const deps = dependencies({ readFails: true }), value = payload();
  assert.throws(() => accept(value, deps)); assert.equal(deps.rows.length, 1);
  const recovered = accept(value, deps);
  assert.equal(recovered.duplicate, true); assert.equal(deps.rows.length, 1);
});

test('a corrupted persisted row cannot become a success receipt on retry after an uncertain first response', () => {
  const deps = dependencies({ readFails: true }), value = payload();
  assert.throws(() => accept(value, deps)); assert.equal(deps.rows.length, 1);
  deps.rows[0][12] = 'Corrupted reflection stored during uncertain write.';
  assert.throws(() => accept(value, deps), error => error.code === 'RECEIPT_READBACK_FAILED');
  assert.equal(deps.rows.length, 1); assert.equal(deps.lock.locked, false);
});

test('persisted server receipt timestamp must remain a strict timestamp inside the configured session', () => {
  for (const replacement of ['2026-10-06T08:00:00.000Z', 'not a timestamp', 'October 6, 2026 14:15:00 GMT+0800']) {
    const deps = dependencies(), value = payload(); accept(value, deps); deps.rows[0][2] = replacement;
    assert.throws(() => accept(value, deps)); assert.equal(deps.rows.length, 1);
  }
});

test('identity, protocol, UUID and payload limits are validated before any Sheet operations', () => {
  for (const mutate of [value => value.student.id = '', value => value.student.name = '\u0000bad',
    value => value.student.id = 'a'.repeat(81), value => value.student = { id: 'synthetic' },
    value => value.student.email = 'synthetic@example.invalid']) {
    const value = payload(); mutate(value); rejects(value, 'INVALID_IDENTITY');
  }
  const value = payload(); value.eventId = 'client-arbitrary-id'; rejects(value, 'INVALID_EVENT_ID');
  value.eventId = payload().eventId; value.format = 'old3d'; rejects(value, 'UNSUPPORTED_FORMAT');
  const deps = dependencies(); assert.throws(() => Core.accept('x'.repeat(60001), deps), error => error.code === 'PAYLOAD_TOO_LARGE');
  assert.deepEqual(deps.actions, []);
  const tooLarge = payload(); tooLarge.attempt.reflection.reason = 'x'.repeat(45001);
  rejects(tooLarge, 'ATTEMPT_TOO_LARGE');
});

test('formula strings are escaped for Sheets and HTML; receipt never renders student identity or reflections', () => {
  for (const input of ['=IMPORTXML("https://example.invalid")', '+SUM(1,2)', '-1+1', '@SUM(1,2)', '\t=1+1', ' \n=1+1']) {
    assert.equal(Core.safeCell(input), "'" + input);
  }
  const value = payload(); value.student.name = '=HYPERLINK("https://example.invalid")';
  value.attempt.reflection.reason = '=1+1'; value.attempt.reflection.revision = '<script>alert("synthetic")</script>';
  const deps = dependencies(), receipt = accept(value, deps);
  assert.equal(deps.rows[0][5][0], "'"); assert.equal(deps.rows[0][12], "'=1+1");
  const html = Core.renderReceipt(receipt);
  assert.equal(html.includes(value.student.name), false);
  assert.equal(html.includes(value.attempt.reflection.revision), false);
  assert.equal(Core.escapeHtml('<script>"&\''), '&lt;script&gt;&quot;&amp;&#39;');
});

test('Apps Script manifest declares drive.file only and enables Advanced Sheets v4 without deployment grants', () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../collector/appsscript.json'), 'utf8'));
  assert.deepEqual(manifest.oauthScopes, ['https://www.googleapis.com/auth/drive.file']);
  assert.deepEqual(manifest.dependencies.enabledAdvancedServices, [{ userSymbol: 'Sheets', serviceId: 'sheets', version: 'v4' }]);
  assert.equal(manifest.timeZone, 'Asia/Taipei'); assert.equal(manifest.runtimeVersion, 'V8');
  assert.equal('webapp' in manifest, false); assert.equal(manifest.exceptionLogging, 'NONE');
});

test('actual frontend prepareEvent protocol interoperates with trusted collector and persists one event on retry', () => {
  const items = new Map(), storage = {
    getItem: key => items.has(key) ? items.get(key) : null,
    setItem: (key, value) => items.set(key, value)
  };
  const options = {
    config: { enabled: true, collectorUrl: 'https://script.google.com/macros/s/SYNTHETIC_ONLY/exec',
      sessionId: CONFIG.sessions[0].id, assignedChapter: 'u03' },
    chapters: Data.chapters, student: { id: '001234', name: 'Synthetic Protocol Test' },
    attempt: copy(COMPLETE), consent: true, storage,
    eventIdFactory: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  };
  const first = ReceiptClient.prepareEvent(options), deps = dependencies();
  const receipt = Core.accept(JSON.stringify(first), deps);
  assert.equal(receipt.ok, true); assert.equal(receipt.eventId, first.eventId);
  assert.equal(deps.rows[0][4], '001234'); assert.equal(deps.rows[0][7], true); assert.equal(deps.rows[0][8], true);
  assert.equal(deps.rows[0][10], 'pending_teacher_review');
  options.eventIdFactory = () => { assert.fail('The frontend must reuse its persisted event ID on identical retry.'); };
  const repeated = ReceiptClient.prepareEvent(options), recovered = Core.accept(JSON.stringify(repeated), deps);
  assert.equal(repeated.eventId, first.eventId); assert.equal(recovered.duplicate, true);
  assert.equal(deps.rows.length, 1); assert.equal(recovered.serverReceivedAt, receipt.serverReceivedAt);
});

test('default per-session and per-identity limits reject new events while existing event recovery stays available', () => {
  const deps = dependencies(), value = payload();
  const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'];
  for (const eventId of ids.slice(0, 3)) { value.eventId = eventId; assert.equal(accept(value, deps).ok, true); }
  value.eventId = ids[3]; assert.throws(() => accept(value, deps), error => error.code === 'STUDENT_EVENT_LIMIT');
  assert.equal(deps.rows.length, 3); value.eventId = ids[0]; assert.equal(accept(value, deps).duplicate, true);
  const sessionFull = dependencies(); sessionFull.store.countEvents = () => ({ sessionEvents: 500, studentEvents: 0 });
  rejects(payload(), 'SESSION_EVENT_LIMIT', sessionFull);
});

test('invalid limits and malformed event-count contracts fail closed before append', () => {
  for (const change of [session => session.maxEvents = 0, session => session.maxEvents = 10001,
    session => session.maxEvents = 1.5, session => session.maxStudentEvents = 101,
    session => { session.maxEvents = 1; session.maxStudentEvents = 2; }]) {
    const deps = dependencies(); change(deps.config.sessions[0]); rejects(payload(), 'SESSION_CONFIGURATION_INVALID', deps);
    assert.deepEqual(deps.actions, []);
  }
  for (const counts of [null, {}, { sessionEvents: 1, studentEvents: 2 }, { sessionEvents: -1, studentEvents: 0 },
    { sessionEvents: 0.5, studentEvents: 0 }, { sessionEvents: '1', studentEvents: 0 }]) {
    const deps = dependencies(); deps.store.countEvents = () => counts; rejects(payload(), 'COLLECTOR_STORE_INVALID', deps);
    assert.equal(deps.lock.locked, false);
  }
});

test('optional shared class code is separate transport, checked before replay and never included in rows or digest', () => {
  const syntheticCode = crypto.randomUUID();
  for (const code of [undefined, '', crypto.randomUUID(), syntheticCode + '\u0000']) {
    const deps = dependencies(); deps.config.accessCodeHashes = { [CONFIG.sessions[0].id]: sha256(syntheticCode) }; deps.accessCode = code;
    deps.engine = { validateState() { assert.fail('Unauthorized access must be rejected before replay.'); } };
    assert.throws(() => accept(payload(), deps), error => ['ACCESS_CODE_REQUIRED', 'ACCESS_CODE_INVALID'].includes(error.code));
    assert.deepEqual(deps.actions, []);
  }
  const plain = dependencies(), protectedDeps = dependencies();
  protectedDeps.config.accessCodeHashes = { [CONFIG.sessions[0].id]: sha256(syntheticCode).toUpperCase() };
  protectedDeps.accessCode = '  ' + syntheticCode + '  ';
  accept(payload(), plain); accept(payload(), protectedDeps);
  assert.deepEqual(protectedDeps.rows[0], plain.rows[0]); assert.equal(JSON.stringify(protectedDeps.rows).includes(syntheticCode), false);
  const injected = payload(); injected.accessCode = syntheticCode; rejects(injected, 'INVALID_PAYLOAD');
});

test('invalid class code map or unknown session code cannot silently bypass configuration', () => {
  for (const accessCodeHashes of [null, [], 'bad', { unknown: sha256(crypto.randomUUID()) }, { [CONFIG.sessions[0].id]: 'not-a-hash' }]) {
    const deps = dependencies(); deps.config.accessCodeHashes = accessCodeHashes;
    rejects(payload(), 'ACCESS_CONFIGURATION_INVALID', deps); assert.deepEqual(deps.actions, []);
  }
});

test('generated Apps Script delivery parses and its SHA256 evidence matches every trusted source', () => {
  const root = path.resolve(__dirname, '..');
  const evidence = JSON.parse(fs.readFileSync(path.join(root, 'collector/generated/build-evidence.json'), 'utf8'));
  for (const source of evidence.sources) {
    assert.equal(sha256(fs.readFileSync(path.join(root, source.path))), source.sha256, source.path + ' must match delivered bundle.');
  }
  const code = fs.readFileSync(path.join(root, evidence.generated.path), 'utf8');
  assert.equal(sha256(code), evidence.generated.sha256);
  assert.doesNotThrow(() => new vm.Script(code, { filename: 'Code.gs' }));
});
