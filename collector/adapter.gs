/** Offline source only. No OAuth, deployment or Google call occurs on file load. */
function collectorConfiguration_() {
  const properties = PropertiesService.getScriptProperties();
  let sessions, accessCodeHashes;
  try {
    sessions = JSON.parse(properties.getProperty('CLASS_SESSIONS') || 'null');
    accessCodeHashes = JSON.parse(properties.getProperty('CLASS_ACCESS_CODE_HASHES') || '{}');
  } catch (_) { throw new Error('SESSION_CONFIGURATION_INVALID'); }
  return {
    enabled: properties.getProperty('COLLECTOR_ENABLED') === 'true',
    spreadsheetId: properties.getProperty('SPREADSHEET_ID'),
    sheetName: properties.getProperty('RECORDS_SHEET') || 'ethics_game_receipts',
    sessions: sessions, accessCodeHashes: accessCodeHashes
  };
}
function collectorSha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(value => (value < 0 ? value + 256 : value).toString(16).padStart(2, '0')).join('');
}
function collectorRange_(sheetName, cells) {
  if (typeof sheetName !== 'string' || !sheetName || sheetName.length > 100 || /[\u0000-\u001f\u007f]/.test(sheetName)) {
    throw new Error('COLLECTOR_NOT_CONFIGURED');
  }
  return "'" + sheetName.replace(/'/g, "''") + "'!" + cells;
}
function collectorGridRows_(response, sheetName, expectedStartRow) {
  const sheets = response && response.sheets;
  if (!Array.isArray(sheets) || sheets.length !== 1 || !sheets[0].properties || sheets[0].properties.title !== sheetName) {
    throw new Error('RECEIPT_READBACK_FAILED');
  }
  const grid = sheets[0].data || [];
  if (!Array.isArray(grid) || grid.length > 1) throw new Error('RECEIPT_READBACK_FAILED');
  if (!grid.length) return [];
  if ((grid[0].startRow || 0) !== expectedStartRow || (grid[0].startColumn || 0) !== 0) {
    throw new Error('RECEIPT_READBACK_FAILED');
  }
  const rows = grid[0].rowData || [];
  if (!Array.isArray(rows)) throw new Error('RECEIPT_READBACK_FAILED');
  return rows.map(row => {
    const cells = row.values || [];
    if (!Array.isArray(cells) || cells.length > EthicsCollectorCore.HEADERS.length) throw new Error('SHEET_SCHEMA_MISMATCH');
    return Array.from({ length: EthicsCollectorCore.HEADERS.length }, (_, index) => {
      const cell = cells[index], entered = cell && cell.userEnteredValue;
      if (!entered) return '';
      if (Object.prototype.hasOwnProperty.call(entered, 'formulaValue')) throw new Error('RECEIPT_READBACK_FAILED');
      let value;
      if (Object.prototype.hasOwnProperty.call(entered, 'stringValue')) value = entered.stringValue;
      else if (Object.prototype.hasOwnProperty.call(entered, 'boolValue')) value = entered.boolValue;
      else if (Object.prototype.hasOwnProperty.call(entered, 'numberValue')) value = entered.numberValue;
      else throw new Error('RECEIPT_READBACK_FAILED');
      const effective = cell.effectiveValue;
      if (effective) {
        const effectiveValue = Object.prototype.hasOwnProperty.call(effective, 'stringValue') ? effective.stringValue :
          (Object.prototype.hasOwnProperty.call(effective, 'boolValue') ? effective.boolValue : effective.numberValue);
        if (value !== effectiveValue) throw new Error('RECEIPT_READBACK_FAILED');
      }
      return value;
    });
  });
}
function collectorStore_(configuration) {
  if (typeof configuration.spreadsheetId !== 'string' || !/^[A-Za-z0-9_-]{20,}$/.test(configuration.spreadsheetId)) {
    throw new Error('COLLECTOR_NOT_CONFIGURED');
  }
  const id = configuration.spreadsheetId, name = configuration.sheetName;
  const headers = EthicsCollectorCore.HEADERS;
  let appendAcknowledged = false;
  function readRange(cells, startRow) {
    const response = Sheets.Spreadsheets.get(id, {
      ranges: [collectorRange_(name, cells)], includeGridData: true,
      fields: 'sheets(properties(title),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue))))'
    });
    return collectorGridRows_(response, name, startRow);
  }
  function table() {
    const rows = readRange('A1:O', 0);
    while (rows.length && rows[rows.length - 1].every(value => value === '')) rows.pop();
    if (!rows.length || !EthicsCollectorCore.rowMatches(headers, rows[0])) throw new Error('SHEET_SCHEMA_MISMATCH');
    rows.slice(1).forEach(row => {
      if (!row[0] || typeof row[3] !== 'string' || !row[3] || typeof row[4] !== 'string' || !row[4]) {
        throw new Error('SHEET_SCHEMA_MISMATCH');
      }
    });
    return rows;
  }
  return {
    findByEventId: function (eventId) {
      const matches = table().slice(1).filter(row => row[0] === eventId);
      if (matches.length > 1) throw new Error('DUPLICATE_EVENT_ROWS');
      return matches.length ? matches[0] : null;
    },
    countEvents: function (sessionId, studentId) {
      const rows = table().slice(1), storedStudentId = EthicsCollectorCore.safeCell(studentId);
      return {
        sessionEvents: rows.filter(row => row[3] === sessionId).length,
        studentEvents: rows.filter(row => row[3] === sessionId && row[4] === storedStudentId).length
      };
    },
    append: function (row) {
      if (!Array.isArray(row) || row.length !== headers.length) throw new Error('SHEET_SCHEMA_MISMATCH');
      const rowNumber = table().length + 1;
      // The validated contiguous table determines the expected row. INSERT_ROWS safely extends the grid.
      const response = Sheets.Spreadsheets.Values.append({ majorDimension: 'ROWS', values: [row] }, id,
        collectorRange_(name, 'A1:O'), { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
      const update = response && response.updates;
      const targetCells = 'A' + rowNumber + ':O' + rowNumber;
      if (!response || response.spreadsheetId !== id || !update || update.updatedRows !== 1 || update.updatedColumns !== headers.length ||
          update.updatedCells !== headers.length || typeof update.updatedRange !== 'string' ||
          ![collectorRange_(name, targetCells), name + '!' + targetCells].includes(update.updatedRange)) {
        throw new Error('RECEIPT_READBACK_FAILED');
      }
      appendAcknowledged = true;
      return rowNumber;
    },
    flush: function () {
      // Advanced Sheets RAW append is synchronous; no SpreadsheetApp write buffer or full Sheets scope is used.
      if (!appendAcknowledged) throw new Error('RECEIPT_READBACK_FAILED');
    },
    read: function (rowNumber) {
      if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error('RECEIPT_READBACK_FAILED');
      const rows = readRange('A' + rowNumber + ':O' + rowNumber, rowNumber - 1);
      if (rows.length !== 1) throw new Error('RECEIPT_READBACK_FAILED');
      return rows[0];
    }
  };
}
function collectorAccept_(raw, accessCode) {
  const configuration = collectorConfiguration_();
  let store;
  function currentStore() { if (!store) store = collectorStore_(configuration); return store; }
  return EthicsCollectorCore.accept(raw, {
    config: configuration, engine: RPGEngine, data: RPGData, accessCode: accessCode,
    sha256: collectorSha256_, now: function () { return new Date(); },
    lock: LockService.getScriptLock(),
    store: {
      findByEventId: function (eventId) { return currentStore().findByEventId(eventId); },
      countEvents: function (sessionId, studentId) { return currentStore().countEvents(sessionId, studentId); },
      append: function (row) { return currentStore().append(row); },
      flush: function () { return currentStore().flush(); },
      read: function (number) { return currentStore().read(number); }
    }
  });
}
function collectorSafeErrorCode_(error) {
  return error && error.code && /^[A-Z_]+$/.test(error.code) ? error.code :
    (error && /^[A-Z_]+$/.test(error.message) ? error.message : 'COLLECTOR_UNAVAILABLE');
}
function handleClassroomSubmission(raw, accessCode) {
  try { return collectorAccept_(raw, accessCode); }
  catch (error) { throw new Error(collectorSafeErrorCode_(error)); }
}
function doPost() {
  // Cross-origin POST is disabled. Use the same-origin Apps Script page/RPC.
  return HtmlService.createHtmlOutput(EthicsCollectorCore.renderReceipt(null, 'COLLECTOR_NOT_CONFIGURED'))
    .setTitle('尚未確認收件');
}
function doGet() {
  try {
    if (collectorConfiguration_().enabled && typeof EthicsSubmissionPage !== 'undefined') {
      return HtmlService.createHtmlOutput(EthicsSubmissionPage.renderSubmissionPage()).setTitle('軍事倫理學收件');
    }
  } catch (_) { /* Never expose Script Properties on a configuration error. */ }
  return HtmlService.createHtmlOutput(EthicsCollectorCore.renderReceipt(null, 'COLLECTOR_NOT_CONFIGURED'))
    .setTitle('軍事倫理學收件服務');
}
function initializePrivateCollector_() {
  // Editor-only: underscore makes this unavailable through google.script.run.
  // Run only after owner approval and explicit one-time Script Property setup.
  const properties = PropertiesService.getScriptProperties();
  if (properties.getProperty('INITIALIZE_NEW_PRIVATE_SHEET') !== 'true') throw new Error('INITIALIZATION_NOT_APPROVED');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('COLLECTOR_BUSY');
  try {
    // Recheck inside the lock: another editor execution may have consumed the gate while this one waited.
    if (properties.getProperty('INITIALIZE_NEW_PRIVATE_SHEET') !== 'true') throw new Error('INITIALIZATION_NOT_APPROVED');
    if (properties.getProperty('SPREADSHEET_ID')) throw new Error('COLLECTOR_ALREADY_INITIALIZED');
    properties.setProperty('COLLECTOR_ENABLED', 'false');
    // Consume before create: an uncertain result requires owner review, never an automatic second create.
    properties.setProperty('INITIALIZE_NEW_PRIVATE_SHEET', 'false');
    const name = 'ethics_game_receipts';
    const spreadsheet = Sheets.Spreadsheets.create({
      properties: { title: '軍事倫理學遊戲紀錄｜2026秋', timeZone: 'Asia/Taipei' },
      sheets: [{ properties: { title: name, gridProperties: { rowCount: 1000, columnCount: 15 } } }]
    }, { fields: 'spreadsheetId' });
    const id = spreadsheet && spreadsheet.spreadsheetId;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{20,}$/.test(id)) throw new Error('INITIALIZATION_FAILED');
    properties.setProperties({ SPREADSHEET_ID: id, RECORDS_SHEET: name });
    const response = Sheets.Spreadsheets.Values.update({ majorDimension: 'ROWS', values: [EthicsCollectorCore.HEADERS.slice()] },
      id, collectorRange_(name, 'A1:O1'), { valueInputOption: 'RAW' });
    if (!response || response.spreadsheetId !== id || response.updatedRows !== 1 || response.updatedColumns !== 15 || response.updatedCells !== 15) {
      throw new Error('INITIALIZATION_FAILED');
    }
    const headers = Sheets.Spreadsheets.get(id, {
      ranges: [collectorRange_(name, 'A1:O1')], includeGridData: true,
      fields: 'sheets(properties(title),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue))))'
    });
    const rows = collectorGridRows_(headers, name, 0);
    if (rows.length !== 1 || !EthicsCollectorCore.rowMatches(EthicsCollectorCore.HEADERS, rows[0])) throw new Error('INITIALIZATION_FAILED');
    // No sharing API is called. The new app-owned file retains its private sharing default.
    return { initialized: true, enabled: false };
  } finally { lock.releaseLock(); }
}
