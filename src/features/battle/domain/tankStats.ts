/**
 * Tank Stats (選車面板用的數值推導)
 * 全部由 TANK_REGISTRY / PROJECTILE_REGISTRY 計算，UI 不寫死任何數值，
 * 新增坦克或砲彈後選車面板會自動跟著更新。
 */
import type { BulletType, TankArchetypeId } from '@/shared/kernel/types'
import { PROJECTILE_REGISTRY, type ProjectileBlueprint } from './projectileRegistry'
import { STATUS_REGISTRY } from './statusEffects'
import { TANK_LIST, TANK_REGISTRY, getTankSpec, type DamageType } from './tankRegistry'

/** 與 launchVelocity 相同的初速係數（power 100 → 16.5 px/step） */
const SPEED_PER_POWER_PX = 0.165

export interface ShotCard {
  readonly id: BulletType
  readonly name: string
  readonly badge: string
  /** 該坦克實際單發最大傷害（含輸出倍率）；多彈體的砲彈為每顆的傷害 */
  readonly damage: number
  /** 一次開火全部命中時的總傷害（散彈 / 碎裂彈 = 顆數 × 單顆，受上限限制） */
  readonly totalDamage: number
  /** 一次開火的彈體數（散彈 5、冰錐 3） */
  readonly pellets: number
  /** 特殊效果一句話（狀態、飛行行為、地形效果）；一般砲彈為空字串 */
  readonly effect: string
  /** 傷害範圍 px（含坦克加成） */
  readonly damageRadius: number
  /** 挖坑半徑 px（含坦克加成） */
  readonly terrainRadius: number
  /** 理想條件（45°、滿力道、無風平地）的射程 px */
  readonly maxRangePx: number
  /** 風阻倍率，數字越大越容易被風吹偏 */
  /** 實際受風倍率 = 砲彈風係數 × 坦克風敏感度 */
  readonly windMultiplier: number
  /** 吸附半徑 px；0 = 不導引（純技術彈） */
  readonly magnetRadius: number
  /** 0~1：相對於所有坦克 / 砲彈的最大值，供長條圖使用 */
  readonly damageRatio: number
  readonly damageRadiusRatio: number
  readonly terrainRadiusRatio: number
  readonly rangeRatio: number
}

export interface TankCard {
  readonly id: TankArchetypeId
  readonly name: string
  readonly maxHp: number
  readonly damageMultiplier: number
  readonly moveFuel: number
  readonly armor: number
  readonly shield: number
  readonly climbPerPx: number
  readonly fallSafePx: number
  /** 各抗性（0~1）已啟用的項目，供面板一行顯示 */
  readonly resist: Partial<Record<DamageType, number>>
  readonly windSensitivity: number
  readonly passive: { readonly name: string; readonly description: string }
  readonly hpRatio: number
  /** 火力：最強砲彈的一發總傷害相對於全部機種的最大值 */
  readonly firepower: number
  readonly firepowerRatio: number
  readonly outputRatio: number
  readonly mobilityRatio: number
  readonly shots: readonly ShotCard[]
}

function maxRangePx(bullet: BulletType): number {
  const proj = PROJECTILE_REGISTRY[bullet]
  const v = 100 * SPEED_PER_POWER_PX * proj.speedMultiplier
  return Math.round((v * v) / (proj.gravityMilli / 1000))
}

function pelletCount(proj: ProjectileBlueprint): number {
  const pattern = proj.pattern ? proj.pattern({} as never).length : 1
  return pattern * (proj.flight?.kind === 'shards' ? proj.flight.angles.length : 1)
}

/** 砲彈的特殊效果說明（由行為欄位推導，新增行為時在這裡補一句） */
function effectText(proj: ProjectileBlueprint): string {
  const parts: string[] = []
  if (proj.flight?.kind === 'lob') parts.push('上升段穿過地形')
  if (proj.flight?.kind === 'bounce') parts.push('觸地反彈一次')
  if (proj.flight?.kind === 'shards') parts.push(`落地碎成 ${proj.flight.angles.length} 片`)
  if (proj.pattern) parts.push(`${pelletCount(proj)} 顆散射`)
  if (proj.terrainOp === 'fill') parts.push('堆出土丘')
  if (proj.terrainDepth) parts.push(`鑽地 ${proj.terrainDepth}px`)
  if (proj.knockbackPx) parts.push(proj.knockbackPx > 0 ? `擊退 ${proj.knockbackPx}px` : `拉近 ${-proj.knockbackPx}px`)
  if (proj.onHit) {
    const st = STATUS_REGISTRY[proj.onHit.status]
    if (st) parts.push(`${st.icon}${st.name} ${proj.onHit.turns} 回合`)
  }
  if (proj.selfEffect) {
    const st = STATUS_REGISTRY[proj.selfEffect.status]
    if (st) parts.push(`自己${st.icon}${st.name} ${proj.selfEffect.turns} 回合`)
  }
  return parts.join(' · ')
}

function rawShot(tankId: TankArchetypeId, bullet: BulletType) {
  const tank = TANK_REGISTRY[tankId]
  const proj = PROJECTILE_REGISTRY[bullet]
  const damage = Math.round(proj.maxDamage * tank.damageMultiplier)
  const pellets = pelletCount(proj)
  return {
    proj,
    damage,
    pellets,
    totalDamage: Math.min(proj.damageCapPerTank ?? Infinity, damage * pellets),
    damageRadius: proj.damageRadius + tank.damageRadiusBonus,
    terrainRadius: proj.terrainRadius + tank.terrainRadiusBonus,
    range: maxRangePx(bullet),
  }
}

export function buildTankCard(tankId: TankArchetypeId): TankCard {
  const tank = getTankSpec(tankId)

  let maxHp = 1
  let maxOutput = 1
  let maxFuel = 1
  let maxDamage = 1
  let maxTotal = 1
  let maxDamageRadius = 1
  let maxTerrainRadius = 1
  let maxRange = 1
  for (const t of TANK_LIST) {
    maxHp = Math.max(maxHp, t.maxHp)
    maxOutput = Math.max(maxOutput, t.damageMultiplier)
    maxFuel = Math.max(maxFuel, t.moveFuel)
    for (const b of t.shots) {
      const s = rawShot(t.id, b)
      maxDamage = Math.max(maxDamage, s.damage)
      maxTotal = Math.max(maxTotal, s.totalDamage)
      maxDamageRadius = Math.max(maxDamageRadius, s.damageRadius)
      maxTerrainRadius = Math.max(maxTerrainRadius, s.terrainRadius)
      maxRange = Math.max(maxRange, s.range)
    }
  }

  const toShot = (bullet: BulletType): ShotCard => {
    const s = rawShot(tank.id, bullet)
    return {
      id: bullet,
      name: s.proj.name,
      badge: s.proj.badge,
      damage: s.damage,
      totalDamage: s.totalDamage,
      pellets: s.pellets,
      effect: effectText(s.proj),
      damageRadius: s.damageRadius,
      terrainRadius: s.terrainRadius,
      maxRangePx: s.range,
      windMultiplier: Math.round(s.proj.windMultiplier * tank.windSensitivity * 100) / 100,
      magnetRadius: s.proj.magnetRadius,
      damageRatio: s.totalDamage / maxTotal,
      damageRadiusRatio: s.damageRadius / maxDamageRadius,
      terrainRadiusRatio: s.terrainRadius / maxTerrainRadius,
      rangeRatio: s.range / maxRange,
    }
  }

  const firepower = Math.max(0, ...tank.shots.map((b) => rawShot(tank.id, b).totalDamage))
  return {
    id: tank.id,
    name: tank.name,
    maxHp: tank.maxHp,
    damageMultiplier: tank.damageMultiplier,
    moveFuel: tank.moveFuel,
    armor: tank.armor,
    shield: tank.shield,
    climbPerPx: tank.climbPerPx,
    fallSafePx: tank.fallSafePx,
    resist: tank.resist,
    windSensitivity: tank.windSensitivity,
    passive: tank.passive,
    hpRatio: tank.maxHp / maxHp,
    firepower,
    firepowerRatio: firepower / maxTotal,
    outputRatio: tank.damageMultiplier / maxOutput,
    mobilityRatio: tank.moveFuel / maxFuel,
    shots: tank.shots.map(toShot),
  }
}
