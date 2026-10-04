'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const crypto = require('node:crypto');
const Page = require('../collector/submission_page');
const eventId = '00000000-0000-4000-8000-000000000001';
const raw = JSON.stringify({ format: 'ndmu-ethics-submission', version: 1, eventId, sessionId: 'FAKE-SESSION',
  student: { id: 'FAKE-ONLY-001', name: '虛構同學' }, attempt: { reflection: { reason: '虛構反思', revision: '虛構修正' } } });
const receipt = { ok: true, eventId, serverReceivedAt: '2026-10-05T00:00:00.000Z', reviewStatus: 'pending_teacher_review', duplicate: false };
function environment(options = {}) {
  const elements = new Map(); const calls = []; const timers = new Map(); let nextTimer = 0, success, failure;
  for (const id of ['submission-form', 'submission-fields', 'submission-payload', 'submission-access-code',
    'submission-send', 'submission-status', 'submission-receipt', 'receipt-event-id', 'receipt-server-time',
    'receipt-review-status', 'receipt-duplicate']) elements.set(id, { value: '', textContent: '', disabled: false,
      hidden: id === 'submission-receipt', handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; } });
  elements.get('submission-fields').disabled = true;
  const rpc = { withSuccessHandler(callback) { success = callback; return this; },
    withFailureHandler(callback) { failure = callback; return this; },
    handleClassroomSubmission(payload, accessCode) { calls.push({ raw: payload, accessCode }); if (options.throwRpc) throw new Error('sensitive transport detail'); } };
  const host = { google: options.noRpc ? undefined : { script: { run: rpc } }, handlers: {},
    setTimeout(callback) { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); }, addEventListener(type, handler) { this.handlers[type] = handler; } };
  for (const name of ['localStorage', 'sessionStorage', 'fetch', 'postMessage', 'location']) {
    Object.defineProperty(host, name, { get() { throw new Error('Forbidden persistence or cross-origin access: ' + name); } });
  }
  const document = { getElementById: id => elements.get(id) };
  function submit(payload = raw, accessCode = '') {
    elements.get('submission-payload').value = payload; elements.get('submission-access-code').value = accessCode;
    elements.get('submission-form').handlers.submit({ preventDefault() {} });
  }
  return { elements, calls, timers, host, document, submit, successCallback: () => success,
    succeed: result => success(result), fail: error => failure(error) };
}
function mounted(options) { const env = environment(options); Page.mountSubmissionPage(env.document, env.host); return env; }
test('GET submission page restores no POST or URL data and supports paste after Google login', () => {
  const html = Page.renderSubmissionPage();
  assert.match(html, /登入重導不需要攜帶 POST 資料/); assert.match(html, /id="submission-payload" required/);
  assert.match(html, /type="password"[^>]*autocomplete="off"/);
  assert.doesNotMatch(html, /<script[^>]+src=|name="payload"|name="accessCode"|fetch\s*\(|postMessage\s*\(|localStorage|sessionStorage|location\./);
  const env = environment(); const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, { document: env.document, window: env.host });
  assert.equal(env.elements.get('submission-fields').disabled, false); assert.equal(env.calls.length, 0);
  const accessCode = crypto.randomUUID(); env.submit(raw, accessCode);
  assert.equal(env.calls.length, 1); assert.equal(env.calls[0].raw, raw);
  assert.ok(env.calls[0].accessCode === accessCode, 'Only the RPC argument carries the runtime-generated access code.');
  assert.equal(env.elements.get('submission-access-code').value, '');
  assert.equal(env.elements.get('submission-receipt').hidden, true); assert.match(env.elements.get('submission-status').textContent, /尚未確認收件/);
});
test('success appears only after matching server acknowledgement and renders only receipt fields', () => {
  const env = mounted(); const accessCode = crypto.randomUUID(); env.submit(raw, accessCode);
  assert.equal(env.elements.get('submission-receipt').hidden, true); assert.equal(env.elements.get('submission-send').disabled, true);
  env.succeed(receipt); assert.equal(env.elements.get('submission-receipt').hidden, false);
  assert.equal(env.elements.get('receipt-event-id').textContent, eventId);
  assert.equal(env.elements.get('receipt-server-time').textContent, receipt.serverReceivedAt);
  assert.match(env.elements.get('submission-status').textContent, /仍待教師核實/);
  const displayed = [...env.elements.values()].map(item => item.textContent).join('\n');
  assert.doesNotMatch(displayed, /FAKE-ONLY-001|虛構同學|虛構反思|虛構修正/);
  assert.equal(displayed.includes(accessCode), false);
  assert.equal(env.elements.get('submission-send').disabled, false); assert.equal(env.timers.size, 0);
});
test('malformed, wrong-event, client-only or identity-bearing acknowledgements never count as receipt', () => {
  for (const bad of [{ completed: true }, { ...receipt, ok: false }, { ...receipt, eventId: '00000000-0000-4000-8000-000000000002' },
    { ...receipt, serverReceivedAt: 'client clock' }, { ...receipt, reviewStatus: 'present' },
    { ...receipt, duplicate: 'true' }, { ...receipt, student: { id: 'private' } }]) {
    const env = mounted(); env.submit(); env.succeed(bad);
    assert.equal(env.elements.get('submission-receipt').hidden, true); assert.match(env.elements.get('submission-status').textContent, /尚未確認收件/);
  }
});
test('RPC failure and exception retain unconfirmed state without echoing sensitive error context', () => {
  const env = mounted(); const accessCode = crypto.randomUUID(); env.submit(raw, accessCode); env.fail(new Error(accessCode + ' FAKE-ONLY-001'));
  assert.equal(env.elements.get('submission-receipt').hidden, true); assert.match(env.elements.get('submission-status').textContent, /尚未確認收件/);
  assert.doesNotMatch(env.elements.get('submission-status').textContent, /FAKE-ONLY-001/);
  assert.equal(env.elements.get('submission-status').textContent.includes(accessCode), false);
  assert.equal(env.elements.get('submission-access-code').value, ''); assert.equal(env.timers.size, 0);
  const thrown = mounted({ throwRpc: true }); thrown.submit();
  assert.equal(thrown.elements.get('submission-receipt').hidden, true); assert.match(thrown.elements.get('submission-status').textContent, /尚未確認收件/);
});
test('timeout ignores late acknowledgement; retry sends same event and code is entered again', () => {
  const env = mounted(); env.submit(raw, crypto.randomUUID()); const firstSuccess = env.successCallback();
  const oldCallback = [...env.timers.values()][0]; oldCallback();
  assert.match(env.elements.get('submission-status').textContent, /等待逾時，尚未確認收件/);
  firstSuccess(receipt); assert.equal(env.elements.get('submission-receipt').hidden, true);
  env.submit(raw, crypto.randomUUID()); assert.equal(env.calls.length, 2);
  assert.equal(env.calls[0].raw, env.calls[1].raw); assert.equal(env.elements.get('submission-access-code').value, '');
  firstSuccess(receipt); assert.equal(env.elements.get('submission-receipt').hidden, true);
  env.succeed({ ...receipt, duplicate: true }); assert.equal(env.elements.get('submission-receipt').hidden, false);
  assert.match(env.elements.get('receipt-duplicate').textContent, /原回執/);
});
test('busy form does not start a second request or save a secret', () => {
  const env = mounted(); env.submit(raw, crypto.randomUUID()); env.submit(raw, crypto.randomUUID());
  assert.equal(env.calls.length, 1); assert.equal(env.elements.get('submission-receipt').hidden, true);
  env.host.handlers.pagehide(); assert.equal(env.elements.get('submission-access-code').value, '');
});
test('invalid paste or missing Apps Script RPC makes no request and cannot silently native-submit', () => {
  for (const bad of ['', '{broken', JSON.stringify({ format: 'ndmu-ethics-rpg', version: 1 }), 'x'.repeat(60001)]) {
    const env = mounted(); env.submit(bad, crypto.randomUUID()); assert.equal(env.calls.length, 0);
    assert.equal(env.elements.get('submission-access-code').value, ''); assert.match(env.elements.get('submission-status').textContent, /尚未確認收件/);
  }
  const env = mounted({ noRpc: true }); assert.equal(env.elements.get('submission-fields').disabled, true);
  env.submit(); assert.equal(env.calls.length, 0); assert.equal(env.elements.get('submission-receipt').hidden, true);
});
test('class access code allows at most 128 characters aligned with the server core', () => {
  const makeCode = length => Array.from({ length: Math.ceil(length / 36) }, () => crypto.randomUUID()).join('').slice(0, length);
  assert.match(Page.renderSubmissionPage(), /id="submission-access-code"[^>]*maxlength="128"/);
  const allowed = mounted(); allowed.submit(raw, makeCode(128)); assert.equal(allowed.calls.length, 1);
  const rejected = mounted(); rejected.submit(raw, makeCode(129)); assert.equal(rejected.calls.length, 0);
  assert.equal(rejected.elements.get('submission-access-code').value, '');
  assert.match(rejected.elements.get('submission-status').textContent, /尚未確認收件/);
});
test('uppercase pasted event UUID matches the lowercase server canonical event ID', () => {
  const canonicalId = 'a0000000-a000-4000-8000-00000000000a';
  const payload = { ...JSON.parse(raw), eventId: canonicalId.toUpperCase() };
  const env = mounted(); env.submit(JSON.stringify(payload), crypto.randomUUID());
  env.succeed({ ...receipt, eventId: canonicalId });
  assert.equal(env.elements.get('submission-receipt').hidden, false);
  assert.equal(env.elements.get('receipt-event-id').textContent, canonicalId);
});
test('server receipt time requires canonical complete UTC ISO and a valid calendar timestamp', () => {
  for (const serverReceivedAt of ['2026-10-05T00:00:00Z', '2026-10-05T00:00:00+08:00',
    '2026-10-05T00:00:00.000Z trailing', '2026-02-30T00:00:00.000Z', '2026-10-05T24:00:00.000Z']) {
    const env = mounted(); env.submit(); env.succeed({ ...receipt, serverReceivedAt });
    assert.equal(env.elements.get('submission-receipt').hidden, true);
    assert.match(env.elements.get('submission-status').textContent, /尚未確認收件/);
  }
  const env = mounted(); env.submit(); env.succeed(receipt); assert.equal(env.elements.get('submission-receipt').hidden, false);
});
