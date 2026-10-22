import { computed, reactive, ref } from 'vue'
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

export function useLocalSkirmish(
  picksFor: (tankId: TankArchetypeId) => BulletType[],
  onSelectPrimaryTank: (choice: TankChoice) => void,
) {
  const hotseatCountPerTeam = ref(1)

  // 預設陣容依註冊表輪流排（B 隊錯開一台），新增機種自動納入；每席也可以選「隨機」，開打時才抽
  const hotseatTeamATanks = reactive<TankChoice[]>(
    Array.from({ length: 5 }, (_, i) => tankAt(i)),
  )
  const hotseatTeamBTanks = reactive<TankChoice[]>(
    Array.from({ length: 5 }, (_, i) => tankAt(i + 1)),
  )

  // 單機模式各隊由玩家或電腦操控（預設：玩家 vs 電腦）
  const hotseatBotTeams = reactive<Record<TeamId, boolean>>({ A: false, B: true })

  // 各隊電腦難度（預設中等：會有瞄準偏差，不至於每發都命中）
  const hotseatBotLevels = reactive<Record<TeamId, BotLevel>>({ A: 'normal', B: 'normal' })
  const BOT_LEVELS = Object.entries(BOT_LEVEL_SPECS) as [BotLevel, (typeof BOT_LEVEL_SPECS)[BotLevel]][]

  const hotseatStartLabel = computed(() => {
    const n = hotseatCountPerTeam.value
    if (hotseatBotTeams.A && hotseatBotTeams.B) return `🍿 觀戰 ${n}v${n} 電腦對決`
    if (hotseatBotTeams.A || hotseatBotTeams.B) return `🚀 啟動 ${n}v${n} 挑戰電腦`
    return `🚀 啟動 ${n}v${n} 單機熱座對戰`
  })

  function setHotseatSlotTank(team: TeamId, slotIndex: number, choice: TankChoice): void {
    if (team === 'A') {
      hotseatTeamATanks[slotIndex] = choice
      if (slotIndex === 0) {
        onSelectPrimaryTank(choice)
      }
    } else {
      hotseatTeamBTanks[slotIndex] = choice
    }
  }

  function buildHotseatRoster(): RosterSlot[] {
    const n = Math.max(1, Math.min(5, hotseatCountPerTeam.value))
    const roster: RosterSlot[] = []
    for (let i = 1; i <= n; i++) {
      const tankId: TankArchetypeId = resolveTank(hotseatTeamATanks[i - 1] ?? tankAt(i - 1))
      const isBot = hotseatBotTeams.A
      roster.push({
        id: `a${i}`,
        name: isBot ? `🤖 CPU A${i}` : `琥珀 A${i}`,
        team: 'A',
        tankId,
        isHost: i === 1,
        isBot,
        loadout: picksFor(tankId),
        botLevel: isBot ? hotseatBotLevels.A : undefined,
      })
    }
    for (let i = 1; i <= n; i++) {
      const tankId: TankArchetypeId = resolveTank(hotseatTeamBTanks[i - 1] ?? tankAt(i))
      const isBot = hotseatBotTeams.B
      roster.push({
        id: `b${i}`,
        name: isBot ? `🤖 CPU B${i}` : `皇家藍 B${i}`,
        team: 'B',
        tankId,
        isHost: false,
        isBot,
        loadout: picksFor(tankId),
        botLevel: isBot ? hotseatBotLevels.B : undefined,
      })
    }
    return roster
  }

  return {
    hotseatCountPerTeam,
    hotseatTeamATanks,
    hotseatTeamBTanks,
    hotseatBotTeams,
    hotseatBotLevels,
    BOT_LEVELS,
    hotseatStartLabel,
    setHotseatSlotTank,
    buildHotseatRoster,
  }
}
