# 私人收件器：權限範圍與部署驗收

2026-10-05（台灣）已完成同 app 私人建表、drive.file-only consent、教師登入的虛構資料真實收件與拒收驗證；正式收件網址已更新至第 2 版，主入口 `enabled:true`，`/preview/u03/` 仍關閉收件。工作表只給教師本人；Web App 為 `USER_DEPLOYING`＋`ANYONE`，未登入 GET 會導向 Google 登入。非教師帳戶與實際學生裝置未另行驗收。GitHub commit／CI／Pages 的最新狀態以部署驗證記錄為準；本機產生 `Code.gs` 本身不會呼叫 Google。

第 2 版以 pinned commit `7fb11c89c2db8f026acbd6aacc46dc81aef19aab` 生成，先在 MYSELF 部署驗證同一虛構學號四次追加、短窗冷卻後再收件、十分鐘窗的學生／全課節流及原 ID 回原回執，再將相同版本更新至原正式網址。缺任一反思、錯章、錯碼及已移除 QA 課次均實測拒收。新增 6 筆皆為虛構資料，原 2 筆逐格保留；現有 8 筆 QA 均不是出席，所有 QA 課次與 QA 碼設定已移除。正式 scope、私人分享與 u03 當堂時間未變。

點名條件沿用已核准的「完成當週指定關卡＋填完反思，不以答對率判定出席」。兩欄「理由與教材依據」「何時會修正」為原遊戲既有欄位，每欄最多 6000 字，只要求非空。服務端用可信 13 章資料與原引擎重播同一次 complete 紀錄；戰術失敗也有效。自填學號、姓名、裝置完成時間與匯入紀錄不構成本人／當堂操作證明；收件一律 `pending_teacher_review`，不改正式出席表。

## 收件資料與限額

- 移除 `SpreadsheetApp` 存取，改 Advanced Sheets service v4；manifest 唯一 OAuth scope 為 `https://www.googleapis.com/auth/drive.file`。它可處理此 app 建立／獲授權的文件，仍不是 OAuth 固定單一 ID 的能力。程式只操作 Script Properties 指定的新收件表。
- 以 `valueInputOption: RAW` 保留字串、前導零及布林，讀回核對完整 A:O 列，另檢查儲存型態沒有 `formulaValue`；不只查看 append 或 RPC 的成功狀態。
- 同一 Script Lock 內找事件、核對、計數、追加及讀回。相同事件與內容可恢復原回執，不消耗新名額；相同事件不同內容拒收。
- 正式課次使用 `rollingLimit: {windowSeconds:600,maxEvents:300,maxStudentEvents:10}`。只計數此課次伺服器時間在 `(now−600秒, now]` 的新持久事件，分別限制全課及自填學號；寫入後讀回失敗仍計數，同一 ID 重試可恢復原回執。窗口秒數支援 60–3600、全課 1–10000、學號 1–100 且不超過全課上限，皆須為整數。舊版整堂 `maxEvents`／`maxStudentEvents` 設定仍可相容使用，但不得與 `rollingLimit` 混用；正式部署已不使用舊整堂 500／3 上限。
- 課次可選通行碼，只有 SHA256 留在 Script Properties 的 `CLASS_ACCESS_CODE_HASHES`。通行碼為獨立 transport 參數，不進 payload、event fingerprint、工作表、網址、localStorage 或回執。沒有配置 hash 的課次不要求碼。需要課堂碼時應使用足夠長且不易猜的隨機值，私下發放。
- 改為直接開啟 GAS 的 GET 提交頁，登入後貼事件內容並輸入課堂碼，再以 `google.script.run` 提交。跨站 POST、fetch、opaque response 都不視為收件證據。

## 已核准的精確權限及部署步驟

1. 以教師指定的 Google 帳戶執行，同一 app 僅用 `drive.file` 範圍新建私人表「軍事倫理學遊戲紀錄｜2026秋」，採 `USER_DEPLOYING`＋`ANYONE`（須登入 Google）。實際 Google 編輯器帳號仍須核對。禁止匿名存取；若 Google 顯示額外 scope 或設計失敗，停止受限步驟並回報，不自動升級 `spreadsheets`、Drive 全 scope、外部請求或新 OAuth client。
2. 執行 `node scripts/build-collector.js` 只產生本機 bundle。由教師在自己的 Apps Script 編輯器建立獨立專案，貼入生成 Code.gs 與 manifest。manifest 啟用 Sheets v4；預設 Cloud project 會自動啟用對應 API，不需 UrlFetch、Picker 或第二套 OAuth client。
3. 在 Script Properties 明確設 `INITIALIZE_NEW_PRIVATE_SHEET=true`、`COLLECTOR_ENABLED=false`，由教師在編輯器執行 **`initializePrivateCollector_`**。它由同一 app 建立新的收件表，寫入固定 `SPREADSHEET_ID`；已有 ID 就拒絕再建。尾底線使管理函式無法由 `google.script.run` 呼叫。不要用另一個 connector 或手動建表再直接填 ID，聲稱此 app 已獲文件授權。
4. 在 Google Share 介面核對新表為「限制存取」，只有教師／明確授權人員；不要公開或使用含其他資料的表。老師審核另記，保留原始 15 欄收件列，不排序／修改／插入公式，以免重送核對失敗。
5. 設 `RECORDS_SHEET`（預設 `ethics_game_receipts`）、`CLASS_SESSIONS`、`CLASS_ACCESS_CODE_HASHES`。程式支援無碼課次，但此次部署使用私人通行碼：原碼在操作時生成，SHA256 map 只填 Script Properties；不放部署包。10/6 指定「軍人倫理（一）」已核對為 `u03`「超出能力的求助」；正式設定如下：

```json
[{"id":"2026-10-06-d84-26-u03","chapterId":"u03","opensAt":"2026-10-06T05:30:00Z","closesAt":"2026-10-06T07:20:00Z","rollingLimit":{"windowSeconds":600,"maxEvents":300,"maxStudentEvents":10}}]
```

6. 若使用通行碼，輸入總長最多 128 字，不允許控制字元；在可信本機將 trim 後原碼以 UTF-8 計算 SHA256，僅把 sessionId→64位十六進位 hash 的 JSON map 放入 `CLASS_ACCESS_CODE_HASHES`；原碼與 hash 都不放前端／版本庫／log。只存 hash 不代表原碼能抵抗猜測，低熵碼仍不安全。
7. Web App 採已核准的 `USER_DEPLOYING`（教師身分）與學生 access=`ANYONE`（任意已登入 Google 使用者）。`ANYONE_ANONYMOUS` 不在授權範圍。這不授予學生工作表讀取權，但登入不代表本班本人，execute-as-owner 也不能依賴 active-user email。初驗可設 `MYSELF`；測試 Google 真正授權／建表／寫入時，用獨立虛構課次與身分，再以 ANYONE 驗證登入與私人表拒絕存取。
8. 批准後的實測需核對：實際 consent 只有 drive.file、同 app 建表、私人分享、RAW 型態、追加後完整列讀回、前導零、同事件去重、事件衝突、敗局完成、缺反思／錯章／錯課次／超時／錯碼／限額拒收、登入重導後 GET 提交頁與 RPC 回執。離線 stub 不替代此項。
9. 確認真實回執和表列相符後，另依既有發布流程啟用 public config 的 URL／課次／指定章節；工作表 ID、code、hash、token 不進 public config。最新 commit／CI／Pages 與 Google 收件結果由部署驗證記錄提供。

## 登入及可確認回執

Pages 先在同意後準備可重送的 event，學生複製事件內容，明確開 `/exec` GET 新分頁；若 clipboard 不可用，提供可手動複製文字。事件不放 query、fragment 或 postMessage。GAS 頁在登入後接受貼上的 JSON 和獨立 password 欄位，以 `google.script.run.handleClassroomSubmission(raw, accessCode)` 呼叫伺服器。

服務端只有在 trusted replay、門檻、鎖、寫入與整列讀回均成功後回傳 `{ok,eventId,serverReceivedAt,reviewStatus,duplicate}`。頁面再核對事件 ID、ISO 伺服器時間及 pending_teacher_review。RPC failure、無效回應或逾時只顯示「尚未確認」，保留事件讓學生以同一編號重送；不回傳姓名、學號、反思、Sheet ID 或設定，不提供公開查詢紀錄端點。

達滾動限額時，頁面明示保留原事件並稍後在當堂時間內重送；不宣稱保存成功。本機 outbox 最多 20 份，滿載即阻止準備第 21 份，保留所有舊事件；「匯出待提交備份」下載原 ID 與內容，不清除 outbox，也不產生伺服器回執。備份含私人學習資料，應妥善保存。每份完整 u03 挑戰仍由學生逐筆送出；本版沒有 13 章自動同步或班級排行榜讀取端點。

上限限制寫入數量，通行碼限制入口；自填學號可更換、碼可被轉傳，兩者均不驗證本人或防代玩。錯碼請求仍會消耗 Apps Script 執行配額；程式內上限不是抵抗 DDoS 的保證。教師可關閉 `COLLECTOR_ENABLED`，並按已公告的設備失敗替代流程處理。

## 離線驗證

執行 `npm test`，包括原遊戲檢查、既有收件與前端案例，以及 Advanced service、滾動限額／碼、待傳備份與 GAS 頁測試。全部為虛構資料／API stub，不存取 Google 或學生資料。`npm run build` 只產生本機 bundle／allowlisted site；不是部署。Google 真實驗收與離線測試分開記錄；真機手機、非教師 Google 帳戶、趣味性與實際音樂聽感仍須按對應情境驗收。

官方依據：[Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes)、[同 app 建表](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/create)、[Advanced services](https://developers.google.com/apps-script/guides/services/advanced)、[RAW](https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption)、[ExtendedValue](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/other#ExtendedValue)、[Web App access](https://developers.google.com/apps-script/manifest/web-app-api-executable)、[google.script.run](https://developers.google.com/apps-script/guides/html/reference/run)、[私有 helper](https://developers.google.com/apps-script/guides/html/communication#private_functions)、[Session 身分限制](https://developers.google.com/apps-script/reference/base/session#getActiveUser())。
