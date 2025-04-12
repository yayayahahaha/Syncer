import fg from 'fast-glob'
import path from 'path'
import fs from 'fs/promises'
import { PHOTO_DIR } from './const.js'
import exiftoolVendored from 'exiftool-vendored'
const { ExifTool } = exiftoolVendored

async function generateExifData(filePath, { fallbackDateList = [] }) {
  const exiftool = new ExifTool({ taskTimeoutMillis: 5000 })
  const exiftoolTags = await exiftool.read(filePath)

  exiftool.end()

  const exifOriginTime = exiftoolTags.DateTimeOriginal?.toString() ?? null
  return new ImageStructure({ filePath, exifOriginTime, fallbackDateList })
}

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'JPG', 'JPEG', 'PNG']

class DayRange {
  constructor(value = Date.now()) {
    const _time = typeof value === 'number' ? value : new Date(value).getTime()
    this._time = _time
    this.#calculateStartEnd()
  }

  #calculateStartEnd() {
    const date = new Date(this.time)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    Object.defineProperty(this, 'start', {
      value: `${year}-${month}-${day}T00:00:00.000Z`,
      writable: false,
      enumerable: true,
      configurable: true,
    })

    Object.defineProperty(this, 'end', {
      value: `${year}-${month}-${day}T23:59:59.999Z`,
      writable: false,
      enumerable: true,
      configurable: true,
    })
  }

  get time() {
    return this._time
  }
  set time(newValue) {
    this._time = newValue
    this.#calculateStartEnd()
  }
}

class ImageStructure {
  constructor(payload = {}) {
    let { filePath, exifOriginTime, fallbackDateList } = payload

    this.#setValue('filePath', filePath ?? '')
    this.#setValue('fileName', path.parse(this.filePath).base)
    this.#setValue('exifOriginTime', exifOriginTime ?? null)
    this.#setValue('photoTimeByName', ImageStructure.guessPhotoTimeByName(this.fileName))

    this._fallbackDateList = fallbackDateList ?? []
    this.#setPossibleCreateDateList()
  }

  get fallbackDateList() {
    return this._fallbackDateList
  }
  set fallbackDateList(newfallbackDateList) {
    this._fallbackDateList = newfallbackDateList
    this.#setPossibleCreateDateList()
  }

  #setValue(key, value) {
    Object.defineProperty(this, key, {
      value: value,
      writable: false, // 不可寫
      enumerable: true, // 讓 console.log 看得見
      configurable: false,
    })
  }

  get #possibleCreateDateListWithoutFallback() {
    const dates = new Set()

    if (this.exifOriginTime) {
      const exifDate = new Date(this.exifOriginTime)
      dates.add(exifDate.toISOString().split('T')[0])

      // Add day before
      const prevDay = new Date(exifDate)
      prevDay.setDate(prevDay.getDate() - 1)
      dates.add(prevDay.toISOString().split('T')[0])

      // Add day after
      const nextDay = new Date(exifDate)
      nextDay.setDate(nextDay.getDate() + 1)
      dates.add(nextDay.toISOString().split('T')[0])
    }

    if (this.photoTimeByName) {
      const nameDate = new Date(this.photoTimeByName)
      dates.add(nameDate.toISOString().split('T')[0])

      // Add day before
      const prevDay = new Date(nameDate)
      prevDay.setDate(prevDay.getDate() - 1)
      dates.add(prevDay.toISOString().split('T')[0])

      // Add day after
      const nextDay = new Date(nameDate)
      nextDay.setDate(nextDay.getDate() + 1)
      dates.add(nextDay.toISOString().split('T')[0])
    }

    return Array.from(dates)
      .sort()
      .map((dateStr) => new DayRange(dateStr))
  }

  #setPossibleCreateDateList() {
    const dates = new Set(this.#possibleCreateDateListWithoutFallback.map((range) => range.start.split('T')[0]))

    // Only add fallback dates if dates is empty
    if (dates.size === 0) {
      this._fallbackDateList.forEach((date) => {
        try {
          const customDate = new Date(date)
          if (isNaN(customDate.getTime())) {
            console.warn(`警告: 自定義日期 "${date}" 格式無效，已略過`)
            return
          }
          dates.add(customDate.toISOString().split('T')[0])
        } catch (err) {
          console.warn(`警告: 自定義日期 "${date}" 格式無效，已略過`, err)
        }
      })
    }

    const list = Array.from(dates)
      .sort()
      .map((dateStr) => new DayRange(dateStr))

    this.#setValue('possibleCreateDateList', list)
  }

  static guessPhotoTimeByName(fileName = '') {
    // Try FB_IMG_1743571233206.jpg format
    const fbMatch = fileName.match(/FB_IMG_(\d{13})/i)
    if (fbMatch) {
      const timestamp = parseInt(fbMatch[1])
      const date = new Date(timestamp)
      return date.toISOString()
    }

    // Try 20250101_0000.jpg format
    const dateTimeMatch = fileName.match(/^(\d{8})_(\d{4})/i)
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
    const screenshotMatch = fileName.match(/Screenshot_(\d{8})-(\d{6})/i)
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
    const pMatch = fileName.match(/P_(\d{8})_(\d{6})/i)
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
}

// 掃描指定資料夾內的圖片，讀取 EXIF 中的 CreateDate 與圖片解析度
// 若 EXIF 讀取不到時間，則使用檔案建立時間作為備用
export async function getLocalPhotosMetadata({ fallbackDateList = [] } = {}) {
  console.log('🗂️ 檢查備份的資料夾: ', PHOTO_DIR)

  const filePahtList = await fg([`**/*.{${IMAGE_EXT.join(',')}}`], { cwd: PHOTO_DIR, absolute: true })
  const results = await Promise.all(filePahtList.map((filePath) => generateExifData(filePath, { fallbackDateList })))

  return results
}
