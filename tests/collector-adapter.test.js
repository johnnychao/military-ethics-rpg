'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const Core = require('../collector/core.js');
const Engine = require('../js/engine/rpg_engine.js');
const Data = require('../js/data/rpg_chapters.js');
const copy = value => JSON.parse(JSON.stringify(value));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const NOW = new Date('2026-10-06T06:15:00.000Z');
const SESSION = { id: 'synthetic-only-20261006', chapterId: 'u03',
  opensAt: '2026-10-06T13:30:00+08:00', closesAt: '2026-10-06T15:20:00+08:00' };
const SHEET_ID = 'SYNTHETIC_APP_CREATED_FILE_00001';
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
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) queue.push({ x: tile.x + dx, y: tile.y + dy, steps: [...tile.steps, [dx, dy]] });
  }
  assert.fail('Trusted marker must be reachable.');
}
function completed() {
  const chapter = Data.chapters.find(item => item.id === 'u03');
  let state = ok(Engine.begin(Engine.createState(chapter), chapter));
  for (const clue of chapter.clues) { state = walkNear(state, chapter, clue); state = ok(Engine.interact(state, chapter, clue.id)); }
  state = walkNear(state, chapter, chapter.map.gate); state = ok(Engine.interact(state, chapter, 'gate'));
  state = ok(Engine.choosePath(state, chapter, chapter.scenario.paths[0].id));
  while (state.phase === 'tactics') {
    const unit = state.tactical.units.find(item => !state.tactical.used.includes(item.id));
    state = ok(Engine.wait(state, chapter, { token: state.revision, unitId: unit.id }));
  }
  state = ok(Engine.interact(state, chapter, 'review'));
  state = ok(Engine.setReflection(state, chapter, { reason: 'Synthetic adapter evidence.', revision: 'Synthetic revised decision.' }));
  state = ok(Engine.complete(state, chapter)); assert.equal(Engine.validateState(state, chapter), true);
  return state;
}
const COMPLETE = completed();
function payload() {
  return { format: Core.FORMAT, version: 1, eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sessionId: SESSION.id, student: { id: '001234', name: 'Synthetic Student' }, attempt: copy(COMPLETE) };
}
function harness(options = {}) {
  const rows = options.empty ? [] : [Core.HEADERS.slice()], formulas = [], calls = [], state = { wrote: false, failedReadOnce: false, gridRows: options.gridRows || 1000, clockMillis: NOW.getTime() };
  const properties = { COLLECTOR_ENABLED: 'true', SPREADSHEET_ID: SHEET_ID, CLASS_SESSIONS: JSON.stringify([SESSION]),
    CLASS_ACCESS_CODE_HASHES: '{}' };
  Object.assign(properties, options.properties || {});
  const lock = {
    locked: false, tryLock() { calls.push('lock'); if (options.lockFails) return false;
      if (options.consumeGateWhileWaiting) { properties.INITIALIZE_NEW_PRIVATE_SHEET = 'false'; properties.COLLECTOR_ENABLED = 'false'; }
      this.locked = true; return true; },
    releaseLock() { calls.push('release'); this.locked = false; }
  };
  function parseRange(range) {
    const match = /^'((?:[^']|'')+)'!A(\d+):O(\d*)$/.exec(range);
    assert.ok(match, 'Only a fixed 15-column configured range may be accessed.');
    assert.equal(match[1].replace(/''/g, "'"), properties.RECORDS_SHEET || 'ethics_game_receipts');
    return { start: Number(match[2]) - 1, end: match[3] ? Number(match[3]) : rows.length };
  }
  function typed(value) {
    if (value === undefined || value === '') return {};
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'boolean') return { boolValue: value };
    if (typeof value === 'number') return { numberValue: value };
    assert.fail('Unsupported RAW fixture value.');
  }
  class Clock extends Date { constructor(value) { super(value === undefined ? state.clockMillis : value); } }
  const context = vm.createContext({ Date: Clock,
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => properties[key] === undefined ? null : properties[key],
      setProperty(key, value) { properties[key] = value; calls.push('set:' + key); },
      setProperties(values) { Object.assign(properties, values); calls.push('setProperties'); }
    }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_, text) => Array.from(crypto.createHash('sha256').update(text).digest()).map(value => value > 127 ? value - 256 : value) },
    LockService: { getScriptLock: () => lock },
    Sheets: { Spreadsheets: {
      get(id, query) {
        assert.equal(id, properties.SPREADSHEET_ID); assert.equal(lock.locked, true);
        assert.equal(query.includeGridData, true); assert.ok(query.fields.includes('userEnteredValue'));
        assert.ok(query.fields.includes('effectiveValue')); assert.equal(query.ranges.length, 1);
        calls.push('get:' + query.ranges[0]);
        if (options.readFails) throw new Error('Synthetic Google read denied: never echo this message.');
        const selection = parseRange(query.ranges[0]);
        if (options.failReadOnce && selection.start >= 1 && state.wrote && !state.failedReadOnce) {
          state.failedReadOnce = true; throw new Error('Synthetic transient read error.');
        }
        return { sheets: [{ properties: { title: properties.RECORDS_SHEET || 'ethics_game_receipts' },
          data: [{ startRow: selection.start, startColumn: 0,
            rowData: rows.slice(selection.start, selection.end).map((row, index) => ({ values: row.map((value, column) => {
              const effectiveValue = typed(value), formula = formulas[selection.start + index] && formulas[selection.start + index][column];
              return { userEnteredValue: formula ? { formulaValue: formula } : typed(value), effectiveValue };
            }) })) }] }] };
      },
      create(resource, query) {
        assert.equal(lock.locked, true); calls.push('create');
        assert.equal(query.fields, 'spreadsheetId'); assert.equal(resource.sheets[0].properties.gridProperties.columnCount, 15);
        assert.equal('permissions' in resource, false); assert.equal(resource.properties.timeZone, 'Asia/Taipei');
        if (options.createFails) throw new Error('Synthetic create denied.');
        rows.splice(0); return { spreadsheetId: SHEET_ID };
      },
      Values: { update(resource, id, range, query) {
        assert.equal(id, properties.SPREADSHEET_ID); assert.equal(lock.locked, true);
        assert.equal(query.valueInputOption, 'RAW'); assert.equal(resource.majorDimension, 'ROWS');
        assert.equal(resource.values.length, 1); assert.equal(resource.values[0].length, 15);
        calls.push('update:' + range);
        if (options.writeFails) throw new Error('Synthetic Google write denied: never echo this message.');
        const selection = parseRange(range);
        if (selection.start >= state.gridRows) throw new Error('SYNTHETIC_GRID_LIMIT');
        // RAW preserves the exact string, including zeros and existing apostrophes; no formula parsing.
        rows[selection.start] = copy(resource.values[0]); formulas[selection.start] = Array(15).fill(''); state.wrote = true;
        if (options.writeAfterPersistFails) throw new Error('Synthetic write acknowledgement lost.');
        return { spreadsheetId: id, updatedRange: range, updatedRows: options.badAck ? 0 : 1, updatedColumns: 15, updatedCells: 15 };
      }, append(resource, id, range, query) {
        assert.equal(id, properties.SPREADSHEET_ID); assert.equal(lock.locked, true);
        assert.equal(query.valueInputOption, 'RAW'); assert.equal(query.insertDataOption, 'INSERT_ROWS');
        assert.equal(resource.majorDimension, 'ROWS'); assert.equal(resource.values.length, 1); assert.equal(resource.values[0].length, 15);
        assert.equal(range, "'" + (properties.RECORDS_SHEET || 'ethics_game_receipts') + "'!A1:O");
        calls.push('append:' + range);
        if (options.writeFails) throw new Error('Synthetic Google write denied: never echo this message.');
        const rowNumber = rows.length + 1;
        state.gridRows = Math.max(state.gridRows + 1, rowNumber);
        rows.push(copy(resource.values[0])); formulas[rowNumber - 1] = Array(15).fill(''); state.wrote = true;
        if (options.writeAfterPersistFails) throw new Error('Synthetic write acknowledgement lost.');
        return { spreadsheetId: id, updates: { updatedRange: "'" + (properties.RECORDS_SHEET || 'ethics_game_receipts') + "'!A" + rowNumber + ':O' + rowNumber,
          updatedRows: options.badAck ? 0 : 1, updatedColumns: 15, updatedCells: 15 } };
      } }
    } },
    HtmlService: { createHtmlOutput: html => ({ html, title: '', setTitle(title) { this.title = title; return this; } }) },
    EthicsSubmissionPage: { renderSubmissionPage: () => '<main>synthetic same-origin form</main>' }
  });
  const root = path.resolve(__dirname, '..');
  for (const relative of ['js/data/course_schedule.js', 'collector/chapter_access.js', 'js/data/rpg_chapters.js', 'js/engine/rpg_engine.js', 'collector/core.js', 'collector/adapter.gs']) {
    vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
  }
  return { context, rows, formulas, calls, lock, properties, state,
    submit: (value, code) => context.handleClassroomSubmission(JSON.stringify(value), code),
    store() { lock.locked = true; return context.collectorStore_(context.collectorConfiguration_()); } };
}

test('Advanced Sheets RPC accepts completed tactical failure only after exact RAW write acknowledgement and readback', () => {
  const fixture = harness(), value = payload(); assert.equal(COMPLETE.tactical.result.success, false);
  const receipt = fixture.submit(value);
  assert.equal(receipt.ok, true); assert.equal(receipt.reviewStatus, 'pending_teacher_review');
  assert.equal(receipt.serverReceivedAt, NOW.toISOString()); assert.equal(fixture.rows.length, 2);
  assert.equal(fixture.rows[1][4], '001234'); assert.equal(typeof fixture.rows[1][2], 'string');
  assert.equal(fixture.rows[1][7], true); assert.equal(fixture.rows[1][8], true); assert.equal(fixture.rows[1][9], false);
  assert.equal(fixture.calls.at(-2), "get:'ethics_game_receipts'!A2:O2"); assert.equal(fixture.calls.at(-1), 'release');
  assert.equal('student' in receipt, false); assert.equal('accessCode' in receipt, false);
});

test('RAW never strips apostrophes or interprets formula strings; leading-zero identity stays a string', () => {
  const fixture = harness(), value = payload(); value.student.name = "'Synthetic"; value.attempt.reflection.reason = '=1+1';
  const receipt = fixture.submit(value); assert.equal(receipt.ok, true);
  assert.equal(fixture.rows[1][4], '001234'); assert.equal(fixture.rows[1][5], Core.safeCell(value.student.name));
  assert.equal(fixture.rows[1][12], Core.safeCell(value.attempt.reflection.reason));
  assert.equal(fixture.formulas.flat().some(Boolean), false);
  assert.equal(fixture.submit(value).duplicate, true); assert.equal(fixture.rows.length, 2);
  fixture.rows[1][12] = fixture.rows[1][12].slice(1);
  assert.throws(() => fixture.submit(value), /RECEIPT_READBACK_FAILED/, 'Apostrophe loss is now corruption, not SpreadsheetApp compatibility.');
});

test('persisted event recovery is idempotent even after an uncertain write/read response', () => {
  for (const option of ['failReadOnce', 'writeAfterPersistFails', 'badAck']) {
    const fixture = harness({ [option]: true }), value = payload();
    assert.throws(() => fixture.submit(value)); assert.equal(fixture.rows.length, 2);
    assert.equal(fixture.submit(value).duplicate, true); assert.equal(fixture.rows.length, 2);
  }
});

test('invalid configuration, session, identity, completion and class access code are rejected before any Sheet access', () => {
  const disabled = harness({ properties: { COLLECTOR_ENABLED: 'false' } });
  assert.throws(() => disabled.submit(payload()), /COLLECTOR_NOT_CONFIGURED/); assert.deepEqual(disabled.calls, []);
  const defaultDisabled = harness(); delete defaultDisabled.properties.COLLECTOR_ENABLED;
  assert.throws(() => defaultDisabled.submit(payload()), /COLLECTOR_NOT_CONFIGURED/); assert.deepEqual(defaultDisabled.calls, []);
  for (const change of [value => value.sessionId = 'unknown', value => value.student.id = '', value => value.attempt.reflection.reason = '']) {
    const fixture = harness(), value = payload(); change(value); assert.throws(() => fixture.submit(value)); assert.deepEqual(fixture.calls, []);
  }
  const syntheticCode = crypto.randomUUID();
  const protectedFixture = harness({ properties: { CLASS_ACCESS_CODE_HASHES: JSON.stringify({ [SESSION.id]: sha256(syntheticCode) }) } });
  for (const code of [undefined, '', crypto.randomUUID(), syntheticCode + '\u0000']) {
    assert.throws(() => protectedFixture.submit(payload(), code)); assert.deepEqual(protectedFixture.calls, []);
  }
  const receipt = protectedFixture.submit(payload(), '  ' + syntheticCode + '  '); assert.equal(receipt.ok, true);
  assert.equal(JSON.stringify(protectedFixture.rows).includes(syntheticCode), false);
  assert.equal(JSON.stringify(receipt).includes(syntheticCode), false);
});

test('same event different payload is rejected; RPC failures never expose raw Google messages or student fields', () => {
  const fixture = harness(), value = payload(); fixture.submit(value); value.student.name = 'Another Synthetic';
  assert.throws(() => fixture.submit(value), /EVENT_ID_CONFLICT/); assert.equal(fixture.rows.length, 2);
  for (const option of ['writeFails', 'readFails', 'lockFails']) {
    const failed = harness({ [option]: true });
    assert.throws(() => failed.submit(payload()), error => /^[A-Z_]+$/.test(error.message));
    assert.equal(failed.rows.length, 1);
  }
});

test('find, count and read reject formulas in the immutable 15-column table instead of executing or trusting results', () => {
  for (const operation of ['find', 'count', 'read']) {
    const fixture = harness(); fixture.submit(payload()); fixture.formulas[1][12] = '=IMPORTXML("https://example.invalid")';
    const store = fixture.store();
    assert.throws(() => operation === 'find' ? store.findByEventId(payload().eventId) :
      operation === 'count' ? store.countEvents(SESSION.id, payload().student.id) : store.read(2), /RECEIPT_READBACK_FAILED/);
  }
});

test('countEvents counts exact session and safe stored identity without trimming RAW apostrophes', () => {
  const fixture = harness(); fixture.submit(payload()); const row = copy(fixture.rows[1]);
  row[0] = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; fixture.rows.push(copy(row));
  row[0] = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; row[4] = 'different-synthetic-id'; fixture.rows.push(copy(row));
  row[0] = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'; row[3] = 'another-session'; fixture.rows.push(copy(row));
  const store = fixture.store(); assert.deepEqual(copy(store.countEvents(SESSION.id, '001234')), { sessionEvents: 3, studentEvents: 2 });
  const unusual = copy(fixture.rows[1]); unusual[0] = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'; unusual[4] = Core.safeCell("'synthetic-id"); fixture.rows.push(unusual);
  assert.deepEqual(copy(store.countEvents(SESSION.id, "'synthetic-id")), { sessionEvents: 4, studentEvents: 1 });
});

test('quota counts occur under the same script lock, and duplicate receipt recovery remains available at the cap', () => {
  const fixture = harness({ properties: { CLASS_SESSIONS: JSON.stringify([{ ...SESSION, maxEvents: 1, maxStudentEvents: 1 }]) } });
  fixture.submit(payload()); assert.equal(fixture.submit(payload()).duplicate, true);
  const next = payload(); next.eventId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  assert.throws(() => fixture.submit(next)); assert.equal(fixture.rows.length, 2); assert.equal(fixture.lock.locked, false);
});

test('damaged headers, blank gaps, duplicate event rows and corrupted stored reflection fail closed', () => {
  for (const corrupt of [fixture => fixture.rows[0][0] = 'wrong-header',
    fixture => fixture.rows.splice(1, 0, Array(15).fill('')),
    fixture => fixture.rows.push(copy(fixture.rows[1])), fixture => fixture.rows[1][12] = 'damaged']) {
    const fixture = harness(); fixture.submit(payload()); corrupt(fixture);
    assert.throws(() => fixture.submit(payload())); assert.equal(fixture.lock.locked, false);
  }
});

test('GET renders the same-origin submission page without Sheet reads; old cross-origin POST cannot submit', () => {
  const fixture = harness(), result = fixture.context.doGet({ parameter: { student: '<script>', accessCode: crypto.randomUUID() } });
  assert.equal(result.html.includes('synthetic same-origin form'), true); assert.deepEqual(fixture.calls, []);
  const post = fixture.context.doPost({ parameter: { payload: JSON.stringify(payload()) } });
  assert.equal(post.title, '尚未確認收件'); assert.deepEqual(fixture.calls, []);
  const disabled = harness({ properties: { COLLECTOR_ENABLED: 'false' } });
  assert.equal(disabled.context.doGet().html.includes('synthetic same-origin form'), false); assert.deepEqual(disabled.calls, []);
});

test('manual initializer creates a new app-owned file once, verifies RAW headers, and leaves collection disabled', () => {
  const fixture = harness({ empty: true, properties: { SPREADSHEET_ID: '', INITIALIZE_NEW_PRIVATE_SHEET: 'true' } });
  const result = fixture.context.initializePrivateCollector_(); assert.deepEqual(copy(result), { initialized: true, enabled: false });
  assert.equal(fixture.properties.SPREADSHEET_ID, SHEET_ID); assert.equal(fixture.properties.COLLECTOR_ENABLED, 'false');
  assert.equal(fixture.properties.INITIALIZE_NEW_PRIVATE_SHEET, 'false'); assert.deepEqual(fixture.rows[0], Core.HEADERS);
  assert.equal(fixture.calls.filter(call => call === 'create').length, 1); assert.equal(fixture.lock.locked, false);
  assert.throws(() => fixture.context.initializePrivateCollector_(), /INITIALIZATION_NOT_APPROVED/);
  fixture.properties.INITIALIZE_NEW_PRIVATE_SHEET = 'true';
  assert.throws(() => fixture.context.initializePrivateCollector_(), /COLLECTOR_ALREADY_INITIALIZED/);
  assert.equal(fixture.calls.filter(call => call === 'create').length, 1);
});

test('RAW INSERT_ROWS append grows beyond the initial grid and still verifies the exact expected persisted row', () => {
  const fixture = harness({ gridRows: 2 }), value = payload(); fixture.submit(value);
  assert.equal(fixture.rows.length, 2);
  fixture.state.gridRows = 2; // Simulate a table exactly at its allocated grid boundary.
  value.eventId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const receipt = fixture.submit(value); assert.equal(receipt.ok, true); assert.equal(fixture.rows.length, 3);
  assert.equal(fixture.state.gridRows, 3); assert.equal(fixture.rows[2][0], value.eventId);
  assert.equal(fixture.calls.at(-2), "get:'ethics_game_receipts'!A3:O3");
});

test('initializer requires a manual gate, never reuses another app file and prevents automatic retry after uncertain creation', () => {
  const blocked = harness(); assert.throws(() => blocked.context.initializePrivateCollector_(), /INITIALIZATION_NOT_APPROVED/);
  assert.deepEqual(blocked.calls, []);
  for (const option of ['createFails', 'writeFails', 'readFails', 'badAck']) {
    const fixture = harness({ [option]: true, empty: true, properties: { SPREADSHEET_ID: '', INITIALIZE_NEW_PRIVATE_SHEET: 'true' } });
    assert.throws(() => fixture.context.initializePrivateCollector_());
    assert.equal(fixture.properties.COLLECTOR_ENABLED, 'false'); assert.equal(fixture.properties.INITIALIZE_NEW_PRIVATE_SHEET, 'false');
    assert.equal(fixture.calls.filter(call => call === 'create').length, 1); assert.equal(fixture.lock.locked, false);
    assert.throws(() => fixture.context.initializePrivateCollector_(), /INITIALIZATION_NOT_APPROVED/);
  }
});

test('initializer rechecks the one-time gate inside the lock after another editor execution may consume it', () => {
  const fixture = harness({ consumeGateWhileWaiting: true, empty: true,
    properties: { SPREADSHEET_ID: '', INITIALIZE_NEW_PRIVATE_SHEET: 'true' } });
  assert.throws(() => fixture.context.initializePrivateCollector_(), /INITIALIZATION_NOT_APPROVED/);
  assert.equal(fixture.calls.includes('create'), false); assert.equal(fixture.properties.COLLECTOR_ENABLED, 'false');
  assert.equal(fixture.properties.SPREADSHEET_ID, ''); assert.equal(fixture.lock.locked, false);
});

test('only public submission RPC and GET/POST exist; initializer/private helpers have underscore suffix and source uses no broad services', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../collector/adapter.gs'), 'utf8');
  const publicFunctions = Array.from(source.matchAll(/^function\s+([A-Za-z0-9_]+)\(/gm), match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions.sort(), ['doGet', 'doPost', 'handleClassroomSubmission']);
  assert.equal(/SpreadsheetApp\s*\.|DriveApp\s*\.|UrlFetchApp\s*\.|GmailApp\s*\.|ScriptApp\s*\./.test(source), false);
  assert.equal(source.includes('valueInputOption: \'RAW\''), true);
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../collector/appsscript.json'), 'utf8'));
  assert.deepEqual(manifest.oauthScopes, ['https://www.googleapis.com/auth/drive.file']);
  assert.deepEqual(manifest.dependencies.enabledAdvancedServices, [{ userSymbol: 'Sheets', serviceId: 'sheets', version: 'v4' }]);
});

test('RAW adapter rolling quota uses server times, permits ten new attempts, and releases slots at the boundary', () => {
  const configured = { ...SESSION, rollingLimit: { windowSeconds: 600, maxEvents: 300, maxStudentEvents: 10 } };
  const fixture = harness({ properties: { CLASS_SESSIONS: JSON.stringify([configured]) } });
  const event = number => { const value = payload(); value.eventId = '00000000-0000-4000-8000-' + String(number).padStart(12, '0'); value.attempt.completedAt = '2000-01-01T00:00:00.000Z'; return value; };
  for (let n = 1; n <= 10; n++) assert.equal(fixture.submit(event(n)).ok, true);
  assert.equal(fixture.rows.length, 11);
  assert.throws(() => fixture.submit(event(11)), /STUDENT_EVENT_LIMIT/);
  assert.equal(fixture.submit(event(1)).duplicate, true); assert.equal(fixture.rows.length, 11);
  fixture.state.clockMillis += 600000;
  const accepted = fixture.submit(event(11)); assert.equal(accepted.eventId, event(11).eventId);
  assert.equal(accepted.serverReceivedAt, '2026-10-06T06:25:00.000Z');
  assert.equal(fixture.rows.length, 12); assert.equal(fixture.rows[1][2], NOW.toISOString());
  assert.equal(fixture.rows[1][11], '2000-01-01T00:00:00.000Z');
});
test('rolling quota rejects malformed or future stored server timestamps instead of silently not counting them', () => {
  for (const time of ['invalid', '2026-02-31T06:00:00.000Z', '2027-01-01T00:00:00.000Z']) {
    const configured = { ...SESSION, rollingLimit: { windowSeconds: 600, maxEvents: 300, maxStudentEvents: 10 } };
    const fixture = harness({ properties: { CLASS_SESSIONS: JSON.stringify([configured]) } });
    fixture.submit(payload()); fixture.rows[1][2] = time;
    const another = payload(); another.eventId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    assert.throws(() => fixture.submit(another), /COLLECTOR_STORE_INVALID/); assert.equal(fixture.rows.length, 2);
  }
});
