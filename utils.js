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
  },
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

// 檢查兩個照片是否匹配
export function isMatching(localPhoto, googlePhoto) {
  // 檢查時間是否在可能的時間範圍內
  const googleTime = new Date(googlePhoto.createTime).getTime()
  const localTime = new Date(localPhoto.possibleCreateTime).getTime()
  const timeDiff = Math.abs(googleTime - localTime)
  const timeThreshold = 1000 // 1 秒的誤差

  if (testing) {
    console.log(
      `    比對時間：本地 ${new Date(localTime).toISOString()} vs Google ${new Date(googleTime).toISOString()} -> ${
        timeDiff <= timeThreshold ? '相符' : '不符'
      }`
    )
  }

  return {
    isMatch: timeDiff <= timeThreshold,
    deltaTime: timeDiff,
  }
}

async function loadParams() {
  try {
    const paramsData = await fs.readFile(PARAMS_PATH, 'utf-8')
    const params = JSON.parse(paramsData)
    return {
      fallbackDateList: (params.fallbackDateList || []).map((date) => new Date(date).getTime()),
    }
  } catch (error) {
    console.log('⚠️ 無法讀取 params.json，使用預設值')
    return { fallbackDateList: [] }
  }
}

export { PARAMS_PATH, loadParams }
