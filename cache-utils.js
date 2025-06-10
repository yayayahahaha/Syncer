import fs from 'fs/promises'
import path from 'path'

const CACHE_DIR = path.join(process.cwd(), 'cache')
const RECENT_DAYS = 3

// 確保 cache 資料夾存在
export async function ensureCacheDir() {
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
export async function getOrSetCache(dateStr, getter) {
  const cachePath = path.join(CACHE_DIR, `${dateStr}.json`)

  try {
    // 嘗試讀取快取
    const cacheData = await fs.readFile(cachePath, 'utf-8')
    console.log(`📦 從快取讀取 ${dateStr} 的資料`)
    return JSON.parse(cacheData)
  } catch {
    // 如果沒有快取或讀取失敗，執行 getter
    const { error, data } = await getter()

    if (error != null) {
      console.log(`⚠️ 取得 ${dateStr} 的 Google Photo API 失敗! 不進行快取`)
    } else if (!isRecentDate(dateStr)) {
      // 如果不是最近幾天的資料，就存入快取
      console.log(`💾 將 ${dateStr} 的資料存入快取`)
      await fs.writeFile(cachePath, JSON.stringify(data, null, 2))
    } else {
      console.log(`⚠️ ${dateStr} 是最近 ${RECENT_DAYS} 天的資料，不進行快取`)
    }

    return data
  }
}
