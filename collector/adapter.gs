/** No deployment is performed by this file. Enable only after owner approval. */
function collectorConfiguration_() {
  const properties = PropertiesService.getScriptProperties();
  let sessions;
  try { sessions = JSON.parse(properties.getProperty('CLASS_SESSIONS') || 'null'); }
  catch (_) { throw new Error('SESSION_CONFIGURATION_INVALID'); }
  return {
    enabled: properties.getProperty('COLLECTOR_ENABLED') === 'true',
    spreadsheetId: properties.getProperty('SPREADSHEET_ID'),
    sheetName: properties.getProperty('RECORDS_SHEET') || 'ethics_game_receipts',
    sessions: sessions
  };
}
function collectorSha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(value => (value < 0 ? value + 256 : value).toString(16).padStart(2, '0')).join('');
}
function collectorStore_(configuration) {
  // openById is deliberate: getActiveSpreadsheet() is not reliable in a Web App.
  if (typeof configuration.spreadsheetId !== 'string' || !/^[A-Za-z0-9_-]{20,}$/.test(configuration.spreadsheetId)) {
    throw new Error('COLLECTOR_NOT_CONFIGURED');
  }
  const spreadsheet = SpreadsheetApp.openById(configuration.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(configuration.sheetName);
  if (!sheet) throw new Error('COLLECTOR_NOT_CONFIGURED');
  const headers = EthicsCollectorCore.HEADERS;
  function ensureHeaders(allowInitialize) {
    if (sheet.getLastRow() === 0) {
      if (!allowInitialize) return false;
      sheet.getRange(1, 1, 1, headers.length).setValues([headers.slice()]);
      SpreadsheetApp.flush();
    }
    const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (!EthicsCollectorCore.rowMatches(headers, actual)) throw new Error('SHEET_SCHEMA_MISMATCH');
    return true;
  }
  function readVerifiedRow(number) {
    const range = sheet.getRange(number, 1, 1, headers.length);
    if (range.getFormulas()[0].some(formula => formula !== '')) throw new Error('RECEIPT_READBACK_FAILED');
    return range.getValues()[0];
  }
  return {
    findByEventId: function (eventId) {
      if (!ensureHeaders(false)) return null;
      const last = sheet.getLastRow();
      if (last < 2) return null;
      const matches = sheet.getRange(2, 1, last - 1, 1).createTextFinder(eventId)
        .matchEntireCell(true).useRegularExpression(false).findAll();
      if (matches.length > 1) throw new Error('DUPLICATE_EVENT_ROWS');
      if (!matches.length) return null;
      return readVerifiedRow(matches[0].getRow());
    },
    append: function (row) {
      ensureHeaders(true);
      const number = sheet.getLastRow() + 1;
      // Keep leading zeros in IDs and ISO timestamps as strings. Booleans stay booleans.
      sheet.getRange(number, 1, 1, headers.length).setNumberFormat('@').setValues([row]);
      return number;
    },
    flush: function () { SpreadsheetApp.flush(); },
    read: function (rowNumber) {
      // Verify no untrusted input became an executable formula.
      return readVerifiedRow(rowNumber);
    }
  };
}
function doPost(event) {
  let receipt = null, errorCode = null;
  try {
    if (!event || !event.parameter || typeof event.parameter.payload !== 'string' ||
        (event.parameters && event.parameters.payload && event.parameters.payload.length !== 1)) {
      throw new Error('INVALID_PAYLOAD');
    }
    const configuration = collectorConfiguration_();
    // Validate before accessing any Sheet, even when permissions already exist.
    EthicsCollectorCore.validateRequest(event.parameter.payload, configuration, RPGEngine, RPGData);
    let store;
    const lazyStore = {
      findByEventId: function (eventId) {
        store = collectorStore_(configuration);
        return store.findByEventId(eventId);
      },
      append: function (row) { return store.append(row); },
      flush: function () { return store.flush(); },
      read: function (number) { return store.read(number); }
    };
    receipt = EthicsCollectorCore.accept(event.parameter.payload, {
      config: configuration, engine: RPGEngine, data: RPGData,
      sha256: collectorSha256_, now: function () { return new Date(); },
      lock: LockService.getScriptLock(), store: lazyStore
    });
  } catch (error) {
    // Never log/echo payload, student identity, reflections, Sheet ID or raw error messages.
    errorCode = error && error.code ? error.code : (error && /^[A-Z_]+$/.test(error.message) ? error.message : 'COLLECTOR_UNAVAILABLE');
  }
  return HtmlService.createHtmlOutput(EthicsCollectorCore.renderReceipt(receipt, errorCode))
    .setTitle(receipt ? '收件成功，待教師核實' : '尚未確認收件');
}
function doGet() {
  // No public lookup endpoint, no Sheet data, no query-parameter reflection.
  return HtmlService.createHtmlOutput(EthicsCollectorCore.renderReceipt(null, 'COLLECTOR_NOT_CONFIGURED'))
    .setTitle('軍事倫理學收件服務');
}
