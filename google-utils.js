import { authenticate } from '@google-cloud/local-auth'
import fs from 'fs/promises'
import path from 'path'
import fetch from 'node-fetch'

const SCOPES = ['https://www.googleapis.com/auth/photoslibrary.readonly']
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json')
const TOKEN_PATH = path.join(process.cwd(), 'token.json')

// 儲存 token 到檔案
async function saveToken(token) {
  await fs.writeFile(TOKEN_PATH, JSON.stringify(token))
}

// 取得授權物件
export async function authorize(force = false) {
  try {
    if (force) throw null

    // 嘗試讀取已儲存的 token
    const token = await fs.readFile(TOKEN_PATH, 'utf-8')
    const credentials = JSON.parse(token)
    console.log('🔑 本地有儲存的 token')
    return {
      getAccessToken: async () => ({
        token: credentials?.credentials?.access_token,
      }),
    }
  } catch {
    // 如果沒有 token 或讀取失敗，進行新的驗證
    console.log('🔑 需要重新驗證，請在瀏覽器中完成驗證流程')
    const auth = await authenticate({
      keyfilePath: CREDENTIALS_PATH,
      scopes: SCOPES,
    })
    // 儲存新的 token
    await saveToken(auth)
    console.log('✅ 驗證成功，token 已儲存')
    return authorize()
  }
}

// 根據指定日期查詢 Google Photos，返回該日所有媒體項目
export async function searchGooglePhotosByDate(auth, dateStr) {
  const startDate = new Date(dateStr)
  const endDate = new Date(dateStr)
  endDate.setHours(23, 59, 59, 999)

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
                startDate: {
                  year: startDate.getUTCFullYear(),
                  month: startDate.getUTCMonth() + 1,
                  day: startDate.getUTCDate(),
                },
                endDate: {
                  year: endDate.getUTCFullYear(),
                  month: endDate.getUTCMonth() + 1,
                  day: endDate.getUTCDate(),
                },
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

      if (response.status === 401) return searchGooglePhotosByDate(await authorize(true), dateStr)
      break
    }

    const data = await response.json()
    const mediaItems = data.mediaItems || []
    itemsForDate.push(...mediaItems)
    nextPageToken = data.nextPageToken
  } while (nextPageToken)

  return itemsForDate
}
