(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EthicsSubmissionPage = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Self-contained so the same function can be embedded in the Apps Script HTML page
  // and executed against DOM/RPC stubs without network access in offline tests.
  function mountSubmissionPage(document, host) {
    'use strict';
    const $ = id => document.getElementById(id);
    const form = $('submission-form'), fields = $('submission-fields'), rawInput = $('submission-payload');
    const codeInput = $('submission-access-code'), submit = $('submission-send'), status = $('submission-status');
    const receipt = $('submission-receipt'), eventOutput = $('receipt-event-id'), timeOutput = $('receipt-server-time');
    const reviewOutput = $('receipt-review-status'), duplicateOutput = $('receipt-duplicate');
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const SERVER_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    let generation = 0, busy = false, timer = null;
    const rpc = host.google && host.google.script && host.google.script.run;
    function unconfirmed(message) { status.textContent = message; receipt.hidden = true; }
    function finish(token) {
      if (!busy || token !== generation) return false;
      busy = false; submit.disabled = false;
      if (timer !== null) { host.clearTimeout(timer); timer = null; }
      return true;
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (busy) return;
      receipt.hidden = true;
      let raw, expectedId;
      try {
        raw = rawInput.value;
        if (typeof raw !== 'string' || !raw.trim() || raw.length > 60000) throw new Error('invalid payload');
        const payload = JSON.parse(raw);
        if (!payload || typeof payload !== 'object' || payload.format !== 'ndmu-ethics-submission' ||
          payload.version !== 1 || typeof payload.eventId !== 'string' || !UUID.test(payload.eventId)) throw new Error('invalid payload');
        expectedId = payload.eventId.toLowerCase();
        if (typeof codeInput.value !== 'string' || codeInput.value.length > 128) throw new Error('invalid access code');
        if (!rpc || typeof rpc.withSuccessHandler !== 'function' || typeof rpc.withFailureHandler !== 'function') throw new Error('RPC unavailable');
      } catch (_) {
        codeInput.value = '';
        unconfirmed('尚未確認收件。請貼上遊戲頁「準備當堂提交資料」產生的完整資料，並在 Google 收件頁內操作；不要貼上遊戲備份或名冊。');
        return;
      }
      busy = true; submit.disabled = true; const token = ++generation;
      const accessCode = codeInput.value; codeInput.value = '';
      unconfirmed('正在等待伺服器收件與讀回核對，尚未確認收件。請保留遊戲頁的相同事件編號。');
      timer = host.setTimeout(() => {
        if (!finish(token)) return;
        unconfirmed('等待逾時，尚未確認收件；請保留相同提交資料及事件編號，重新填寫必要的通行碼後重送。逾時不代表伺服器一定未收到。');
      }, 30000);
      try {
        rpc.withSuccessHandler(result => {
          if (!finish(token)) return;
          const allowed = ['ok', 'eventId', 'serverReceivedAt', 'reviewStatus', 'duplicate'];
          const valid = result && typeof result === 'object' && !Array.isArray(result) &&
            Object.keys(result).every(key => allowed.includes(key)) && result.ok === true &&
            result.eventId === expectedId && UUID.test(result.eventId) &&
            result.reviewStatus === 'pending_teacher_review' && typeof result.duplicate === 'boolean' &&
            typeof result.serverReceivedAt === 'string' && SERVER_ISO.test(result.serverReceivedAt) &&
            Number.isFinite(Date.parse(result.serverReceivedAt)) && new Date(result.serverReceivedAt).toISOString() === result.serverReceivedAt;
          if (!valid) {
            unconfirmed('伺服器未提供可核對的回執，尚未確認收件。請保留相同事件編號並請老師協助。'); return;
          }
          // Render only receipt fields. No identity, reflection, payload or access code is echoed.
          eventOutput.textContent = result.eventId; timeOutput.textContent = result.serverReceivedAt;
          reviewOutput.textContent = '待教師核實（pending_teacher_review）';
          duplicateOutput.textContent = result.duplicate ? '相同事件已收件，本次回傳原回執。' : '這筆事件已由伺服器收件並完成讀回核對。';
          receipt.hidden = false;
          status.textContent = '伺服器已確認收件，仍待教師核實身分、當堂參與與指定關卡；此回執不會自動登記正式出席。';
        }).withFailureHandler(() => {
          if (!finish(token)) return;
          // Server errors may contain sensitive context; display a fixed safe message instead.
          unconfirmed('收件失敗或授權未就緒，尚未確認收件。請核對完整資料與必要的課堂通行碼，保留相同事件編號重送，或請老師協助。');
        }).handleClassroomSubmission(raw, accessCode);
      } catch (_) {
        if (!finish(token)) return;
        unconfirmed('無法聯絡收件服務，尚未確認收件。請保留相同提交資料與事件編號並請老師協助。');
      }
    });
    host.addEventListener('pagehide', () => { codeInput.value = ''; });
    if (rpc && typeof rpc.withSuccessHandler === 'function' && typeof rpc.withFailureHandler === 'function') {
      fields.disabled = false;
      unconfirmed('請貼上已在遊戲頁同意交給老師的提交資料；必要時在本頁輸入課堂通行碼。尚未確認收件。');
    } else {
      fields.disabled = true;
      unconfirmed('目前不是可提交的 Google 收件頁，尚未確認收件。請依老師提供的 /exec 收件網址登入後再試。');
    }
  }
  function renderSubmissionPage() {
    return '<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><base target="_top">' +
      '<title>當堂紀錄收件</title><style>' +
      'body{margin:0;background:#f6f3e8;color:#19382c;font:18px/1.65 system-ui,sans-serif}' +
      'main{max-width:46rem;margin:auto;padding:1.2rem}h1{font-size:1.6rem}p{overflow-wrap:anywhere}' +
      'fieldset{border:0;padding:0;margin:1rem 0;min-width:0}label{display:block;font-weight:600;margin:.8rem 0 .4rem}' +
      'textarea,input,button{box-sizing:border-box;font:inherit;border:1px solid #62746a;border-radius:.4rem}' +
      'textarea,input{width:100%;padding:.7rem;background:white;color:#19382c}textarea{min-height:12rem;font-size:.9rem}' +
      'button{min-height:44px;padding:.7rem 1rem;background:#19382c;color:white;font-weight:700;cursor:pointer}' +
      'button:disabled{background:#e7e7e2;color:#606963;cursor:default}:focus-visible{outline:3px solid #ad620c;outline-offset:3px}' +
      '.status{padding:.8rem;border-left:4px solid #ad620c;background:white}dl{background:white;padding:1rem}' +
      'dt{font-weight:700}dd{margin:0 0 .8rem;overflow-wrap:anywhere}[hidden]{display:none!important}' +
      '@media(max-width:640px){button{width:100%}}</style></head><body><main>' +
      '<h1>當堂紀錄收件</h1><p>請依 Google 提示登入，再把遊戲頁「準備當堂提交資料」產生的內容貼在下方。登入重導不需要攜帶 POST 資料；仍可回到遊戲頁重新複製相同事件。</p>' +
      '<p>這裡只接受已同意交給老師的單筆學習事件。不要貼上名冊或整份遊戲備份。通行碼只在本頁使用，本頁程式不會將它存入瀏覽器、提交資料或回執。</p>' +
      '<p id="submission-status" class="status" role="status" aria-live="polite">尚未確認收件。</p>' +
      '<form id="submission-form" autocomplete="off"><fieldset id="submission-fields" disabled>' +
      '<legend>貼上單筆提交資料</legend><label for="submission-payload">遊戲頁準備的提交資料</label>' +
      '<textarea id="submission-payload" required maxlength="60000" autocomplete="off" spellcheck="false"></textarea>' +
      '<label for="submission-access-code">課堂通行碼（老師啟用時才需填寫）</label>' +
      '<input id="submission-access-code" type="password" maxlength="128" autocomplete="off" spellcheck="false">' +
      '<p>通行碼送出後會從輸入框清除。若需重送，請重新輸入；相同資料維持原事件編號。</p>' +
      '<button id="submission-send" type="submit">送出並等待伺服器回執</button></fieldset></form>' +
      '<section id="submission-receipt" hidden aria-labelledby="receipt-heading"><h2 id="receipt-heading">伺服器收件回執</h2>' +
      '<dl><dt>事件編號</dt><dd id="receipt-event-id"></dd><dt>伺服器收件時間</dt><dd id="receipt-server-time"></dd>' +
      '<dt>教師核實狀態</dt><dd id="receipt-review-status"></dd></dl><p id="receipt-duplicate"></p>' +
      '<p>請保留事件編號與伺服器收件時間，供老師核對。戰術勝敗與答對率不作為出席門檻；身分與當堂參與仍待老師核實。</p></section>' +
      '<noscript><p>此收件頁需要 JavaScript。尚未確認收件；請保留遊戲 JSON 備份並請老師協助。</p></noscript>' +
      '<script>(' + mountSubmissionPage.toString() + ')(document,window);</script></main></body></html>';
  }
  return { renderSubmissionPage, mountSubmissionPage };
});
