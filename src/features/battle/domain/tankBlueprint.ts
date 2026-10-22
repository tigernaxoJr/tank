/**
 * 坦克藍圖型別與 `defineTank`。每台坦克一個檔放在 `tanks/<id>.ts`（default export `defineTank({...})`），
 * 由 tankRegistry.ts 自動收集，新增機種不需要改任何註冊程式。
 */
import type { BulletType, TankArchetypeId, TeamId } from '@/shared/kernel/types'

/** 表情臉部位置（rig 區域座標，以面向右為準；面向左時自動鏡像） */
export interface FaceSpec {
  readonly x: number
  readonly y: number
  /** 兩眼中心距離 */
  readonly eyeGap: number
  /** 眼睛半高 */
  readonly eyeSize: number
}

/** 傷害類型：explosion/fall 已啟用；poison/burn/movement 為預留（尚無來源，新增效果時只需套用 mitigateDamage） */
export type DamageType = 'explosion' | 'fall' | 'poison' | 'burn' | 'movement'

export interface TankBlueprint {
  readonly id: TankArchetypeId
  /** 顯示與預設陣容的排序（小的在前） */
  readonly sortOrder: number
  readonly name: string
  readonly subtitle: string
  readonly description: string
  readonly maxHp: number
  readonly moveFuel: number
  /** 傷害範圍加成 (px)，加在砲彈的 damageRadius 上 */
  readonly damageRadiusBonus: number
  /** 挖坑半徑加成 (px)，加在砲彈的 terrainRadius 上 */
  readonly terrainRadiusBonus: number
  readonly damageMultiplier: number
  /** 這台坦克可用的砲彈（至少 1 種，鍵盤數字鍵 1~9 依序切換，第一種為預設） */
  readonly shots: readonly BulletType[]
  /** 爬坡能力：每水平移動 1px 最多可爬升的高度 (px)，更陡的牆面會擋住這台坦克 */
  readonly climbPerPx: number
  /** 摔落抗性：下墜超過此高度 (px) 才開始受摔落傷害 */
  readonly fallSafePx: number
  /** 風敏感度：該機種發射的砲彈受風影響倍率（<1 彈道穩、>1 更吃風，需要技術修正） */
  readonly windSensitivity: number
  /** 裝甲值：每次爆炸（explosion）傷害固定減免的點數，至少仍造成 1 點 */
  readonly armor: number
  /** 護盾值：先於 HP 吸收傷害，不會自動回復 */
  readonly shield: number
  /** 各傷害類型抗性 0~1（0.4 = 減傷 40%）；未列出視為 0。預留 poison/burn/movement */
  readonly resist: Partial<Record<DamageType, number>>
  /** 精靈圖（以 2.5 倍繪製）的顯示縮放與砲塔轉軸（相對於坦克容器原點，原點約在車身中心上方） */
  readonly sprite: {
    readonly scale: number
    readonly pivotX: number
    readonly pivotY: number
    readonly face: FaceSpec
  }
  getSprites(team: TeamId): {
    readonly hullUrl: string
    readonly barrelUrl: string
  }
}

/** 藍圖資料（不含由 id 推得的 getSprites） */
export type TankSpec = Omit<TankBlueprint, 'getSprites'>

/** 美術檔固定放 public/assets/units/tanks/<id>_<a|b>_<hull|barrel>.png（tools/assets/paint_units.mjs 產生） */
export function defineTank(spec: TankSpec): TankBlueprint {
  return {
    ...spec,
    getSprites(team: TeamId) {
      const t = team === 'A' ? 'a' : 'b'
      return {
        hullUrl: `./assets/units/tanks/${spec.id}_${t}_hull.png`,
        barrelUrl: `./assets/units/tanks/${spec.id}_${t}_barrel.png`,
      }
    },
  }
}
