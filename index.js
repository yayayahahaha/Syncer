import fs from 'fs/promises'

import { ensureLogsDir, isMatching, OUTPUT_FILE } from './utils.js'
import { authorize, searchGooglePhotosByDate } from './google-utils.js'
import { getLocalPhotosMetadata } from './photo-utils.js'

const fallbackDateList = [new Date('2025/03/27').getTime()]

async function main({ fallbackDateList = [] } = {}) {
  // 確保 logs 的資料夾存在
  await ensureLogsDir()

  // Google Photo API 驗證
  const auth = await authorize()
  await auth.getAccessToken()

  // 讀取本地要檢查有沒有備份的資料夾裡的檔案
  const localPhotos = await getLocalPhotosMetadata({ fallbackDateList })
  console.log(`📸 找到本地相片 ${localPhotos.length} 張`)

  // 收集所有可能的日期範圍，並去除重複
  const uniqueDateStrs = new Set()
  localPhotos.forEach((photo) => {
    photo.possibleCreateDateList.forEach((range) => {
      uniqueDateStrs.add(range.start.split('T')[0])
    })
  })

  // 為每個唯一的日期查詢 Google Photos
  const googlePhotosMap = {}
  for (const dateStr of uniqueDateStrs) {
    console.log(`☁️ 查詢 ${dateStr} 的備份資料…`)
    const items = await searchGooglePhotosByDate(auth, dateStr)
    googlePhotosMap[dateStr] = {
      list: items,
      nameSet: new Set(items.map((item) => item.filename)),
    }
    console.log(`✅ ${dateStr} 取得 ${items.length} 筆 Google Photos 資料`)
  }

  // 比對每一張照片的檔名、時間與解析度
  const output = localPhotos.map((photo) => {
    // 找出所有可能的日期範圍中是否有匹配的 Google Photos 項目
    const match = photo.possibleCreateDateList.some((range) => {
      const dateStr = range.start.split('T')[0]
      const { list: googleItems, nameSet } = googlePhotosMap[dateStr] || { list: [], nameSet: new Set() }

      // 先檢查檔名是否匹配
      if (nameSet.has(photo.fileName)) {
        return { isFilenameMatched: true, isPhotoDataMatched: true }
      }

      // 再檢查時間和解析度是否匹配
      const matchedItem = googleItems.find((googleItem) => isMatching(photo, googleItem))
      if (matchedItem) {
        return { isFilenameMatched: false, isPhotoDataMatched: true }
      }

      return false
    })

    if (match) {
      console.log(`✅ 找到 ${photo.fileName} 的備份`)
    } else {
      console.log(`❌ 沒有找到 ${photo.fileName} 的備份`)
    }
    return { ...photo, ...match }
  })

  // 輸出結果
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2))
  console.log(`🔄 結果已輸出至 ${OUTPUT_FILE}`)
}

main({ fallbackDateList }).catch((err) => {
  console.error('程式發生錯誤:', err)
})
