'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RPGStore = require('../js/engine/rpg_store');
const Engine = require('../js/engine/rpg_engine');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const units = ['cadet', 'liaison', 'logistics', 'doctor'];
const chapters = Array.from({ length: 13 }, (_, index) => ({
  id: 'u' + String(index + 1).padStart(2, '0'), number: index + 1,
  title: '任務 ' + (index + 1), topic: '教材主題', region: '學院',
  map: { width: 16, height: 20, spawn: { x: 8, y: 17 }, walls: [], gate: { x: 8, y: 17 } },
  clues: [{ id: 'a', x: 7, y: 17 }, { id: 'b', x: 8, y: 16 }, { id: 'c', x: 9, y: 17 }],
  sideQuest: { x: 7, y: 18, name: '支線', text: '取得補充觀點', reward: '紀念' },
  scenario: {
    resources: { time: 12, supplies: 7, load: 0 },
    targets: units.map((id, i) => ({ id: 'target-' + id, x: i + 1, y: 5, name: id, text: '協作' })),
    actions: units.flatMap(id => [1, 2].map(n => ({ id: id + n, unitId: id, targetId: 'target-' + id,
      label: '協作 ' + n, kind: 'verify', cost: { time: 1, supplies: 0, load: 0 }, flag: id + n,
      preview: '耗時一格', feedback: '留下查證紀錄' }))),
    events: [{ round: 1, text: '新回報', delta: { time: 0, supplies: 0, load: 0 } },
      { round: 2, text: '新資訊', delta: { time: -1, supplies: 0, load: 0 } }],
    paths: [{ id: 'consult', label: '先諮詢', text: '共同查核', tradeoff: '花費時間',
      cost: { time: 1, supplies: 0, load: 0 }, requiredFlags: ['cadet1', 'liaison1'],
      success: { title: '完成協作', text: '資訊已核對' }, partial: { title: '待續', text: '仍有缺口' } },
      { id: 'refer', label: '先轉介', text: '轉介與追蹤', tradeoff: '等待成本',
        cost: { time: 1, supplies: 0, load: 0 }, requiredFlags: ['logistics1', 'doctor1'],
        success: { title: '完成轉介', text: '接應已核對' }, partial: { title: '轉介待續', text: '接應仍有缺口' } }]
  }, reward: { title: '協作學員', item: '查證手冊', story: '小隊故事' }
}));
function setup(initial = {}) {
  const values = new Map(Object.entries(initial)); const warnings = []; const reads = [];
  const storage = { getItem: key => { reads.push(key); return values.get(key) ?? null; }, setItem: (key, value) => values.set(key, value) };
  const store = new RPGStore({ storage, chapters, onWarning: value => warnings.push(value) });
  return { store, values, warnings, storage, reads };
}
function apply(store, method, ...args) {
  const state = store.getCurrent(); const chapter = chapters.find(item => item.id === state.chapterId);
  const result = Engine[method](state, chapter, ...args);
  assert.equal(result.ok, true, result.message); store.updateState(result.state); return result.state;
}
function reachTactics(store, id = 'u03', pathId = 'consult') {
  store.startChapter(id); apply(store, 'begin');
  for (const clue of ['a', 'b', 'c']) apply(store, 'interact', clue);
  apply(store, 'interact', 'gate'); apply(store, 'choosePath', pathId);
}
function finish(store, id = 'u03') {
  reachTactics(store, id);
  for (const [unitId, actionId] of [['cadet', 'cadet1'], ['liaison', 'liaison1'], ['logistics', 'logistics1'], ['doctor', 'doctor1'], ['cadet', 'cadet2'], ['liaison', 'liaison2']]) {
    const state = store.getCurrent(); const unit = state.tactical.units.find(item => item.id === unitId);
    apply(store, 'execute', { token: state.revision, unitId, actionId, x: unit.x, y: unit.y });
  }
  apply(store, 'interact', 'review');
  apply(store, 'setReflection', { reason: '依教材先查證', revision: '遇到新證據再修正' });
  return apply(store, 'complete');
}
test('新版 profile、自由選章和重新載入，舊 key 從未被讀寫', () => {
  const legacy = 'ndmu-campus-ethics:v1'; const env = setup({ [legacy]: '{old}' });
  assert.equal(env.store.load(), null); env.store.newProfile('  測試學員  ');
  assert.equal(env.store.save.nickname, '測試學員'); assert.equal(env.store.getCurrent().chapterId, 'u01');
  reachTactics(env.store, 'u13'); env.store.setSettings({ reducedMotion: true });
  const reopened = new RPGStore({ storage: env.storage, chapters }); reopened.load();
  assert.deepEqual(reopened.getCurrent(), env.store.getCurrent()); assert.equal(reopened.save.settings.reducedMotion, true);
  assert.equal(env.values.get(legacy), '{old}'); assert.ok(env.reads.every(key => key === RPGStore.KEY));
  assert.throws(() => env.store.newProfile('a'.repeat(41))); assert.throws(() => env.store.newProfile(' '));
});
test('音樂設定預設、更新、重整及JSON匯入匯出保留，不改章節紀錄', () => {
  const { store, storage } = setup(); store.newProfile('音樂測試'); finish(store);
  assert.deepEqual(store.save.settings, { reducedMotion: false, musicEnabled: true, musicVolume: 0.2 });
  const records = JSON.parse(store.exportJSON()).records;
  store.setSettings({ musicEnabled: false }); store.setSettings({ musicVolume: 0.65, reducedMotion: true });
  assert.deepEqual(store.save.settings, { reducedMotion: true, musicEnabled: false, musicVolume: 0.65 });
  assert.deepEqual(store.save.records, records); assert.equal(store.completedCount(), 1);
  const reopened = new RPGStore({ storage, chapters }); reopened.load();
  assert.deepEqual(reopened.save.settings, store.save.settings);
  const restored = setup().store; restored.importJSON(store.exportJSON());
  assert.deepEqual(restored.save.settings, store.save.settings); assert.deepEqual(restored.save.records, records);
  for (const musicVolume of [0, 1]) { store.setSettings({ musicVolume }); assert.equal(store.save.settings.musicVolume, musicVolume); }
});
test('v1僅reducedMotion的存檔及JSON補音樂預設，保留原章節、歷史及完成數', () => {
  const source = setup().store; source.newProfile('相容測試'); finish(source); source.startChapter('u03', true);
  const legacy = JSON.parse(source.exportJSON()); legacy.settings = { reducedMotion: true };
  const raw = JSON.stringify(legacy); const env = setup({ [RPGStore.KEY]: raw });
  env.store.load();
  assert.deepEqual(env.store.save.settings, { reducedMotion: true, musicEnabled: true, musicVolume: 0.2 });
  assert.deepEqual(env.store.save.records, legacy.records); assert.equal(env.store.completedCount(), 1);
  assert.deepEqual(JSON.parse(env.values.get(RPGStore.KEY)).settings, env.store.save.settings);
  assert.deepEqual(JSON.parse(env.store.exportJSON()).records, legacy.records);
  const imported = setup().store; imported.importJSON(raw);
  assert.deepEqual(imported.save.settings, env.store.save.settings); assert.deepEqual(imported.save.records, legacy.records);
  const partial = JSON.parse(raw); partial.settings.musicEnabled = false;
  imported.importJSON(JSON.stringify(partial)); assert.equal(imported.save.settings.musicEnabled, false);
  assert.equal(imported.save.settings.musicVolume, 0.2);
});
test('音樂無效開關、NaN、超界及文字音量拒絕且完全不改現存紀錄', () => {
  const { store, values } = setup(); store.newProfile('音量驗證'); finish(store);
  const before = store.exportJSON(); const diskBefore = values.get(RPGStore.KEY);
  for (const patch of [{ musicEnabled: 'true' }, { musicEnabled: null }, { musicVolume: NaN },
    { musicVolume: Infinity }, { musicVolume: -0.01 }, { musicVolume: 1.01 }, { musicVolume: '0.2' },
    { musicVolume: null }, { unknownMusic: true }]) {
    assert.throws(() => store.setSettings(patch));
    assert.equal(store.exportJSON(), before); assert.equal(values.get(RPGStore.KEY), diskBefore);
    const bad = JSON.parse(before); Object.assign(bad.settings, patch);
    assert.throws(() => store.importJSON(JSON.stringify(bad)));
    assert.equal(store.exportJSON(), before); assert.equal(values.get(RPGStore.KEY), diskBefore);
  }
});
test('真實引擎13章完成、歷次重開保留完成數及獎勵', () => {
  const { store } = setup(); store.newProfile('甲');
  for (const chapter of chapters) finish(store, chapter.id);
  assert.equal(store.completedCount(), 13); const complete = store.getCurrent();
  store.startChapter('u13', true); assert.equal(store.completedCount(), 13);
  assert.deepEqual(store.save.records.u13.attempts[0], complete);
  const restored = setup().store; restored.importJSON(store.exportJSON());
  assert.equal(restored.completedCount(), 13); assert.ok(restored.exportCSV().includes('協作學員'));
});
test('外部 state 不可改動內部；策略中途和反思草稿可恢復', () => {
  const { store, storage } = setup(); store.newProfile('甲'); reachTactics(store);
  const state = store.getCurrent(); const unit = state.tactical.units[0];
  apply(store, 'execute', { token: state.revision, unitId: unit.id, actionId: unit.id + '1', x: unit.x, y: unit.y });
  const external = store.getCurrent(); external.player.x = 900;
  assert.notEqual(store.getCurrent().player.x, 900);
  const reopened = new RPGStore({ storage, chapters }); reopened.load();
  assert.deepEqual(reopened.getCurrent(), store.getCurrent());
  for (const [unitId, actionId] of [['liaison', 'liaison1'], ['logistics', 'logistics1'], ['doctor', 'doctor1'], ['cadet', 'cadet2'], ['liaison', 'liaison2']]) {
    const next = store.getCurrent(); const nextUnit = next.tactical.units.find(item => item.id === unitId);
    apply(store, 'execute', { token: next.revision, unitId, actionId, x: nextUnit.x, y: nextUnit.y });
  }
  apply(store, 'interact', 'review');
  apply(store, 'setReflection', { reason: '尚未提交的教材依據', revision: '新資訊時修正' });
  const draft = new RPGStore({ storage, chapters }); draft.load();
  assert.deepEqual(draft.getCurrent().reflection, store.getCurrent().reflection);
  apply(store, 'retry');
  assert.equal(store.getCurrent().tacticalAttempts.length, 1);
  const backup = setup().store; backup.importJSON(store.exportJSON());
  assert.deepEqual(backup.getCurrent().tacticalAttempts, store.getCurrent().tacticalAttempts);
});
test('匯入整份驗證後才替換；版本、未知章、偽造完成、原型污染與過大檔案拒絕', () => {
  const { store, values } = setup(); store.newProfile('原學員'); reachTactics(store);
  const original = store.exportJSON(); const disk = values.get(RPGStore.KEY);
  const changed = fn => { const data = JSON.parse(original); fn(data); return JSON.stringify(data); };
  const invalid = [changed(v => v.format = 'ndmu-campus-ethics'), changed(v => v.version = 2),
    changed(v => v.records.u99 = v.records.u03), changed(v => v.records.u03.current.chapterId = 'u02'),
    changed(v => v.records.u03.current.phase = 'complete'), changed(v => v.rewards = ['偽造']),
    changed(v => v.settings.reducedMotion = 'yes'), changed(v => v.activeChapter = 'u99'),
    changed(v => v.records.u03.attempts = Array(101).fill(v.records.u03.current)),
    original.replace('"settings":{', '"settings":{"__proto__":{"polluted":true},'),
    'a'.repeat(2 * 1024 * 1024 + 1), changed(v => v.nickname = '學'.repeat(800000))];
  for (const raw of invalid) {
    assert.throws(() => store.importJSON(raw)); assert.equal(store.exportJSON(), original); assert.equal(values.get(RPGStore.KEY), disk);
  }
  assert.equal({}.polluted, undefined);
  assert.throws(() => store.updateState({ ...store.getCurrent(), chapterId: 'u01' }));
});
test('實際舊版不同欄位與破損JSON顯示白話訊息，記憶體及磁碟皆不變', () => {
  const { store, values } = setup(); store.newProfile('目前學員'); reachTactics(store, 'u04');
  const before = store.exportJSON(); const diskBefore = values.get(RPGStore.KEY);
  const old = { format: 'ndmu-campus-ethics', version: 1,
    profile: { id: 'old-learner', nickname: '舊學員', code: '' },
    player: { x: 0, z: 110, yaw: 0, biking: false },
    settings: { lowMotion: false, avatar: 'female' }, missions: {}, updatedAt: new Date().toISOString() };
  const legacyMessage = '不是此版本的國醫倫理冒險紀錄；舊版紀錄不能直接匯入。';
  const parseMessage = 'JSON無法讀取，請確認貼上完整備份；未修改目前紀錄。';
  for (const [raw, expected] of [[JSON.stringify(old), legacyMessage],
    [JSON.stringify({ version: 0, progress: [1, 2], oldNickname: '舊學員' }), legacyMessage],
    ['null', legacyMessage], ['{broken', parseMessage], [before.slice(0, -1), parseMessage], ['', parseMessage]]) {
    assert.throws(() => store.importJSON(raw), error => error.message === expected);
    assert.equal(store.exportJSON(), before); assert.equal(values.get(RPGStore.KEY), diskBefore);
  }
  // A valid JSON object with invalid gameplay state must retain the engine's useful error.
  const invalidState = JSON.parse(before); invalidState.records.u04.current.player.x = 900;
  const state = invalidState.records.u04.current;
  let engineMessage;
  try { Engine.validateState(state, chapters[3]); } catch (error) { engineMessage = error.message; }
  assert.equal(typeof engineMessage, 'string');
  assert.throws(() => store.importJSON(JSON.stringify(invalidState)), error => error.message === engineMessage);
  assert.equal(store.exportJSON(), before); assert.equal(values.get(RPGStore.KEY), diskBefore);
});
test('損壞原文先另 key 備份；備份失敗不覆寫、記憶體仍可匯出', () => {
  const raw = '{damaged'; const env = setup({ [RPGStore.KEY]: raw });
  assert.equal(env.store.load(), null); env.store.load(); assert.equal(env.warnings.length, 1);
  assert.equal(env.values.get(RPGStore.KEY), raw); env.store.newProfile('新學員');
  const recovery = [...env.values.entries()].find(([key]) => key.startsWith(RPGStore.KEY + ':recovery:'));
  assert.ok(recovery); assert.equal(recovery[1], raw);
  const failed = setup({ [RPGStore.KEY]: raw }); failed.storage.setItem = (key, value) => {
    if (key.includes(':recovery:')) throw Error('quota'); failed.values.set(key, value);
  };
  failed.store.load(); failed.store.newProfile('記憶體學員'); failed.store.setSettings({ reducedMotion: true });
  assert.equal(failed.values.get(RPGStore.KEY), raw); assert.equal(JSON.parse(failed.store.exportJSON()).nickname, '記憶體學員');
  assert.ok(failed.warnings.some(value => value.includes('未覆寫')));
});
test('quota 無法寫入仍可遊玩和匯出，warning只提示一次', () => {
  const env = setup(); env.storage.setItem = () => { throw Error('quota'); };
  env.store.newProfile('甲'); finish(env.store); env.store.setSettings({ reducedMotion: true });
  assert.equal(env.store.completedCount(), 1); assert.equal(env.warnings.length, 1);
  assert.equal(setup().store.importJSON(env.store.exportJSON()).records.u03.current.phase, 'complete');
});
test('未先load也保護損壞原文；靜默備份失敗不得覆寫', () => {
  const raw = '{broken'; const env = setup({ [RPGStore.KEY]: raw });
  env.store.newProfile('新學員');
  assert.ok([...env.values.entries()].some(([key, value]) => key.includes(':recovery:') && value === raw));
  const dropped = setup({ [RPGStore.KEY]: raw });
  dropped.storage.setItem = (key, value) => { if (!key.includes(':recovery:')) dropped.values.set(key, value); };
  dropped.store.newProfile('記憶體'); assert.equal(dropped.values.get(RPGStore.KEY), raw);
  assert.equal(JSON.parse(dropped.store.exportJSON()).nickname, '記憶體');
  assert.ok(dropped.warnings.some(value => value.includes('未覆寫')));
});
test('瀏覽器UMD先載引擎後載store，可本機建立和匯出', () => {
  const context = vm.createContext({ TextEncoder });
  for (const file of ['rpg_engine.js', 'rpg_store.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/engine', file), 'utf8'), context);
  }
  context.chapters = chapters;
  vm.runInContext("const store = new RPGStore({ chapters }); store.newProfile('瀏覽器學員'); result = store.exportJSON();", context);
  assert.equal(JSON.parse(context.result).nickname, '瀏覽器學員');
  assert.equal(JSON.parse(context.result).activeChapter, 'u01');
});
test('100次重開達上限不改動；無效設定也不改存檔', () => {
  const { store } = setup(); store.newProfile('甲');
  for (let i = 0; i < 100; i++) store.startChapter('u01', true);
  const original = store.exportJSON(); assert.throws(() => store.startChapter('u01', true), /100/);
  for (const settings of [{ reducedMotion: 1 }, { unknown: true }, null]) assert.throws(() => store.setSettings(settings));
  assert.equal(store.exportJSON(), original);
});
test('CSV BOM、13列、換行引號逗號及公式保護；無單一倫理分數', () => {
  const { store } = setup(); store.newProfile(' =HYPERLINK("外部")'); finish(store);
  store.startChapter('u03', true); failedReview(store);
  apply(store, 'setReflection', { reason: '甲,乙\n"查核"', revision: '\t@SUM(1)' });
  const csv = store.exportCSV(); assert.ok(csv.startsWith('\uFEFF'));
  assert.equal((csv.match(/"u\d\d"/g) || []).length, 13);
  assert.ok(csv.includes("'=HYPERLINK(\"\"外部\"\")"));
  assert.ok(csv.includes('甲,乙\n""查核""')); assert.ok(csv.includes("'\t@SUM(1)"));
  assert.ok(csv.includes('重新挑戰中（曾完成）')); assert.ok(!csv.includes('倫理分數'));
});

function csvRows(csv) {
  assert.equal(csv[0], '\uFEFF');
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 1; i < csv.length; i++) {
    const ch = csv[i];
    if (ch === '"') {
      if (quoted && csv[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && ch === ',') { row.push(value); value = ''; }
    else if (!quoted && ch === '\r' && csv[i + 1] === '\n') {
      row.push(value); rows.push(row); row = []; value = ''; i++;
    } else value += ch;
  }
  assert.equal(quoted, false); row.push(value); rows.push(row);
  return rows;
}
function chapterCSV(store, id = 'u03') {
  const before = store.exportJSON(); const rows = csvRows(store.exportCSV());
  assert.equal(store.exportJSON(), before, 'CSV匯出不得改動JSON或歷史');
  assert.equal(rows.length, 14); assert.equal(rows[0].length, 15);
  assert.ok(rows.every(row => row.length === rows[0].length));
  const row = rows.slice(1).find(values => values[1] === id);
  assert.ok(row); return Object.fromEntries(rows[0].map((key, i) => [key, row[i]]));
}
function failedReview(store, id = 'u03', pathId = 'refer') {
  reachTactics(store, id, pathId);
  for (let i = 0; i < 6; i++) {
    const state = store.getCurrent();
    const unit = state.tactical.units.find(item => !state.tactical.used.includes(item.id));
    apply(store, 'wait', { token: state.revision, unitId: unit.id, x: unit.x, y: unit.y });
  }
  apply(store, 'interact', 'review');
  assert.equal(store.getCurrent().tactical.result.success, false);
}
function assertJSONRoundTrip(store) {
  const records = JSON.parse(store.exportJSON()).records;
  const restored = setup().store; restored.importJSON(store.exportJSON());
  assert.deepEqual(JSON.parse(restored.exportJSON()).records, records);
  assert.equal(restored.exportCSV(), store.exportCSV());
}
function assertHistory(row, first) {
  assert.equal(row['歷次最近完成時間'], first.completedAt);
  assert.equal(row['歷次已取得稱號'], chapters[2].reward.title);
  assert.equal(row['歷次紀念物'], chapters[2].reward.item);
}
test('CSV未開始與首次完成的本次欄位一致，匯出不改JSON', () => {
  const { store } = setup(); store.newProfile('CSV測試');
  const unopened = chapterCSV(store, 'u02'); assert.equal(unopened['狀態'], '未開始');
  for (const key of ['本次階段', '本次方案', '本次結果', '本次完成時間',
    '本次理由與教材依據', '本次何時會修正', '歷次最近完成時間', '歷次已取得稱號', '歷次紀念物']) {
    assert.equal(unopened[key], '');
  }
  const first = finish(store); const row = chapterCSV(store);
  assert.equal(row['本次階段'], 'complete'); assert.equal(row['本次方案'], '先諮詢');
  assert.equal(row['本次結果'], first.tactical.result.title);
  assert.equal(row['本次完成時間'], first.completedAt);
  assert.equal(row['本次理由與教材依據'], first.reflection.reason);
  assert.equal(row['本次何時會修正'], first.reflection.revision);
  assertHistory(row, first); assertJSONRoundTrip(store);
});
test('CSV完成後重玩與換方案不回填歷史時間或反思', () => {
  const { store } = setup(); store.newProfile('CSV測試'); const first = finish(store);
  store.startChapter('u03', true);
  for (const phase of ['briefing', 'exploration']) {
    if (phase === 'exploration') apply(store, 'begin');
    const row = chapterCSV(store); assert.equal(row['本次階段'], phase);
    assert.equal(row['狀態'], '重新挑戰中（曾完成）');
    for (const key of ['本次方案', '本次結果', '本次完成時間', '本次理由與教材依據', '本次何時會修正']) {
      assert.equal(row[key], '');
    }
    assertHistory(row, first);
  }
  for (const clue of ['a', 'b', 'c']) apply(store, 'interact', clue);
  apply(store, 'interact', 'gate'); apply(store, 'choosePath', 'refer');
  const row = chapterCSV(store); assert.equal(row['本次方案'], '先轉介');
  for (const key of ['本次結果', '本次完成時間', '本次理由與教材依據', '本次何時會修正']) assert.equal(row[key], '');
  assertHistory(row, first); assert.equal(store.completedCount(), 1);
  assert.deepEqual(store.save.records.u03.attempts[0], first); assertJSONRoundTrip(store);
});
test('CSV重玩未達標與單欄草稿僅取本次反思，單欄仍不能完成', () => {
  const { store } = setup(); store.newProfile('CSV測試'); const first = finish(store);
  store.startChapter('u03', true); failedReview(store);
  for (const draft of [{ reason: '', revision: '' },
    { reason: '本次轉介理由', revision: '' }, { reason: '', revision: '本次轉介修正' }]) {
    apply(store, 'setReflection', draft); const state = store.getCurrent(); const row = chapterCSV(store);
    assert.equal(row['本次方案'], '先轉介'); assert.equal(row['本次結果'], '轉介待續');
    assert.equal(row['本次階段'], 'review'); assert.equal(row['本次完成時間'], '');
    assert.equal(row['本次理由與教材依據'], draft.reason);
    assert.equal(row['本次何時會修正'], draft.revision); assertHistory(row, first);
    const rejected = Engine.complete(state, chapters[2]); assert.equal(rejected.ok, false);
    assert.deepEqual(store.getCurrent(), state); assert.equal(store.completedCount(), 1);
    assert.deepEqual(store.save.records.u03.attempts[0], first); assertJSONRoundTrip(store);
  }
});
test('CSV第二次未達標仍可完成並保持兩次紀錄，JSON匯入一致', () => {
  const { store } = setup(); store.newProfile('CSV測試'); const first = finish(store);
  store.startChapter('u03', true); failedReview(store);
  apply(store, 'setReflection', { reason: '本次轉介依據', revision: '本次轉介修正' });
  const second = apply(store, 'complete'); const row = chapterCSV(store);
  assert.equal(second.tactical.result.success, false); assert.equal(row['狀態'], '完成');
  assert.equal(row['本次階段'], 'complete'); assert.equal(row['本次方案'], '先轉介');
  assert.equal(row['本次結果'], '轉介待續'); assert.equal(row['本次完成時間'], second.completedAt);
  assert.equal(row['本次理由與教材依據'], second.reflection.reason);
  assert.equal(row['本次何時會修正'], second.reflection.revision); assertHistory(row, second);
  assert.equal(store.completedCount(), 1); assert.equal(store.save.records.u03.attempts.length, 1);
  assert.deepEqual(store.save.records.u03.attempts[0], first);
  assert.deepEqual(store.save.records.u03.current, second); assertJSONRoundTrip(store);
});
