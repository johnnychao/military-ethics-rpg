# 國醫倫理冒險｜2D 策略 RPG

此收件改版已獲使用者授權續接部署，Google 真實收件仍須驗收；本機 Google 收件設定保持 OFF。GitHub commit／CI／Pages 的最新狀態以部署驗證記錄為準。

沿用同一個既有遊戲的 13 章、三份線索、四位隊員、三回合策略與兩欄反思。此 repo 僅收錄審查過的必要程式與新增收件程式；原 Google Drive 專案未被改寫、移動或停止服務。

學生可在 GitHub Pages 遊玩並以「紀錄」備份／匯入 JSON。當堂收件目前預設關閉，尚需完成已核准範圍內的 Google 授權、私人工作表與真實收件驗收。10/6 指定「軍人倫理（一）」：`u03`「超出能力的求助」。未啟用時不收集姓名或學號，也不自動上傳進度。

## 當堂條件

已核准條件：完成當週指定關卡＋填完反思。兩個反思欄都必須非空，且來自同一次已完成的挑戰。戰術失敗、答對率、稱號與分數不作為出席門檻。學生自填身分與可匯入的本機紀錄仍需教師核對，不宣稱防代玩或自動完成正式點名。

Google 服務收到完整事件後，根據教師設定的當堂、章節與伺服器收件時間驗證；以可信章節定義重演策略資料，拒絕僅宣稱已完成的布林值。同一腳本鎖內去重、事件限額、RAW 寫入及整列型態讀回，確認後才產生回執。學生先複製單筆事件、直接開啟 GAS 頁登入，再由該頁提交；複製、開頁或請求成功不表示 Sheets 已收件。

使用者已核准以 `johnny2cindy@gmail.com` 執行同一 Apps Script，以唯一 `drive.file` 範圍新建私人表「軍事倫理學遊戲紀錄｜2026秋」，並採 `USER_DEPLOYING`＋`ANYONE`（須登入 Google）。禁止匿名存取或自動擴大 scope。可設定的課次／自填學號事件上限及課堂通行碼只限制收件，不證明學生身分。通行碼只在 GAS 頁輸入、hash 只放 Script Properties，不進前端或版本庫。

## 驗證與建置

Node 22 以上，不需第三方 npm 套件：

```sh
npm test
npm run build
```

GitHub Actions 只部署 scripts/build-site.js 的明確檔案清單，不把收件服務原始碼、測試、教材、備份或學生檔帶入 Pages artifact。Google 服務啟用步驟及權限見 collector/README.md；生成程式見 collector/generated/Code.gs。

公開版資料測試保留原 2D 邏輯與版型，但使用凍結的教材參考 metadata fixture，不發布或要求教材 PDF／舊版 backup。這些測試不能取代原專案的教材檔案核對，也不代表真機手機、實際喇叭、學生趣味性或 Google 真實收件已驗收。

## 素材來源與隱私

Canvas 圖形、虛構人物與 Web Audio 音符表為既有原創製作；系統字型不隨 repo 散布。保留 assets/rpg/README.md 的素材來源聲明。章節只帶摘要與來源頁碼，不包含教材 PDF。沒有重新授權教材或第三方素材為 MIT 等開源授權。

資料使用說明見 privacy.html。請勿 commit 姓名、學號、反思、工作表 ID、憑證或任何學生匯出檔。
