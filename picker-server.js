import express from 'express'
import { createServer } from 'http'
import path from 'path'
import fs from 'fs/promises'

const app = express()
const server = createServer(app)

const pickerFilePath = path.resolve('.', 'photos-picker-demo.html')

app.use(express.json())

app.get('/', (req, res) => {
  res.sendFile(pickerFilePath)
})

app.post('/api/photos', async (req, res) => {
  try {
    const photos = req.body
    if (!Array.isArray(photos) || photos.length === 0) {
      return res.status(400).json({ error: 'No photos data' })
    }
    // 依每張照片的 createTime 分組
    const groups = {}
    for (const photo of photos) {
      const time = photo.mediaMetadata?.creationTime || photo.createTime || new Date().toISOString()
      const date = time.slice(0, 10).replace(/-/g, '') // YYYYMMDD
      if (!groups[date]) groups[date] = []
      groups[date].push(photo)
    }
    await fs.mkdir('photos', { recursive: true })
    const result = {}
    for (const [date, group] of Object.entries(groups)) {
      const filePath = path.join('photos', `${date}.json`)
      let merged = []
      // 1. 檢查檔案是否存在，若存在則讀取舊資料
      try {
        await fs.access(filePath)
        const old = await fs.readFile(filePath, 'utf-8')
        merged = JSON.parse(old)
      } catch {}
      // 2. 合併新舊資料，避免重複 id
      const all = [...merged, ...group.filter((p) => !merged.some((m) => m.id === p.id))]
      // 3. 依 createTime 排序
      all.sort((a, b) => {
        const ta = new Date(a.mediaMetadata?.creationTime || a.createTime || 0).getTime()
        const tb = new Date(b.mediaMetadata?.creationTime || b.createTime || 0).getTime()
        return ta - tb
      })
      // 4. 寫回檔案
      await fs.writeFile(filePath, JSON.stringify(all, null, 2))
      result[date] = all.length
    }
    res.json({ ok: true, files: result })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const port = 8080
server.listen(port, () => {
  console.log(`📸 相片選擇器已啟動，請在瀏覽器中打開 http://localhost:${port} 來選擇相片`)
})
