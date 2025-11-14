import fs from 'fs/promises'
import path from 'path'
import { MSG } from './utils.js'

const PHOTO_DIR = path.join(process.cwd(), 'photos')
const RECENT_DAYS = 3

// 確保 cache 資料夾存在
export async function ensurePhotosDir() {
  try {
    await fs.access(PHOTO_DIR)
  } catch {
    await fs.mkdir(PHOTO_DIR)
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
export async function getPhotoInfoFromFolders(dateStr) {
  const photoFilePath = path.join(PHOTO_DIR, `${dateStr}.json`)

  try {
    // 嘗試讀取快取
    const cacheData = await fs.readFile(photoFilePath, 'utf-8')
    console.log(`📦 從 photos 資料夾讀取 ${dateStr} 的資料`)
    return JSON.parse(cacheData)
  } catch {
    console.log(MSG.ERROR(`photos 資料夾內沒有要查找的日期 ${dateStr} 的資料!`))
    return []
  }
}
