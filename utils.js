import fs from 'fs/promises'
import path from 'path'
import { testing } from './const.js'

const timestamp = new Date()
const formattedTimestamp = formatDateToTaiwanTime(timestamp)

const LOGS_DIR = path.join(process.cwd(), 'logs') // 輸出結果資料夾
export const OUTPUT_FILE = path.join(LOGS_DIR, `${formattedTimestamp}-result.json`)

const PARAMS_PATH = path.join(process.cwd(), 'params.json')

// Console colors
const COLORS = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  DIM: '\x1b[2m',
  UNDERSCORE: '\x1b[4m',
  BLINK: '\x1b[5m',
  REVERSE: '\x1b[7m',
  HIDDEN: '\x1b[8m',
  
  FG: {
    BLACK: '\x1b[30m',
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    MAGENTA: '\x1b[35m',
    CYAN: '\x1b[36m',
    WHITE: '\x1b[37m',
  },
  
  BG: {
    BLACK: '\x1b[40m',
    RED: '\x1b[41m',
    GREEN: '\x1b[42m',
    YELLOW: '\x1b[43m',
    BLUE: '\x1b[44m',
    MAGENTA: '\x1b[45m',
    CYAN: '\x1b[46m',
    WHITE: '\x1b[47m',
  }
}

// Console message types
export const MSG = {
  ACTION: (msg) => `${COLORS.BRIGHT}${COLORS.FG.BLUE}🔄 ${msg}${COLORS.RESET}`,
  SUCCESS: (msg) => `${COLORS.BRIGHT}${COLORS.FG.CYAN}✅ ${msg}${COLORS.RESET}`,
  WARNING: (msg) => `${COLORS.FG.YELLOW}⚠️ ${msg}${COLORS.RESET}`,
  ERROR: (msg) => `${COLORS.FG.RED}❌ ${msg}${COLORS.RESET}`,
  INFO: (msg) => `${COLORS.FG.WHITE}📸 ${msg}${COLORS.RESET}`,
}

// 檢查 logs 資料夾是否存在，若不存在則建立
export async function ensureLogsDir() {
  try {
    await fs.access(LOGS_DIR)
  } catch {
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

// 判斷兩個時間是否接近
function isCloseTime(a, b, TIME_TOLERANCE = 2000) {
  const t1 = new Date(a).getTime()
  const t2 = new Date(b).getTime()
  return Math.abs(t1 - t2) <= TIME_TOLERANCE
}

// 比對本地照片與 Google Photos 項目是否為同一張
// 先比對檔名，再比對時間與解析度（寬高必須一致，若雙方皆有解析度資訊）
export function isMatching(localPhoto, googleItem) {
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

async function loadParams() {
  try {
    const paramsData = await fs.readFile(PARAMS_PATH, 'utf-8')
    const params = JSON.parse(paramsData)
    return {
      fallbackDateList: (params.fallbackDateList || []).map(date => new Date(date).getTime())
    }
  } catch (error) {
    console.log('⚠️ 無法讀取 params.json，使用預設值')
    return { fallbackDateList: [] }
  }
}

export {
  PARAMS_PATH,
  loadParams,
}
