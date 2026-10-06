'use strict';

// App-level event tests. The DOM, rendering and audio are stubs: these cases do
// not replace native-browser focus, layout, touch or audible-playback QA.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Avatar = require('../js/engine/rpg_avatar');
const AvatarUI = require('../js/rpg_avatar_ui');
const Engine = require('../js/engine/rpg_engine');
const Data = require('../js/data/rpg_chapters');
const Maps = require('../js/data/rpg_maps');
const Store = require('../js/engine/rpg_store');
const Schedule = require('../js/data/course_schedule');
const Bonus = require('../js/engine/rpg_bonus');
const BonusContent = require('../js/data/rpg_bonus_content');
const LEARNING_KEY = 'ndmu-ethics-rpg:v1';

function fixture({ now = '2026-10-06T13:30:00+08:00', search = '', initial = {}, formal = true, schedule = Schedule } = {}) {
  const queued = [], timers = [], windowEvents = {}, writes = [];
  let clock = Date.parse(now), bonus;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }

  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = []; this.events = {}; this.dataset = {}; this.style = {};
      this.classList = { toggle() {}, add() {}, remove() {} };
      this.value = ''; this.textContent = ''; this.hidden = false;
      this.attributes = {}; this.parentElement = { scrollTop: 0 };
    }
    append(...nodes) {
      for (const node of nodes) {
        if (node && typeof node === 'object') node.parentElement = this;
        this.children.push(node);
      }
    }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    dispatch(type, event = {}) {
      for (const fn of this.events[type] || []) {
        fn({ target: this, isTrusted: false, preventDefault() {}, ...event });
      }
    }
    focus() {} select() {}
    get firstChild() { return this.children[0]; }
    get elements() { return Object.fromEntries(this.all().filter(node => node.name).map(node => [node.name,node])); }
    getContext() { return new Proxy({}, { get: () => () => {}, set: () => true }); }
    closest() { return null; }
    showModal() { this.open = true; }
    close() {
      if (!this.open) return;
      this.open = false;
      // The real dialog close event is queued, not dispatched synchronously.
      queued.push(() => this.dispatch('close'));
    }
    all() { return [this, ...this.children.flatMap(node => node?.all?.() || [])]; }
  }
  const nodes = new Map();
  const html = fs.readFileSync('legacy-v1/index.html', 'utf8');
  for (const match of html.matchAll(/<([\w-]+)[^>]* id="([^"]+)"[^>]*>/g)) {
    const node = new Element(match[1]); node.id = match[2]; nodes.set(node.id, node);
  }
  const document = {
    body: new Element('body'), hidden: false,
    createElement: tag => new Element(tag), addEventListener() {},
    getElementById(id) {
      return nodes.get(id) || [...nodes.values()].flatMap(node => node.all()).find(node => node.id === id);
    },
    querySelectorAll(selector) {
      return selector === '.header-actions button'
        ? ['avatar', 'chapters', 'concepts', 'records', 'bonus', 'settings'].map(id => nodes.get(id + '-button'))
        : [];
    },
    querySelector() { return null; }
  };
  nodes.get('storage-warning').hidden = true;
  let world, music;
  class World {
    constructor() { world = this; this.avatar = Avatar.defaults; }
    start() {} stop() {} draw() {}
    set(state, chapter) { this.state = state; this.chapter = chapter; }
    setAvatar(value) { this.avatar = value; }
    static portrait() {}
  }
  class Music {
    constructor() { music = this; this.enabled = true; this.volume = .2; this.scene = 'exploration'; }
    getStatus() { return { enabled: this.enabled, volume: this.volume, playing: false, message: '' }; }
    setChapter(id) { this.chapterId = id; }
    setScene(scene) { this.scene = scene; }
    setEnabled(value) { this.enabled = value; }
    setVolume(value) { this.volume = value; }
    effect() {} unlock() {} resume() {} pause() {}
  }
  const values = new Map(Object.entries(initial));
  const storage = {
    getItem: key => values.get(key) || null,
    setItem(key, value) {
      writes.push(key); values.set(key, value);
    }
  };
  const window = {
    RPGAvatar: Avatar,
    RPGAvatarUI: class extends AvatarUI {
      constructor(options) { super({ ...options, document }); }
    },
    RPGEngine: Engine, RPGData: Data, RPGMaps: Maps, RPGStore: Store,
    RPGWorld: World, RPGMusic: Music, localStorage: storage,
    CourseSchedule: schedule, RPGRuntimeConfig: formal ? { mode: 'formal' } : undefined,
    RPGBonus: Bonus, RPGBonusContent: BonusContent,
    matchMedia: () => ({ matches: false }), addEventListener(name, fn) { (windowEvents[name] ||= []).push(fn); }
  };
  const context = vm.createContext({ window, document, location: { search }, URLSearchParams, Date: Clock,
    RPGBonus: Bonus, RPGBonusContent: BonusContent,
    setTimeout: () => 1, clearTimeout() {}, clearInterval() {}, setInterval: (fn, delay) => { timers.push({ fn, delay }); return timers.length; }
  });
  vm.runInContext(fs.readFileSync('js/rpg_bonus_ui.js', 'utf8'), context);
  window.RPGBonusUI = class extends context.RPGBonusUI { constructor(options) { super(options); bonus = this; } };
  vm.runInContext(fs.readFileSync('js/rpg_app.js', 'utf8'), context);
  const modal = nodes.get('modal'), body = nodes.get('modal-body');
  return {
    values, modal, world, music, nodes, writes, bonus,
    saved: () => JSON.parse(values.get(LEARNING_KEY)),
    setNow(now, refresh = true) { clock = typeof now === 'number' ? now : Date.parse(now); if(refresh)timers.filter(t => t.delay === 1000).forEach(t => t.fn()); },
    fire(name) { (windowEvents[name] || []).forEach(fn => fn()); },
    chapter(id) { return nodes.get('chapter-list').all().find(node => node.dataset.chapterId === id); },
    task(text) { return nodes.get('task-body').all().find(node => node.textContent === text); },

    id: id => document.getElementById(id),
    find: text => body.all().find(node => node.textContent === text),
    click(text) {
      const node = body.all().find(node => node.textContent === text);
      assert.ok(node, 'Expected button: ' + text); node.dispatch('click');
    },
    change(id, value) { const node = document.getElementById(id); node.value = value; node.dispatch('change'); },
    submit() { body.all().find(node => node.tagName === 'FORM').dispatch('submit'); },
    flush() { while (queued.length) queued.shift()(); },
    onboard() { document.getElementById('nickname').value = 'Fictional QA'; this.submit(); this.flush(); }
  };
}


const chapters = Data.chapters.map(Maps.apply);
function profile(id = 'u03', phase = 'briefing', history = false) {
  const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key,value) => values.set(key,value) };
  const store = new Store({ storage, chapters }); store.newProfile('Fictional schedule QA'); store.startChapter(id);
  const c = chapters.find(c => c.id === id);
  const apply = result => { assert.equal(result.ok,true,result.message); store.updateState(result.state); return result.state; };
  if (phase !== 'briefing') apply(Engine.begin(store.getCurrent(),c));
  if (['outcome','review','complete'].includes(phase)) {
    for (const clue of c.clues) { const s=store.getCurrent(); s.player={x:clue.x,y:clue.y,facing:'up'}; apply(Engine.interact(s,c,clue.id)); }
    const s=store.getCurrent(); s.player={x:c.map.gate.x,y:c.map.gate.y,facing:'up'}; apply(Engine.interact(s,c,'gate'));
    apply(Engine.choosePath(store.getCurrent(),c,c.scenario.paths[0].id));
    for(let i=0;i<6;i++){ const s=store.getCurrent();apply(Engine.wait(s,c,{token:s.revision,unitId:i%2?'liaison':'cadet'})); }
    if(phase!=='outcome')apply(Engine.interact(store.getCurrent(),c,'review'));
    if(phase==='complete'){apply(Engine.setReflection(store.getCurrent(),c,{reason:'保留早期授權紀錄',revision:'新證據出現時修正'}));apply(Engine.complete(store.getCurrent(),c));}
  }
  if(history)store.startChapter(id,true);
  return { raw:store.exportJSON(), save:store.save, initial:Object.fromEntries(values) };
}

test('formal legacy gate is explicitly loaded before app; both app sources match and attendance entry remains intact', () => {
  const html=fs.readFileSync('legacy-v1/index.html','utf8');
  assert.match(html,/window.RPGRuntimeConfig=Object.freeze\(\{mode:'formal'\}\)/);
  assert.ok(html.indexOf('js/data/course_schedule.js')<html.indexOf('js/rpg_app.js'));
  assert.match(html,/id="classroom-receipt"/);assert.match(html,/id="legacy-queue-export"/);
  assert.equal(fs.readFileSync('legacy-v1/js/rpg_app.js','utf8'),fs.readFileSync('js/rpg_app.js','utf8'));
});

for (const id of Object.keys(Schedule.entries)) test(id+' legacy chapter entry opens at exact Taipei class start, never before', () => {
  const opens=Date.parse(Schedule.get(id).opensAt), f=fixture({now:new Date(opens-1).toISOString(),initial:profile('u01').initial});
  const before=f.values.get(LEARNING_KEY);
  assert.equal(f.chapter(id).attributes['aria-disabled'],'true');
  f.chapter(id).dispatch('click');assert.equal(f.values.get(LEARNING_KEY),before);
  assert.match(f.nodes.get('toast').textContent,/13:30（台北時間）/);
  f.setNow(opens);assert.equal(f.chapter(id).attributes['aria-disabled'],'false');
  f.chapter(id).dispatch('click');assert.equal(f.saved().activeChapter,id);
  f.setNow('2028-01-01T00:00:00Z');assert.equal(f.chapter(id).attributes['aria-disabled'],'false');
});

test('fresh blocked deep link explains its date and onboards into an already-open chapter', () => {
  const f=fixture({search:'?chapter=u13'});assert.equal(f.modal.dataset.kind,'welcome');
  assert.ok(f.nodes.get('modal-body').all().some(n=>n.textContent.includes('2026/12/22 13:30')));
  f.onboard();assert.equal(f.saved().activeChapter,'u03');assert.equal(f.saved().records.u13,undefined);
  assert.match(f.nodes.get('toast').textContent,/尚未開放/);
});

test('existing blocked deep link never replaces the saved chapter or data, allowed deep link does navigate', () => {
  const p=profile('u02'), f=fixture({search:'?chapter=u13',initial:p.initial});
  assert.equal(f.values.get(LEARNING_KEY),p.raw);assert.equal(f.saved().activeChapter,'u02');
  const open=fixture({search:'?chapter=u03',initial:p.initial});assert.equal(open.saved().activeChapter,'u03');
  assert.deepEqual(open.saved().records.u02,p.save.records.u02);
});

test('onboarding before the first class creates no profile; same open form works after boundary', () => {
  const start=Date.parse(Schedule.get('u01').opensAt),f=fixture({now:new Date(start-1).toISOString()});
  assert.equal(f.id('onboarding-submit').disabled,true);f.onboard();assert.equal(f.values.has(LEARNING_KEY),false);
  f.setNow(start);assert.equal(f.id('onboarding-submit').disabled,false);f.onboard();assert.equal(f.saved().activeChapter,'u01');
});

test('loaded future progress and early completed history stay readable and losslessly exportable', () => {
  const p=profile('u13','complete',true),extra='ndmu-ethics-classroom:queue:v1',f=fixture({initial:{...p.initial,[extra]:'existing queue bytes'}});
  assert.equal(f.values.get(LEARNING_KEY),p.raw);assert.equal(f.nodes.get('scene').style.visibility,'hidden');
  assert.equal(f.nodes.get('phase-label').textContent,'尚未開放');assert.equal(f.nodes.get('completion-count').textContent,'1 / 13');
  f.nodes.get('records-button').dispatch('click');f.nodes.get('modal-body').all().filter(n=>n.textContent==='查看').at(-1).dispatch('click');
  assert.ok(f.nodes.get('modal-body').all().some(n=>n.textContent==='理由與依據：保留早期授權紀錄'));
  f.nodes.get('records-button').dispatch('click');f.click('查看備份文字');
  const backup=f.nodes.get('modal-body').all().find(n=>n.attributes['aria-label']==='完整 JSON 備份文字');
  assert.equal(backup.value,p.raw);assert.equal(f.values.get(extra),'existing queue bytes');assert.equal(f.writes.length,0);
});

test('importing locked active chapter retains every history and leaves play gated', async () => {
  const p=profile('u13','complete',true),f=fixture({initial:profile('u03').initial});
  await f.nodes.get('import-file').events.change[0]({target:{files:[{size:p.raw.length,text:async()=>p.raw}],value:''}});
  assert.equal(f.saved().activeChapter,'u13');assert.deepEqual(f.saved().records,p.save.records);
  assert.equal(f.nodes.get('scene').style.visibility,'hidden');assert.equal(f.task('出發探索 →'),undefined);
  assert.equal(f.nodes.get('completion-count').textContent,'1 / 13');
});

test('resume unlocks in place at boundary without replacing imported history', () => {
  const p=profile('u13','exploration'),f=fixture({initial:p.initial});
  assert.equal(f.nodes.get('scene').style.visibility,'hidden');f.setNow(Schedule.get('u13').opensAt);
  assert.equal(f.nodes.get('scene').style.visibility,'');assert.equal(f.world.state.phase,'exploration');assert.equal(f.values.get(LEARNING_KEY),p.raw);
});

test('pending retry confirmation rechecks opening time and cannot clear old attempt', () => {
  const p=profile('u13','outcome'),f=fixture({now:'2026-12-22T13:30:00+08:00',initial:p.initial});
  f.task('重試三回合策略').dispatch('click');f.setNow('2026-10-06T13:30:00+08:00',false);f.click('確認繼續');
  assert.equal(f.values.get(LEARNING_KEY),p.raw);assert.match(f.nodes.get('toast').textContent,/尚未開放/);
});

test('pending restart and next chapter never create premature attempts', () => {
  const p=profile('u03','complete'),f=fixture({initial:p.initial});
  f.task('繼續下一章 →').dispatch('click');assert.equal(f.values.get(LEARNING_KEY),p.raw);assert.equal(f.saved().records.u04,undefined);
  f.task('重新挑戰本章').dispatch('click');f.setNow('2026-10-06T13:29:59+08:00',false);f.click('確認繼續');assert.equal(f.values.get(LEARNING_KEY),p.raw);
});

test('reflection input and submit both recheck time before modifying a saved draft', () => {
  const p=profile('u13','review'),f=fixture({now:'2026-12-22T13:30:00+08:00',initial:p.initial});
  const reason=f.id('reflection-reason'),revision=f.id('reflection-revision'),form=f.id('reflection-form');
  f.setNow('2026-10-06T13:30:00+08:00',false);reason.value='must not save';revision.value='must not save';reason.dispatch('input');form.dispatch('submit');
  assert.equal(f.values.get(LEARNING_KEY),p.raw);
});

test('bonus entry and stale puzzle callbacks are gated while old bonus backup stays accessible', () => {
  const p=profile('u13','exploration'),f=fixture({now:'2026-12-22T13:30:00+08:00',initial:p.initial});
  const content=BonusContent.getChapter('u13'),marker=content.markers.find(m=>m.puzzleId);
  f.bonus.openMarker(marker.id);f.bonus.puzzle(marker.puzzleId);
  const hint=f.find('需要一點提示'),key=Bonus.STORAGE_KEY+':'+p.save.createdAt,before=f.values.get(key);
  assert.ok(before);f.setNow('2026-10-06T13:30:00+08:00',false);hint.dispatch('click');assert.equal(f.values.get(key),before);
  f.nodes.get('bonus-button').dispatch('click');assert.match(f.nodes.get('toast').textContent,/尚未開放/);
  f.setNow('2026-10-06T13:30:00+08:00');f.task('備份支線與收藏').dispatch('click');
  const backup=f.nodes.get('modal-body').all().find(n=>n.attributes['aria-label']==='支線收藏 JSON 備份');
  assert.deepEqual(JSON.parse(backup.value),JSON.parse(before));assert.equal(f.values.get(key),before);
});

test('schedule failure closes formal entry safely but leaves read-only backup reachable', () => {
  const p=profile('u03');
  // Explicit null simulates a failed schedule script load.
  const missing=fixture({schedule:null,initial:p.initial});assert.equal(missing.nodes.get('phase-label').textContent,'尚未開放');
  assert.equal(missing.values.get(LEARNING_KEY),p.raw);missing.nodes.get('records-button').dispatch('click');missing.click('查看備份文字');
  assert.ok(missing.nodes.get('modal-body').all().some(n=>n.value===p.raw));
});

test('nonformal preview app keeps independent free chapter entry and original onboarding', () => {
  const f=fixture({formal:false,now:'2026-01-01T00:00:00Z',search:'?chapter=u13'});f.onboard();assert.equal(f.saved().activeChapter,'u13');
  assert.equal(f.chapter('u13').attributes['aria-disabled'],'false');
});
