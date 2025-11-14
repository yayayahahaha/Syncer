import { authenticate } from '@google-cloud/local-auth'
import fs from 'fs/promises'
import path from 'path'
import fetch from 'node-fetch'
import open from 'open'
import http from 'http'
import { URL } from 'url'

const SCOPES = ['https://www.googleapis.com/auth/photospicker.mediaitems.readonly']
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json')
const TOKEN_PATH = path.join(process.cwd(), 'token.json')

// 檢查 token 是否有效
async function checkTokenValidity(token) {
  console.log('🔑 正在驗證金鑰...')
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      console.log('🔓 金鑰驗證失敗，HTTP 狀態碼:', response.status)
      return false
    }

    const data = await response.json()
    const isValid = data.expires_in > 0
    if (isValid) {
      console.log(`🔐 金鑰有效，剩餘有效時間: ${Math.floor(data.expires_in / 60)} 分鐘`)
    } else {
      console.log('🔓 金鑰已過期')
    }
    return isValid
  } catch (error) {
    console.log('🔓 金鑰驗證發生錯誤:', error.message)
    return false
  }
}

// 儲存 token 到檔案
async function saveToken(token) {
  console.log('🗝️ 正在儲存新的金鑰...')
  try {
    await fs.writeFile(TOKEN_PATH, JSON.stringify(token))
    console.log('🔐 金鑰已成功儲存到本地')
  } catch (error) {
    console.error('🔓 金鑰儲存失敗:', error.message)
    throw error
  }
}

// 取得授權物件
export async function authorize(force = false) {
  try {
    if (force) {
      console.log('🔄 強制重新取得金鑰...')
      throw null
    }

    console.log('🔍 正在檢查本地的金鑰...')
    // 嘗試讀取已儲存的 token
    const tokenData = await fs.readFile(TOKEN_PATH, 'utf-8')
    console.log('🔐 成功讀取本地的金鑰')
    const credentials = JSON.parse(tokenData)
    const accessToken = credentials?.credentials?.access_token

    if (!accessToken) {
      console.log('🔓 本地的金鑰格式錯誤')
      throw new Error('No access token found')
    }

    // 檢查 token 是否有效
    const isValid = await checkTokenValidity(accessToken)
    if (!isValid) {
      console.log('🔄 金鑰無效，需要重新取得')
      throw new Error('Token expired')
    }

    console.log('🔐 使用有效的金鑰')
    return {
      getAccessToken: async () => ({
        token: accessToken,
      }),
    }
  } catch (error) {
    if (error.message === 'No access token found' || error.message === 'Token expired') {
      console.log('🔄 開始新的金鑰取得流程...')
    } else {
      console.log('🔓 讀取金鑰失敗:', error.message)
    }

    // 如果沒有 token 或讀取失敗，進行新的驗證
    console.log('🔑 請在瀏覽器中完成金鑰取得流程...')
    const auth = await authenticate({
      keyfilePath: CREDENTIALS_PATH,
      scopes: SCOPES,
    })
    // 儲存新的 token
    await saveToken(auth)
    console.log('🔐 金鑰取得成功，已儲存到本地')
    return authorize()
  }
}

export async function letUserSelectPhotos(auth) {
  const accessToken = (await auth.getAccessToken()).token
  const redirectPort = 34567
  const redirectUri = `http://localhost:${redirectPort}/photos-picker-callback`
  // 這個 URL 只是範例，實際上 Google 官方未公開 photospicker UI，這裡假設有這個 endpoint
  const pickerUrl = `https://photos.google.com/share/photospicker?access_token=${encodeURIComponent(accessToken)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=photoslibrary&scope=https://www.googleapis.com/auth/photospicker.mediaitems.readonly`

  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/photos-picker-callback')) {
      const urlObj = new URL(req.url, `http://localhost:${redirectPort}`)
      const photosJson = urlObj.searchParams.get('photos')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<h2>✅ 已收到您的選擇，請回到 Terminal</h2>')
      if (photosJson) {
        try {
          const photos = JSON.parse(decodeURIComponent(photosJson))
          console.log('🖼️ 使用者選擇的相片：')
          console.log(JSON.stringify(photos, null, 2))
        } catch (e) {
          console.error('❌ 解析選擇結果失敗:', e)
        }
      } else {
        console.log('⚠️ 沒有收到選擇的相片')
      }
      server.close()
    }
  })

  server.listen(redirectPort, () => {
    console.log('🌐 等待 Google Photos Picker 回傳...')
    open(pickerUrl)
  })
}

// 根據指定日期查詢 Google Photos，返回該日所有媒體項目
export async function searchGooglePhotosByDate(auth, dateStr) {
  const startDate = new Date(dateStr)
  const endDate = new Date(dateStr)
  endDate.setHours(23, 59, 59, 999)

  let nextPageToken = null
  const itemsForDate = []
  let error = null

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
      console.error(`🔓 Google API 錯誤: ${response.status} ${response.statusText}`)
      error = response

      if (response.status === 401) {
        console.log('🔄 金鑰無效，重新取得金鑰...')
        // Token 無效，重新驗證
        return searchGooglePhotosByDate(await authorize(true), dateStr)
      }
      break
    }

    const data = await response.json()
    const mediaItems = data.mediaItems || []
    itemsForDate.push(...mediaItems)
    nextPageToken = data.nextPageToken
  } while (nextPageToken)

  return { error, data: itemsForDate }
}

// 直接透過 pages 查詢所有的 photos
export async function listPhotosWithFetch(auth) {
  const accessToken = (await auth.getAccessToken()).token
  let nextPageToken = null
  let count = 0

  do {
    const res = await fetch(
      `https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=10${
        nextPageToken ? `&pageToken=${nextPageToken}` : ''
      }`,
      {
        headers:
