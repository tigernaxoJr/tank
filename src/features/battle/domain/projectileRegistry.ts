/**
 * Projectile Registry (模組化砲彈與特效基底引擎)
 *
 * 設計規範：
 * 1. 日後要新增任何特殊砲彈（如分裂彈、電磁彈、鑽地彈）或自訂飛行尾焰/爆炸特效，
 *    只需在 PROJECTILE_REGISTRY 新增一筆 ProjectileBlueprint。
 * 2. 物理一致性：一般砲彈一律使用同一個重力 `STANDARD_GRAVITY_MILLI`（彈種重量只影響爆炸與風阻，
 *    不影響落地加速度）；只有「特殊彈」（如電漿彈）才可以自訂 `gravityMilli`。
 *    播放時鐘固定為每模擬步 `PLAYBACK_MS_PER_STEP` 毫秒，**不依射程拉伸或壓縮**，
 *    所以每一發看起來的重力加速度都相同；常見射擊約滯空 1.5s ~ 3.3s，保有「投籃拋物線節奏」。
 * 3. 爆炸後以 `postImpactHoldMs` 停留觀察彈坑與傷害，再平滑切換至下一位行動玩家。
 */
import type { BulletType } from '@/shared/kernel/types'

/** 一般砲彈共用的重力（千分位 px / step²） */
export const STANDARD_GRAVITY_MILLI = 175
/** 每個物理模擬步在畫面上對應的毫秒數（全部彈種共用，確保視覺重力一致） */
export const PLAYBACK_MS_PER_STEP = 18
/** 極近距離射擊的最短播放時間，避免砲彈瞬間消失 */
export const MIN_FLIGHT_MS = 500

export type ProjectileTrailStyle = 'flame_smoke' | 'heavy_fireball' | 'plasma_beam'

export interface ProjectileBlueprint {
  readonly id: BulletType
  readonly name: string
  readonly badge: string
  readonly description: string
  /** 對坦克的傷害範圍 (px)：範圍內線性衰減，邊緣為 0 */
  readonly damageRadius: number
  /** 對地形的挖坑半徑 (px)；與 damageRadius 獨立，可做出「只傷人不挖地」或「重挖地輕傷人」的砲彈 */
  readonly terrainRadius: number
  readonly maxDamage: number
  /** 坦克吸附半徑 (px)：飛行中進入敵我坦克此範圍（需無地形遮擋）會被導引命中；0 = 完全不導引，純靠玩家技術。地形傷害（terrainRadius）越大，導引越少 */
  readonly magnetRadius: number
  /** 直接命中坦克的傷害倍率 */
  readonly directHitMultiplier: number
  /** 砲口初速倍率（重彈 < 1，射程較短）；與重力無關，不破壞物理一致性 */
  readonly speedMultiplier: number
  /** 一般彈請用 STANDARD_GRAVITY_MILLI；僅特殊彈可不同 */
  readonly gravityMilli: number
  readonly windMultiplier: number
  /** 命中爆炸後鏡頭停留觀察彈坑的毫秒數 */
  readonly postImpactHoldMs: number
  readonly visual: {
    /**
     * 原創彈體精靈 (public/assets/units/projectiles/<key>.png，由 tools/assets/paint_units.mjs 繪製)。
     * 預設沿飛行方向旋轉；`spin` 有值時改為持續自轉（rad/s，能量彈用）。省略時改畫發光核心。
     */
    readonly sprite?: { readonly key: string; readonly scale: number; readonly spin?: number }
    readonly coreRadius: number
    readonly coreColor: number
    readonly glowColor: number
    readonly strokeColor: number
    readonly trailStyle: ProjectileTrailStyle
    readonly explosionColors: number[]
    readonly cameraShakeIntensity: number
  }
}

export const PROJECTILE_REGISTRY: Record<BulletType, ProjectileBlueprint> = {
  MISSILE_STANDARD: {
    id: 'MISSILE_STANDARD',
    name: '高爆榴彈 (Standard HE)',
    badge: '標準拋物線 · 均衡節奏',
    description: '經典投籃拋物線手感，附帶橘黃尾焰與濃煙軌跡，破甲與挖坑表現均衡。',
    damageRadius: 40,
    terrainRadius: 40,
    maxDamage: 34,
    magnetRadius: 30,
    directHitMultiplier: 1,
    speedMultiplier: 1,
    gravityMilli: STANDARD_GRAVITY_MILLI,
    windMultiplier: 4,
    postImpactHoldMs: 950,
    visual: {
      sprite: { key: 'shell_he', scale: 0.45 },
      coreRadius: 7,
      coreColor: 0xfef08a,
      glowColor: 0xf97316,
      strokeColor: 0xc2410c,
      trailStyle: 'flame_smoke',
      explosionColors: [0xfffbeb, 0xfde047, 0xfb923c, 0xef4444],
      cameraShakeIntensity: 0.011,
    },
  },
  MISSILE_HEAVY: {
    id: 'MISSILE_HEAVY',
    name: '重型巨砲核彈 (Heavy Buster)',
    badge: '大範圍 · 單發較低 · 射程較短',
    description: '彈體沉重、初速較慢（射程較短），單發傷害不高，但爆炸範圍大、對瞄不準的對手更寬容，可炸出巨大彈坑。',
    damageRadius: 50,
    terrainRadius: 50,
    maxDamage: 22,
    magnetRadius: 22,
    directHitMultiplier: 1,
    speedMultiplier: 0.85,
    gravityMilli: STANDARD_GRAVITY_MILLI,
    windMultiplier: 3,
    postImpactHoldMs: 1150,
    visual: {
      sprite: { key: 'shell_heavy', scale: 0.45 },
      coreRadius: 9.5,
      coreColor: 0xffedd5,
      glowColor: 0xef4444,
      strokeColor: 0x7f1d1d,
      trailStyle: 'heavy_fireball',
      explosionColors: [0xffffff, 0xfef08a, 0xf97316, 0xdc2626, 0x7f1d1d],
      cameraShakeIntensity: 0.018,
    },
  },
  MISSILE_PLASMA: {
    id: 'MISSILE_PLASMA',
    name: '疾速電漿彈 (Plasma Bolt)',
    badge: '高速流線 · 電磁星芒',
    description: '初速較快、受重力影響較小的藍紫電漿彈體；爆炸範圍小但單發傷害高，需要精準瞄準。',
    damageRadius: 30,
    terrainRadius: 30,
    maxDamage: 52,
    magnetRadius: 26,
    directHitMultiplier: 1,
    speedMultiplier: 1,
    // 特殊彈：能量彈受重力較小，彈道刻意比一般彈平直
    gravityMilli: 145,
    windMultiplier: 5,
    postImpactHoldMs: 850,
    visual: {
      sprite: { key: 'shell_plasma', scale: 0.42, spin: 9 },
      coreRadius: 6.5,
      coreColor: 0xe0f2fe,
      glowColor: 0x38bdf8,
      strokeColor: 0x6366f1,
      trailStyle: 'plasma_beam',
      explosionColors: [0xf0f9ff, 0x7dd3fc, 0x38bdf8, 0x818cf8, 0xc084fc],
      cameraShakeIntensity: 0.013,
    },
  },
  MISSILE_RAILGUN: {
    id: 'MISSILE_RAILGUN',
    name: '穿甲狙擊彈 (Rail Sniper)',
    badge: '零導引 · 極高傷害',
    description: '小範圍、幾乎不挖地形，但完全沒有吸附導引；打得準就是一發重創，考驗落點與風向控制。',
    damageRadius: 18,
    terrainRadius: 8,
    maxDamage: 75,
    magnetRadius: 0,
    directHitMultiplier: 1,
    speedMultiplier: 1,
    // 特殊彈：高初速、彈道比一般彈平直
    gravityMilli: 150,
    windMultiplier: 5,
    postImpactHoldMs: 850,
    visual: {
      coreRadius: 5,
      coreColor: 0xffffff,
      glowColor: 0xa3e635,
      strokeColor: 0x365314,
      trailStyle: 'plasma_beam',
      explosionColors: [0xffffff, 0xd9f99d, 0xa3e635, 0x4d7c0f],
      cameraShakeIntensity: 0.016,
    },
  },
}

export const PROJECTILE_LIST: ProjectileBlueprint[] = Object.values(PROJECTILE_REGISTRY)
