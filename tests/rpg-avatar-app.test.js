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
const LEARNING_KEY = 'ndmu-ethics-rpg:v1';

function fixture({ blockAvatarSave = false } = {}) {
  const queued = [];
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
    focus() {}
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
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem(key, value) {
      if (blockAvatarSave && key === Avatar.KEY) throw new Error('Storage full');
      values.set(key, value);
    }
  };
  const window = {
    RPGAvatar: Avatar,
    RPGAvatarUI: class extends AvatarUI {
      constructor(options) { super({ ...options, document }); }
    },
    RPGEngine: Engine, RPGData: Data, RPGMaps: Maps, RPGStore: Store,
    RPGWorld: World, RPGMusic: Music, localStorage: storage,
    matchMedia: () => ({ matches: false }), addEventListener() {}
  };
  vm.runInNewContext(fs.readFileSync('js/rpg_app.js', 'utf8'), {
    window, document, location: { search: '' }, URLSearchParams,
    setTimeout: () => 1, clearTimeout() {}, clearInterval() {}, setInterval: () => 1
  });
  const modal = nodes.get('modal'), body = nodes.get('modal-body');
  return {
    values, modal, world, music, nodes,
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

test('interrupted first-run appearance edits are discarded and onboarding saves only on submit', () => {
  const f = fixture();
  assert.equal(f.modal.dataset.kind, 'welcome');
  f.change('avatar-hair', 'long');
  f.nodes.get('modal-close').dispatch('click'); f.flush();
  assert.equal(f.values.size, 0);
  f.nodes.get('avatar-button').dispatch('click');
  assert.equal(f.id('avatar-hair').value, 'crop');
  f.change('avatar-hair', 'pony'); f.onboard();
  assert.equal(f.modal.open, false);
  assert.equal(JSON.parse(f.values.get(Avatar.KEY)).hair, 'pony');
  assert.equal(JSON.parse(f.values.get(LEARNING_KEY)).nickname, 'Fictional QA');
});

test('cancel and save preserve learning progress and only save changes the world appearance', () => {
  const f = fixture(); f.onboard();
  const learning = f.values.get(LEARNING_KEY), original = f.values.get(Avatar.KEY);
  f.nodes.get('avatar-button').dispatch('click');
  f.change('avatar-topColor', 'plum');
  assert.equal(f.world.avatar.topColor, 'teal');
  f.click('取消'); f.flush();
  assert.equal(f.values.get(Avatar.KEY), original);
  assert.equal(f.values.get(LEARNING_KEY), learning);
  f.nodes.get('avatar-button').dispatch('click');
  assert.equal(f.id('avatar-topColor').value, 'teal');
  f.change('avatar-topColor', 'plum'); f.click('保存角色外觀'); f.flush();
  assert.equal(JSON.parse(f.values.get(Avatar.KEY)).topColor, 'plum');
  assert.equal(f.world.avatar.topColor, 'plum');
  assert.equal(f.values.get(LEARNING_KEY), learning);
});

test('Escape-style native dialog cancellation discards the draft and restores scene music', () => {
  const f = fixture(); f.onboard();
  f.nodes.get('avatar-button').dispatch('click');
  f.change('avatar-hair', 'long');
  assert.equal(f.music.scene, 'dialogue');
  f.modal.dispatch('cancel'); f.modal.close(); f.flush();
  assert.equal(f.music.scene, f.world.state.phase);
  f.nodes.get('avatar-button').dispatch('click');
  assert.equal(f.id('avatar-hair').value, 'crop');
});

test('a queued close event cannot unduck a synchronously reopened welcome dialog', () => {
  const f = fixture(); f.onboard();
  f.nodes.get('task-body').all().find(node => node.textContent === '出發探索 →').dispatch('click');
  assert.equal(f.world.state.phase, 'exploration');
  f.nodes.get('records-button').dispatch('click');
  f.click('建立新學員紀錄'); f.click('確認繼續');
  assert.equal(f.modal.open, true);
  assert.equal(f.music.scene, 'dialogue');
  f.flush();
  assert.equal(f.modal.open, true);
  assert.equal(f.music.scene, 'dialogue');
});

test('failed cosmetic persistence warns without discarding the learning profile or applied appearance', () => {
  const f = fixture({ blockAvatarSave: true });
  f.change('avatar-hair', 'long'); f.onboard();
  assert.equal(f.modal.open, false);
  assert.equal(f.world.avatar.hair, 'long');
  assert.ok(f.values.get(LEARNING_KEY));
  assert.equal(f.values.has(Avatar.KEY), false);
  assert.match(f.nodes.get('toast').textContent, /無法保存外觀/);
});
