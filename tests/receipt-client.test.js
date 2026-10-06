'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Client = require('../js/receipt_client');
const Engine = require('../js/engine/rpg_engine');
const Store = require('../js/engine/rpg_store');
const fs = require('node:fs');
const path = require('node:path');

// Fictional fixture only; no roster, student records, Sheet or network access.
const units = ['cadet', 'liaison', 'logistics', 'doctor'];
const chapters = Array.from({ length: 13 }, (_, index) => ({
  id: 'u' + String(index + 1).padStart(2, '0'), number: index + 1, title: 'Fictional chapter ' + (index + 1),
  map: { width: 16, height: 20, spawn: { x: 8, y: 17 }, walls: [], gate: { x: 8, y: 17 } },
  clues: [{ id: 'a', x: 7, y: 17 }, { id: 'b', x: 8, y: 16 }, { id: 'c', x: 9, y: 17 }],
  sideQuest: { x: 7, y: 18, name: 'Fictional side quest', text: 'Inspect', reward: 'Story' },
  scenario: {
    resources: { time: 12, supplies: 7, load: 0 },
    targets: units.map((id, i) => ({ id: 'target-' + id, x: i + 1, y: 5, name: id, text: 'Inspect' })),
    actions: units.map(id => ({ id: id + '-act', unitId: id, targetId: 'target-' + id,
      label: 'Inspect', cost: { time: 1, supplies: 0, load: 0 }, flag: id, preview: 'Inspect', feedback: 'Inspected' })),
    events: [{ round: 1, text: 'New information', delta: { time: 0 } }, { round: 2, text: 'Another update', delta: { time: -1 } }],
    paths: [{ id: 'consult', label: 'Consult', cost: { time: 1 }, requiredFlags: ['cadet', 'liaison'],
      success: { title: 'Success', text: 'Verified' }, partial: { title: 'Tactical failure', text: 'Needs action' } }]
  }
}));
const config = { enabled: true, collectorUrl: 'https://script.google.com/macros/s/FICTIONAL_EXEC/exec',
  sessionId: 'fictional-2026-week-1', assignedChapter: 'u03' };
const student = { id: 'FAKE-001', name: '虛構測試同學' };
const firstId = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
function memory(initial = {}) {
  const values = new Map(Object.entries(initial)); const writes = [], reads = [];
  return { values, writes, reads, getItem: key => { reads.push(key); return values.get(key) ?? null; },
    setItem: (key, value) => { writes.push(key); values.set(key, value); }, removeItem: key => values.delete(key) };
}
function completedSave() {
  const storage = memory(); const store = new Store({ storage, chapters }); store.newProfile('Fictional'); store.startChapter('u03');
  const chapter = chapters[2];
  function act(method, ...args) {
    const result = Engine[method](store.getCurrent(), chapter, ...args);
    assert.equal(result.ok, true, result.message); store.updateState(result.state); return result.state;
  }
  act('begin'); for (const clue of ['a', 'b', 'c']) act('interact', clue); act('interact', 'gate'); act('choosePath', 'consult');
  for (let i = 0; i < 6; i++) act('wait', { token: store.getCurrent().revision, unitId: i % 2 ? 'liaison' : 'cadet' });
  act('interact', 'review'); act('setReflection', { reason: '依虛構教材概念說明取捨。', revision: '新資訊改變需求時修正。' }); act('complete');
  return { storage, store, chapter, attempt: store.getCurrent() };
}
function options(attempt, storage = memory(), extra = {}) {
  return { config, chapters, student, attempt, consent: true, storage, eventIdFactory: () => firstId, ...extra };
}

test('disabled or incomplete configuration rejects before reading or storing identity', () => {
  const attempt = completedSave().attempt;
  for (const bad of [{ ...config, enabled: false }, { ...config, collectorUrl: '' }, { ...config, sessionId: '' },
    { ...config, assignedChapter: '' }, { ...config, assignedChapter: 'u99' }, { ...config, sessionId: 'not a session' }]) {
    const storage = memory(); assert.equal(Client.checkConfig(bad, chapters).ready, false);
    assert.throws(() => Client.prepareEvent(options(attempt, storage, { config: bad })));
    assert.equal(storage.reads.length, 0); assert.equal(storage.writes.length, 0);
  }
});
test('only exact Google Apps Script HTTPS exec URLs are accepted', () => {
  for (const collectorUrl of ['http://script.google.com/macros/s/ID/exec', 'https://evil.test/exec',
    'https://script.google.com.evil.test/macros/s/ID/exec', 'https://script.google.com/macros/s/ID/dev',
    'https://user:password@script.google.com/macros/s/ID/exec', config.collectorUrl + '?tracking=x']) {
    assert.equal(Client.checkConfig({ ...config, collectorUrl }, chapters).ready, false);
  }
  assert.equal(Client.checkConfig(config, chapters).ready, true);
});
test('a genuine completed state with tactical failure qualifies without score or win criteria', () => {
  const { store, chapter, attempt } = completedSave();
  assert.equal(attempt.tactical.result.success, false);
  assert.equal(Engine.validateState(attempt, chapter), true);
  const candidates = Client.readCandidates(store.exportJSON(), 'u03', chapters);
  assert.equal(candidates[0].source, 'current');
  const payload = Client.prepareEvent(options(Client.selectAttempt(candidates)));
  assert.deepEqual(Object.keys(payload).sort(), ['attempt', 'eventId', 'format', 'sessionId', 'student', 'version']);
  assert.equal(payload.format, 'ndmu-ethics-submission'); assert.equal(payload.attempt.phase, 'complete');
  assert.equal(payload.student.id, 'FAKE-001'); assert.ok(payload.attempt.reflection.reason);
});
test('current complete is preferred; incomplete retry requires explicit same historical attempt selection', () => {
  const { store, attempt } = completedSave(); store.startChapter('u03', true);
  const candidates = Client.readCandidates(store.exportJSON(), 'u03', chapters);
  assert.equal(candidates.length, 1); assert.equal(candidates[0].source, 'history');
  assert.throws(() => Client.selectAttempt(candidates), /明確選擇/);
  assert.deepEqual(Client.selectAttempt(candidates, 'history:0'), attempt);
  const current = store.save.records.u03.current;
  assert.equal(current.reflection.reason, ''); assert.equal(current.completedAt, null);
  assert.throws(() => Client.validateComplete(current, chapters[2]));
});
test('missing restored state or wrong assigned chapter cannot borrow another completed chapter', () => {
  const { store } = completedSave();
  assert.deepEqual(Client.readCandidates(null, 'u03', chapters), []);
  assert.deepEqual(Client.readCandidates('', 'u03', chapters), []);
  assert.deepEqual(Client.readCandidates(store.exportJSON(), 'u04', chapters), []);
  assert.throws(() => Client.selectAttempt([]));
  assert.throws(() => Client.readCandidates('{broken', 'u03', chapters));
});
test('client completion booleans, blank reflection, early completion and impossible commands fail validation', () => {
  const { attempt, chapter } = completedSave();
  for (const change of [value => { value.completed = true; }, value => { value.reflection.reason = '   '; },
    value => { value.reflection.revision = ''; }, value => { value.phase = 'review'; },
    value => { value.clues = []; }, value => { value.tactical.log[0].unitId = 'intruder'; },
    value => { value.chapterId = 'u04'; }]) {
    const altered = JSON.parse(JSON.stringify(attempt)); change(altered);
    assert.throws(() => Client.validateComplete(altered, chapter));
  }
});
test('consent is mandatory and identity is trimmed, bounded and self-declared', () => {
  const attempt = completedSave().attempt; const storage = memory();
  assert.throws(() => Client.prepareEvent(options(attempt, storage, { consent: false })), /同意/);
  assert.equal(storage.reads.length, 0); assert.equal(storage.writes.length, 0);
  assert.deepEqual(Client.normalizeStudent({ id: ' FAKE-001 ', name: ' 虛構甲 ' }), { id: 'FAKE-001', name: '虛構甲' });
  for (const identity of [{ id: '', name: 'Fake' }, { id: 'a'.repeat(81), name: 'Fake' }, { id: 'F\n001', name: 'Fake' },
    { id: 'FAKE', name: 'Fake', email: 'not-requested@example.invalid' }]) assert.throws(() => Client.normalizeStudent(identity));
});
test('retry and reload preserve eventId for exactly the same payload', () => {
  const attempt = completedSave().attempt; const storage = memory();
  const first = Client.prepareEvent(options(attempt, storage)); const before = storage.writes.length;
  const retry = Client.prepareEvent(options(JSON.parse(JSON.stringify(attempt)), storage, { eventIdFactory: () => secondId }));
  assert.equal(first.eventId, firstId); assert.deepEqual(retry, first); assert.equal(storage.writes.length, before);
  const reopened = memory(Object.fromEntries(storage.values));
  assert.equal(Client.prepareEvent(options(attempt, reopened, { eventIdFactory: () => secondId })).eventId, firstId);
  assert.equal(Client.readOutbox(reopened).entries.length, 1);
});
test('identity or reflection changes cannot reuse a prior eventId', () => {
  const { attempt } = completedSave(); const storage = memory(); Client.prepareEvent(options(attempt, storage));
  assert.throws(() => Client.prepareEvent(options(attempt, storage, { student: { id: 'FAKE-002', name: '虛構乙' } })), /事件編號/);
  const changed = Client.prepareEvent(options(attempt, storage, { student: { id: 'FAKE-002', name: '虛構乙' }, eventIdFactory: () => secondId }));
  assert.equal(changed.eventId, secondId); assert.equal(Client.readOutbox(storage).entries.length, 2);
});
test('outbox persistence failure prevents handoff and never modifies game storage', () => {
  const { attempt, store } = completedSave(); const game = store.exportJSON();
  const storage = memory({ [Store.KEY]: game }); storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => Client.prepareEvent(options(attempt, storage)), /尚未傳送/);
  assert.equal(storage.values.get(Store.KEY), game);
  const dishonest = memory(); dishonest.setItem = () => {};
  assert.throws(() => Client.prepareEvent(options(attempt, dishonest)), /尚未傳送/);
});
test('clear removes only consented pending identity and events, preserving the game', () => {
  const { attempt, store } = completedSave(); const game = store.exportJSON(); const storage = memory({ [Store.KEY]: game });
  Client.prepareEvent(options(attempt, storage)); Client.clearOutbox(storage);
  assert.equal(storage.getItem(Client.OUTBOX_KEY), null); assert.equal(storage.getItem(Store.KEY), game);
});
test('disabled collection still lets a student manually clear old outbox without reading identity', () => {
  const { attempt, store } = completedSave(); const game = store.exportJSON(); const storage = memory({ [Store.KEY]: game });
  Client.prepareEvent(options(attempt, storage)); storage.reads.length = 0; storage.writes.length = 0;
  const elements = new Map();
  for (const id of ['classroom-receipt', 'classroom-form', 'classroom-fields', 'classroom-status', 'classroom-task',
    'classroom-attempt', 'classroom-consent', 'classroom-student-id', 'classroom-student-name', 'classroom-clear',
    'classroom-submit', 'classroom-transfer', 'classroom-prepared-payload', 'classroom-copy', 'classroom-open-page']) {
    elements.set(id, { value: '', checked: false, disabled: true, handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; } });
  }
  const document = { getElementById: id => elements.get(id) };
  Client.mount(document, { ...config, enabled: false }, chapters, { localStorage: storage });
  assert.equal(elements.get('classroom-fields').disabled, true);
  assert.equal(elements.get('classroom-clear').disabled, false);
  assert.equal(elements.get('classroom-student-id').value, ''); assert.equal(storage.reads.length, 0);
  assert.equal(storage.writes.length, 0); assert.ok(storage.values.has(Client.OUTBOX_KEY));
  elements.get('classroom-clear').handlers.click();
  assert.equal(storage.values.has(Client.OUTBOX_KEY), false); assert.equal(storage.values.get(Store.KEY), game);
});
test('corrupt or duplicate pending event IDs are rejected without destructive recovery', () => {
  const payload = Client.prepareEvent(options(completedSave().attempt));
  for (const raw of ['{broken', JSON.stringify({ version: 1, entries: [payload, payload] }),
    JSON.stringify({ version: 1, entries: [{ ...payload, eventId: 'unsafe' }] })]) {
    const storage = memory({ [Client.OUTBOX_KEY]: raw }); assert.throws(() => Client.readOutbox(storage));
    assert.equal(storage.getItem(Client.OUTBOX_KEY), raw); assert.equal(storage.writes.length, 0);
  }
});
test('large valid attempts are rejected rather than truncated before collection', () => {
  const { attempt, chapter } = completedSave();
  attempt.tacticalAttempts = Array.from({ length: 100 }, () => JSON.parse(JSON.stringify(attempt.tactical)));
  attempt.revision += 700; assert.equal(Engine.validateState(attempt, chapter), true);
  assert.throws(() => Client.eventBody(config, chapters, student, attempt, true), /超過收件大小限制/);
});
test('event IDs require cryptographic UUID v4 generation', () => {
  assert.match(Client.newEventId(crypto), /^[0-9a-f-]{36}$/); assert.throws(() => Client.newEventId(null));
  const fallback = Client.newEventId({ getRandomValues: array => { array.fill(0); return array; } }); assert.equal(fallback, firstId.replace(/1$/, '0'));
});
test('prepared payload goes to a direct GET page via copy and paste, without cross-origin submission', () => {
  const html = fs.readFileSync(path.join(__dirname, '../legacy-v1/index.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../js/receipt_client.js'), 'utf8');
  assert.match(html, /id="classroom-form" autocomplete="off"/);
  assert.match(html, /id="classroom-fields" disabled/); assert.match(html, /id="classroom-prepared-payload" readonly/);
  assert.match(html, /id="classroom-open-page"[^>]*target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /name="payload"|id="classroom-access-code"/);
  assert.doesNotMatch(script, /\bfetch\s*\(|HTMLFormElement|\.postMessage\s*\(|\.open\s*\(/);
  assert.match(script, /已準備提交資料，尚未傳送或確認收件/);
  assert.match(script, /validator\.validate\(parsed\)/); assert.match(script, /if \(!configResult\.ready\)/);
  const publicConfig = require('../js/classroom_config');
  assert.equal(Client.checkConfig(publicConfig, chapters).ready, true);
  assert.equal(publicConfig.assignedChapter, 'u03');
  assert.equal(Client.checkConfig({ ...publicConfig, enabled: false }, chapters).ready, false,
    'The same deployed configuration must still fail closed when the teacher disables it.');
});

function mountClient(options = {}) {
  const saved = completedSave(); const elements = new Map(); const clipboard = [], downloads = [], blobs = [], revoked = [];
  function node() {
    return { value: '', checked: false, disabled: false, hidden: true, handlers: {}, children: [],
      addEventListener(type, handler) { this.handlers[type] = handler; },
      replaceChildren(...children) { this.children = children; }, append(child) { this.children.push(child); },
      focus() { this.focused = true; }, select() { this.selected = true; }, contains() { return false; },
      click() { downloads.push({ href: this.href, filename: this.download }); } };
  }
  for (const id of ['classroom-receipt', 'classroom-form', 'classroom-fields', 'classroom-status', 'classroom-task',
    'classroom-attempt', 'classroom-consent', 'classroom-student-id', 'classroom-student-name', 'classroom-clear',
    'classroom-submit', 'classroom-transfer', 'classroom-prepared-payload', 'classroom-copy', 'classroom-open-page']) elements.set(id, node());
  if (options.withExport) elements.set('classroom-export-pending', node());
  const document = { getElementById: id => elements.get(id), createElement: node, addEventListener() {} };
  const host = { localStorage: saved.storage, crypto, addEventListener() {}, setInterval() {},
    navigator: options.noClipboard ? {} : { clipboard: { async writeText(value) { clipboard.push(value); } } } };
  if (options.withExport) Object.assign(host, { Blob: class { constructor(parts) { this.contents = parts.join(''); } },
    URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:synthetic-pending'; }, revokeObjectURL(url) { revoked.push(url); } },
    setTimeout(callback) { callback(); } });
  Client.mount(document, options.config || config, chapters, host);
  return { saved, elements, clipboard, host, downloads, blobs, revoked };
}
test('preparing consented data opens no network and preserves UUID across login or reload', async () => {
  const env = mountClient();
  env.elements.get('classroom-student-id').value = 'FAKE-001'; env.elements.get('classroom-student-name').value = '虛構甲';
  env.elements.get('classroom-consent').checked = true;
  const handler = env.elements.get('classroom-form').handlers.submit;
  handler({ preventDefault() {} });
  const raw = env.elements.get('classroom-prepared-payload').value, payload = JSON.parse(raw);
  assert.equal(env.elements.get('classroom-transfer').hidden, false);
  assert.equal(env.elements.get('classroom-open-page').href, config.collectorUrl);
  assert.equal(env.elements.get('classroom-form').action, undefined);
  assert.match(env.elements.get('classroom-status').textContent, /尚未傳送或確認收件/);
  assert.equal(Client.readOutbox(env.saved.storage).entries.length, 1);
  handler({ preventDefault() {} });
  assert.equal(JSON.parse(env.elements.get('classroom-prepared-payload').value).eventId, payload.eventId);
  await env.elements.get('classroom-copy').handlers.click();
  assert.deepEqual(env.clipboard, [raw]); assert.equal(env.elements.get('classroom-open-page').href.includes(payload.eventId), false);
  assert.match(env.elements.get('classroom-status').textContent, /尚未傳送或確認收件/);
});
test('clipboard failure gives explicit selected-text fallback without claiming submission', async () => {
  const env = mountClient({ noClipboard: true });
  env.elements.get('classroom-student-id').value = 'FAKE-001'; env.elements.get('classroom-student-name').value = '虛構甲';
  env.elements.get('classroom-consent').checked = true; env.elements.get('classroom-form').handlers.submit({ preventDefault() {} });
  await env.elements.get('classroom-copy').handlers.click();
  assert.equal(env.elements.get('classroom-prepared-payload').selected, true);
  assert.match(env.elements.get('classroom-status').textContent, /無法自動複製/);
  assert.match(env.elements.get('classroom-status').textContent, /尚未確認收件/);
});
test('OFF mode does not prepare, copy or expose any Google navigation', () => {
  const env = mountClient({ config: { ...config, enabled: false } });
  assert.equal(env.elements.get('classroom-fields').disabled, true);
  assert.equal(env.elements.get('classroom-open-page').href, undefined);
  assert.equal(env.elements.get('classroom-form').handlers.submit, undefined);
  assert.equal(env.elements.get('classroom-copy').handlers.click, undefined);
  assert.equal(env.elements.get('classroom-prepared-payload').value, '');
  assert.equal(env.clipboard.length, 0); assert.equal(env.saved.storage.values.has(Client.OUTBOX_KEY), false);
});

test('full pending queue never evicts older events and exports every original ID without claiming cloud receipt', () => {
  const saved = completedSave(), attempt = saved.store.getCurrent();
  for (let i = 1; i <= 20; i++) {
    const next = JSON.parse(JSON.stringify(attempt)); next.reflection.reason = 'Fictional pending attempt ' + i;
    Client.prepareEvent({ config, chapters, student, attempt: next, consent: true, storage: saved.storage,
      eventIdFactory: () => '00000000-0000-4000-8000-' + String(i).padStart(12, '0') });
  }
  const before = saved.storage.getItem(Client.OUTBOX_KEY), gameBefore = saved.storage.getItem(Store.KEY);
  const next = JSON.parse(JSON.stringify(attempt)); next.reflection.reason = 'Fictional pending attempt 21';
  assert.throws(() => Client.prepareEvent({ config, chapters, student, attempt: next, consent: true, storage: saved.storage }), /不要刪除未收件資料/);
  assert.equal(saved.storage.getItem(Client.OUTBOX_KEY), before); assert.equal(saved.storage.getItem(Store.KEY), gameBefore);
  const backup = Client.pendingBackup(saved.storage);
  assert.equal(backup.count, 20); assert.deepEqual(JSON.parse(backup.contents), JSON.parse(before));
  assert.equal('receipt' in JSON.parse(backup.contents), false);
  assert.equal(saved.storage.getItem(Client.OUTBOX_KEY), before);
});
test('optional backup button downloads a complete pending copy without clearing data or reporting receipt', () => {
  const env = mountClient({ withExport: true });
  env.elements.get('classroom-student-id').value = 'FAKE-001'; env.elements.get('classroom-student-name').value = '虛構甲';
  env.elements.get('classroom-consent').checked = true; env.elements.get('classroom-form').handlers.submit({ preventDefault() {} });
  const before = env.saved.storage.getItem(Client.OUTBOX_KEY);
  env.elements.get('classroom-export-pending').handlers.click();
  assert.deepEqual(JSON.parse(env.blobs[0].contents), JSON.parse(before));
  assert.equal(env.downloads[0].filename, 'military-ethics-pending-submissions.json');
  assert.equal(env.saved.storage.getItem(Client.OUTBOX_KEY), before);
  assert.match(env.elements.get('classroom-status').textContent, /尚未確認雲端收件/);
  assert.deepEqual(env.revoked, ['blob:synthetic-pending']);
});
