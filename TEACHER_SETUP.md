# 教師啟用與當堂驗收

公開遊戲可以先遊玩。Google 收件保持停用，直到老師核准下列持續權限、完成設定並以虛構事件確認回執與私人工作表一致。

## 需要老師明確核准的 Google 權限

- Apps Script manifest 只要求 `https://www.googleapis.com/auth/spreadsheets`。Google 的此 scope 涵蓋老師可存取的工作表，並非只授權一份工作表；程式使用私人 Script Properties 中的 `SPREADSHEET_ID`，只對指定工作表執行收件。不要求 Drive、Gmail、外部請求或背景 trigger 權限。
- Web App 若以部署者／老師身分執行，學生的有效提交會使用老師的授權寫入私人工作表。學生不取得工作表讀取權；程式沒有公開查詢學生成績或紀錄的介面。
- 要讓學生開啟收件頁，需核准 Web App 的使用者範圍。可採學校網域允許的登入範圍；若開放任何人或匿名，公開端點可能收到冒名與濫用提交。程式驗證課次、章節、時窗、完整行動與反思，但不證明真人身分，因此一律標記 `pending_teacher_review`。

以上權限與 Web App 發布尚未啟用。若 Google 要求不同或額外的權限，應停止並確認其影響，不自行新增 OAuth client、憑證或修改安全政策。

官方依據：[Web App 執行身分與發布](https://developers.google.com/apps-script/guides/web)、[最小且明確的 OAuth scopes](https://developers.google.com/apps-script/concepts/scopes)、[openById 所需權限](https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#openById(String))。Web App 中不能依賴 bound script 的 `getActiveSpreadsheet()`，因此不宣稱使用 `spreadsheets.currentonly` 即可完成此收件服務。

## 核准後的最少步驟

1. 在老師帳號準備私人工作表及獨立收件分頁；不公開工作表，也不更改學生檔案分享。把 `collector/generated/Code.gs` 與 `collector/generated/appsscript.json` 放進老師自己的 Apps Script 專案。
2. 在 Script Properties 設定工作表 ID、收件分頁、課次與指定關卡；所有私人值留在 Google 端，勿 commit。具體鍵名、schema 與生成命令見 `collector/README.md`。先使用明確標示虛構的驗證課次，不把測試資料當正式出席。
3. 核准 manifest 權限與 Web App 執行／使用者範圍，取得真正 `/exec` URL。先測一筆完整虛構事件，再重送同 eventId；應只留一筆，回執使用相同伺服器收件時間。拒絕缺反思、未完成、錯章、錯課次與收件時窗外的事件；故障不得產生成功回執。
4. 10/6 13:30–15:20（台灣）D84、26 教室的正式指定章節尚待老師決定。使用已核准的「完成指定關卡＋填完反思」，不設答對率或戰術勝敗門檻。將同一課次與章節設定到 Google 服務及 `js/classroom_config.js`；只公開課次代碼、章節與收件 URL，不公開工作表 ID。
5. 完成 Google 真實寫入／回執驗收後才將公共設定的 `enabled` 改為 `true` 並透過 Pages 工作流重新發布。現有 `enabled:false` 不收集姓名或學號。

## 尚需當堂驗收

- 從學生網址進入、選指定章節、完成兩欄反思、送出及教師確實收到同一次紀錄。
- 真機手機的觸控與桌機鍵盤、重新整理／JSON 備份還原、背景頁籤及音樂喇叭試聽。
- 完成時間與趣味性：請用非正式試玩觀察學生能否理解資源取捨、隊員協作、事件與反思；不將策略勝敗當道德評分。
- 設備故障時先保留 JSON 備份、使用老師允許的裝置恢復同一份紀錄；若只能紙本或口頭完成，替代出席方式由老師明確核定。此程式不自動把設備故障、紙本或未收件的進度算成出席。
- 老師核對自填身分、指定課次與學習內容後，才在原有正式點名流程處理；本程式不讀名冊或改寫正式出席表。

資料保存期限與刪除、更正流程由老師訂定，向學生公告後再啟用正式收件。
