import fs from 'fs/promises'
import path from 'path'

import { ensureLogsDir, isMatching, OUTPUT_FILE } from './utils.js'
import { authorize, searchGooglePhotosByDate } from './google-utils.js'
import { getLocalPhotosMetadata } from './photo-utils.js'

const CACHE_DIR = path.join(process.cwd(), 'cache')
const RECENT_DAYS = 3

// 確保 cache 資料夾存在
async function ensureCacheDir() {
  try {
    await fs.access(CACHE_DIR)
  } catch {
    await fs.mkdir(CACHE_DIR)
  }
}

// 檢查日期是否在最近幾天內（這些資料不快取）
function isRecentDate(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24))
  return diffDays <= RECENT_DAYS
}

// 從快取讀取或寫入資料
async function getOrSetCache(dateStr, getter) {
  const cachePath = path.join(CACHE_DIR, `${dateStr}.json`)

  try {
    // 嘗試讀取快取
    const cacheData = await fs.readFile(cachePath, 'utf-8')
    console.log(`📦 從快取讀取 ${dateStr} 的資料`)
    return JSON.parse(cacheData)
  } catch {
    // 如果沒有快取或讀取失敗，執行 getter
    const data = await getter()

    // 如果不是最近幾天的資料，就存入快取
    if (!isRecentDate(dateStr)) {
      console.log(`💾 將 ${dateStr} 的資料存入快取`)
      await fs.writeFile(cachePath, JSON.stringify(data, null, 2))
    } else {
      console.log(`⚠️ ${dateStr} 是最近 ${RECENT_DAYS} 天的資料，不進行快取`)
    }

    return data
  }
}

const fallbackDateList = [new Date('2025/03/27').getTime()]

async function main({ fallbackDateList = [] } = {}) {
  // 確保必要的資料夾存在
  await ensureLogsDir()
  await ensureCacheDir()

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

    const items = await getOrSetCache(dateStr, async () => {
      const result = await searchGooglePhotosByDate(auth, dateStr)
      console.log(`✅ ${dateStr} 取得 ${result.length} 筆 Google Photos 資料`)
      return result
    })

    googlePhotosMap[dateStr] = {
      list: items,
      nameSet: new Set(items.map((item) => item.filename)),
    }
  }

  // 比對每一張照片的檔名與時間
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
