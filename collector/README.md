本目錄是私人 Google Sheets 收件程式的交付原始碼；目前沒有 Google 部署、持續授權、學生資料或實際 Sheets 寫入。GitHub Pages 的遊戲入口可先供練習，收件設定未完成時保持停用。

點名條件已核准為「完成當週指定關卡＋填完反思，不以答對率判定出席」。伺服器使用本專案的 13 章定義與 `RPGEngine.validateState` 重播驗證同一次完整關卡，要求 `phase === 'complete'`、老師指定章節、兩欄反思非空。戰術失敗也可收件，沒有勝率、答對率或反思字數門檻。伺服器收件時間必須在老師設定的課次時窗內。

完成紀錄來自學生瀏覽器，重播驗證只能驗證紀錄結構、章節與戰術結果一致，不能證明誰操作、是否當堂完成或未使用匯入紀錄。學號、姓名均為自填；每筆固定標為 `pending_teacher_review`，老師核對身分、當堂參與及指定課次後才能判定正式出席。客戶端完成時間另存為 `client_completed_at_untrusted`，不當成可信收件或出席時間。

同一 `eventId` 的相同內容在腳本鎖內去重；不同內容沿用同一編號會拒收。新事件只有寫入、`SpreadsheetApp.flush()` 並整列讀回一致且無公式後才顯示「收件成功，待教師核實」。網路中斷或寫入後回應不明時，請用同一筆內容與編號重送。已收件的相同事件可於時窗結束後重新取得原回執，不新增資料；原始列被修改或損毀會拒絕回傳成功。

學生由 HTML form POST 在新分頁開啟收件頁，欄位只有 `payload` JSON；不使用跨來源 `fetch(..., mode:'no-cors')` 或前端完成畫面推定 Sheets 成功。回執只顯示事件編號、伺服器時間及待核實狀態，不回傳學號、姓名、反思或工作表資料。`doGet` 不查詢或公開紀錄，腳本不發信、不連其他服務、不寫正式出席系統。工作表 ID 保存在 Script Properties，禁止放入公開前端。

Google 啟用前仍需使用者明確同意以下持續權限與執行方式：

- OAuth scope 為 `https://www.googleapis.com/auth/spreadsheets`。程式只用 `SPREADSHEET_ID` 開啟一份指定表；Google scope 本身允許查看、編輯、建立與刪除帳戶全部 Google Sheets，不能宣稱僅獲授權這一份表。Web App 的 `openById` 需要此完整 scope，不能用 `spreadsheets.currentonly` 代替。
- 若部署成「以擁有者身分執行」、允許任何人提交，持有 Web App URL 的人會透過此程式將資料寫入擁有者的指定私人表。這不公開工作表、也不提供讀取端點；但匿名呼叫者可偽造身分或大量提交，程式的重播驗證與 event 去重不能提供身分認證或防代玩證明。Google／學校管理政策也可能禁止此存取模式。
- 這份 manifest 沒有 `webapp` 公開設定，也沒有授權部署 API、Drive、Gmail、外部網路或觸發器。沒有新 OAuth client、API key 或憑證。

上述權限、存取模式與私有目標表尚未獲批准，請不要先行啟用或收集學生。以下步驟只在明確批准後執行：

1. 選定使用者擁有的私人 Google Sheets 與專用空白工作表分頁 `ethics_game_receipts`，保持分享為限制存取。不要選正式出席表或放有其他資料的分頁；老師審核另用私人審核表／分頁，保留原始 15 欄收件資料不改動。
2. 本機執行 `node scripts/build-collector.js`，把產生的 `collector/generated/Code.gs` 與 `appsscript.json` 放入使用者自己的 Apps Script 專案。此建置只產生檔案，完全不部署或存取 Google。
3. 在 Script Properties 設定 `SPREADSHEET_ID`、`RECORDS_SHEET`、`CLASS_SESSIONS`、`COLLECTOR_ENABLED`。`CLASS_SESSIONS` 必須是陣列，每項具有 `id`、`chapterId`、`opensAt`、`closesAt`；只有老師指定的章節，沒有預設第 1 章或示範第 3 章。`COLLECTOR_ENABLED` 尚未準備好時維持 `false`。
4. 課次 JSON 形狀如下；`__TEACHER_ASSIGNED_CHAPTER__` 是故意無效的佔位值，必須由老師確認實際 `u01`–`u13`，不能直接照貼當成 10/6 指定關卡：

```json
[{"id":"teacher-chosen-session-id","chapterId":"__TEACHER_ASSIGNED_CHAPTER__","opensAt":"2026-10-06T13:30:00+08:00","closesAt":"2026-10-06T15:20:00+08:00"}]
```

5. 使用者批准完整 Sheets scope 與 Web App 執行／存取模式後再部署 `/exec` URL，先用明確虛構身分驗證實際收到一列、前導零學號、伺服器時間、同 event 重送不新增、不同內容衝突、錯課次、錯章節、超時及敗局完成。未完成此實測不能宣稱 Sheets 寫入已驗證。
6. 確認私人表與收件測試後，把 `/exec` URL 和同一老師課次／章節加入前端公開設定；前端不包含工作表 ID、授權 token 或學生紀錄。最後再完成真機手機、鍵盤、恢復、教師收件及設備失敗替代驗收。

傳輸協定：`{format:'ndmu-ethics-submission',version:1,eventId:UUIDv4,sessionId,student:{id,name},attempt:完整Engine state}`。`sessionId` 僅限 1–80 字 `[A-Za-z0-9._:-]` 且首字為英數；自填學號／姓名 trim 後各 1–80 字、不允許控制字元。完整 payload 最多 60,000 個 UTF-16 字元，attempt canonical JSON 最多 45,000 個字元；不截斷紀錄。反思依原遊戲規格各最多 6,000 字，內容可以很短，只要求非空。測試的 `u03` 及 `SYNTHETIC-ONLY-*` 只供離線案例，不是當堂指派或真學生。

離線驗證執行 `node --test tests/collector.test.js`。測試用可信 13 章產生虛構關卡，包含戰術失敗仍有效、缺反思／偽造／錯章、時窗、去重、鎖、寫入／同步／讀回失敗、損毀重送、公式注入及 Apps Script stub。這些測試不開啟 Google，也不能替代實際 Google 授權與虛構收件測試。

Google 官方依據（2026-10-05 查核）：[Sheets scope 的查看、編輯、建立、刪除範圍](https://developers.google.com/workspace/sheets/api/scopes)、[openById 的完整 Sheets scope](https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#openById(String))、[Web App 的 doPost 與擁有者執行權限](https://developers.google.com/apps-script/guides/web#permissions)、[setValues 的公式行為](https://developers.google.com/apps-script/reference/spreadsheet/range#setValues(Object))、[Script LockService](https://developers.google.com/apps-script/reference/lock/lock-service)、[OAuth scopes](https://developers.google.com/apps-script/concepts/scopes)。
