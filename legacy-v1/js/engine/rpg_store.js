(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rpg_engine'));
  else root.RPGStore = factory(root.RPGEngine);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine) {
  'use strict';
  const KEY = 'ndmu-ethics-rpg:v1';
  const FORMAT = 'ndmu-ethics-rpg';
  const LIMIT = 2 * 1024 * 1024;
  const MAX_ATTEMPTS = 100;
  const DEFAULT_SETTINGS = { reducedMotion: false, musicEnabled: true, musicVolume: 0.2 };
  const SETTINGS_KEYS = Object.keys(DEFAULT_SETTINGS);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const now = () => new Date().toISOString();
  const fail = message => { throw new Error(message); };
  const size = value => new TextEncoder().encode(value).length;
  function text(value, label, maximum, required = true) {
    if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())) fail(label + '格式不正確。');
  }
  function date(value, label) {
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(label + '格式不正確。');
  }
  function keys(value, allowed, label) {
    if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) fail(label + '含未知欄位或格式不正確。');
    if (allowed.some(key => !own(value, key))) fail(label + '缺少必要欄位。');
  }
  function checkTree(value, depth = 0) {
    if (depth > 24) fail('存檔資料層數過多。');
    if (typeof value === 'number' && !Number.isFinite(value)) fail('存檔含無效數值。');
    if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof value)) fail('存檔含不支援的資料型別。');
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('存檔含不安全欄位。');
        checkTree(value[key], depth + 1);
      }
    }
  }
  function encode(value) {
    const raw = JSON.stringify(value);
    if (size(raw) > LIMIT) fail('紀錄超過 2 MB，請先匯出備份再建立新紀錄。');
    return raw;
  }
  const completed = state => state.phase === 'complete' && typeof state.completedAt === 'string';
  class RPGStore {
    constructor(options = {}) {
      if (!Engine || typeof Engine.validateState !== 'function' || typeof Engine.createState !== 'function') fail('請先載入 RPGEngine。');
      this.storage = options.storage;
      this.onWarning = typeof options.onWarning === 'function' ? options.onWarning : () => {};
      this.warned = new Set();
      this.save = null;
      this.damagedRaw = null;
      const chapters = Array.isArray(options.chapters) ? options.chapters : Object.values(options.chapters || {});
      this.definitions = new Map();
      for (const chapter of chapters) {
        if (!plain(chapter) || !/^u(0[1-9]|1[0-3])$/.test(chapter.id) || this.definitions.has(chapter.id)) fail('章節設定不正確或重複。');
        this.definitions.set(chapter.id, chapter);
      }
      if (this.definitions.size !== 13) fail('請提供全部 13 章設定。');
    }
    warning(message) {
      if (this.warned.has(message)) return;
      this.warned.add(message);
      // A notification callback must not prevent the learner from keeping a backup.
      try { this.onWarning(message); } catch (_) { /* Storage remains available in memory. */ }
    }
    definition(id) {
      if (!this.definitions.has(id)) fail('找不到這個章節。');
      return this.definitions.get(id);
    }
    requireSave() { if (!this.save) fail('請先建立學習紀錄。'); }
    validateState(state, id) {
      if (!plain(state) || state.chapterId !== id) fail('章節狀態與紀錄不一致。');
      if (Engine.validateState(state, this.definition(id)) !== true) fail('章節狀態驗證失敗。');
    }
    validateSettings(settings, partial = false) {
      if (!plain(settings) || Object.keys(settings).some(key => !SETTINGS_KEYS.includes(key))) fail('設定含未知欄位或格式不正確。');
      if ((!partial || own(settings, 'reducedMotion')) && typeof settings.reducedMotion !== 'boolean') fail('減少動態設定須為開啟或關閉。');
      if (own(settings, 'musicEnabled') && typeof settings.musicEnabled !== 'boolean') fail('音樂設定須為開啟或關閉。');
      if (own(settings, 'musicVolume') && (!Number.isFinite(settings.musicVolume) || settings.musicVolume < 0 || settings.musicVolume > 1)) fail('音樂音量須為 0 到 1 的數值。');
    }
    normalizeSettings(value) {
      const next = clone(value);
      next.settings = Object.assign({}, DEFAULT_SETTINGS, next.settings);
      return next;
    }
    validate(value) {
      checkTree(value);
      if (!plain(value) || value.format !== FORMAT || value.version !== 1) fail('不是此版本的國醫軍事倫理冒險紀錄；舊版紀錄不能直接匯入。');
      keys(value, ['format', 'version', 'nickname', 'createdAt', 'updatedAt', 'activeChapter', 'settings', 'records'], '存檔');
      text(value.nickname, '暱稱', 40); date(value.createdAt, '建立時間'); date(value.updatedAt, '更新時間');
      this.definition(value.activeChapter);
      this.validateSettings(value.settings);
      if (!plain(value.records) || !own(value.records, value.activeChapter)) fail('缺少目前章節紀錄。');
      for (const id of Object.keys(value.records)) {
        this.definition(id);
        const record = value.records[id]; keys(record, ['current', 'attempts'], '章節紀錄');
        if (!Array.isArray(record.attempts) || record.attempts.length > MAX_ATTEMPTS) fail('歷次挑戰紀錄不得超過 100 次。');
        this.validateState(record.current, id);
        for (const attempt of record.attempts) this.validateState(attempt, id);
      }
      encode(value);
      return value;
    }
    load() {
      let raw = null;
      try {
        raw = this.storage && this.storage.getItem(KEY);
        if (raw === null || raw === undefined) return this.save;
        if (typeof raw !== 'string' || size(raw) > LIMIT) fail('原存檔格式不正確或超過 2 MB。');
        const candidate = this.validate(JSON.parse(raw));
        const needsDefaults = !own(candidate.settings, 'musicEnabled') || !own(candidate.settings, 'musicVolume');
        const next = this.validate(this.normalizeSettings(candidate));
        this.save = clone(next); this.damagedRaw = null;
        if (needsDefaults) this.persist();
      } catch (error) {
        if (typeof raw === 'string') this.damagedRaw = raw;
        this.warning('原存檔無法讀取，未刪除或覆寫。請先保存備份。原因：' + error.message);
      }
      return this.save;
    }
    persist() {
      try {
        if (!this.storage || typeof this.storage.setItem !== 'function') fail('瀏覽器無法使用本機儲存。');
        if (this.damagedRaw !== null) {
          const recoveryKey = KEY + ':recovery:' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
          try {
            this.storage.setItem(recoveryKey, this.damagedRaw);
            if (typeof this.storage.getItem !== 'function' || this.storage.getItem(recoveryKey) !== this.damagedRaw) fail('備份原文核對失敗。');
          } catch (_) { fail('損壞原存檔的備份失敗，因此未覆寫原紀錄。'); }
          this.damagedRaw = null;
          this.warning('損壞原存檔已保留備份（' + recoveryKey + '）；現在可保存新紀錄。');
        }
        this.storage.setItem(KEY, encode(this.save));
        return true;
      } catch (error) {
        this.warning('本機存檔失敗；本次紀錄仍保留在記憶體，可繼續操作。請立即匯出 JSON 備份。原因：' + error.message);
        return false;
      }
    }
    commit(next) {
      next.updatedAt = now();
      this.validate(next);
      this.save = clone(next);
      this.persist();
      return this.save;
    }
    newProfile(nickname) {
      text(nickname, '暱稱', 40);
      if (!this.save && this.damagedRaw === null) this.load();
      const createdAt = now();
      return this.commit({ format: FORMAT, version: 1, nickname: nickname.trim(), createdAt, updatedAt: createdAt,
        activeChapter: 'u01', settings: Object.assign({}, DEFAULT_SETTINGS),
        records: { u01: { current: Engine.createState(this.definition('u01')), attempts: [] } } });
    }
    startChapter(id, restart = false) {
      this.requireSave(); const chapter = this.definition(id);
      if (typeof restart !== 'boolean') fail('重新挑戰設定格式不正確。');
      const next = clone(this.save);
      if (!own(next.records, id)) next.records[id] = { current: Engine.createState(chapter), attempts: [] };
      else if (restart) {
        const record = next.records[id];
        if (record.attempts.length >= MAX_ATTEMPTS) fail('已達此章 100 次歷次紀錄上限，請先匯出備份後建立新紀錄。');
        record.attempts.push(clone(record.current)); record.current = Engine.createState(chapter);
      }
      next.activeChapter = id; this.commit(next);
      return this.getCurrent();
    }
    getCurrent() {
      return this.save ? clone(this.save.records[this.save.activeChapter].current) : null;
    }
    updateState(state) {
      this.requireSave(); checkTree(state); this.validateState(state, this.save.activeChapter);
      const next = clone(this.save); next.records[next.activeChapter].current = clone(state);
      this.commit(next); return this.getCurrent();
    }
    setSettings(patch) {
      this.requireSave(); checkTree(patch);
      this.validateSettings(patch, true);
      const next = clone(this.save); Object.assign(next.settings, patch);
      this.commit(next); return clone(this.save.settings);
    }
    exportJSON() { this.requireSave(); this.validate(this.save); return encode(this.save); }
    importJSON(raw) {
      if (typeof raw !== 'string' || size(raw) > LIMIT) fail('匯入檔案不得超過 2 MB，且須為 JSON 文字。');
      let candidate;
      try { candidate = JSON.parse(raw); }
      catch (_) { fail('JSON無法讀取，請確認貼上完整備份；未修改目前紀錄。'); }
      // Validate the entire candidate before changing memory or touching storage.
      const next = this.validate(this.normalizeSettings(this.validate(candidate)));
      if (!this.save && this.damagedRaw === null) this.load();
      return this.commit(clone(next));
    }
    completedCount() {
      if (!this.save) return 0;
      return Object.values(this.save.records).filter(record => completed(record.current) || record.attempts.some(completed)).length;
    }
    exportCSV() {
      this.requireSave(); this.validate(this.save);
      const cell = value => {
        let result = String(value == null ? '' : value);
        if (/^[\s\uFEFF]*[=+@-]/.test(result)) result = "'" + result;
        return '"' + result.replace(/"/g, '""') + '"';
      };
      const rows = [['暱稱', '章節', '任務', '教材主題', '狀態', '本次階段', '本次方案', '本次結果', '本次完成時間', '總挑戰次數（含策略重試）', '本次理由與教材依據', '本次何時會修正', '歷次已取得稱號', '歷次紀念物', '歷次最近完成時間']];
      for (let number = 1; number <= 13; number++) {
        const id = 'u' + String(number).padStart(2, '0'); const chapter = this.definition(id);
        const record = this.save.records[id]; const current = record && record.current;
        const states = record ? [...record.attempts, current] : [];
        const latestComplete = states.filter(completed).pop();
        // Keep current-attempt columns together; history is explicitly labelled below.
        const reflection = current && current.reflection || {};
        const path = current && chapter.scenario.paths.find(item => item.id === current.pathId);
        const result = current && current.tactical && current.tactical.result;
        const status = !record ? '未開始' : completed(current) ? '完成' : latestComplete ? '重新挑戰中（曾完成）' : '進行中';
        const attempts = states.reduce((total, state) => total + 1 + (state.tacticalAttempts || []).length, 0);
        rows.push([this.save.nickname, id, chapter.title, chapter.topic, status, current && current.phase,
          path && path.label, result && result.title, current && completed(current) ? current.completedAt : null,
          attempts, reflection.reason, reflection.revision,
          latestComplete && chapter.reward.title, latestComplete && chapter.reward.item,
          latestComplete && latestComplete.completedAt]);
      }
      return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
    }
  }
  RPGStore.KEY = KEY;
  return RPGStore;
});
