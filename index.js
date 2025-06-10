import fs from 'fs/promises'

import { ensureLogsDir, isMatching, OUTPUT_FILE, loadParams, MSG } from './utils.js'
import { authorize, searchGooglePhotosByDate } from './google-utils.js'
import { getLocalPhotosMetadata } from './photo-utils.js'
import { ensureCacheDir, getOrSetCache } from './cache-utils.js'

async function main() {
  // 確保必要的資料夾存在
  console.log(MSG.ACTION('正在檢查必要的資料夾...'))
  await Promise.all([ensureLogsDir(), ensureCacheDir()])
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
      const { error, data } = await searchGooglePhotosByDate(auth, dateStr)
      if (!error) console.log(MSG.INFO(`${dateStr} 取得 ${data.length} 筆 Google Photos 資料`))
      else console.log(MSG.ERROR(`取得 Google Photos 資料失敗! ${await error.text()}`))
      return { error, data }
    })

    googlePhotosMap[dateStr] = {
      list: items,
      nameSet: new Set(items.map((item) => item.filename)),
    }
  }
  console.log()

  // 比對每一張照片的檔名與時間
  console.log(MSG.ACTION('開始比對照片...'))
  let successCount = 0
  let timeSuccessCount = 0
  let failedCount = 0
  const output = localPhotos.map((photo) => {
    let matchedDate = null
    let match = null

    // 先檢查所有日期的檔名匹配
    for (const range of photo.possibleCreateDateList) {
      const dateStr = range.start.split('T')[0]
      const { nameSet } = googlePhotosMap[dateStr] || { nameSet: new Set() }

      if (nameSet.has(photo.fileName)) {
        matchedDate = dateStr
        match = { isFilenameMatched: true, isPhotoDataMatched: true }
        break
      }
    }

    // 如果沒有找到檔名匹配，且照片有創建時間，才檢查時間匹配
    if (!match && photo.possibleCreateTime) {
      for (const range of photo.possibleCreateDateList) {
        const dateStr = range.start.split('T')[0]
        const { list: googleItems } = googlePhotosMap[dateStr] || { list: [] }

        // 檢查這個日期的所有照片
        for (const googleItem of googleItems) {
          const matchResult = isMatching(photo, googleItem)
          if (matchResult.isMatch) {
            matchedDate = dateStr
            match = { isFilenameMatched: false, isPhotoDataMatched: true, deltaTime: matchResult.deltaTime }
            break
          }
        }
        if (match) break
      }
    }

    if (match) {
      successCount++
      if (match.isFilenameMatched) {
        console.log(MSG.SUCCESS(`找到 ${photo.fileName} 的備份 (透過檔名匹配，日期: ${matchedDate})`))
      } else {
        timeSuccessCount++
        console.log(
          MSG.INFO(
            `找到 ${photo.fileName} 的備份 (透過時間匹配，日期: ${photo.possibleCreateTime}, 誤差為 ${match.deltaTime} 毫秒)`
          )
        )
      }
    } else {
      failedCount++
      if (!photo.possibleCreateTime) {
        console.log(MSG.WARNING(`沒有找到 ${photo.fileName} 的備份 (此照片無創建時間，僅檢查檔名)`))
      } else {
        console.log(
          MSG.ERROR(
            `沒有找到 ${photo.fileName} 的備份 (日期: ${photo.possibleCreateDate}, 時間: ${new Date(
              photo.possibleCreateTime
            ).toISOString()})`
          )
        )
      }
    }
    return { ...photo, ...match }
  })
  console.log(
    MSG.INFO(`找到了 ${successCount} 張, 其中有 ${timeSuccessCount} 張是透過時間匹配, 有 ${failedCount} 張沒找到`)
  )
  console.log()

  // 輸出結果
  console.log(MSG.ACTION('正在輸出結果...'))
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2))
  console.log(MSG.SUCCESS(`結果已輸出至 ${OUTPUT_FILE}`))
}

main().catch((err) => {
  console.error(MSG.ERROR('程式發生錯誤:'), err)
})
