/**
 * Lobby Slice - Domain Model
 * 定義 P2P 房間連線狀態機、10 人分隊編制 (最多 5v5) 與房號產生規則。
 */
import type { MapPresetId, PlayerId, RosterSlot, TankArchetypeId, TeamId } from '@/shared/kernel/types'

export type ConnectionPhase = 'idle' | 'hosting' | 'joining' | 'connected' | 'error'

export const MAX_PLAYERS_PER_TEAM = 5
export const MAX_TOTAL_PLAYERS = 10

export interface RoomSession {
  roomCode: string
  phase: ConnectionPhase
  isHost: boolean
  localPlayerId: PlayerId
  localPlayerName: string
  selectedTankId: TankArchetypeId
  selectedMapId: MapPresetId
  locked: boolean
  roster: RosterSlot[]
  errorMessage?: string
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function countTeamMembers(roster: RosterSlot[], team: TeamId): number {
  return roster.filter((r) => r.team === team).length
}

/**
 * 為新加入的玩家分配人數較少的隊伍（最多 5v5）
 */
export function pickBalancedTeam(roster: RosterSlot[]): TeamId | null {
  const countA = countTeamMembers(roster, 'A')
  const countB = countTeamMembers(roster, 'B')
  if (countA >= MAX_PLAYERS_PER_TEAM && countB >= MAX_PLAYERS_PER_TEAM) {
    return null
  }
  return countA <= countB ? 'A' : 'B'
}
