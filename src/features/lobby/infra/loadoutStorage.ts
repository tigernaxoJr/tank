import { sanitizeLoadout } from '@/features/battle'
import type { BulletType, TankArchetypeId } from '@/shared/kernel/types'

/** 記住使用者對每台坦克選的主彈 / 副彈（只存在本機瀏覽器，隱私模式或被擋時安靜失效） */
const KEY = 'tank:loadouts:v1'

function readAll(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** 讀出已存的配置；沒有或已失效（例如砲彈被移除）時退回預設 */
export function loadLoadoutPicks(tankId: TankArchetypeId): BulletType[] {
  const saved = readAll()[tankId]
  return sanitizeLoadout(tankId, Array.isArray(saved) ? (saved as BulletType[]) : null)
}

export function saveLoadoutPicks(tankId: TankArchetypeId, picks: readonly BulletType[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [tankId]: picks }))
  } catch {
    // 無法寫入就只在本次有效
  }
}
