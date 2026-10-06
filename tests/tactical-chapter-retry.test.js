'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const Client = require('../js/tactical/tactical_classroom_client'), Engine = require('../js/tactical/tactical_engine');
const Bonus = require('../js/engine/rpg_bonus'), Schedule = require('../js/data/course_schedule');
const NOW = Date.parse('2026-10-06T06:00:00Z'), SCOPE = 'synthetic-scope-aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CLASS = 'military-ethics-2026-fall', PACING = Client.STORAGE_KEY + ':pacing:v1';
const clone = value => JSON.parse(JSON.stringify(value));
function memory() { const values = new Map(); return { values, failure: null,
  getItem(key) { if (this.failure === 'readback' && key === PACING) return null; return values.get(key) || null; },
  setItem(key, value) { if (this.failure === 'write' && key === PACING) throw Error('QUOTA'); values.set(key, value); } }; }
function finished(chapterId) {
  let battle = Engine.createState(chapterId);
  while (battle.status === 'active') battle = Engine.command(battle, { type: 'endTurn', revision: battle.revision }).state;
  return { attemptId: crypto.randomUUID(), chapterId, startedAt: '2020-01-01T00:00:00.000Z',
    closedAt: new Date(NOW).toISOString(), closure: 'finished', battle,
    learning: { reason: '虛構測試：核對責任及交接。', revision: '虛構測試：新資訊時修正。', completedAt: new Date(NOW).toISOString(), clockSource: 'device-untrusted' } };
}
function store() { return { key: 'ndmu-ethics-tactical:v2', persisted: true, lockState: 'owned',
  data: { profileId: crypto.randomUUID(), attempts: [finished('u13'), finished('u03')], bonus: null, session: null } }; }
function clock() { let time = NOW; return { now: () => time, tick(ms) { time += ms; } }; }
function rig(storage = memory(), time = clock(), handler) {
  const calls = [], client = Client.createClient({ mode: 'public', enabled: true, Engine, Bonus,
    crypto: crypto.webcrypto, storage, now: time.now, random: () => 0,
    rpc: async (_method, args) => { const payload = JSON.parse(args[0]); calls.push(payload); if (handler) await handler(payload, calls.length);
      else if (payload.attempt.chapterId === 'u13') throw Error('CHAPTER_NOT_OPEN');
      return { ok: true, format: 'ndmu-ethics-class-receipt', version: 2, eventId: payload.eventId,
        serverReceivedAt: new Date(time.now()).toISOString(), reviewStatus: 'pending_teacher_review', duplicate: false }; } });
  return { client, calls, storage, time };
}
function connect(r, s) { r.client.attachStore(s); r.client.connectBridge({ classId: CLASS, queueScope: SCOPE,
  rankingsEnabled: true, expiresAt: '2099-01-01T00:00:00.000Z', connectionId: 'a'.repeat(64),
  protocolVersion: 2, engineVersion: '2.0.0', contentVersion: 'tactical-2026-10-06-v1', bonusContentVersion: Bonus.CONTENT_VERSION }); r.client.setConsent(true); }
const queue = r => JSON.parse(r.client.exportQueue());
test('locked finished A is deferred without starving open finished B; original event remains immutable', async () => {
  const r = rig(), s = store(); connect(r, s); const before = queue(r).entries.map(e => ({ eventId: e.eventId, raw: e.raw }));
  assert.equal(await r.client.pump(), false); assert.equal(r.client.state().authenticated, true); assert.equal(r.client.state().consent, true);
  assert.match(r.client.state().message, /尚未到開放時間/);
  assert.equal(queue(r).entries[0].nextTryAt, Date.parse(Schedule.get('u13').opensAt));
  assert.equal(JSON.parse(r.storage.getItem(PACING)).nextGlobalAt, NOW + 65000);
  r.time.tick(64999); assert.equal(await r.client.pump(), false); r.time.tick(1); assert.equal(await r.client.pump(), true);
  assert.deepEqual(r.calls.map(p => p.attempt.chapterId), ['u13', 'u03']);
  assert.deepEqual(queue(r).entries.map(e => ({ eventId: e.eventId, raw: e.raw })), before);
  assert.equal(queue(r).entries[0].status, 'pending'); assert.equal(queue(r).entries[1].status, 'synced');
});
test('reload preserves independent dispatch cooldown but does not turn weeks-long chapter wait into global pause', async () => {
  const first = rig(), s = store(); connect(first, s); await first.client.pump();
  const restored = rig(first.storage, first.time); connect(restored, s);
  assert.equal(await restored.client.pump(), false); first.time.tick(65000); assert.equal(await restored.client.pump(), true);
  assert.deepEqual(restored.calls.map(p => p.attempt.chapterId), ['u03']);
  assert.equal(queue(restored).entries[0].error, 'CHAPTER_NOT_OPEN');
});
test('already-open stale tab carries newer rejection classification during writer-lock handover', async () => {
  const storage = memory(), time = clock(), first = rig(storage, time), stale = rig(storage, time), s = store();
  connect(first, s); connect(stale, s); assert.equal(queue(stale).entries[0].tries, 0);
  await first.client.pump(); first.client.setConsent(false);
  assert.equal(await stale.client.pump(), false); assert.equal(queue(stale).entries[0].error, 'CHAPTER_NOT_OPEN');
  time.tick(65000); assert.equal(await stale.client.pump(), true); assert.deepEqual(stale.calls.map(p => p.attempt.chapterId), ['u03']);
  assert.equal(JSON.parse(storage.getItem(Client.STORAGE_KEY)).entries[0].error, 'CHAPTER_NOT_OPEN');
});
test('ordinary quota failures retain global cooldown through reload and cannot be bypassed by manual retry', async () => {
  const first = rig(memory(), clock(), () => { throw Error('RETRY_LATER_KEEP_EVENT'); }), s = store(); connect(first, s); await first.client.pump();
  const restored = rig(first.storage, first.time, () => {}); connect(restored, s); restored.client.retry();
  first.time.tick(65000); assert.equal(await restored.client.pump(), false);
  first.time.tick(600000 - 65000); assert.equal(await restored.client.pump(), true); assert.equal(restored.calls.length, 1);
});
test('pacing write/readback failure stops RPC and preserves the original attempted queue event', async () => {
  for (const failure of ['write', 'readback']) {
    const r = rig(), s = store(); connect(r, s); const original = queue(r).entries.map(e => e.raw); r.storage.failure = failure;
    assert.equal(await r.client.pump(), false); assert.equal(r.calls.length, 0);
    assert.deepEqual(queue(r).entries.map(e => e.raw), original); assert.equal(queue(r).entries[0].tries, 1);
  }
});
test('malformed durable pacing cannot trigger RPC or overwrite the retained queue', async () => {
  const r = rig(), s = store(); connect(r, s); const raw = r.storage.getItem(Client.STORAGE_KEY); r.storage.values.set(PACING, '{bad');
  assert.equal(await r.client.pump(), false); assert.equal(r.calls.length, 0); assert.equal(r.storage.getItem(Client.STORAGE_KEY), raw);
  assert.equal(r.storage.getItem(PACING), '{bad');
});
test('server rejection with apparently-open device schedule falls back to fifteen minutes per event', async () => {
  const r = rig(memory(), clock(), () => { throw Error('CHAPTER_NOT_OPEN'); }), s = store(); s.data.attempts = [finished('u03')]; connect(r, s);
  assert.equal(await r.client.pump(), false); assert.equal(queue(r).entries[0].nextTryAt, NOW + 900000);
});

test('formal built page loads the immutable schedule before its browser client',()=>{const fs=require('node:fs'),html=fs.readFileSync('index.html','utf8');assert.ok(html.indexOf('root.CourseSchedule=')>=0);assert.ok(html.indexOf('root.CourseSchedule=')<html.indexOf('root.TacticalClassroomClient ='));});
