import { reactive, ref } from 'vue'
import {
  createLoadoutSecret,
  loadoutRoot,
  sanitizeLoadout,
  type LoadoutSecret,
} from '@/features/battle'
import { loadLoadoutPicks, saveLoadoutPicks } from '../../infra/loadoutStorage'
import type { BulletType, TankArchetypeId } from '@/shared/kernel/types'

export function useLoadoutCommitment(getSelectedTankId: () => TankArchetypeId) {
  const loadoutPicks = ref<BulletType[]>(loadLoadoutPicks(getSelectedTankId()))
  const loadoutCache = reactive<Record<string, BulletType[]>>({})

  function picksFor(tankId: TankArchetypeId): BulletType[] {
    return (loadoutCache[tankId] ??= loadLoadoutPicks(tankId))
  }

  const localRoot = ref('')
  let localSecret: LoadoutSecret | null = null

  function refreshCommitment(): void {
    const tankId = getSelectedTankId()
    localSecret = createLoadoutSecret(tankId, loadoutPicks.value)
    localRoot.value = loadoutRoot(tankId, localSecret)
  }

  function syncWithTank(tankId: TankArchetypeId): void {
    loadoutPicks.value = loadLoadoutPicks(tankId)
    refreshCommitment()
  }

  function onPickLoadout(picks: BulletType[], isLocked = false): void {
    if (isLocked) return
    const tankId = getSelectedTankId()
    loadoutPicks.value = sanitizeLoadout(tankId, picks)
    saveLoadoutPicks(tankId, loadoutPicks.value)
    loadoutCache[tankId] = loadoutPicks.value
    refreshCommitment()
  }

  refreshCommitment()

  return {
    loadoutPicks,
    loadoutCache,
    picksFor,
    localRoot,
    getLocalSecret: () => localSecret,
    refreshCommitment,
    syncWithTank,
    onPickLoadout,
  }
}
