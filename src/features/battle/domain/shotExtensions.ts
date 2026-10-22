/**
 * 砲彈行為擴充點（介面草案，尚未接進戰鬥流程）。
 *
 * 純數值（威力、半徑、風係數）放在 ProjectileBlueprint；數值表達不了的行為分兩種擴充點：
 *  1. 開火樣式 `FirePattern`：一次開火要射出幾顆彈丸、各自的角度 / 力道偏移與傷害比例（霰彈、追蹤彈）。
 *  2. 命中效果 `HitEffect` → `StatusEffectBlueprint`：命中後掛在坦克上的回合制狀態（中毒、冰凍…）。
 * 地形新增（墊土彈 `op: 'add'`）與擊退等「命中當下的立即效果」之後再比照 `HitEffect` 擴充。
 *
 * 共同規則（P2P 雙端必須一致）：
 *  - 全部是純函式，回傳「要做什麼」，由戰鬥流程套用；不直接改 state，也不得使用 Math.random。
 *  - 需要亂數時用 `state.seed` + `state.turnId` 派生的確定性亂數。
 *  - 結果只能是整數；狀態存在 `TankEntity.statuses`，並納入 `battleStateHash` 與快照。
 *
 * 預計的接入點（實作時才改，對現有砲彈行為不變）：
 *  - `prepareFireTrajectory`：呼叫 `pattern` 取得彈丸清單，逐顆模擬；`PreparedShotPlan` 由單一 hit 改為 `shots[]`。
 *  - `commitFireImpact`：依序結算每顆彈丸的挖坑與傷害，最後對受傷坦克套用 `onHit`。
 *  - `advanceTurn`：輪到某坦克時呼叫其各狀態的 `onTurnStart`，套用傷害與燃料上限，再遞減剩餘回合。
 *  - `BattleScene.playProjectileFlight`：由單一路徑改為多條路徑（可同時飛）。
 */
import type { FireActionCommand } from '@/shared/kernel/types'
import type { BattleState, TankEntity } from './battleState'
import type { ProjectileBlueprint } from './projectileBlueprint'

// ───── 1. 開火樣式 ─────

/** 一顆彈丸相對於玩家瞄準值的偏移 */
export interface Pellet {
  /** 角度偏移（度，整數） */
  readonly angleDelta: number
  /** 力道偏移（與 UI 的力道單位相同） */
  readonly powerDelta: number
  /** 這顆彈丸的傷害比例（1 = 全額）；霰彈 n 顆的總和應略低於 1 倍，見 docs/06 §三之一 */
  readonly damageScale: number
}

export interface FirePatternContext {
  readonly state: Readonly<BattleState>
  readonly shooter: Readonly<TankEntity>
  readonly projectile: ProjectileBlueprint
  readonly cmd: Readonly<FireActionCommand>
}

/** 回傳至少一顆彈丸；順序即結算順序 */
export type FirePattern = (ctx: FirePatternContext) => readonly Pellet[]

/** 預設樣式：單發、不偏移（所有現有砲彈） */
export const SINGLE_SHOT: FirePattern = () => [{ angleDelta: 0, powerDelta: 0, damageScale: 1 }]

// ───── 2. 命中效果與狀態 ─────

/** 砲彈藍圖上的宣告：命中（造成傷害）的坦克會被掛上哪個狀態 */
export interface HitEffect {
  readonly status: string
  /** 持續回合數（以被命中坦克自己的回合計） */
  readonly turns: number
  /** 強度（意義由狀態自訂：中毒 = 每回合傷害、冰凍 = 燃料削減百分比） */
  readonly power: number
}

/** 掛在 `TankEntity.statuses` 上的實例；同種狀態不疊加，重複命中只刷新 `turnsLeft` */
export interface StatusInstance {
  readonly id: string
  turnsLeft: number
  readonly power: number
}

/** 回合開始時狀態要產生的結果（由 advanceTurn 套用） */
export interface StatusTurnResult {
  /** 直接扣血（會經過 mitigateDamage，傷害類型見 `damageType`）；省略 = 0 */
  readonly damage?: number
  /** 本回合移動燃料上限的保留比例 0~1（1 = 不變）；省略 = 1。不得為 0 以外的「跳過回合」效果 */
  readonly moveFuelScale?: number
}

/** 狀態藍圖，放在 `statuses/<id>.ts`，比照坦克 / 砲彈一檔一模組並自動收集 */
export interface StatusEffectBlueprint {
  readonly id: string
  readonly name: string
  readonly description: string
  /** HUD 圖示（原創美術，見 docs/04） */
  readonly icon: string
  /** 對應 `DamageType`，讓坦克抗性套用在持續傷害上 */
  readonly damageType: 'poison' | 'burn' | 'movement'
  /** 掛上後是否有 1 回合免疫（避免被鎖死） */
  readonly immuneAfterTurns?: number
  /** 該坦克回合開始時呼叫；純函式 */
  onTurnStart(instance: Readonly<StatusInstance>, tank: Readonly<TankEntity>): StatusTurnResult
}

/** 在 `ProjectileBlueprint` 上新增的兩個可選欄位（省略 = 現有行為） */
export interface ProjectileBehavior {
  /** 省略 = `SINGLE_SHOT` */
  readonly pattern?: FirePattern
  /** 省略 = 無狀態效果 */
  readonly onHit?: HitEffect
}
