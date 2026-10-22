/**
 * Tank Registry (模組化坦克基底引擎)
 * 每台坦克一個檔：新增機種只要在 `tanks/` 新增 `<id>.ts`（default export `defineTank({...})`），
 * 並在 tools/assets/paint_units.mjs 的 TANKS 畫好原創車身/砲管後執行 `pnpm run paint:units`（美術風格見 docs/04 §六），
 * 本檔以 import.meta.glob 自動收集，物理引擎、大廳選角與 Phaser 渲染器皆從這裡驅動，不必改其他程式。
 * 平衡原則：血量愈少輸出愈高（maxHp × damageMultiplier 約略相等，機動力另外補償低血量），
 * 修改數值後請用 tools/balance/duel_sim.mjs 重新模擬對轟勝率（見 docs/06-gameplay-reference-and-physics.md）。
 * 琥珀隊 (A) 使用琥珀橘塗裝、皇家藍隊 (B) 使用皇家藍塗裝。
 */
import type { TankArchetypeId } from '@/shared/kernel/types'
import type { DamageType, TankBlueprint } from './tankBlueprint'

export type { DamageType, FaceSpec, TankBlueprint } from './tankBlueprint'

const modules = import.meta.glob<{ default: TankBlueprint }>('./tanks/*.ts', { eager: true })

export const TANK_LIST: TankBlueprint[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.sortOrder - b.sortOrder)

export const TANK_REGISTRY: Record<TankArchetypeId, TankBlueprint> = Object.fromEntries(TANK_LIST.map((t) => [t.id, t]))


/** 查機種；id 不認得時退回清單第一台（不把任何特定機種寫死成預設） */
export function getTankSpec(id: TankArchetypeId | undefined): TankBlueprint {
  return (id && TANK_REGISTRY[id]) || TANK_LIST[0]
}

/** 依序輪流取機種 id（預設陣容用），新增機種自動納入輪替 */
export function tankAt(index: number): TankArchetypeId {
  return TANK_LIST[index % TANK_LIST.length].id
}

/** 套用裝甲與抗性後的實際傷害（整數，確定性）。其他傷害類型日後直接呼叫即可 */
export function mitigateDamage(spec: TankBlueprint, type: DamageType, raw: number): number {
  if (raw <= 0) return 0
  if ((spec.resist[type] ?? 0) >= 1) return 0
  const flat = type === 'explosion' ? spec.armor : 0
  return Math.max(1, Math.round((raw - flat) * (1 - (spec.resist[type] ?? 0))))
}

/** 砲彈實際承受的風力（千分位整數）：全局風 × 砲彈風係數 × 發射坦克的風敏感度。預覽、結算、CPU 皆須經此函式以維持一致 */
export function effectiveWindMilli(wind: number, projectileWindMultiplier: number, spec: TankBlueprint): number {
  return Math.round(wind * projectileWindMultiplier * spec.windSensitivity)
}
