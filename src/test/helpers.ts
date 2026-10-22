import type { MapPresetId, RosterSlot } from '@/shared/kernel/types'
import { DeterministicTankCore } from '@/shared/wasm'
import { syncAllTanksToTerrain } from '@/features/battle/application/useBattleTurn'
import { createInitialBattleState } from '@/features/battle/domain/battleState'
import { MAP_REGISTRY, terrainOptionsFor } from '@/features/battle/domain/mapRegistry'

export const ROSTER_1V1: RosterSlot[] = [
  { id: 'p1', name: 'A', team: 'A', tankId: 'aegis', isHost: true },
  { id: 'p2', name: 'B', team: 'B', tankId: 'goliath', isHost: false },
]

/** 建立一局已貼地的對戰（與 BattleArena.resetMatch 相同流程） */
export function setupBattle(seed = 1024, mapId: MapPresetId = 'harvest_plains', roster = ROSTER_1V1) {
  const state = createInitialBattleState(seed, roster, mapId)
  const core = new DeterministicTankCore()
  core.resetTerrain(seed, terrainOptionsFor(MAP_REGISTRY[mapId]))
  syncAllTanksToTerrain(state, core)
  return { state, core }
}
