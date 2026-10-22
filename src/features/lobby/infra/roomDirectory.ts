/**
 * Lobby Slice - Infrastructure: 房間目錄客戶端（房間列表）
 * 與 server/roomDirectory.js 的 REST API 對應：
 *   GET    {base}          → { rooms: RoomListing[] }
 *   PUT    {base}/{code}   → 註冊 / 更新（兼心跳），第一次回傳 token，之後以 x-room-token 帶回
 *   DELETE {base}/{code}   → 移除
 * 目錄是「加分功能」：任何錯誤都只回傳空清單或靜默失敗，不能影響開房 / 進房 / 對戰。
 */
import type { DisconnectPolicy, MapPresetId } from '@/shared/kernel/types'
import { getPeerConfig } from './peerAdapter'

export type RoomStatus = 'waiting' | 'playing'

export interface RoomListing {
  code: string
  name: string
  hostName: string
  mapId: MapPresetId
  players: number
  maxPlayers: number
  status: RoomStatus
  disconnectPolicy?: DisconnectPolicy
  ageSec: number
}

export type RoomAnnouncement = Omit<RoomListing, 'code' | 'ageSec'>

export interface RoomDirectoryPort {
  /** 沒有自建信令伺服器時為 false，UI 要顯示「請輸入房號」的降級提示 */
  readonly available: boolean
  /** 回傳 null 代表目錄伺服器連不上（與「連得上但沒有房間」的空陣列區分） */
  list(): Promise<RoomListing[] | null>
  /** 註冊 / 更新房間（呼叫端每幾秒呼叫一次當作心跳） */
  announce(code: string, info: RoomAnnouncement): Promise<void>
  remove(code: string): Promise<void>
}

const REQUEST_TIMEOUT_MS = 4000

async function request(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

export function createRoomDirectory(baseUrl: string | null = getPeerConfig().directoryBaseUrl): RoomDirectoryPort {
  if (!baseUrl) {
    return { available: false, list: async () => null, announce: async () => {}, remove: async () => {} }
  }
  // 每個房號各自保存 token：只有建房者能更新 / 刪除自己的房間
  const tokens = new Map<string, string>()

  return {
    available: true,
    async list() {
      try {
        const res = await request(baseUrl, { method: 'GET' })
        if (!res.ok) return null
        const data = (await res.json()) as { rooms?: RoomListing[] }
        return Array.isArray(data.rooms) ? data.rooms : []
      } catch {
        return null
      }
    },
    async announce(code, info) {
      try {
        const headers: Record<string, string> = { 'content-type': 'application/json' }
        const token = tokens.get(code)
        if (token) headers['x-room-token'] = token
        const res = await request(`${baseUrl}/${code}`, { method: 'PUT', headers, body: JSON.stringify(info) })
        if (res.ok) {
          const data = (await res.json()) as { token?: string }
          if (data.token) tokens.set(code, data.token)
        }
      } catch {
        // 目錄暫時連不上不影響對戰
      }
    },
    async remove(code) {
      const token = tokens.get(code)
      tokens.delete(code)
      if (!token) return
      try {
        await request(`${baseUrl}/${code}`, { method: 'DELETE', headers: { 'x-room-token': token } })
      } catch {
        // 讓伺服器端 TTL 自動清除
      }
    },
  }
}
