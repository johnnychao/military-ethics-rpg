(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine/rpg_engine'), require('./engine/rpg_store'));
  } else {
    root.ClassroomReceipt = factory(root.RPGEngine, root.RPGStore);
    root.ClassroomReceipt.mount(root.document, root.ClassroomConfig, root.RPGData.chapters, root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, Store) {
  'use strict';
  const FORMAT = 'ndmu-ethics-submission';
  const OUTBOX_KEY = 'ndmu-ethics-classroom-outbox:v1';
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const SESSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
  const LIMIT = 60000; // UTF-16 characters; paired with the collector's Sheet cell limit.
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const byteSize = value => new TextEncoder().encode(value).length;
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  }
  const signature = value => JSON.stringify(canonical(value));
  function checkConfig(config, chapters) {
    if (!plain(config) || config.enabled !== true) return { ready: false, message: '老師尚未啟用收件。遊戲仍可使用；請先保留遊戲 JSON 備份。' };
    if (typeof config.collectorUrl !== 'string' || !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(config.collectorUrl)) {
      return { ready: false, message: '收件服務尚未設定妥當，暫不收集姓名與學號。' };
    }
    if (typeof config.sessionId !== 'string' || !SESSION.test(config.sessionId)) return { ready: false, message: '老師尚未設定當堂課程識別，暫不收集姓名與學號。' };
    const chapter = chapters.find(item => item.id === config.assignedChapter);
    if (!chapter) return { ready: false, message: '老師尚未指定當堂關卡，暫不收集姓名與學號。' };
    return { ready: true, chapter, message: '' };
  }
  function validateComplete(attempt, chapter) {
    if (!plain(attempt) || attempt.chapterId !== chapter.id) fail('紀錄不屬於老師指定的關卡。');
    Engine.validateState(attempt, chapter);
    if (attempt.phase !== 'complete' || !attempt.reflection.reason.trim() || !attempt.reflection.revision.trim()) {
      fail('請完成指定關卡，填完兩欄反思，並按「保存回顧，完成本章」。');
    }
    return clone(attempt);
  }
  function readCandidates(raw, assignedChapter, chapters) {
    const chapter = chapters.find(item => item.id === assignedChapter);
    if (!chapter) fail('老師尚未指定當堂關卡。');
    if (raw === null || raw === undefined || raw === '') return [];
    if (typeof raw !== 'string' || byteSize(raw) > 2 * 1024 * 1024) fail('遊戲紀錄格式或大小不正確，請保留原備份。');
    const parsed = JSON.parse(raw);
    const validator = new Store({ chapters });
    // validate does not load, save, repair or overwrite the original game storage.
    validator.validate(parsed);
    const record = parsed.records[assignedChapter];
    if (!record) return [];
    const candidates = [];
    if (record.current.phase === 'complete') candidates.push({ key: 'current', source: 'current', index: null, attempt: validateComplete(record.current, chapter) });
    record.attempts.forEach((attempt, index) => {
      if (attempt.phase === 'complete') candidates.push({ key: 'history:' + index, source: 'history', index, attempt: validateComplete(attempt, chapter) });
    });
    return candidates;
  }
  function selectAttempt(candidates, selectedKey) {
    if (!Array.isArray(candidates)) fail('紀錄清單不正確。');
    const key = selectedKey || (candidates.find(item => item.source === 'current') || {}).key;
    const candidate = candidates.find(item => item.key === key);
    if (!candidate) fail(candidates.length ? '請明確選擇一份歷次已完成紀錄；請確認它屬於當堂課程。' : '尚未找到指定關卡的完整紀錄。');
    return clone(candidate.attempt);
  }
  function normalizeStudent(student) {
    if (!plain(student) || Object.keys(student).sort().join(',') !== 'id,name') fail('請填寫姓名與學號。');
    const next = {};
    for (const key of ['id', 'name']) {
      if (typeof student[key] !== 'string' || /[\u0000-\u001f\u007f-\u009f]/.test(student[key])) fail('姓名或學號含有不適用的字元。');
      next[key] = student[key].trim();
      if (!next[key] || next[key].length > 80) fail('姓名與學號各需填寫 1–80 字。');
    }
    return next;
  }
  function eventBody(config, chapters, student, attempt, consent) {
    const result = checkConfig(config, chapters);
    if (!result.ready) fail(result.message);
    if (consent !== true) fail('請先同意將此筆學習紀錄交給老師核對。');
    const body = { format: FORMAT, version: 1, sessionId: config.sessionId,
      student: normalizeStudent(student), attempt: validateComplete(attempt, result.chapter) };
    if (signature(body.attempt).length > 45000 || JSON.stringify(body).length > LIMIT - 100) fail('此筆紀錄超過收件大小限制，請匯出遊戲 JSON 備份並請老師協助。');
    return body;
  }
  function newEventId(cryptoObject) {
    if (cryptoObject && typeof cryptoObject.randomUUID === 'function') return cryptoObject.randomUUID();
    if (!cryptoObject || typeof cryptoObject.getRandomValues !== 'function') fail('此瀏覽器無法安全建立事件編號，請使用支援 HTTPS 的新版瀏覽器。');
    const bytes = cryptoObject.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, item => item.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  }
  function readOutbox(storage) {
    const raw = storage.getItem(OUTBOX_KEY);
    if (raw === null || raw === undefined) return { version: 1, entries: [] };
    if (typeof raw !== 'string' || byteSize(raw) > 2 * 1024 * 1024) fail('待提交資料無法讀取；請保留遊戲 JSON 備份。');
    const value = JSON.parse(raw);
    if (!plain(value) || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 20) fail('待提交資料格式不正確。');
    const seen = new Set();
    for (const payload of value.entries) {
      if (!plain(payload) || Object.keys(payload).sort().join(',') !== 'attempt,eventId,format,sessionId,student,version' ||
          payload.format !== FORMAT || payload.version !== 1 || !UUID.test(payload.eventId) ||
          !SESSION.test(payload.sessionId) || !plain(payload.attempt)) fail('待提交資料格式不正確。');
      normalizeStudent(payload.student);
      if (seen.has(payload.eventId)) fail('待提交資料有重複事件編號。');
      seen.add(payload.eventId);
    }
    return clone(value);
  }
  function prepareEvent(options) {
    // Validate configuration and consent before any identity persistence or outbox read.
    const body = eventBody(options.config, options.chapters, options.student, options.attempt, options.consent);
    const outbox = readOutbox(options.storage);
    const wanted = signature(body);
    const previous = outbox.entries.find(payload => {
      const { eventId, ...rest } = payload;
      return signature(rest) === wanted;
    });
    if (previous) return clone(previous);
    if (outbox.entries.length >= 20) fail('本機待提交紀錄已達上限；請先確認收件頁，再清除此裝置的待提交資料。遊戲紀錄不會被清除。');
    const eventId = options.eventIdFactory ? options.eventIdFactory() : newEventId(options.crypto);
    if (typeof eventId !== 'string' || !UUID.test(eventId) || outbox.entries.some(item => item.eventId === eventId)) fail('事件編號無效或重複；請重新操作。');
    const payload = { ...body, eventId };
    outbox.entries.push(payload);
    const encoded = JSON.stringify(outbox);
    if (byteSize(encoded) > 2 * 1024 * 1024) fail('本機待提交空間不足，請保留遊戲 JSON 備份。');
    try {
      options.storage.setItem(OUTBOX_KEY, encoded);
      if (options.storage.getItem(OUTBOX_KEY) !== encoded) fail('儲存核對失敗。');
    } catch (_) { fail('無法保存待提交事件編號，因此尚未傳送。請保留遊戲 JSON 備份，並請老師協助。'); }
    return clone(payload);
  }
  function clearOutbox(storage) {
    storage.removeItem(OUTBOX_KEY);
    if (storage.getItem(OUTBOX_KEY) != null) fail('無法清除待提交資料；請在瀏覽器設定中移除本網站資料前先備份遊戲。');
  }
  function mount(document, config, chapters, host) {
    const panel = document.getElementById('classroom-receipt');
    if (!panel) return;
    const $ = id => document.getElementById(id);
    const form = $('classroom-form'), fields = $('classroom-fields'), status = $('classroom-status');
    const task = $('classroom-task'), select = $('classroom-attempt'), consent = $('classroom-consent');
    const id = $('classroom-student-id'), name = $('classroom-student-name'), clear = $('classroom-clear');
    const button = $('classroom-submit'), configResult = checkConfig(config, chapters);
    let candidates = [], lastRaw, lastChoices, statusMessage = '';
    function announce(message) { if (statusMessage !== message) { statusMessage = message; status.textContent = message; } }
    // Clearing previously consented data remains available even if the teacher disables collection.
    // No pending identity is read or displayed before a student explicitly uses this control.
    clear.disabled = false;
    clear.addEventListener('click', () => {
      try {
        clearOutbox(host.localStorage); id.value = ''; name.value = ''; consent.checked = false; $('classroom-payload').value = '';
        announce('已清除此裝置的姓名、學號與待提交資料。遊戲紀錄仍保留；老師已收到的紀錄不會被清除。');
      } catch (error) { announce(error.message); }
    });
    if (!configResult.ready) {
      fields.disabled = true; id.value = ''; name.value = ''; consent.checked = false;
      task.textContent = '當堂課程與指定關卡待老師啟用。'; announce(configResult.message); return;
    }
    fields.disabled = false; clear.disabled = false;
    form.action = config.collectorUrl;
    task.textContent = '課程：' + config.sessionId + ' · 指定第 ' + configResult.chapter.number + ' 章：' + configResult.chapter.title;
    function refresh(force) {
      try {
        const raw = host.localStorage.getItem(Store.KEY);
        if (!force && raw === lastRaw) return;
        lastRaw = raw; candidates = readCandidates(raw, config.assignedChapter, chapters);
        const choices = signature(candidates.map(item => ({ key: item.key, attempt: item.attempt })));
        if (choices !== lastChoices) {
          const oldValue = select.value;
          const placeholder = document.createElement('option'); placeholder.value = '';
          placeholder.textContent = candidates.length ? '請選擇要交給老師的完整紀錄' : '尚未完成指定關卡與兩欄反思';
          select.replaceChildren(placeholder);
          for (const candidate of candidates) {
            const option = document.createElement('option'); option.value = candidate.key;
            const date = new Date(candidate.attempt.completedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
            option.textContent = (candidate.source === 'current' ? '本次已完成' : '歷次挑戰 ' + (candidate.index + 1) + '（請核對當堂）') + ' · ' + date + ' 台灣時間（裝置時間）';
            select.append(option);
          }
          select.value = candidates.some(item => item.key === oldValue) ? oldValue : (candidates.find(item => item.source === 'current') || {}).key || '';
          lastChoices = choices;
        }
        button.disabled = !candidates.length;
        if (!candidates.length) announce('請先完成指定關卡與兩欄反思，並按「保存回顧，完成本章」。戰術勝敗與答對率不影響此條件。');
        else if (!statusMessage || statusMessage.startsWith('請先完成') || statusMessage.startsWith('遊戲紀錄讀取失敗')) announce('已找到完整學習紀錄。提交後請在收件分頁確認事件編號與伺服器收件時間；身分仍待老師核對。');
      } catch (_) { candidates = []; button.disabled = true; announce('遊戲紀錄讀取失敗。請保留原遊戲 JSON 備份，使用遊戲的「紀錄」還原後再試；本頁尚未傳送。'); }
    }
    refresh(true);
    try {
      const outbox = readOutbox(host.localStorage);
      const prior = [...outbox.entries].reverse().find(item => item.sessionId === config.sessionId && item.attempt.chapterId === config.assignedChapter);
      if (prior) {
        validateComplete(prior.attempt, configResult.chapter);
        id.value = prior.student.id; name.value = prior.student.name;
        // Consent is deliberately requested again after every reload.
        announce('此裝置保有待提交事件 ' + prior.eventId + '。核對同一紀錄並再次同意後重送會沿用事件編號；尚未確認老師收件。');
      }
    } catch (_) { announce('待提交資料無法讀取。請保留遊戲 JSON 備份；清除待提交資料只會移除本頁姓名、學號與待送事件。'); }
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        refresh(true);
        const attempt = selectAttempt(candidates, select.value);
        const payload = prepareEvent({ config, chapters, student: { id: id.value, name: name.value }, attempt,
          consent: consent.checked, storage: host.localStorage, crypto: host.crypto });
        $('classroom-payload').value = JSON.stringify(payload);
        // A browser form navigation is not an acknowledgement of a Sheet write.
        host.HTMLFormElement.prototype.submit.call(form);
        announce('已開啟收件頁，尚未確認；請在該頁確認回執。事件編號：' + payload.eventId + '。若分頁未開啟，可再按提交沿用相同事件編號。');
      } catch (error) { announce(error.message || '尚未傳送。請保留遊戲 JSON 備份並請老師協助。'); }
    });
    host.addEventListener('storage', event => { if (event.key === Store.KEY) refresh(true); });
    host.addEventListener('focus', () => refresh(true));
    // The game has no save event; read-only polling updates this separate panel without touching input focus.
    host.setInterval(() => { if (!document.hidden) refresh(false); }, 1500);
    document.addEventListener('keydown', event => {
      if (panel.contains(event.target)) event.stopImmediatePropagation();
    }, true);
  }
  return { FORMAT, OUTBOX_KEY, LIMIT, checkConfig, validateComplete, readCandidates, selectAttempt,
    normalizeStudent, eventBody, prepareEvent, readOutbox, clearOutbox, newEventId, mount };
});
