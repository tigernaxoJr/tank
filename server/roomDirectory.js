/**
 * 房間目錄 (Room Directory)：記憶體內的「等待中 / 遊戲中」房間清單。
 * 只存房間的公開資訊（房號、房名、房主暱稱、地圖、人數、狀態），不存任何 IP，也不中繼遊戲資料。
 * 房主第一次註冊會拿到 token，之後更新 / 刪除都必須帶同一個 token，避免他人劫持或惡意刪房。
 * 房主每隔幾秒用 PUT 當心跳；超過 ttlMs 沒有心跳的房間會被自動清除。
 */
import { randomBytes } from 'node:crypto'
import { Router } from 'express'

const ROOM_CODE_RE = /^[A-Z2-9]{6}$/
const MAP_ID_RE = /^[a-z0-9_]{1,32}$/
const STATUSES = new Set(['waiting', 'playing'])

export const MAX_PLAYERS_LIMIT = 10

/** 去除控制字元與前後空白，並限制長度；空字串回傳 fallback */
export function cleanText(value, maxLen, fallback = '') {
  if (typeof value !== 'string') return fallback
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, maxLen)
  return text || fallback
}

/** 驗證並正規化房間欄位；不合法回傳 { error } */
export function validateRoomBody(code, body) {
  if (!ROOM_CODE_RE.test(code)) return { error: 'invalid room code' }
  if (!body || typeof body !== 'object') return { error: 'invalid body' }
  const mapId = typeof body.mapId === 'string' && MAP_ID_RE.test(body.mapId) ? body.mapId : null
  if (!mapId) return { error: 'invalid mapId' }
  const maxPlayers = Number.isInteger(body.maxPlayers) ? body.maxPlayers : MAX_PLAYERS_LIMIT
  if (maxPlayers < 2 || maxPlayers > MAX_PLAYERS_LIMIT) return { error: 'invalid maxPlayers' }
  const players = Number.isInteger(body.players) ? body.players : 1
  if (players < 1 || players > maxPlayers) return { error: 'invalid players' }
  const status = body.status === undefined ? 'waiting' : body.status
  if (!STATUSES.has(status)) return { error: 'invalid status' }
  return {
    room: {
      code,
      name: cleanText(body.name, 24, `房間 ${code}`),
      hostName: cleanText(body.hostName, 16, 'Commander'),
      mapId,
      players,
      maxPlayers,
      status,
    },
  }
}

export function createRoomDirectory({ ttlMs = 30_000, maxRooms = 500, now = () => Date.now() } = {}) {
  /** @type {Map<string, { room: object, token: string, updatedAt: number }>} */
  const rooms = new Map()

  function sweep() {
    const t = now()
    for (const [code, entry] of rooms) {
      if (t - entry.updatedAt > ttlMs) rooms.delete(code)
    }
  }

  return {
    /** 建立或更新房間；已存在時必須帶正確 token。回傳 { token } 或 { error, status } */
    upsert(code, room, token) {
      sweep()
      const existing = rooms.get(code)
      if (existing) {
        if (!token || token !== existing.token) return { error: 'forbidden', status: 403 }
        existing.room = room
        existing.updatedAt = now()
        return { token: existing.token }
      }
      if (rooms.size >= maxRooms) return { error: 'directory full', status: 503 }
      const fresh = randomBytes(16).toString('hex')
      rooms.set(code, { room, token: fresh, updatedAt: now() })
      return { token: fresh }
    },
    remove(code, token) {
      const existing = rooms.get(code)
      if (!existing) return { ok: true }
      if (!token || token !== existing.token) return { error: 'forbidden', status: 403 }
      rooms.delete(code)
      return { ok: true }
    },
    /** 等待中的房間排在前面，其次依最近更新時間 */
    list() {
      sweep()
      const t = now()
      return [...rooms.values()]
        .map((e) => ({ ...e.room, ageSec: Math.round((t - e.updatedAt) / 1000) }))
        .sort((a, b) => (a.status === b.status ? a.ageSec - b.ageSec : a.status === 'waiting' ? -1 : 1))
    },
    size: () => rooms.size,
  }
}

/** 每個 IP 在一分鐘視窗內的請求上限（記憶體內，簡易限流） */
export function createRateLimiter({ limit = 120, windowMs = 60_000, now = () => Date.now() } = {}) {
  const hits = new Map()
  return (ip) => {
    const t = now()
    const entry = hits.get(ip)
    if (!entry || t - entry.start >= windowMs) {
      hits.set(ip, { start: t, count: 1 })
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k)
      }
      return true
    }
    entry.count += 1
    return entry.count <= limit
  }
}

export function createRoomsRouter(directory, { allowedOrigin = '*', allow = createRateLimiter() } = {}) {
  const router = Router()

  router.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type,x-room-token')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    if (!allow(req.ip ?? 'unknown')) return res.status(429).json({ error: 'too many requests' })
    next()
  })

  router.get('/', (_req, res) => {
    res.json({ rooms: directory.list() })
  })

  router.put('/:code', (req, res) => {
    const code = String(req.params.code).toUpperCase()
    const parsed = validateRoomBody(code, req.body)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    const result = directory.upsert(code, parsed.room, req.get('x-room-token') ?? '')
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json({ ok: true, token: result.token })
  })

  router.delete('/:code', (req, res) => {
    const code = String(req.params.code).toUpperCase()
    const result = directory.remove(code, req.get('x-room-token') ?? '')
    if (result.error) return res.status(result.status).json({ error: result.error })
    res.json({ ok: true })
  })

  return router
}
