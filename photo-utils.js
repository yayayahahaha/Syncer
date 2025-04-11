import fg from 'fast-glob'
import pathFn from 'path'
import fs from 'fs/promises'
import { PHOTO_DIR } from './const.js'
import exiftoolVendored from 'exiftool-vendored'
const { ExifTool } = exiftoolVendored

async function generateExifData(filePath) {
  const exiftool = new ExifTool({ taskTimeoutMillis: 5000 })
  const exiftoolTags = await exiftool.read(filePath)

  exiftool.end()

  // TODO(flyc): 這邊還沒挑出需要的 keys
  return exiftoolTags
}

class ImageFormat {
  constructor(payload = {}) {
    let { path, filename, createTime } = payload

    this.path = path ?? ''
    this.filename = filename ?? ''
    this.createTime = createTime ?? ''
    this.photoTimeByName = ImageFormat.guessPhotoTimeByName(filename)
  }

  static guessPhotoTimeByName(filename) {
    // Try FB_IMG_1743571233206.jpg format
    const fbMatch = filename.match(/FB_IMG_(\d{13})/i)
    if (fbMatch) {
      const timestamp = parseInt(fbMatch[1])
      const date = new Date(timestamp)
      return date.toISOString()
    }

    // Try 20250101_0000.jpg format
    const dateTimeMatch = filename.match(/^(\d{8})_(\d{4})/i)
    if (dateTimeMatch) {
      const [, date, time] = dateTimeMatch
      const year = date.slice(0, 4)
      const month = date.slice(4, 6)
      const day = date.slice(6, 8)
      const hour = time.slice(0, 2)
      const minute = time.slice(2, 4)
      return `${year}-${month}-${day}T${hour}:${minute}:00.000Z`
    }

    // Try Screenshot_20250401-133917446.jpg format
    const screenshotMatch = filename.match(/Screenshot_(\d{8})-(\d{6})/i)
    if (screenshotMatch) {
      const [, date, time] = screenshotMatch
      const year = date.slice(0, 4)
      const month = date.slice(4, 6)
      const day = date.slice(6, 8)
      const hour = time.slice(0, 2)
      const minute = time.slice(2, 4)
      const second = time.slice(4, 6)
      return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`
    }

    // Try P_20250404_122309.jpg format
    const pMatch = filename.match(/P_(\d{8})_(\d{6})/i)
    if (pMatch) {
      const [, date, time] = pMatch
      const year = date.slice(0, 4)
      const month = date.slice(4, 6)
      const day = date.slice(6, 8)
      const hour = time.slice(0, 2)
      const minute = time.slice(2, 4)
      const second = time.slice(4, 6)
      return `${year}-${month}-${day}T${hour}:${minute}:${second}.000Z`
    }

    // No match found
    return null
  }

  get createDate() {
    return this.createTime.slice(0, 10)
  }
}

// 掃描指定資料夾內的圖片，讀取 EXIF 中的 CreateDate 與圖片解析度
// 若 EXIF 讀取不到時間，則使用檔案建立時間作為備用
export async function getLocalPhotosMetadata() {
  console.log('🗂️ 檢查備份的資料夾: ', PHOTO_DIR)

  const filePahtList = await fg(['**/*.{jpg,jpeg,png,JPG,JPEG,PNG}'], { cwd: PHOTO_DIR, absolute: true })
  const results = await Promise.all(
    filePahtList.map((filePath) => {
      return generateExifData(filePath)
        .then(async (exifData) => {
          if (exifData.isExifExist)
            return Promise.all([
              null,
              {
                exifData,
                filePath: exifData.filePath,
              },
            ])

          return Promise.all([fs.stat(exifData.filePath), { filePath: exifData.filePath }])
        })
        .then(([fileStat, otherInfo]) => {
          const { filePath, exifData } = otherInfo ?? {}
          if (exifData != null) return new ImageFormat(exifData)

          const createTime = fileStat.birthtime.toISOString()
          return new ImageFormat({
            path: filePath,
            filename: pathFn.basename(filePath),
            createTime: createTime,
            date: createTime.slice(0, 10), // YYYY-MM-DD
          })
        })
    })
  )

  return results
}

const result = await getLocalPhotosMetadata()
console.log(result)
