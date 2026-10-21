/**
 * Tank Stats (選車面板用的數值推導)
 * 全部由 TANK_REGISTRY / PROJECTILE_REGISTRY 計算，UI 不寫死任何數值，
 * 新增坦克或砲彈後選車面板會自動跟著更新。
 */
import type { BulletType, TankArchetypeId } from '@/shared/kernel/types'
import { PROJECTILE_REGISTRY } from './projectileRegistry'
import { TANK_LIST, TANK_REGISTRY } from './tankRegistry'

/** 與 launchVelocity 相同的初速係數（power 100 → 16.5 px/step） */
const SPEED_PER_POWER_PX = 0.165

export interface ShotCard {
  readonly id: BulletType
  readonly name: string
  readonly badge: string
  /** 該坦克實際單發最大傷害（含輸出倍率） */
  readonly damage: number
  /** 傷害範圍 px（含坦克加成） */
  readonly damageRadius: number
  /** 挖坑半徑 px（含坦克加成） */
  readonly terrainRadius: number
  /** 理想條件（45°、滿力道、無風平地）的射程 px */
  readonly maxRangePx: number
  /** 風阻倍率，數字越大越容易被風吹偏 */
  readonly windMultiplier: number
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
  readonly hpRatio: number
  readonly outputRatio: number
  readonly mobilityRatio: number
  readonly shots: readonly [ShotCard, ShotCard]
}

function maxRangePx(bullet: BulletType): number {
  const proj = PROJECTILE_REGISTRY[bullet]
  const v = 100 * SPEED_PER_POWER_PX * proj.speedMultiplier
  return Math.round((v * v) / (proj.gravityMilli / 1000))
}

function rawShot(tankId: TankArchetypeId, bullet: BulletType) {
  const tank = TANK_REGISTRY[tankId]
  const proj = PROJECTILE_REGISTRY[bullet]
  return {
    proj,
    damage: Math.round(proj.maxDamage * tank.damageMultiplier),
    damageRadius: proj.damageRadius + tank.damageRadiusBonus,
    terrainRadius: proj.terrainRadius + tank.terrainRadiusBonus,
    range: maxRangePx(bullet),
  }
}

export function buildTankCard(tankId: TankArchetypeId): TankCard {
  const tank = TANK_REGISTRY[tankId] ?? TANK_REGISTRY.aegis

  let maxHp = 1
  let maxOutput = 1
  let maxFuel = 1
  let maxDamage = 1
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
      damageRadius: s.damageRadius,
      terrainRadius: s.terrainRadius,
      maxRangePx: s.range,
      windMultiplier: s.proj.windMultiplier,
      damageRatio: s.damage / maxDamage,
      damageRadiusRatio: s.damageRadius / maxDamageRadius,
      terrainRadiusRatio: s.terrainRadius / maxTerrainRadius,
      rangeRatio: s.range / maxRange,
    }
  }

  return {
    id: tank.id,
    name: tank.name,
    maxHp: tank.maxHp,
    damageMultiplier: tank.damageMultiplier,
    moveFuel: tank.moveFuel,
    hpRatio: tank.maxHp / maxHp,
    outputRatio: tank.damageMultiplier / maxOutput,
    mobilityRatio: tank.moveFuel / maxFuel,
    shots: [toShot(tank.shots[0]), toShot(tank.shots[1])],
  }
}
