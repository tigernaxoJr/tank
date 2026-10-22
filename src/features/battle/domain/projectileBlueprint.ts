/**
 * 砲彈藍圖型別、全域物理常數與 `defineProjectile`。每種砲彈一個檔放在 `projectiles/<name>.ts`
 * （default export `defineProjectile({...})`），由 projectileRegistry.ts 自動收集。
 */
import type { BulletType } from '@/shared/kernel/types'

/** 一般砲彈共用的重力（千分位 px / step²） */
export const STANDARD_GRAVITY_MILLI = 175
/** 每個物理模擬步在畫面上對應的毫秒數（全部彈種共用，確保視覺重力一致） */
export const PLAYBACK_MS_PER_STEP = 18
/** 極近距離射擊的最短播放時間，避免砲彈瞬間消失 */
export const MIN_FLIGHT_MS = 500

/** 疊加混色光暈貼圖（tools/assets/paint_units.mjs 的 fx 粒子） */
export type GlowKey = 'fx_glow_fire' | 'fx_glow_plasma'

/**
 * 砲彈專屬特效參數。渲染器只讀這些參數，不認識任何彈種或樣式名稱，
 * 新增砲彈時只需在這裡組合出新外觀，不必改 BattleScene。
 */
export interface ProjectileFx {
  /** 砲口閃光、彈體光暈與爆炸核心使用的光暈貼圖 */
  readonly glow: GlowKey
  /** 彈體光暈的不透明度（僅有 sprite 的彈體使用） */
  readonly haloAlpha: number
  /** 飛行中每步噴發的尾焰 */
  readonly trail: {
    readonly glowSize: number
    readonly glowMs: number
    readonly glowDepth: number
    /** 擴散環（電磁環）；省略則不畫 */
    readonly ring?: { readonly fill: number; readonly stroke: number }
    /** 煙霧；省略則不畫 */
    readonly puff?: {
      readonly texture: 'fx_puff' | 'fx_smoke'
      readonly scale: number
      readonly scaleJitter: number
      readonly chance: number
    }
    /** 每步噴出火星的機率（0 = 不噴） */
    readonly sparkChance: number
  }
  readonly explosion: {
    /** 爆炸序列影格貼圖 */
    readonly sheet: 'fx_explosion' | 'fx_flash'
    /** 是否四散火花 */
    readonly sparks: boolean
  }
}

export interface ProjectileBlueprint {
  readonly id: BulletType
  /** 顯示與預設選彈的排序（小的在前） */
  readonly sortOrder: number
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
    readonly fx: ProjectileFx
    readonly explosionColors: number[]
    readonly cameraShakeIntensity: number
  }
}

export function defineProjectile(spec: ProjectileBlueprint): ProjectileBlueprint {
  return spec
}
