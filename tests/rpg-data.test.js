'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chapters, sources, party } = require('../js/data/rpg_chapters.js');
const base = path.resolve(__dirname, '..');
const roles = ['cadet', 'liaison', 'logistics', 'doctor'];
const keys = ['time', 'supplies', 'load'];
const text = value => assert.ok(typeof value === 'string' && value.trim(), 'Expected nonempty text');
function blocked(map, x, y) {
  return x < 0 || y < 0 || x >= map.width || y >= map.height ||
    map.walls.some(w => x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h);
}
function flood(map) {
  const found = new Set(), queue = [map.spawn];
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i], key = x + ',' + y;
    if (found.has(key) || blocked(map, x, y)) continue;
    found.add(key);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) queue.push({ x: x + dx, y: y + dy });
  }
  return found;
}
function cost(value) {
  assert.deepEqual(Object.keys(value).sort(), keys.slice().sort());
  for (const key of keys) assert.ok(Number.isInteger(value[key]));
  assert.ok(value.time >= 0 && value.supplies >= 0);
}

test('13 chapters have stable IDs; browser and Node UMD exports agree', () => {
  assert.deepEqual(chapters.map(c => c.id), Array.from({ length: 13 }, (_, i) => 'u' + String(i + 1).padStart(2, '0')));
  assert.deepEqual(party.map(p => p.id), roles);
  party.forEach(p => ['name', 'role', 'color', 'description'].forEach(k => text(p[k])));
  const browser = {};
  vm.runInNewContext(fs.readFileSync(path.join(base, 'js/data/rpg_chapters.js'), 'utf8'), browser);
  assert.equal(JSON.stringify(browser.RPGData), JSON.stringify({ chapters, sources, party }));
});

// Frozen from the verified 2D snapshot; public tests do not read or distribute textbook PDFs.
const referenceFixture = require('./fixtures/source-references.json');
for (const chapter of chapters) {
  test(chapter.id + ': educational content and original PDF reference retained', () => {
    assert.equal(chapter.number, Number(chapter.id.slice(1)));
    ['title', 'topic', 'region', 'intro', 'objective'].forEach(k => text(chapter[k]));
    assert.ok(chapter.concepts.length >= 2);
    chapter.concepts.forEach(c => { text(c.term); text(c.text); });
    const original = referenceFixture.find(c => c.id === chapter.id);
    const localRefs = chapter.sourceRefs.filter(r => !r.file.startsWith('https:'));
    assert.ok(localRefs.length);
    for (const ref of localRefs) {
      assert.match(ref.file, /^教材\/.+\.pdf$/);
      assert.ok(ref.pages.every(p => Number.isInteger(p) && p > 0));
      const old = original.sourceRefs.find(r => r.file === ref.file);
      assert.ok(old, 'Unverified textbook mapping ' + ref.file);
      assert.equal(JSON.stringify(ref.pages), JSON.stringify(old.pages));
      text(ref.label);
    }
    for (const ref of chapter.sourceRefs.filter(r => r.file.startsWith('https:'))) {
      assert.ok(sources.some(s => s.url === ref.file));
      assert.deepEqual(ref.pages, []);
    }
    ['title', 'item', 'story'].forEach(k => text(chapter.reward[k]));
  });
  test(chapter.id + ': all exploration clues, side quest, and gate are reachable', () => {
    const map = chapter.map;
    assert.equal(map.width, 16); assert.equal(map.height, 20);
    assert.deepEqual(map.spawn, { x: 8, y: 17 });
    assert.deepEqual(map.gate, { x: 8, y: 3 });
    map.walls.forEach(w => {
      assert.ok([w.x, w.y, w.w, w.h].every(Number.isInteger));
      assert.ok(w.w > 0 && w.h > 0 && w.x >= 0 && w.y >= 0 && w.x + w.w <= 16 && w.y + w.h <= 20);
    });
    const reachable = flood(map);
    assert.equal(chapter.clues.length, 3);
    assert.equal(new Set(chapter.clues.map(c => c.id)).size, 3);
    chapter.clues.forEach(c => ['id', 'name', 'text', 'type'].forEach(k => text(c[k])));
    ['name', 'text', 'reward'].forEach(k => text(chapter.sideQuest[k]));
    for (const item of [...chapter.clues, chapter.sideQuest, map.gate]) {
      assert.ok(Number.isInteger(item.x) && Number.isInteger(item.y));
      assert.ok(reachable.has(item.x + ',' + item.y), 'Unreachable interaction');
    }
  });
  test(chapter.id + ': tactical costs, roles, flags, events and two meaningful paths are valid', () => {
    const scenario = chapter.scenario;
    assert.deepEqual(Object.keys(scenario.resources).sort(), keys.slice().sort());
    for (const key of keys) assert.ok(Number.isInteger(scenario.resources[key]) && scenario.resources[key] >= 0 && scenario.resources[key] <= (key === 'load' ? 9 : 20));
    const targetIDs = new Set(scenario.targets.map(t => t.id));
    assert.equal(targetIDs.size, scenario.targets.length);
    scenario.targets.forEach(t => {
      assert.ok(Number.isInteger(t.x) && Number.isInteger(t.y) && t.x >= 0 && t.x < 6 && t.y >= 0 && t.y < 8);
      ['id', 'name', 'text'].forEach(k => text(t[k]));
    });
    assert.equal(new Set(scenario.actions.map(a => a.id)).size, scenario.actions.length);
    const flags = new Set(scenario.actions.map(a => a.flag));
    assert.equal(flags.size, scenario.actions.length);
    scenario.actions.forEach(a => {
      assert.ok(roles.includes(a.unitId) && targetIDs.has(a.targetId));
      assert.ok(['查證', '協商', '調度', '保護', '專業支援'].includes(a.kind));
      ['id', 'label', 'preview', 'feedback', 'flag'].forEach(k => text(a[k])); cost(a.cost);
    });
    roles.forEach(role => assert.ok(scenario.actions.filter(a => a.unitId === role).length >= 2));
    assert.deepEqual(scenario.events.map(e => e.round), [1, 2]);
    scenario.events.forEach(e => {
      text(e.text);
      assert.deepEqual(Object.keys(e.delta).sort(), keys.slice().sort());
      assert.ok(keys.every(k => Number.isInteger(e.delta[k])));
      assert.ok(keys.some(k => e.delta[k] !== 0));
    });
    assert.match(scenario.events[1].text, /新資訊/);
    assert.equal(scenario.paths.length, 2);
    assert.equal(new Set(scenario.paths.map(p => p.label)).size, 2);
    scenario.paths.forEach(p => {
      ['id', 'label', 'text', 'tradeoff'].forEach(k => text(p[k])); cost(p.cost);
      assert.ok(keys.some(k => p.cost[k] !== 0));
      assert.equal(p.requiredFlags.length, 4, 'Every selected plan needs all four roles, including actual deployment');
      assert.equal(new Set(p.requiredFlags).size, p.requiredFlags.length);
      p.requiredFlags.forEach(f => assert.ok(flags.has(f)));
      assert.deepEqual(p.requiredFlags.map(f => scenario.actions.find(a => a.flag === f).unitId).sort(), roles.slice().sort());
      for (const result of [p.success, p.partial]) { text(result.title); text(result.text); }
      assert.notEqual(p.success.text, p.partial.text);
      assert.doesNotMatch(p.partial.text, /已建立|已啟動|已有部分|已被看見|已收到|已完成|已部分到位|已整理|已做部分|已收集|已見|已到位/, 'Partial outcome must also be truthful after six wait commands');
    });
    assert.notEqual(scenario.paths[0].requiredFlags.join(','), scenario.paths[1].requiredFlags.join(','));
  });
}

test('chapter content is distinct; official sources are explicit and reform is not claimed effective', () => {
  assert.equal(new Set(chapters.map(c => c.intro)).size, 13);
  assert.equal(new Set(chapters.flatMap(c => c.clues.map(l => l.text))).size, 39);
  assert.equal(new Set(chapters.flatMap(c => c.scenario.actions.map(a => a.id))).size, 104);
  assert.equal(sources.length, 3);
  sources.forEach(s => { assert.equal(s.checked, '2026-10-04'); assert.match(s.url, /^https:\/\/(www\.aac\.moj\.gov\.tw|law\.mnd\.gov\.tw|www\.mnd\.gov\.tw)\//); text(s.status); });
  assert.match(JSON.stringify(chapters[6]), /傳聞/);
  assert.match(JSON.stringify(chapters[9]), /108\.04\.03/);
  assert.match(JSON.stringify(chapters[9]), /草案/);
  assert.match(JSON.stringify(chapters[9]), /不能.*生效/);
  assert.match(chapters[12].concepts[0].text, /諮詢自省.*執行.*評估回饋/);
  const simplified = JSON.stringify({ chapters, sources, party }).match(/[学没较传资队时门场发过为并当后体这条该记国军从个样会说应员来现项验规报风讲无寻楼损坏谁阅营题专断区统决电终义适达择际状语种扩兴争惊环变长网装问书乡处观确览极顾属简轻难仅纸视给启丽节鸣战庆陆罚审贪预则尔献盗拟担远训举识见]/g);
  assert.equal(simplified, null, 'Traditional Chinese required; unexpected characters: ' + (simplified || []).join(''));
});
