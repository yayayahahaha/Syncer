import fs from 'fs/promises'

import { ensureLogsDir, isMatching, OUTPUT_FILE, loadParams, MSG } from './utils.js'
import { getLocalPhotosMetadata } from './photo-utils.js'
import { ensurePhotosDir, getPhotoInfoFromFolders } from './cache-utils.js'

async function main() {
  // 確保必要的資料夾存在
  console.log(MSG.ACTION('正在檢查必要的資料夾...'))
  await Promise.all([ensureLogsDir(), ensurePhotosDir()])
  console.log(MSG.SUCCESS('資料夾檢查完成'))
  console.log()

  // 讀取參數
  console.log(MSG.ACTION('正在讀取參數...'))
  const { fallbackDateList } = await loadParams()
  console.log(MSG.INFO(`已讀取 ${fallbackDateList.length} 個備用日期`))
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
      uniqueDateStrs.add(range.start.split('T')[0].replace(/-/g, ''))
    })
  })

  // 為每個唯一的日期查詢 Google Photos
  const googlePhotosMap = {}
  for (const dateStr of uniqueDateStrs) {
    console.log(MSG.ACTION(`正在查詢 ${dateStr} 的資料...`))
    const items = await getPhotoInfoFromFolders(dateStr)
    googlePhotosMap[dateStr] = {
      list: items,
      nameSet: new Set(items.map((item) => item.mediaFile?.filename ?? null)),
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
      const dateStr = range.start.split('T')[0].replace(/-/g, '')
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
        const dateStr = range.start.split('T')[0].replace(/-/g, '')
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
        console.log(MSG.SUCCESS(`透過檔名匹配找到 ${photo.fileName} 這張照片 ✔️`))
      } else {
        timeSuccessCount++
        console.log(
          MSG.WARNING(
            `透過時間精度匹配找到 ${photo.fileName}, 日期 ${matchedDate} ⚠️, 時間相近 (${match.deltaTime} 毫秒差)`
          )
        )
      }
    } else {
      failedCount++
      console.log(MSG.ERROR(`${photo.fileName} ❌`))
    }
    return { ...photo, ...match }
  })

  console.log()
  console.log(MSG.INFO(`成功匹配檔案數: ${successCount}`))
  console.log(MSG.WARNING(`時間相近檔案數: ${timeSuccessCount}`))
  console.log(MSG.ERROR(`失敗檔案數: ${failedCount}`))

  // 寫入結果到檔案
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2))
  console.log(MSG.SUCCESS(`結果已寫入 ${OUTPUT_FILE}`))
}

main().catch((error) => {
  console.error(MSG.ERROR('發生錯誤:', error))
  process.exit(1)
})
