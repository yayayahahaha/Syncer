import fg from 'fast-glob'
import path from 'path'
import fs from 'fs/promises'
import { PHOTO_DIR, testing } from './const.js'
import exifr from 'exifr'

const { Exifr } = exifr

// 掃描指定資料夾內的圖片，讀取 EXIF 中的 CreateDate 與圖片解析度
// 若 EXIF 讀取不到時間，則使用檔案建立時間作為備用
export async function getLocalPhotosMetadata() {
  console.log('🗂️ 檢查備份的資料夾: ', PHOTO_DIR)

  const filesPath = await fg(['**/*.{jpg,jpeg,png,JPG,JPEG,PNG}'], { cwd: PHOTO_DIR, absolute: true })
  const results = []
  for (const file of filesPath) {
    let createDate
    let width = null,
      height = null
    try {
      let exr = new Exifr()
      await exr.read(file)
      let output = await exr.parse()
      let buffer = await exr.extractThumbnail()
      await exr.file?.close?.()
      console.log('output: ', output)
      console.log('buffer: ', buffer)

      // 嘗試讀取 EXIF 資料
      const exifData = await exifr.parse(file)
      if (testing) {
        console.log(`📷 檔案: ${path.basename(file)}`)
        console.log('  讀取到 EXIF 資料:', exifData)
      }
      if (exifData && exifData.CreateDate) {
        createDate = new Date(exifData.CreateDate)
        if (testing) console.log(`  使用 EXIF CreateDate: ${createDate}`)
      } else {
        if (testing) console.log('  EXIF 中未找到 CreateDate')
      }
      // 嘗試取得圖片解析度
      width = exifData?.ImageWidth || exifData?.ExifImageWidth || null
      height = exifData?.ImageHeight || exifData?.ExifImageHeight || null
      if (testing) {
        if (width && height) {
          console.log(`  取得圖片解析度: ${width} x ${height}`)
        } else {
          console.log('  無法從 EXIF 取得圖片解析度')
        }
      }
    } catch (e) {
      console.warn(`⚠️ 無法讀取 ${file} 的 EXIF 資料: ${e.message}`)
    }

    // 如果 EXIF 讀取不到時間，再嘗試用檔案建立時間
    if (!createDate) {
      try {
        const stat = await fs.stat(file)
        createDate = stat.birthtime
        if (testing) console.log(`  使用檔案建立時間: ${createDate}`)
      } catch (e) {
        console.error(`❌ 無法讀取 ${file} 的檔案建立時間: ${e.message}`)
        continue
      }
    }
    if (createDate) {
      const isoTime = createDate.toISOString()
      results.push({
        path: file,
        filename: path.basename(file),
        createTime: isoTime,
        date: isoTime.slice(0, 10), // YYYY-MM-DD
        width: width ? Number(width) : null,
        height: height ? Number(height) : null,
      })
    }
  }
  return results
}

getLocalPhotosMetadata()
