# 職安勇者｜雲端多人學習系統部署說明（Supabase）

## 上線狀態

此儲存庫已加入**跨裝置雲端登入、進度同步程式、資料庫建置 SQL、學員管理者儀表板**；但在 Supabase 專案建立及設定完成前，`cloud/cloud-config.js` 保持空白，網站**自動沿用原本本機 PIN 檔案模式**，確保已使用中的學員不受影響。

本功能不等同於已完成的雲端部署。不得在未安裝資料庫或未核實 RLS 政策前填入設定值。

## 1. 建立 Supabase 專案

前往 https://supabase.com/dashboard 建立專案，儲存專案名稱、區域及資料庫密碼；不要將密碼寫入 GitHub。
在專案的 **SQL Editor** 執行：

`supabase/migrations/20261020_osh_cloud.sql`

此檔案將建立：

- `public.learner_profiles`：使用者名稱及 `student/admin` 權限。
- `public.learner_progress`：每位學員獨立的完整練習紀錄、摘要資料、更新版號。
- 所有需要的 **RLS 逐列存取政策**，不允許學員讀取其他學員資料。
- 新註冊使用者的後端自動建立學員檔案，角色固定為 `student`。

**請先測試**：兩個一般學員彼此無法存取資料；未登入無法存取任何學員紀錄。不要關閉 RLS。

## 2. 啟用 Email 註冊驗證

到 **Authentication → Providers** 確認 Email 已啟用，正式環境建議**強制確認電子郵件**、設定適當的密碼及濫用保護，配置正式 SMTP 服務以提供穩定寄送；Supabase 預設測試郵件功能可能有限額。

至 **Authentication → URL Configuration** 設定：

- Site URL：`https://joemelody7532-arch.github.io/osh-exam-mobile/`
- Redirect URLs：`https://joemelody7532-arch.github.io/osh-exam-mobile/`

此網站需要 HTTPS。登入採 **Supabase Auth** 的 Email＋密碼，不再使用本機 6 位 PIN 當作雲端身分驗證。

## 3. 在 GitHub 設定公開連線資訊

編輯 `cloud/cloud-config.js`：

```javascript
window.OSH_CLOUD_CONFIG = {
  url: "https://你的專案ID.supabase.co",
  publishableKey: "sb_publishable_你的公開金鑰",
  redirectUrl: "https://joemelody7532-arch.github.io/osh-exam-mobile/"
};
```

取得位置：Supabase → Project Settings → API Keys（publishable key）及 Data API / API settings（Project URL）。

**務必注意：** publishable/anon 是設計給瀏覽器使用的公開金鑰，安全性依靠 Auth 與 RLS。**service_role、secret key、資料庫密碼絕對不能放進 GitHub、HTML、JavaScript 或聊天**。

GitHub Pages 發布完成後用無痕瀏覽器測試註冊、郵件驗證及登入。

## 4. 指派管理者角色

先使用要成為管理者的 Email 在雲端版正常註冊並完成驗證，然後進 Supabase **SQL Editor** 以具管理權限的角色執行：

```sql
update public.learner_profiles
set role = 'admin'
where user_id = (
  select id from auth.users
  where email = '替換成管理者的Email'
  limit 1
);
```

先查詢確認人員識別正確再執行。**請不要在網頁程式碼中加入「升級為管理者」按鈕或開放修改 `role` 欄位**。

進入管理後台：

https://joemelody7532-arch.github.io/osh-exam-mobile/admin.html

系統先用 Supabase Auth 驗證身分，再由資料庫 RLS 控制可讀取哪些學員資料；未授權者無法瀏覽全體學員。

## 5. 舊版進度轉移

舊版 v5 本機使用者資料存放在原手機瀏覽器，無法自動跨裝置存取。在尚未啟用雲端前，請每位使用者：

1. 以本機 PIN 登入原有個人檔案。
2. 在設定中按「匯出個人練習資料」，下載 JSON 備份。
3. 待雲端上線後用本人電子郵件註冊及登入。
4. 在設定中「匯入備份」，指定本人 JSON；網站將排入雲端同步。
5. 等待「✅ 雲端已同步」，再登入另一部手機核對結果。

切勿把舊版多人共用的混合紀錄一律匯入同一個人的新帳號。

## 6. 管理者儀表板功能

管理者可檢視與匯出：
- 總學員數、7 日活躍學員、總作答題數、整體正確率與模擬考次數。
- 最近七天答題活動柱狀圖。
- 個別學員證照類別、作答量、正確率、模擬考次數、甲級闖關等級、星星與最後同步時間。
- 搜尋、依證照及時間篩選，以及 UTF-8 CSV 匯出（對公式字元作安全處理）。

學員的學習紀錄與個資應依適用的個資及內部告知規範管理，向所有學員告知管理者可檢視學習成績，並限制後台管理者人數。

## 7. 雙手機同步原理及限制

- 題目作答後先寫入帳號專屬的瀏覽器離線快取，並排入雲端同步。
- 恢復連線或切回頁面時嘗試同步；已在本機完成但尚未同步的進度，另一台手機不會立即看到。
- 雲端資料有版本號以避免盲目覆蓋；跨裝置衝突時合併不重複的答題事件和星等，並盡量保存闖關狀態。
- 裝置時鐘差異、極端同時操作或失去連線時，仍有衝突風險。請確認「已同步」再頻繁切換裝置；重要資料可匯出備份。
- GitHub Pages 為靜態網站，公開 URL 不會自行建立 Supabase 專案、SQL 資料表或 Email 服務。
- 系統分數及學習結果由用戶端送出，**非防作弊的正式檢定考試或具公信力評量平台**。

## 8. 驗收檢查

- [ ] A 在 iPhone 註冊並答題，顯示「✅ 雲端已同步」。
- [ ] A 在 Android 或另一台 iPhone 用同帳號登入，看到相同進度。
- [ ] B 用不同帳號登入，無法看到 A 的答題、星星或資料。
- [ ] 未登入使用者無法讀取資料庫。
- [ ] B 嘗試打開 `admin.html` 時看見「無權限存取」。
- [ ] SQL 指派 A 為 admin 後，A 可開後台看到所有學員。
- [ ] A 匯出 CSV 後欄位正確，學員資料無重複。
- [ ] 離線作答再恢復網路後可以正常上傳。
- [ ] 不曾在 GitHub 提交過 service_role/secret key。
