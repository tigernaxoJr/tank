import { computed, reactive } from 'vue'
import {
  BOT_LEVEL_SPECS,
  tankAt,
} from '@/features/battle'
import type {
  BotLevel,
  BulletType,
  RosterSlot,
  TankArchetypeId,
  TeamId,
} from '@/shared/kernel/types'
import { resolveTank, type TankChoice } from '../tankChoice'

/** 單機練習每一席由誰操控：玩家（同機輪流）、電腦，或空位（兩隊人數可以不同，例如 2v4） */
export type SeatControl = 'player' | 'bot' | 'empty'

export interface PracticeSeat {
  tank: TankChoice
  control: SeatControl
  /** 電腦難度，每一席各自設定；改成玩家時保留，切回電腦沿用 */
  level: BotLevel
}

export const SEATS_PER_TEAM = 5

export function useLocalSkirmish(
  picksFor: (tankId: TankArchetypeId) => BulletType[],
  onSelectPrimaryTank: (choice: TankChoice) => void,
  /** 大廳設定的玩家名稱：A1（我的戰車）出戰時用這個名字 */
  localName: () => string = () => '',
) {
  // 預設陣容依註冊表輪流排（B 隊錯開一台），新增機種自動納入；每席也可以選「隨機」，開打時才抽。
  // 預設 1v1：A1 是玩家自己（我的戰車），B1 是中等電腦，其餘空位
  const seat = (team: TeamId, i: number): PracticeSeat => ({
    tank: tankAt(i + (team === 'B' ? 1 : 0)),
    control: i > 0 ? 'empty' : team === 'A' ? 'player' : 'bot',
    level: 'normal',
  })
  const hotseatSeats = reactive<Record<TeamId, PracticeSeat[]>>({
    A: Array.from({ length: SEATS_PER_TEAM }, (_, i) => seat('A', i)),
    B: Array.from({ length: SEATS_PER_TEAM }, (_, i) => seat('B', i)),
  })

  const BOT_LEVELS = Object.entries(BOT_LEVEL_SPECS) as [BotLevel, (typeof BOT_LEVEL_SPECS)[BotLevel]][]

  const occupied = (team: TeamId) => hotseatSeats[team].filter((s) => s.control !== 'empty')
  const teamCount = computed(() => ({ A: occupied('A').length, B: occupied('B').length }))

  const hotseatStartLabel = computed(() => {
    const all = [...occupied('A'), ...occupied('B')]
    const size = `${teamCount.value.A}v${teamCount.value.B}`
    if (all.every((s) => s.control === 'bot')) return `🍿 觀戰 ${size} 電腦對決`
    if (all.some((s) => s.control === 'bot')) return `🚀 啟動 ${size} 挑戰電腦`
    return `🚀 啟動 ${size} 單機熱座對戰`
  })

  /** A1 是「我的戰車」不能空；每隊至少留一席，最後一台不能改成空位 */
  function canEmpty(team: TeamId, index: number): boolean {
    if (team === 'A' && index === 0) return false
    return hotseatSeats[team][index].control !== 'empty' ? teamCount.value[team] > 1 : true
  }

  function setSeatControl(team: TeamId, index: number, control: SeatControl): void {
    if (control === 'empty' && !canEmpty(team, index)) return
    hotseatSeats[team][index].control = control
  }

  function setSeatLevel(team: TeamId, index: number, level: BotLevel): void {
    hotseatSeats[team][index].level = level
  }

  function setHotseatSlotTank(team: TeamId, slotIndex: number, choice: TankChoice): void {
    hotseatSeats[team][slotIndex].tank = choice
    if (team === 'A' && slotIndex === 0) onSelectPrimaryTank(choice)
  }

  /** A1 用大廳名稱；其餘玩家席以隊名 + 席位稱呼 */
  function playerName(team: TeamId, index: number, label: string): string {
    const own = localName().trim()
    if (team === 'A' && index === 0 && own) return own
    return `${team === 'A' ? '橘隊' : '藍隊'} ${label}`
  }

  function buildHotseatRoster(): RosterSlot[] {
    const roster: RosterSlot[] = []
    for (const team of ['A', 'B'] as const) {
      hotseatSeats[team].forEach((s, i) => {
        if (s.control === 'empty') return
        const tankId: TankArchetypeId = resolveTank(s.tank)
        const isBot = s.control === 'bot'
        const label = `${team}${i + 1}`
        roster.push({
          id: `${team.toLowerCase()}${i + 1}`,
          name: isBot ? `🤖 CPU ${label}` : playerName(team, i, label),
          team,
          tankId,
          isHost: team === 'A' && i === 0,
          isBot,
          loadout: picksFor(tankId),
          botLevel: isBot ? s.level : undefined,
        })
      })
    }
    return roster
  }

  return {
    hotseatSeats,
    BOT_LEVELS,
    hotseatStartLabel,
    teamCount,
    canEmpty,
    setSeatControl,
    setSeatLevel,
    setHotseatSlotTank,
    buildHotseatRoster,
  }
}
