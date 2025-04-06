import fs from 'fs/promises'

import { ensureLogsDir, isMatching, OUTPUT_FILE } from './utils.js'
import { authorize, searchGooglePhotosByDate } from './google-utils.js'
import { getLocalPhotosMetadata } from './photo-utils.js'

async function main() {
  // 確保 logs 的資料夾存在
  await ensureLogsDir()

  // Google Photo API 驗證
  const auth = await authorize()
  await auth.getAccessToken()

  // 讀取本地要檢查有沒有備份的資料夾裡的檔案
  const localPhotos = await getLocalPhotosMetadata()
  console.log(`📸 找到本地相片 ${localPhotos.length} 張`)

  // 根據日期分組：{ "YYYY-MM-DD": [photo1, photo2, ...] }
  const photosByDate = localPhotos.reduce((group, photo) => {
    group[photo.date] = group[photo.date] || []
    group[photo.date].push(photo)
    return group
  }, {})

  // 為每一天查詢 Google Photos，只發一次 API 請求
  const googlePhotosMap = {}
  for (const date in photosByDate) {
    console.log(`☁️ 查詢 ${date} 的備份資料…`)
    const items = await searchGooglePhotosByDate(auth, date)
    googlePhotosMap[date] = {
      list: items,
      nameSet: new Set(items.map((item) => item.filename)),
    }
    console.log(`✅ ${date} 取得 ${items.length} 筆 Google Photos 資料`)
  }

  // 比對每一張照片的檔名、時間與解析度
  const output = localPhotos.map((photo) => {
    const { list: googleItems, nameSet } = googlePhotosMap[photo.date]

    const match = nameSet.has(photo.filename)
      ? { isFilenameMatched: true, isPhotoDataMatched: true }
      : googleItems.find((googleItem) => isMatching(photo, googleItem))
    if (match) {
      console.log(`✅ 找到 ${photo.filename} 的備份`)
    } else {
      console.log(`❌ 沒有找到 ${photo.filename} 的備份`)
    }
    return { ...photo, ...match }
  })

  // 輸出結果
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2))
  console.log(`🔄 結果已輸出至 ${OUTPUT_FILE}`)
}

main().catch((err) => {
  console.error('程式發生錯誤:', err)
})
