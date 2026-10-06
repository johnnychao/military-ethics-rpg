(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./chapter_access'));
  else root.EthicsCollectorCore = factory(root.EthicsCourseAccess);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (courseAccess) {
  'use strict';

  const FORMAT = 'ndmu-ethics-submission';
  const VERSION = 1;
  const MAX_PAYLOAD_CHARS = 60000;
  const MAX_ATTEMPT_CHARS = 45000;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
  const HEADERS = Object.freeze([
    'event_id', 'payload_sha256', 'server_received_at', 'session_id',
    'student_id_self_declared', 'student_name_self_declared', 'chapter_id',
    'assigned_chapter_complete', 'reflection_complete', 'tactical_success',
    'review_status', 'client_completed_at_untrusted',
    'reflection_reason', 'reflection_revision', 'attempt_json'
  ]);

  function fail(code) {
    const error = new Error(code);
    error.code = code;
    throw error;
  }
  function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function keys(value, expected, code) {
    if (!isObject(value) || Object.keys(value).length !== expected.length ||
        !expected.every(key => Object.prototype.hasOwnProperty.call(value, key))) fail(code);
  }
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  }
  function canonicalJson(value) { return JSON.stringify(canonical(value)); }
  function identityField(value) {
    if (typeof value !== 'string') fail('INVALID_IDENTITY');
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 80 || /[\u0000-\u001f\u007f-\u009f]/.test(trimmed)) fail('INVALID_IDENTITY');
    return trimmed;
  }
  function timestamp(value, code) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail(code);
    const time = Date.parse(value);
    if (!Number.isFinite(time)) fail(code);
    return time;
  }
  function validateConfig(config, data) {
    if (!isObject(config) || config.enabled !== true || !Array.isArray(config.sessions) || !config.sessions.length) fail('COLLECTOR_NOT_CONFIGURED');
    if (!data || !Array.isArray(data.chapters) || data.chapters.length !== 13) fail('TRUSTED_DATA_INVALID');
    const ids = new Set();
    config.sessions.forEach(session => {
      if (!isObject(session) || typeof session.id !== 'string' || !SESSION_ID.test(session.id) || ids.has(session.id)) fail('SESSION_CONFIGURATION_INVALID');
      ids.add(session.id);
      if (!data.chapters.some(chapter => chapter.id === session.chapterId)) fail('SESSION_CONFIGURATION_INVALID');
      const opens = timestamp(session.opensAt, 'SESSION_CONFIGURATION_INVALID');
      const closes = timestamp(session.closesAt, 'SESSION_CONFIGURATION_INVALID');
      if (closes <= opens) fail('SESSION_CONFIGURATION_INVALID');
      eventLimits(session);
    });
    if (config.accessCodeHashes !== undefined) {
      if (!isObject(config.accessCodeHashes)) fail('ACCESS_CONFIGURATION_INVALID');
      Object.entries(config.accessCodeHashes).forEach(([id, digest]) => {
        if (!ids.has(id) || typeof digest !== 'string' || !/^[0-9a-f]{64}$/i.test(digest)) fail('ACCESS_CONFIGURATION_INVALID');
      });
    }
  }
  function eventLimits(session) {
    if (session.rollingLimit !== undefined) {
      const rolling = session.rollingLimit;
      keys(rolling, ['windowSeconds', 'maxEvents', 'maxStudentEvents'], 'SESSION_CONFIGURATION_INVALID');
      if (session.maxEvents !== undefined || session.maxStudentEvents !== undefined ||
          !Number.isInteger(rolling.windowSeconds) || rolling.windowSeconds < 60 || rolling.windowSeconds > 3600 ||
          !Number.isInteger(rolling.maxEvents) || rolling.maxEvents < 1 || rolling.maxEvents > 10000 ||
          !Number.isInteger(rolling.maxStudentEvents) || rolling.maxStudentEvents < 1 || rolling.maxStudentEvents > 100 ||
          rolling.maxStudentEvents > rolling.maxEvents) fail('SESSION_CONFIGURATION_INVALID');
      return { maxEvents: rolling.maxEvents, maxStudentEvents: rolling.maxStudentEvents, windowSeconds: rolling.windowSeconds };
    }
    const maxEvents = session.maxEvents === undefined ? 500 : session.maxEvents;
    const maxStudentEvents = session.maxStudentEvents === undefined ? Math.min(3, maxEvents) : session.maxStudentEvents;
    if (!Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 10000 ||
        !Number.isInteger(maxStudentEvents) || maxStudentEvents < 1 || maxStudentEvents > 100 || maxStudentEvents > maxEvents) {
      fail('SESSION_CONFIGURATION_INVALID');
    }
    return { maxEvents, maxStudentEvents };
  }
  function checkAccessCode(checked, deps) {
    const hashes = deps.config.accessCodeHashes || {};
    const expected = Object.prototype.hasOwnProperty.call(hashes, checked.session.id) ? hashes[checked.session.id] : null;
    const supplied = deps.accessCode === undefined ? '' : deps.accessCode;
    if (typeof supplied !== 'string' || supplied.length > 128 || /[\u0000-\u001f\u007f-\u009f]/.test(supplied)) fail('ACCESS_CODE_INVALID');
    if (!expected) return;
    const code = supplied.trim();
    if (!code) fail('ACCESS_CODE_REQUIRED');
    const actual = deps.sha256(code);
    if (typeof actual !== 'string' || !/^[0-9a-f]{64}$/.test(actual)) fail('DIGEST_INVALID');
    // Fixed-length comparison avoids early exits on individual digest characters.
    let difference = 0;
    const normalized = expected.toLowerCase();
    for (let i = 0; i < 64; i++) difference |= actual.charCodeAt(i) ^ normalized.charCodeAt(i);
    if (difference !== 0) fail('ACCESS_CODE_INVALID');
  }
  function parsePayload(raw) {
    if (typeof raw !== 'string' || !raw || raw.length > MAX_PAYLOAD_CHARS) fail('PAYLOAD_TOO_LARGE');
    try { return JSON.parse(raw); } catch (_) { fail('INVALID_JSON'); }
  }
  function validateRequest(raw, config, engine, data, authorize) {
    validateConfig(config, data);
    const payload = parsePayload(raw);
    keys(payload, ['format', 'version', 'eventId', 'sessionId', 'student', 'attempt'], 'INVALID_PAYLOAD');
    if (payload.format !== FORMAT || payload.version !== VERSION) fail('UNSUPPORTED_FORMAT');
    if (typeof payload.eventId !== 'string' || !UUID.test(payload.eventId)) fail('INVALID_EVENT_ID');
    if (typeof payload.sessionId !== 'string' || !SESSION_ID.test(payload.sessionId)) fail('INVALID_SESSION_ID');
    const session = config.sessions.find(item => item.id === payload.sessionId);
    if (!session) fail('UNKNOWN_SESSION');
    // Authenticate the class gate before expensive trusted-engine replay or any Sheet access.
    if (authorize) authorize({ session });
    keys(payload.student, ['id', 'name'], 'INVALID_IDENTITY');
    const normalized = { ...payload, eventId: payload.eventId.toLowerCase(),
      student: { id: identityField(payload.student.id), name: identityField(payload.student.name) } };
    const chapter = data.chapters.find(item => item.id === session.chapterId);
    if (!isObject(payload.attempt) || payload.attempt.chapterId !== session.chapterId) fail('WRONG_CHAPTER');
    const attemptJson = canonicalJson(payload.attempt);
    if (attemptJson.length > MAX_ATTEMPT_CHARS) fail('ATTEMPT_TOO_LARGE');
    try { engine.validateState(payload.attempt, chapter); }
    catch (_) { fail('INVALID_ATTEMPT'); }
    if (payload.attempt.phase !== 'complete') fail('ATTEMPT_INCOMPLETE');
    if (!payload.attempt.reflection.reason.trim() || !payload.attempt.reflection.revision.trim()) fail('REFLECTION_INCOMPLETE');
    return { payload: normalized, session, canonicalPayload: canonicalJson(normalized), attemptJson };
  }
  function checkWindow(session, now) {
    const received = now instanceof Date ? now.getTime() : NaN;
    if (!Number.isFinite(received)) fail('SERVER_CLOCK_INVALID');
    if (received < Date.parse(session.opensAt)) fail('SESSION_NOT_OPEN');
    if (received > Date.parse(session.closesAt)) fail('SESSION_CLOSED');
    return new Date(received).toISOString();
  }
  // Prefix dangerous spreadsheet/CSV text. Do not insert untrusted strings as formulas.
  function safeCell(value) {
    if (typeof value !== 'string') return value;
    return value.startsWith("'") || /^[\s\u0000-\u001f]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
  }
  function makeRow(checked, digest, serverReceivedAt) {
    const payload = checked.payload, attempt = payload.attempt;
    return [payload.eventId, digest, serverReceivedAt, payload.sessionId,
      payload.student.id, payload.student.name, attempt.chapterId,
      true, true, attempt.tactical.result.success, 'pending_teacher_review',
      attempt.completedAt, attempt.reflection.reason, attempt.reflection.revision,
      checked.attemptJson].map(safeCell);
  }
  function publicReceipt(row, duplicate) {
    if (!Array.isArray(row) || row.length !== HEADERS.length || !UUID.test(row[0]) ||
        typeof row[1] !== 'string' || !/^[0-9a-f]{64}$/.test(row[1]) ||
        typeof row[2] !== 'string' ||
        row[7] !== true || row[8] !== true) fail('RECEIPT_READBACK_FAILED');
    timestamp(row[2], 'RECEIPT_READBACK_FAILED');
    return { ok: true, eventId: row[0], serverReceivedAt: row[2],
      reviewStatus: 'pending_teacher_review', duplicate: !!duplicate };
  }
  function rowMatches(expected, actual) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    // Advanced Sheets RAW writes preserve every literal character, including apostrophes.
    return expected.every((cell, i) => cell === actual[i]);
  }
  function accept(raw, dependencies) {
    const deps = dependencies;
    const checked = validateRequest(raw, deps.config, deps.engine, deps.data, gate => checkAccessCode(gate, deps));
    const digest = deps.sha256(checked.canonicalPayload);
    if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) fail('DIGEST_INVALID');
    if (!deps.lock.tryLock(10000)) fail('COLLECTOR_BUSY');
    try {
      // Lookup and append share one script-wide lock, including flush/readback.
      const existing = deps.store.findByEventId(checked.payload.eventId);
      if (existing) {
        if (existing[1] !== digest) fail('EVENT_ID_CONFLICT');
        if (!rowMatches(makeRow(checked, digest, existing[2]), existing)) fail('RECEIPT_READBACK_FAILED');
        checkWindow(checked.session, new Date(existing[2]));
        return publicReceipt(existing, true);
      }
      const now = deps.now();
      courseAccess.checkCollector(checked.session, now);
      const serverReceivedAt = checkWindow(checked.session, now);
      if (typeof deps.store.countEvents !== 'function') fail('COLLECTOR_STORE_INVALID');
      const limits = eventLimits(checked.session);
      const window = limits.windowSeconds === undefined ? undefined : {
        afterExclusive: new Date(Date.parse(serverReceivedAt) - limits.windowSeconds * 1000).toISOString(),
        throughInclusive: serverReceivedAt
      };
      const counts = deps.store.countEvents(checked.payload.sessionId, checked.payload.student.id, window);
      if (!isObject(counts) || !Number.isSafeInteger(counts.sessionEvents) || counts.sessionEvents < 0 ||
          !Number.isSafeInteger(counts.studentEvents) || counts.studentEvents < 0 || counts.studentEvents > counts.sessionEvents) {
        fail('COLLECTOR_STORE_INVALID');
      }
      if (counts.sessionEvents >= limits.maxEvents) fail('SESSION_EVENT_LIMIT');
      if (counts.studentEvents >= limits.maxStudentEvents) fail('STUDENT_EVENT_LIMIT');
      const row = makeRow(checked, digest, serverReceivedAt);
      const rowNumber = deps.store.append(row);
      deps.store.flush();
      const persisted = deps.store.read(rowNumber);
      if (!rowMatches(row, persisted)) fail('RECEIPT_READBACK_FAILED');
      return publicReceipt(persisted, false);
    } finally { deps.lock.releaseLock(); }
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }
  const MESSAGES = Object.freeze({
    COLLECTOR_NOT_CONFIGURED: '老師尚未啟用收件服務。',
    UNKNOWN_SESSION: '課次尚未設定，請向老師確認當堂入口。',
    WRONG_CHAPTER: '提交章節與本課次指定章節不符。',
    CHAPTER_NOT_OPEN: '章節或支線尚未到開放時間；請保留原紀錄與收件編號，開放後重送。',
    SESSION_NOT_OPEN: '本課次尚未開始收件。', SESSION_CLOSED: '本課次收件時間已結束。',
    INVALID_IDENTITY: '請填入有效的自填學號與姓名；身分仍待老師核實。',
    ATTEMPT_INCOMPLETE: '本次關卡尚未完成。', INVALID_ATTEMPT: '關卡紀錄驗證未通過，請保留本機備份並告知老師。',
    REFLECTION_INCOMPLETE: '請完成同一次關卡的兩欄反思。',
    EVENT_ID_CONFLICT: '此收件編號已用於另一筆內容；請告知老師。',
    COLLECTOR_BUSY: '收件服務忙碌，請稍後使用同一收件編號重送。',
    PAYLOAD_TOO_LARGE: '提交內容過大，請保留本機備份並告知老師。',
    ATTEMPT_TOO_LARGE: '此關卡累積紀錄過大，請保留本機備份並告知老師。',
    RECEIPT_READBACK_FAILED: '寫入後未能確認紀錄，請使用同一收件編號重送並告知老師。',
    ACCESS_CODE_REQUIRED: '請輸入老師在課堂提供的通行碼。',
    ACCESS_CODE_INVALID: '通行碼未通過；請向老師確認。',
    SESSION_EVENT_LIMIT: '本課次的新事件數已達上限。已收件的同一事件仍可重送確認；請告知老師。',
    STUDENT_EVENT_LIMIT: '此自填學號的新事件數已達上限。請沿用已提交事件重送確認，或告知老師。'
  });
  function renderReceipt(result, errorCode) {
    const success = result && result.ok === true && result.reviewStatus === 'pending_teacher_review' && UUID.test(result.eventId);
    const title = success ? '收件成功，待教師核實' : '尚未確認收件';
    const body = success ? '<p>收件編號：<code>' + escapeHtml(result.eventId) + '</code></p>' +
      '<p>伺服器收件時間：<time>' + escapeHtml(result.serverReceivedAt) + '</time></p>' +
      (result.duplicate ? '<p>這是同一筆已收件紀錄，沒有重複新增。</p>' : '') +
      '<p>指定關卡與兩欄反思已通過紀錄驗證。自填身分與當堂參與仍待老師核實；此回執不是正式出席認證。</p>' :
      '<p>' + escapeHtml(MESSAGES[errorCode] || '服務未能確認收件。請保留本機紀錄，稍後用同一收件編號重送或告知老師。') + '</p>';
    return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="robots" content="noindex,nofollow"><title>' + title + '</title>' +
      '<style>body{font:18px system-ui,sans-serif;line-height:1.7;max-width:42rem;margin:3rem auto;padding:1rem;color:#13212e;background:#f4f7fa}code{overflow-wrap:anywhere}</style>' +
      '</head><body><h1>' + title + '</h1>' + body + '<p>可關閉此頁並返回遊戲；請保留收件編號供老師核對。</p></body></html>';
  }
  return { FORMAT, VERSION, MAX_PAYLOAD_CHARS, MAX_ATTEMPT_CHARS, HEADERS,
    canonicalJson, parsePayload, validateRequest, checkWindow, safeCell, makeRow,
    eventLimits, checkAccessCode, rowMatches, accept, escapeHtml, renderReceipt };
}));
