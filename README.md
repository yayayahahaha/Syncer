# Google Photos 同步檢查工具

這個工具可以幫助你檢查本地資料夾中的照片，是否已經存在於你的 Google Photos 中。它透過比對本地照片的 EXIF 時間資訊與預先從 Google Photos 下載的資料快取來完成，避免了每次執行都大量呼叫 API。

## 環境需求

- Node.js >= 18.0.0
- pnpm >= 8.0.0

## 核心功能

- 掃描本地資料夾中的照片，並讀取其 EXIF 元資料。
- 提供一個網頁介面，讓使用者透過 Google Photos Picker 選擇照片，並自動生成對應日期的資料快取。
- 比對本地照片與快取資料，找出尚未備份的照片。
- 將比對結果輸出成 JSON 檔案，方便後續處理。

## 首次設定

在開始使用前，請完成以下設定步驟。

### 1. 安裝專案依賴

```bash
# 安裝 pnpm（如果尚未安裝）
npm install -g pnpm

# 安裝專案依賴
pnpm install
```

### 2. 設定 Google API 憑證

本工具需要透過 Google API 讀取您的相簿資訊，因此需要進行授權設定。

1.  前往 [Google Cloud Console](https://console.cloud.google.com/)。
2.  建立一個新專案或選擇現有專案。
3.  在左側選單的「API 和服務」中，啟用 **Google Photos Library API**。
4.  在「憑證」頁面建立一個 **OAuth 2.0 用戶端 ID**。
    - 應用程式類型請選擇「**網頁應用程式**」。
    - 在「已授權的 JavaScript 來源」中，加入 `http://localhost:8080`。
    - 在「已授權的重新導向 URI」中，加入 `http://localhost:8080`。
5.  建立後，您會得到一個**用戶端 ID**。請將其複製下來。
6.  打開 `photos-picker-demo.html` 檔案，將第 68 行的 `CLIENT_ID` 變數值替換成您的用戶端 ID。
    ```html
    <!-- photos-picker-demo.html -->
    <script>
      const CLIENT_ID = '在此貼上您的用戶端 ID' // e.g., 'xxxx.apps.googleusercontent.com'
      // ...
    </script>
    ```

> ⚠️ **重要**：舊的 `credentials.json` 桌面應用程式流程已不再適用於此專案，請務必使用上述的網頁應用程式流程進行設定。

### 3. 準備本地照片與參數

1.  將您想要檢查是否已備份的照片，放入專案根目錄下的 `photos_to_check` 資料夾中。
2.  (可選) 複製 `params.json.example` 並命名為 `params.json`。如果有些照片沒有 EXIF 時間資訊，您可以編輯此檔案，提供一個備用的檢查日期。
    ```json
    {
      "fallbackDateList": ["2025/03/27"]
    }
    ```

## 使用方式

本工具的使用分為兩個主要步驟：

### 步驟一：獲取 Google Photos 資料並建立快取

這一步的目的是從 Google Photos 下載您指定照片的資訊，並在本地建立 `.json` 快取檔案。

1.  在終端機中執行以下命令，啟動本地伺服器：
    ```bash
    node picker-server.js
    ```
2.  伺服器啟動後，您會看到提示 `📸 相片選擇器已啟動，請在瀏覽器中打開 http://localhost:8080 來選擇相片`。
3.  在您的網頁瀏覽器中打開 `http://localhost:8080`。
4.  點擊「**登入 Google**」按鈕，並在彈出視窗中完成 Google 帳號的登入和授權。
5.  登入成功後，點擊「**選擇相片**」按鈕，會彈出一個 Google Photos 的官方選擇器介面。
6.  在選擇器中，**選取您想要檢查的所有照片**，然後點擊「選取」按鈕。
7.  完成後，伺服器會自動接收資料，並在專案的 `photos/` 資料夾下，根據日期生成對應的 `YYYYMMDD.json` 快取檔案。您可以重複此步驟來增加不同日期的快取。

#### 自動化照片選取 (可選)

如果您的照片數量龐大，手動點選會非常耗時。您可以使用 `click-auto.js` 腳本來自動化這個過程。

1.  在彈出的 Google Photos 選擇器視窗中，打開瀏覽器的「開發人員工具」(通常是按 `F12` 或 `Cmd+Opt+J`)，並切換到「**Console**」(主控台) 標籤頁。
2.  打開專案中的 `click-auto.js` 檔案，複製其全部內容。
3.  將複製的程式碼貼到瀏覽器的 Console 中，然後按下 `Enter` 鍵。
4.  腳本會開始自動向下捲動並選取所有照片，直到達到約 2000 張的上限或捲動到底部為止。

> **提示**：您可以修改 `click-auto.js` 腳本開頭的 `m` (月) 和 `d` (日) 變數，讓腳本從指定的日期開始選取，方便您分批操作。  
> 自動捲動的 container 的 selector 可能會失效，可以手動更新  
> 有時候會出現一直往下捲動但沒有嘗試勾選任何項目的場景，這個時候可以先點「完成」，然後下次先手動捲動到附近後重新開始一次

### 步驟二：比對本地照片與快取資料

當快取檔案準備好後，就可以開始比對了。

1.  確認您想比對的照片都已經放在 `photos_to_check` 資料夾中。
2.  在終端機中執行比對腳本：
    ```bash
    node index.js
    ```
3.  腳本會掃描 `photos_to_check` 中的每一張照片，並與 `photos/` 資料夾中的快取進行比對。
4.  比對完成後，詳細的結果會被寫入到 `logs/output.json` 檔案中。`true` 表示已在 Google Photos 中找到匹配的照片，`false` 或沒有該欄位則表示未找到。

## 注意事項

- `token.json` 檔案是您登入後自動產生的金鑰，請勿將其分享給他人。
- 您可以在 [Google 帳號設定](https://myaccount.google.com/permissions) 中隨時管理或撤銷本應用程式的存取權限。
