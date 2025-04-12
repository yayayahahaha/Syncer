# Google Photos 同步工具

這個工具可以幫助你檢查本地照片是否已經備份到 Google Photos。

## 環境需求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

## 功能

- 掃描指定資料夾中的照片
- 檢查照片是否已備份到 Google Photos
- 支援多種照片格式
- 自動處理日期範圍
- 快取機制減少 API 呼叫

## 安裝

```bash
# 安裝 pnpm（如果尚未安裝）
npm install -g pnpm

# 安裝專案依賴
pnpm install
```

## 設定

### Google Photos API 認證

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立新專案或選擇現有專案
3. 啟用 Google Photos Library API
4. 在「憑證」頁面建立 OAuth 2.0 用戶端 ID
   - 應用程式類型選擇「桌面應用程式」
   - 設定授權的重新導向 URI 為 `http://localhost`
5. 下載認證檔案並重新命名為 `credentials.json`
6. 將 `credentials.json` 放在專案根目錄

> ⚠️ 重要：`credentials.json` 包含你的 Google Cloud 專案認證資訊，請勿分享給他人。每個使用者都應該建立自己的 Google Cloud 專案並下載自己的認證檔案。

### 本地設定

1. 複製 `credentials.example.json` 到 `credentials.json`
2. 填入你的 Google Cloud 專案認證資訊
3. 複製 `params.json.example` 到 `params.json`
4. 在 `params.json` 中設定備用日期列表
   ```json
   {
     "fallbackDateList": [
       "2025/03/27"  // 格式：YYYY/MM/DD
     ]
   }
   ```
5. 將要檢查的照片放在 `photos_to_check` 資料夾中

## 使用方式

```bash
node index.js
```

程式會：

1. 讀取 `photos_to_check` 資料夾中的照片
2. 檢查每張照片是否已備份到 Google Photos
3. 將結果輸出到 `logs/output.json`

## 注意事項

- `credentials.json` 包含你的 Google Cloud 專案認證資訊，請勿加入版本控制或分享給他人
- 第一次執行時會開啟瀏覽器進行 Google 帳號授權
- 授權完成後會自動儲存金鑰到本地的 `token.json`
- 金鑰過期或無效時會自動重新授權
- 你可以在 [Google 帳號設定](https://myaccount.google.com/permissions) 中隨時管理應用程式的存取權限
- 如果沒有設定 `params.json`，程式會使用預設值（空的備用日期列表）
