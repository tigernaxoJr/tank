/**
 * 砲彈行為擴充點。純數值（威力、半徑、風係數）放在 ProjectileBlueprint；數值表達不了的行為分成四類：
 *  1. 開火樣式 `pattern`：一次開火射出幾顆彈丸、各自的角度 / 力道偏移與傷害比例（散彈）。
 *  2. 飛行行為 `flight`：碰到地形後的反應（跳彈、碎裂成冰錐、上升段穿過地形的高拋彈），見 shellFlight.ts。
 *  3. 命中當下的立即效果：挖坑 / 堆土 `terrainOp`、鑽地 `terrainDepth`、擊退 `knockbackPx`。
 *  4. 狀態 `onHit` / `selfEffect`：命中後掛在坦克上的回合制狀態（中毒、冰凍、破甲、偵察），見 statusEffects.ts。
 *  5. 定時引爆 `fuse`：落地不爆，黏在落點成為「定時彈」(`BattleState.charges`)，倒數歸零才用同一套爆炸結算引爆（蝸牛的黏殼彈）。
 *
 * 共同規則（P2P 雙端必須一致）：
 *  - 全部是純函式或純資料，不得使用 Math.random；結果只能是整數。
 *  - 狀態存在 `TankEntity.statuses`，並納入 `battleStateHash` 與快照。
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

/** 預設樣式：單發、不偏移 */
export const SINGLE_SHOT: FirePattern = () => [{ angleDelta: 0, powerDelta: 0, damageScale: 1 }]

/**
 * 散射：`count` 顆彈丸的力道以 `powerStep` 為間隔前後對稱展開（例如 5 顆、2 → -4, -2, 0, 2, 4），每顆傷害比例相同。
 * 用力道而不是角度散開，是因為射程與力道平方成正比：任何仰角下彈丸都沿射擊方向前後排開，
 * 且射得愈遠間距愈大，所以「距離愈近命中顆數愈多」。固定偏移、不含亂數。
 */
export function spreadPattern(count: number, powerStep: number, damageScale: number): FirePattern {
  const pellets: Pellet[] = []
  for (let i = 0; i < count; i++) {
    pellets.push({ angleDelta: 0, powerDelta: (i - (count - 1) / 2) * powerStep, damageScale })
  }
  return () => pellets
}

// ───── 2. 飛行行為 ─────

export type FlightBehavior =
  /** 跳彈：第一次碰到地形不爆炸，以 `keepPermille`（千分比）保留的速度反彈一次，第二次碰撞才引爆 */
  | { readonly kind: 'bounce'; readonly keepPermille: number }
  /** 高拋彈：上升段（vy < 0）穿過地形，能從坑底、橋下、自己堆的土丘後方開火；下降段照常碰撞 */
  | { readonly kind: 'lob' }
  /**
   * 碎裂：第一次碰到地形時不爆炸，往射擊方向碎成 `count` 片，以 `angles`（相對水平、往前）與 `speedMilli` 初速貼地飛出，
   * 每片各自爆炸，傷害比例 `damageScale`。
   */
  | {
      readonly kind: 'shards'
      readonly angles: readonly number[]
      readonly speedMilli: number
      readonly damageScale: number
    }

// ───── 3. 命中效果與狀態 ─────

/** 砲彈藍圖上的宣告：命中（造成傷害）的坦克會被掛上哪個狀態 */
export interface HitEffect {
  readonly status: string
  /** 持續回合數（以掛狀態的坦克自己的回合計，見 statusEffects.ts） */
  readonly turns: number
  /** 強度（意義由狀態自訂：中毒 = 每回合傷害、冰凍 = 燃料削減百分比、紮根 = 減傷百分比） */
  readonly power: number
}

/** 在 `ProjectileBlueprint` 上新增的可選欄位（省略 = 一般砲彈行為） */
export interface ProjectileBehavior {
  /** 省略 = `SINGLE_SHOT` */
  readonly pattern?: FirePattern
  /** 省略 = 直線拋物線，碰到地形或坦克就引爆 */
  readonly flight?: FlightBehavior
  /** 'carve' 挖坑（預設）、'fill' 在落點堆出土丘（築壘彈） */
  readonly terrainOp?: 'carve' | 'fill'
  /** 鑽地深度 (px)：碰到地面後再往下鑽這麼深才爆炸（挖坑與傷害都以鑽到的位置計算）；省略 = 0 */
  readonly terrainDepth?: number
  /** 一次開火對同一台坦克的爆炸傷害上限（散彈全中時避免一發秒殺，docs/06 §三之一）；省略 = 不設限 */
  readonly damageCapPerTank?: number
  /** 擊退 (px)：爆炸範圍內的坦克被沿地形往外推，愈靠近爆心推得愈遠；可能被推下懸崖 */
  readonly knockbackPx?: number
  /** 命中（受到傷害）的坦克被掛上的狀態 */
  readonly onHit?: HitEffect
  /** 開火時掛在射手自己身上的狀態（偵察照明彈） */
  readonly selfEffect?: HitEffect
  /**
   * 定時引爆：砲彈落地（或進入坦克判定圈）時不爆炸，也不挖坑、不扣血，而是黏在落點留下一顆定時彈，
   * 之後每個回合結束倒數一次，`turns` 次後在原地引爆（同一套爆炸結算：挖坑、傷害、擊退、摔落）。
   * `turns: 2` = 放置的當回合結束算第 1 次、對手的下一個回合結束算第 2 次 → 對手剛好有一個回合可以離開。
   * 定時彈不分敵我，射手自己站在範圍內一樣會被炸；不會跟著坦克移動。
   */
  readonly fuse?: { readonly turns: number }
}
