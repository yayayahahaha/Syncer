// index.js
import fs from 'fs/promises'
import path from 'path'
import { authenticate } from '@google-cloud/local-auth'
import fg from 'fast-glob'
import exifr from 'exifr'
import fetch from 'node-fetch'

// 設定變數
const testing = false // 設為 false 則關閉除錯 log
const SCOPES = ['https://www.googleapis.com/auth/photoslibrary.readonly']
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json')
const TOKEN_PATH = path.join(process.cwd(), 'token.json')
const PHOTO_DIR = path.join(process.cwd(), 'photos_to_check') // 資料夾名稱，可自行更改
const LOGS_DIR = path.join(process.cwd(), 'logs') // 輸出結果資料夾
const TIME_TOLERANCE = 2000 // ±2秒

// 檢查 logs 資料夾是否存在，若不存在則建立
async function ensureLogsDir() {
  try {
    await fs.access(LOGS_DIR)
  } catch (e) {
    await fs.mkdir(LOGS_DIR)
  }
}

// 使用當下的 ISO 字串作為輸出檔案名稱的一部份 (冒號替換成 -)
function formatDateToTaiwanTime(date) {
  const options = { timeZone: 'Asia/Taipei', hour12: false }
  const taiwanTime = new Intl.DateTimeFormat('zh-TW', {
    ...options,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
  return taiwanTime.replace(/[^0-9]/g, '') // 去除非數字的字符
}

const timestamp = new Date()
const formattedTimestamp = formatDateToTaiwanTime(timestamp)
const OUTPUT_FILE = path.join(LOGS_DIR, `${formattedTimestamp}-result.json`)

// 儲存 token 到檔案
async function saveToken(token) {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(token))
}

// 取得授權物件
async function authorize() {
  try {
    // 嘗試讀取已儲存的 token
    const token = await fs.readFile(TOKEN_PATH, 'utf-8')
    const credentials = JSON.parse(token)
    console.log('🔑 使用已儲存的 token')
    return {
      getAccessToken: async () => ({
        token: credentials.credentials.access_token
      })
    }
  } catch (e) {
    // 如果沒有 token 或讀取失敗，進行新的驗證
    console.log('🔑 需要重新驗證，請在瀏覽器中完成驗證流程')
    const auth = await authenticate({
      keyfilePath: CREDENTIALS_PATH,
      scopes: SCOPES,
    })
    // 儲存新的 token
    await saveToken(auth)
    console.log('✅ 驗證成功，token 已儲存')
    return auth
  }
}

// 掃描指定資料夾內的圖片，讀取 EXIF 中的 CreateDate 與圖片解析度
// 若 EXIF 讀取不到時間，則使用檔案建立時間作為備用
async function getLocalPhotosMetadata() {
  const files = await fg(['**/*.{jpg,jpeg,png,JPG,JPEG,PNG}'], { cwd: PHOTO_DIR, absolute: true })
  const results = []
  for (const file of files) {
    let createDate
    let width = null,
      height = null
    try {
      // 嘗試讀取 EXIF 資料
      const exifData = await exifr.parse(file, { tiff: true })
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

// 根據指定日期查詢 Google Photos，返回該日所有媒體項目
async function searchGooglePhotosByDate(auth, dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  let nextPageToken = null
  const itemsForDate = []

  do {
    const response = await fetch('https://photoslibrary.googleapis.com/v1/mediaItems:search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${(await auth.getAccessToken()).token}`,
      },
      body: JSON.stringify({
        filters: {
          dateFilter: {
            ranges: [
              {
                startDate: { year, month, day },
                endDate: { year, month, day },
              },
            ],
          },
        },
        pageSize: 100,
        pageToken: nextPageToken || undefined,
      }),
    })

    if (!response.ok) {
      console.error(`❌ Google API 錯誤: ${response.status} ${response.statusText}`)
      break
    }

    const data = await response.json()
    const mediaItems = data.mediaItems || []
    itemsForDate.push(...mediaItems)
    nextPageToken = data.nextPageToken
  } while (nextPageToken)

  return itemsForDate
}

// 判斷兩個時間是否接近
function isCloseTime(a, b) {
  const t1 = new Date(a).getTime()
  const t2 = new Date(b).getTime()
  return Math.abs(t1 - t2) <= TIME_TOLERANCE
}

// 比對本地照片與 Google Photos 項目是否為同一張
// 先比對檔名，再比對時間與解析度（寬高必須一致，若雙方皆有解析度資訊）
function isMatching(localPhoto, googleItem) {
  const filenameMatch = localPhoto.filename === googleItem.filename
  if (testing) {
    console.log(
      `    檔名比對: ${localPhoto.filename} vs Google Photos ${googleItem.filename} -> ${
        filenameMatch ? '相符' : '不符'
      }`
    )
  }

  if (filenameMatch) {
    return { isFilenameMatched: true, isPhotoDataMatched: true }
  }

  const timeMatch = isCloseTime(googleItem.mediaMetadata?.creationTime, localPhoto.createTime)

  let resolutionMatch = true
  // 若本地與 Google 均有解析度資訊，則比對解析度是否一致
  if (localPhoto.width && localPhoto.height && googleItem.mediaMetadata.width && googleItem.mediaMetadata.height) {
    const gWidth = Number(googleItem.mediaMetadata.width)
    const gHeight = Number(googleItem.mediaMetadata.height)
    resolutionMatch = gWidth === localPhoto.width && gHeight === localPhoto.height
    if (testing) {
      console.log(
        `    比對解析度：本地 ${localPhoto.width}x${localPhoto.height} vs Google ${gWidth}x${gHeight} -> ${
          resolutionMatch ? '相符' : '不符'
        }`
      )
    }
  } else if (testing) {
    console.log('    解析度資訊不全，僅以時間比對')
  }

  return {
    isFilenameMatched: false,
    isPhotoDataMatched: timeMatch && resolutionMatch,
  }
}

async function main() {
  console.log('檢查的資料夾: ', PHOTO_DIR)

  await ensureLogsDir()
  const auth = await authorize()
  const localPhotos = await getLocalPhotosMetadata()
  console.log(`📸 找到本地相片 ${localPhotos.length} 張`)

  // 根據日期分組：{ "YYYY-MM-DD": [photo1, photo2, ...] }
  const photosByDate = localPhotos.reduce((group, photo) => {
    group[photo.date] = group[photo.date] || []
    group[photo.date].push(photo)
    return group
  }, {})

  // 為每一天查詢 Google Photos，只發一次 API 請求
  const googlePhotosMap = {}
  for (const date in photosByDate) {
    console.log(`☁️ 查詢 ${date} 的備份資料…`)
    const items = await searchGooglePhotosByDate(auth, date)
    googlePhotosMap[date] = {
      list: items,
      nameSet: new Set(items.map((item) => item.filename)),
    }
    console.log(`✅ ${date} 取得 ${items.length} 筆 Google Photos 資料`)
  }

  // 比對每一張照片的檔名、時間與解析度
  const output = localPhotos.map((photo) => {
    const { list: googleItems, nameSet } = googlePhotosMap[photo.date]

    const match = nameSet.has(photo.filename)
      ? { isFilenameMatched: true, isPhotoDataMatched: true }
      : googleItems.find((googleItem) => isMatching(photo, googleItem))
    if (match) {
      console.log(`✅ 找到 ${photo.filename} 的備份`)
    } else {
      console.log(`❌ 沒有找到 ${photo.filename} 的備份`)
    }
    return { ...photo, ...match }
  })

  // 輸出結果
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2))
  console.log(`🔄 結果已輸出至 ${OUTPUT_FILE}`)
}

main().catch((err) => {
  console.error('程式發生錯誤:', err)
})
