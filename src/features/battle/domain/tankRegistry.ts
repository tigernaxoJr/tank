/**
 * Tank Registry (模組化坦克基底引擎)
 * 日後要新增或修改任何坦克機種，只需在 TANK_REGISTRY 新增一筆設定，並在
 * tools/assets/paint_units.mjs 的 TANKS 畫好原創車身/砲管後執行 `npm run paint:units`（美術風格見 docs/04 §六），
 * 物理引擎、大廳選角與 Phaser 渲染器皆自動從此註冊表驅動。
 * 平衡原則：血量愈少輸出愈高（maxHp × damageMultiplier 約略相等，機動力另外補償低血量），
 * 修改數值後請用 tools/balance/duel_sim.mjs 重新模擬對轟勝率（見 docs/06-gameplay-reference-and-physics.md）。
 * 琥珀隊 (A) 使用琥珀橘塗裝、皇家藍隊 (B) 使用皇家藍塗裝。
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
  /** 這台坦克的兩種專屬砲彈（鍵盤 1 / 2 切換，第一種為預設） */
  readonly shots: readonly [BulletType, BulletType]
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

export const TANK_REGISTRY: Record<TankArchetypeId, TankBlueprint> = {
  aegis: {
    id: 'aegis',
    name: '神盾騎士 Aegis',
    subtitle: '均衡泛用型裝甲戰車',
    description: '圓豆形車身配頭盔式砲塔與精準加農砲，適合各種地形全距離拋物線作戰。',
    maxHp: 100,
    moveFuel: 280,
    damageRadiusBonus: 0,
    terrainRadiusBonus: 0,
    damageMultiplier: 1.0,
    climbPerPx: 3,
    fallSafePx: 30,
    windSensitivity: 1,
    armor: 0,
    shield: 0,
    resist: {},
    shots: ['MISSILE_STANDARD', 'MISSILE_HEAVY'],
    sprite: { scale: 0.4, pivotX: 1, pivotY: -31, face: { x: 10, y: -13, eyeGap: 15, eyeSize: 6 } },
    getSprites(team: TeamId) {
      const t = team === 'A' ? 'a' : 'b'
      return {
        hullUrl: `./assets/units/tanks/aegis_${t}_hull.png`,
        barrelUrl: `./assets/units/tanks/aegis_${t}_barrel.png`,
      }
    },
  },
  goliath: {
    id: 'goliath',
    name: '巨像重砲 Goliath',
    subtitle: '重裝破甲巨獸',
    description: '厚重圓頂裝甲，全場最高血量，但單發輸出最低、移動燃料最少，適合穩紮穩打。',
    maxHp: 130,
    moveFuel: 200,
    damageRadiusBonus: 0,
    terrainRadiusBonus: 0,
    damageMultiplier: 0.82,
    climbPerPx: 2,
    fallSafePx: 40,
    windSensitivity: 0.8,
    armor: 2,
    shield: 0,
    resist: { fall: 0.4 },
    shots: ['MISSILE_HEAVY', 'MISSILE_STANDARD'],
    sprite: { scale: 0.4, pivotX: 13, pivotY: -28, face: { x: 7, y: -17, eyeGap: 17, eyeSize: 7 } },
    getSprites(team: TeamId) {
      const t = team === 'A' ? 'a' : 'b'
      return {
        hullUrl: `./assets/units/tanks/goliath_${t}_hull.png`,
        barrelUrl: `./assets/units/tanks/goliath_${t}_barrel.png`,
      }
    },
  },
  zephyr: {
    id: 'zephyr',
    name: '疾風磁軌 Zephyr',
    subtitle: '高機動突擊戰車',
    description: '低矮水滴形輕量底盤配磁軌砲，全場最高機動與輸出，但血量最低，吃兩三發就倒，擅長游擊搶先手。',
    maxHp: 80,
    moveFuel: 360,
    damageRadiusBonus: 0,
    terrainRadiusBonus: 0,
    damageMultiplier: 1.15,
    climbPerPx: 4,
    fallSafePx: 36,
    windSensitivity: 1.25,
    armor: 0,
    shield: 0,
    resist: { fall: 0.15 },
    shots: ['MISSILE_PLASMA', 'MISSILE_RAILGUN'],
    sprite: { scale: 0.4, pivotX: -4, pivotY: -25, face: { x: 8, y: -9, eyeGap: 14, eyeSize: 5.2 } },
    getSprites(team: TeamId) {
      const t = team === 'A' ? 'a' : 'b'
      return {
        hullUrl: `./assets/units/tanks/zephyr_${t}_hull.png`,
        barrelUrl: `./assets/units/tanks/zephyr_${t}_barrel.png`,
      }
    },
  },
}

export const TANK_LIST: TankBlueprint[] = Object.values(TANK_REGISTRY)

/** 套用裝甲與抗性後的實際傷害（整數，確定性）。其他傷害類型日後直接呼叫即可 */
export function mitigateDamage(spec: TankBlueprint, type: DamageType, raw: number): number {
  if (raw <= 0) return 0
  const flat = type === 'explosion' ? spec.armor : 0
  return Math.max(1, Math.round((raw - flat) * (1 - (spec.resist[type] ?? 0))))
}

/** 砲彈實際承受的風力（千分位整數）：全局風 × 砲彈風係數 × 發射坦克的風敏感度。預覽、結算、CPU 皆須經此函式以維持一致 */
export function effectiveWindMilli(wind: number, projectileWindMultiplier: number, spec: TankBlueprint): number {
  return Math.round(wind * projectileWindMultiplier * spec.windSensitivity)
}
