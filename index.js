import fs from 'fs/promises'
import path from 'path'

import { ensureLogsDir, isMatching, OUTPUT_FILE, loadParams, MSG } from './utils.js'
import { authorize, searchGooglePhotosByDate } from './google-utils.js'
import { getLocalPhotosMetadata } from './photo-utils.js'
import { ensureCacheDir, getOrSetCache } from './cache-utils.js'

async function main() {
  // 確保必要的資料夾存在
  console.log(MSG.ACTION('正在檢查必要的資料夾...'))
  await ensureLogsDir()
  await ensureCacheDir()
  console.log(MSG.SUCCESS('資料夾檢查完成'))
  console.log()

  // 讀取參數
  console.log(MSG.ACTION('正在讀取參數...'))
  const { fallbackDateList } = await loadParams()
  console.log(MSG.INFO(`已讀取 ${fallbackDateList.length} 個備用日期`))
  console.log()

  // Google Photo API 驗證
  console.log(MSG.ACTION('正在驗證 Google Photos API...'))
  const auth = await authorize()
  await auth.getAccessToken()
  console.log(MSG.SUCCESS(`Google Photos API 驗證成功`))
  console.log()

  // 讀取本地要檢查有沒有備份的資料夾裡的檔案
  console.log(MSG.ACTION('正在讀取本地照片...'))
  const localPhotos = await getLocalPhotosMetadata({ fallbackDateList })
  console.log(MSG.INFO(`找到本地相片 ${localPhotos.length} 張`))
  console.log()

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
    console.log(MSG.ACTION(`正在查詢 ${dateStr} 的備份資料...`))

    const items = await getOrSetCache(dateStr, async () => {
      const result = await searchGooglePhotosByDate(auth, dateStr)
      console.log(MSG.INFO(`${dateStr} 取得 ${result.length} 筆 Google Photos 資料`))
      return result
    })

    googlePhotosMap[dateStr] = {
      list: items,
      nameSet: new Set(items.map((item) => item.filename)),
    }
  }
  console.log()

  // 比對每一張照片的檔名與時間
  console.log(MSG.ACTION('開始比對照片...'))
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
      console.log(MSG.SUCCESS(`找到 ${photo.fileName} 的備份`))
    } else {
      console.log(MSG.ERROR(`沒有找到 ${photo.fileName} 的備份`))
    }
    return { ...photo, ...match }
  })
  console.log()

  // 輸出結果
  console.log(MSG.ACTION('正在輸出結果...'))
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2))
  console.log(MSG.SUCCESS(`結果已輸出至 ${OUTPUT_FILE}`))
}

main().catch((err) => {
  console.error(MSG.ERROR('程式發生錯誤:'), err)
})
