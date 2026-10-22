/**
 * 狀態效果（Status Effect）：掛在坦克上、以回合計的效果。每種狀態一個檔放在 `statuses/<id>.ts`
 * （default export `defineStatus({...})`），本檔以 import.meta.glob 自動收集。規格見 docs/06 §三之二。
 *
 * 回合規則（`TankEntity.statuses`，全部整數、確定性，P2P 兩端一致）：
 *  - `turnsLeft` = 還會影響這台坦克幾個「自己的回合」。
 *  - 自己回合開始（advanceTurn 選到它）：結算持續傷害、套用燃料上限，然後 `turnsLeft - 1`。
 *  - 自己回合結束（advanceTurn 離開它）：`turnsLeft <= 0` 的狀態移除；設定了 `immuneAfterTurns` 的狀態改掛同等回合的免疫。
 *  - 被動效果（破甲、紮根減傷、偵察）只看「狀態還在不在」，所以會一直持續到最後那個自己回合結束。
 *  - 同種狀態不疊加：重複命中只把剩餘回合刷新為較大者，強度不變；免疫期間不會被掛上。
 */
import type { DamageType, TankBlueprint } from './tankBlueprint'
import type { HitEffect } from './shotExtensions'

/** 掛在 `TankEntity.statuses` 上的實例 */
export interface StatusInstance {
  readonly id: string
  turnsLeft: number
  readonly power: number
}

export interface StatusEffectBlueprint {
  readonly id: string
  /** 顯示順序 */
  readonly sortOrder: number
  readonly name: string
  readonly description: string
  /** HUD 與戰場上的圖示（單一字元） */
  readonly icon: string
  /** 圖示底色 */
  readonly color: string
  /** 'debuff' 負面、'buff' 正面 */
  readonly kind: 'debuff' | 'buff'
  /** 持續傷害的傷害類型（套用坦克抗性） */
  readonly damageType?: DamageType
  /** 回合開始時的持續傷害（未計抗性） */
  readonly turnStartDamage?: (s: StatusInstance) => number
  /** 回合開始時移動燃料上限保留的比例（千分比，1000 = 不變）；不得為 0（不可硬控） */
  readonly moveFuelPermille?: (s: StatusInstance) => number
  /** 爆炸傷害減免百分比（紮根） */
  readonly explosionReductionPct?: (s: StatusInstance) => number
  /** 受到一次爆炸傷害後就消失 */
  readonly consumedByExplosion?: boolean
  /** 裝甲與護盾失效（破甲） */
  readonly ignoresArmor?: boolean
  /** 瞄準預覽畫出完整彈道（偵察） */
  readonly fullAimPreview?: boolean
  /** 結束後幾個回合內免疫同種狀態 */
  readonly immuneAfterTurns?: number
}

export function defineStatus(spec: StatusEffectBlueprint): StatusEffectBlueprint {
  return spec
}

const modules = import.meta.glob<{ default: StatusEffectBlueprint }>('./statuses/*.ts', { eager: true })

export const STATUS_LIST: StatusEffectBlueprint[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.sortOrder - b.sortOrder)

export const STATUS_REGISTRY: Record<string, StatusEffectBlueprint> = Object.fromEntries(STATUS_LIST.map((s) => [s.id, s]))

const IMMUNE_SUFFIX = ':immune'

/** 只帶 statuses 的最小坦克形狀（測試與模擬器也能用） */
interface HasStatuses {
  statuses: StatusInstance[]
}

/** 這台坦克身上看得見的狀態（不含免疫標記），依顯示順序 */
export function visibleStatuses(tank: HasStatuses): { spec: StatusEffectBlueprint; turnsLeft: number }[] {
  return tank.statuses
    .filter((s) => STATUS_REGISTRY[s.id])
    .map((s) => ({ spec: STATUS_REGISTRY[s.id], turnsLeft: s.turnsLeft }))
    .sort((a, b) => a.spec.sortOrder - b.spec.sortOrder)
}

export function hasStatusFlag(tank: HasStatuses, flag: 'ignoresArmor' | 'fullAimPreview'): boolean {
  return tank.statuses.some((s) => STATUS_REGISTRY[s.id]?.[flag] === true)
}

/** 掛上狀態：免疫中略過；已有同種則刷新剩餘回合（取較大者），不疊加強度 */
export function applyStatus(tank: HasStatuses, effect: HitEffect): void {
  if (!STATUS_REGISTRY[effect.status]) return
  if (tank.statuses.some((s) => s.id === effect.status + IMMUNE_SUFFIX)) return
  const existing = tank.statuses.find((s) => s.id === effect.status)
  if (existing) {
    existing.turnsLeft = Math.max(existing.turnsLeft, effect.turns)
    return
  }
  tank.statuses.push({ id: effect.status, turnsLeft: effect.turns, power: effect.power })
}

/**
 * 自己回合開始：回傳要結算的持續傷害（依傷害類型分開，由呼叫端套用抗性）與燃料上限比例（千分比），
 * 並把所有狀態的剩餘回合減一。
 */
export function tickStatusesAtTurnStart(tank: HasStatuses): { damage: [DamageType, number][]; fuelPermille: number } {
  const damage: [DamageType, number][] = []
  let fuelPermille = 1000
  for (const s of tank.statuses) {
    const spec = STATUS_REGISTRY[s.id]
    if (spec && s.turnsLeft > 0) {
      const dot = spec.turnStartDamage?.(s) ?? 0
      if (dot > 0) damage.push([spec.damageType ?? 'poison', dot])
      if (spec.moveFuelPermille) fuelPermille = Math.min(fuelPermille, Math.max(1, spec.moveFuelPermille(s)))
    }
    s.turnsLeft -= 1
  }
  return { damage, fuelPermille }
}

/** 自己回合結束：移除到期的狀態，需要時改掛免疫 */
export function expireStatusesAtTurnEnd(tank: HasStatuses): void {
  const kept: StatusInstance[] = []
  for (const s of tank.statuses) {
    if (s.turnsLeft > 0) {
      kept.push(s)
      continue
    }
    const immune = STATUS_REGISTRY[s.id]?.immuneAfterTurns ?? 0
    if (immune > 0) kept.push({ id: s.id + IMMUNE_SUFFIX, turnsLeft: immune, power: 0 })
  }
  tank.statuses = kept
}

/**
 * 依坦克目前的狀態結算一次傷害：破甲時裝甲歸零，紮根時爆炸傷害打折（並在受傷後消耗掉），再套用機種抗性。
 * 抗性 1.0 代表完全免疫（回傳 0）。
 */
export function mitigateForTank(tank: HasStatuses, spec: TankBlueprint, type: DamageType, raw: number): number {
  if (raw <= 0) return 0
  const resist = spec.resist[type] ?? 0
  if (resist >= 1) return 0
  const armor = type === 'explosion' && !hasStatusFlag(tank, 'ignoresArmor') ? spec.armor : 0
  let reducePct = 0
  if (type === 'explosion') {
    for (const s of tank.statuses) {
      const fn = STATUS_REGISTRY[s.id]?.explosionReductionPct
      if (fn) reducePct = Math.max(reducePct, fn(s))
    }
  }
  const afterArmor = Math.max(1, Math.round((raw - armor) * (1 - resist)))
  const dmg = Math.max(1, Math.round((afterArmor * (100 - reducePct)) / 100))
  if (type === 'explosion') tank.statuses = tank.statuses.filter((s) => !STATUS_REGISTRY[s.id]?.consumedByExplosion)
  return dmg
}
