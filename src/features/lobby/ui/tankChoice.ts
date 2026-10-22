import { TANK_LIST } from '@/features/battle'
import type { TankArchetypeId } from '@/shared/kernel/types'

/** 選車時的「隨機」選項：只存在大廳 UI，開打前一定要換成真正的機種 id */
export const RANDOM_TANK = 'random'
export type TankChoice = TankArchetypeId | typeof RANDOM_TANK

export function rollTank(): TankArchetypeId {
  return TANK_LIST[Math.floor(Math.random() * TANK_LIST.length)].id
}

export function resolveTank(choice: TankChoice): TankArchetypeId {
  return choice === RANDOM_TANK ? rollTank() : choice
}
