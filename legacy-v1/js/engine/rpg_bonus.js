/* Optional bonus state machine. No DOM, network, storage, clock, or main RPG state.
 * Scores are derived only by replaying accepted, content-validated events.
 * This supports trusted server replay, not identity verification or anti-cheat claims.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../data/rpg_bonus_content'));
  else root.RPGBonus = factory(root.RPGBonusContent);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Content) {
  'use strict';
  if (!Content || !Array.isArray(Content.chapters)) throw new Error('請先載入 RPGBonusContent。');
  const VERSION = 1;
  const FORMAT = 'ndmu-ethics-rpg-bonus';
  const EVENT_FORMAT = 'ndmu-ethics-rpg-bonus-events';
  const CONTENT_VERSION = Content.VERSION;
  const STORAGE_KEY = 'ndmu-ethics-rpg:bonus:v1';
  const MAX_EVENTS = 2048;
  const MAX_BYTES = 1024 * 1024;
  const MAX_EVENT_ID = 128;
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
  const clone = value => JSON.parse(JSON.stringify(value));
  const freeze = value => {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  function fail(message, code = 'invalid') { const error = new Error(message); error.code = code; throw error; }
  function exact(value, keys, label) {
    if (!plain(value) || Object.keys(value).length !== keys.length || keys.some(key => !own(value, key))) fail(label + '欄位不正確。');
    if (Object.keys(value).some(key => !keys.includes(key))) fail(label + '含未知欄位。');
  }
  function jsonTree(value, depth = 0) {
    if (depth > 10) fail('加值紀錄層數過多。');
    if (typeof value === 'string') { if (value.length > 512) fail('紀錄字串過長。'); return; }
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail('紀錄數值不正確。'); return; }
    if (value === null || typeof value === 'boolean') return;
    if (Array.isArray(value)) {
      if (value.length > MAX_EVENTS) fail('紀錄項目過多。');
      if (Object.keys(value).length !== value.length) fail('紀錄陣列不可缺項或附帶其他欄位。');
      for (let i = 0; i < value.length; i++) { if (!own(value, i)) fail('紀錄陣列不可缺項。'); jsonTree(value[i], depth + 1); }
      return;
    }
    if (!plain(value)) fail('加值紀錄含不支援的資料型別。');
    for (const key of Object.keys(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) fail('加值紀錄含不安全欄位。');
      jsonTree(value[key], depth + 1);
    }
  }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  }
  const stringify = value => JSON.stringify(canonical(value));
  function bytes(value) {
    const raw = JSON.stringify(value);
    return typeof TextEncoder === 'function' ? new TextEncoder().encode(raw).length : raw.length * 3;
  }
  function getChapter(id) {
    const chapter = Content.getChapter(id);
    if (!chapter) fail('找不到這個支線章節。', 'chapter');
    return chapter;
  }
  function marker(chapter, id) {
    const value = chapter.markers.find(item => item.id === id);
    if (!value) fail('找不到這個可選互動點。', 'target');
    return value;
  }
  function puzzle(chapter, id) {
    const value = chapter.puzzles.find(item => item.id === id);
    if (!value) fail('找不到這個益智練習。', 'target');
    return value;
  }
  function markerFor(chapter, puzzleId) { return chapter.markers.find(item => item.puzzleId === puzzleId); }
  function feedback(title, text, details = []) { return { title, text, details }; }
  const noAward = () => ({ points: 0, collectibles: [], puzzles: [] });
  function freshProgress() { return { attempts: 0, hintsShown: 0, solved: false, lastAnswer: null, lastCorrect: null }; }
  function projection() { return { revision: 0, visited: new Set(), completed: new Set(), progress: {}, ids: new Map(), signatures: new Set() }; }
  function signature(event) {
    let payload = event.payload;
    const definition = Content.getChapter(event.chapterId)?.puzzles.find(item => item.id === event.targetId);
    if (event.type === 'answer' && definition?.kind === 'resource-plan' && Array.isArray(payload.answer)) payload = { answer: [...payload.answer].sort() };
    return stringify({ type: event.type, chapterId: event.chapterId, targetId: event.targetId, payload });
  }
  function eventShape(event) {
    exact(event, ['id', 'type', 'chapterId', 'targetId', 'payload', 'token'], '支線事件');
    if (typeof event.id !== 'string' || event.id.length > MAX_EVENT_ID || !/^[a-zA-Z0-9._:-]+$/.test(event.id)) fail('支線事件識別碼不正確。', 'event-id');
    if (!['interact', 'answer', 'hint'].includes(event.type)) fail('不支援這種支線操作。', 'event-type');
    if (!Number.isSafeInteger(event.token) || event.token < 0) fail('支線事件版本不正確。', 'stale');
    if (typeof event.chapterId !== 'string' || typeof event.targetId !== 'string') fail('支線事件目標不正確。', 'target');
    if (event.type === 'answer') exact(event.payload, ['answer'], '解謎輸入');
    else if (event.type === 'hint') exact(event.payload, ['index'], '提示輸入');
    else exact(event.payload, [], '探索輸入');
    jsonTree(event);
  }
  function checkAnswer(definition, value) {
    const bad = text => ({ valid: false, correct: false, feedback: feedback('還差一點資料', text) });
    if (definition.kind === 'evidence-sort') {
      if (!plain(value) || Object.keys(value).length !== definition.cards.length ||
        definition.cards.some(card => !own(value, card.id)) || Object.keys(value).some(id => !definition.cards.some(card => card.id === id)))
        return bad('請為每張卡選一個資料欄；不接受多出的卡片。');
      if (Object.values(value).some(id => !definition.categories.some(category => category.id === id))) return bad('有卡片尚未選到有效的資料欄。');
      const wrong = definition.cards.filter(card => value[card.id] !== card.category);
      return { valid: true, correct: wrong.length === 0, answer: clone(value),
        feedback: wrong.length ? feedback('可以再核對', '目前還有 ' + wrong.length + ' 張卡需要調整。沒有扣分，可查看提示後再試。', wrong.map(card => card.label + '：' + card.reason)) :
          feedback('資料欄核對完成', definition.rationale, definition.cards.map(card => card.reason)) };
    }
    if (definition.kind === 'dependency-order') {
      if (!Array.isArray(value) || value.length !== definition.cards.length || new Set(value).size !== value.length || value.some(id => !definition.cards.some(card => card.id === id)))
        return bad('請讓每張卡出現一次，不可省略或重複。');
      const wrong = definition.constraints.filter(rule => value.indexOf(rule.before) >= value.indexOf(rule.after));
      return { valid: true, correct: wrong.length === 0, answer: clone(value),
        feedback: wrong.length ? feedback('接力還有斷點', '有 ' + wrong.length + ' 個前後條件還沒接上。互不依賴的步驟可以交換。', wrong.map(rule => rule.reason)) :
          feedback('接力順序可行', definition.rationale, ['這是一個符合題目條件的順序；其他順序也可能成立。']) };
    }
    if (definition.kind === 'resource-plan') {
      if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length || value.some(id => !definition.choices.some(choice => choice.id === id)))
        return bad('請至少選一項工作，每項只選一次，且只能使用題目的工作卡。');
      const selected = definition.choices.filter(choice => value.includes(choice.id));
      const used = Object.fromEntries(Object.keys(definition.budget).map(key => [key, selected.reduce((sum, choice) => sum + (choice.cost[key] || 0), 0)]));
      const covered = new Set(selected.flatMap(choice => choice.covers));
      const missing = definition.requirements.filter(item => !covered.has(item.id));
      const exceeded = Object.keys(definition.budget).filter(key => used[key] > definition.budget[key]);
      const details = [...missing.map(item => '尚缺：' + item.label), ...exceeded.map(key => (definition.budgetLabels[key] || key) + '用了 ' + used[key] + '，上限是 ' + definition.budget[key] + '。')];
      return { valid: true, correct: !missing.length && !exceeded.length, answer: [...value].sort(), used,
        feedback: details.length ? feedback('工具組還可調整', '對照需求與總額再試。不同可行組合得到相同完成獎勵。', details) :
          feedback('工具組可行', definition.rationale, Object.keys(used).map(key => (definition.budgetLabels[key] || key) + '：' + used[key] + ' / ' + definition.budget[key])) };
    }
    fail('不支援此益智題型。', 'content');
  }
  function apply(project, event) {
    eventShape(event);
    const sig = signature(event);
    if (project.ids.has(event.id)) {
      if (project.ids.get(event.id) !== sig) fail('同一事件識別碼帶了不同內容，未套用。', 'event-conflict');
      return { changed: false, duplicate: true, correct: null, awarded: noAward(), feedback: feedback('已記錄', '同一操作已處理，不會重複計分。') };
    }
    if (event.token !== project.revision) fail('這個支線操作已過期，請重新開啟目前的互動點。', 'stale');
    const chapter = getChapter(event.chapterId);
    let outcome;
    if (event.type === 'interact') {
      const target = marker(chapter, event.targetId);
      if (project.visited.has(target.id)) return { changed: false, duplicate: true, correct: null, awarded: noAward(), feedback: feedback(target.name, target.story) };
      project.visited.add(target.id);
      const awarded = noAward();
      if (target.kind === 'easterEgg') {
        project.completed.add(target.id); awarded.points = target.reward.points;
        if (target.reward.collectibleId) awarded.collectibles.push(target.reward.collectibleId);
      }
      outcome = { changed: true, duplicate: false, correct: null, awarded, feedback: feedback(target.name, target.story, [target.reward.label]) };
    } else {
      const definition = puzzle(chapter, event.targetId);
      const target = markerFor(chapter, definition.id);
      if (!target || !project.visited.has(target.id)) fail('請先開啟對應的支線互動點，再進行練習。', 'not-started');
      const progress = project.progress[definition.id] || freshProgress();
      if (event.type === 'hint') {
        if (!Number.isInteger(event.payload.index) || event.payload.index < 0 || event.payload.index >= definition.hints.length) fail('提示編號不正確。', 'hint');
        if (event.payload.index < progress.hintsShown) return { changed: false, duplicate: true, correct: null, awarded: noAward(), feedback: feedback('已看過的提示', definition.hints[event.payload.index]) };
        if (event.payload.index !== progress.hintsShown) fail('請依序開啟下一則提示。', 'hint');
        progress.hintsShown++;
        project.progress[definition.id] = progress;
        outcome = { changed: true, duplicate: false, correct: null, awarded: noAward(), feedback: feedback('提示 ' + progress.hintsShown, definition.hints[event.payload.index], ['提示不扣分，也不影響排行榜。']) };
      } else {
        const checked = checkAnswer(definition, event.payload.answer);
        if (!checked.valid) fail(checked.feedback.text, 'answer-shape');
        if (progress.solved) return { changed: false, duplicate: false, practice: true, correct: checked.correct, awarded: noAward(), feedback: checked.feedback };
        // A repeated identical answer is a retry, not a new attempt or award.
        if (project.signatures.has(sig)) return { changed: false, duplicate: true, correct: checked.correct, awarded: noAward(), feedback: checked.feedback };
        progress.attempts++;
        progress.lastAnswer = checked.answer;
        progress.lastCorrect = checked.correct;
        progress.solved = checked.correct;
        project.progress[definition.id] = progress;
        const awarded = noAward();
        if (checked.correct) {
          project.completed.add(target.id); awarded.points = target.reward.points; awarded.puzzles.push(definition.id);
          if (target.reward.collectibleId) awarded.collectibles.push(target.reward.collectibleId);
        }
        outcome = { changed: true, duplicate: false, correct: checked.correct, awarded, feedback: checked.feedback };
      }
    }
    if (project.revision >= MAX_EVENTS) fail('本機支線紀錄已達 ' + MAX_EVENTS + ' 筆上限，請先保存備份；主線與出席不受影響。', 'capacity');
    project.ids.set(event.id, sig); project.signatures.add(sig); project.revision++;
    return outcome;
  }
  function createState() { return freeze({ format: FORMAT, version: VERSION, contentVersion: CONTENT_VERSION, revision: 0, events: [] }); }
  function hydrate(state) {
    exact(state, ['format', 'version', 'contentVersion', 'revision', 'events'], '支線存檔');
    if (state.format !== FORMAT || state.version !== VERSION) fail('支線存檔版本不支援；請保留原檔，不要直接覆寫。', 'version');
    if (state.contentVersion !== CONTENT_VERSION) fail('支線教材版本不同；請保留原檔，等待相容版本。', 'content-version');
    if (!Array.isArray(state.events) || state.events.length > MAX_EVENTS || state.revision !== state.events.length) fail('支線事件數量與版本不一致。', 'state');
    jsonTree(state);
    if (bytes(state) > MAX_BYTES) fail('支線存檔超過 1 MB，未讀取或覆寫。', 'capacity');
    const project = projection();
    for (const event of state.events) {
      const result = apply(project, event);
      if (!result.changed) fail('支線存檔包含重複或未生效的事件。', 'state');
    }
    return project;
  }
  function validateState(state) { hydrate(state); return true; }
  function transition(state, event) {
    try {
      const project = hydrate(state);
      const result = apply(project, event);
      if (!result.changed) return { ok: true, state, event: null, ...result };
      const next = { format: FORMAT, version: VERSION, contentVersion: CONTENT_VERSION, revision: project.revision, events: [...clone(state.events), clone(event)] };
      if (bytes(next) > MAX_BYTES) fail('支線存檔超過 1 MB，未套用新操作。', 'capacity');
      return { ok: true, state: freeze(next), event: freeze(clone(event)), ...result };
    } catch (error) {
      return { ok: false, state, event: null, changed: false, duplicate: false, correct: null, code: error.code || 'invalid', awarded: noAward(), feedback: feedback('這次操作尚未套用', error.message) };
    }
  }
  // A compact event identifier, not a cryptographic signature. Payload equality is checked separately.
  function hash(value) {
    let left = 2166136261, right = 2246822507;
    for (let i = 0; i < value.length; i++) { left = Math.imul(left ^ value.charCodeAt(i), 16777619); right = Math.imul(right ^ value.charCodeAt(i), 3266489909); }
    return (left >>> 0).toString(36) + '-' + (right >>> 0).toString(36);
  }
  function wrap(state, type, chapterId, targetId, payload, meta = {}) {
    try {
      if (!plain(meta) || Object.keys(meta).some(key => !['id', 'token'].includes(key))) fail('事件選項不正確。');
      jsonTree(payload);
      const event = { id: own(meta, 'id') ? meta.id : type + ':' + targetId + ':' + hash(stringify(payload)), type, chapterId, targetId, payload, token: own(meta, 'token') ? meta.token : state.revision };
      return transition(state, event);
    } catch (error) {
      return { ok: false, state, event: null, changed: false, duplicate: false, correct: null, code: error.code || 'invalid', awarded: noAward(), feedback: feedback('這次操作尚未套用', error.message) };
    }
  }
  const interact = (state, chapterId, markerId, meta) => wrap(state, 'interact', chapterId, markerId, {}, meta);
  const answer = (state, chapterId, puzzleId, value, meta) => wrap(state, 'answer', chapterId, puzzleId, { answer: value }, meta);
  function hint(state, chapterId, puzzleId, meta) {
    try {
      const definition = puzzle(getChapter(chapterId), puzzleId);
      const project = hydrate(state);
      const shown = (project.progress[puzzleId] || freshProgress()).hintsShown;
      return wrap(state, 'hint', chapterId, puzzleId, { index: Math.min(shown, definition.hints.length - 1) }, meta);
    } catch (error) { return { ok: false, state, event: null, changed: false, duplicate: false, correct: null, code: error.code || 'invalid', awarded: noAward(), feedback: feedback('提示尚未開啟', error.message) }; }
  }
  function summarize(project, chapterId) {
    const chapters = chapterId ? [getChapter(chapterId)] : Content.chapters;
    const markers = chapters.flatMap(item => item.markers), puzzles = chapters.flatMap(item => item.puzzles);
    const completed = markers.filter(item => project.completed.has(item.id));
    const progress = Object.fromEntries(puzzles.map(item => [item.id, clone(project.progress[item.id] || freshProgress())]));
    return {
      scope: 'personal-local', contentVersion: CONTENT_VERSION, chapterId: chapterId || null,
      points: completed.reduce((sum, item) => sum + item.reward.points, 0), maxPoints: markers.reduce((sum, item) => sum + item.reward.points, 0),
      completed: completed.length, total: markers.length,
      collections: completed.filter(item => item.reward.collectibleId).length, maxCollections: markers.filter(item => item.reward.collectibleId).length,
      puzzles: Object.values(progress).filter(item => item.solved).length, maxPuzzles: puzzles.length,
      visitedIds: markers.filter(item => project.visited.has(item.id)).map(item => item.id), completedIds: completed.map(item => item.id),
      collectibles: completed.filter(item => item.reward.collectibleId).map(item => ({ id: item.reward.collectibleId, chapterId: chapters.find(ch => ch.markers.includes(item)).id, label: item.reward.label })),
      progress, notice: Content.NOTICE
    };
  }
  function getSummary(state, chapterId) { return summarize(hydrate(state), chapterId); }
  const METRICS = freeze({
    exploration: { label: '探索完成榜', unit: '%', field: 'completed', total: 'total', percent: true },
    collection: { label: '彩蛋收藏榜', unit: '件', field: 'collections', total: 'maxCollections', percent: false },
    puzzle: { label: '益智突破榜', unit: '題', field: 'puzzles', total: 'maxPuzzles', percent: false },
    points: { label: '探索積分榜', unit: '分', field: 'points', total: 'maxPoints', percent: false }
  });
  function getLeaderboard(state, metric = 'exploration') {
    const aliases = { collections: 'collection', puzzles: 'puzzle', completed: 'exploration' };
    metric = aliases[metric] || metric;
    if (!own(METRICS, metric)) fail('不支援這個排行榜項目。', 'metric');
    const project = hydrate(state), definition = METRICS[metric];
    const rows = Content.chapters.map(chapter => {
      const item = summarize(project, chapter.id);
      return { chapterId: chapter.id, title: chapter.title, score: definition.percent ? Math.round(item[definition.field] / item[definition.total] * 100) : item[definition.field],
        completed: item[definition.field], total: item[definition.total], rank: 0 };
    }).sort((a, b) => b.score - a.score || a.chapterId.localeCompare(b.chapterId));
    let rank = 0, previous = null;
    rows.forEach(row => { if (row.score !== previous) rank++; row.rank = rank; previous = row.score; });
    return { scope: 'personal-local', metric, label: definition.label, unit: definition.unit, rows,
      notice: '這是此瀏覽器本人的章節紀錄，沒有其他玩家或班級資料。並列同分不比較用時、反思或提示次數。' };
  }
  function exportEvents(state) {
    validateState(state);
    return freeze({ format: EVENT_FORMAT, version: VERSION, contentVersion: CONTENT_VERSION, events: clone(state.events) });
  }
  function replayEvents(input, options = {}) {
    const original = plain(options) && own(options, 'initialState') ? options.initialState : createState();
    let currentIndex = null;
    try {
      if (!plain(options) || Object.keys(options).some(key => !['initialState', 'rebase'].includes(key)) || (own(options, 'rebase') && typeof options.rebase !== 'boolean')) fail('重播選項不正確。');
      const project = hydrate(original);
      let events = input;
      if (!Array.isArray(input)) {
        exact(input, ['format', 'version', 'contentVersion', 'events'], '支線事件封包');
        if (input.format !== EVENT_FORMAT || input.version !== VERSION || input.contentVersion !== CONTENT_VERSION) fail('支線事件封包版本不相容。', 'version');
        events = input.events;
      }
      if (!Array.isArray(events) || events.length > MAX_EVENTS) fail('重播事件數量不正確。', 'capacity');
      jsonTree(events);
      if (bytes(events) > MAX_BYTES) fail('重播事件大小不正確。', 'capacity');
      let accepted = 0, duplicates = 0;
      const nextEvents = clone(original.events);
      for (let index = 0; index < events.length; index++) {
        currentIndex = index;
        const incoming = events[index];
        eventShape(incoming);
        const event = options.rebase ? { ...clone(incoming), token: project.revision } : incoming;
        const result = apply(project, event);
        if (result.changed) { accepted++; nextEvents.push(clone(event)); }
        else if (result.duplicate) duplicates++;
      }
      const candidate = accepted ? { format: FORMAT, version: VERSION, contentVersion: CONTENT_VERSION, revision: project.revision, events: nextEvents } : original;
      if (bytes(candidate) > MAX_BYTES) fail('合併後支線存檔超過 1 MB，未套用此批事件。', 'capacity');
      const state = accepted ? freeze(candidate) : original;
      return { ok: true, state, accepted, duplicates, summary: summarize(project) };
    } catch (error) { return { ok: false, state: original, accepted: 0, duplicates: 0, rejectedIndex: currentIndex, code: error.code || 'invalid', feedback: feedback('事件尚未完成重播', error.message) }; }
  }
  return freeze({ VERSION, FORMAT, EVENT_FORMAT, CONTENT_VERSION, STORAGE_KEY, MAX_EVENTS, MAX_BYTES, METRICS,
    getChapter, createState, validateState, transition, interact, answer, hint, getSummary, getLeaderboard, exportEvents, replayEvents });
});
