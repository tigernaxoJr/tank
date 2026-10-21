/**
 * Battle Application Service: 接收玩家或網路傳來的 FireActionCommand，
 * 支援兩階段「投籃節奏」開火編排：
 *   1. `prepareFireTrajectory`: 進入 FIRING 階段並回傳確定性軌跡，供 Phaser 播放 1.8~3.2s 砲彈飛行與尾焰特效。
 *   2. `commitFireImpact`: 砲彈實際飛抵落點瞬間，才執行挖坑、扣血、坦克下墜（含摔落/墜入深淵傷害）。
 *   3. `finalizeTurnAfterHold`: 爆炸停留結束後才切換回合與風向。
 */
import type { BulletType, FireActionCommand, PlayerId } from '@/shared/kernel/types'
import {
  DEFAULT_WORLD_HEIGHT,
  DEFAULT_WORLD_WIDTH,
  DeterministicTankCore,
  type DirtyRect,
  type TankCorePort,
  type TrajectoryHit,
} from '@/shared/wasm'
import {
  advanceTurn,
  applyDamageAndCheckWinner,
  fallDamageFor,
  findSpawnGround,
  groundUnderTank,
  launchVelocity,
  MUZZLE_RISE,
  slopeAt,
  TANK_GROUND_OFFSET,
  syncTankToSurface,
  walkAlongTerrain,
  type BattleState,
} from '../domain/battleState'
import { MAP_REGISTRY } from '../domain/mapRegistry'
import { nextWindSpeed } from '../domain/windRules'
import { PROJECTILE_REGISTRY } from '../domain/projectileRegistry'
import { TANK_REGISTRY } from '../domain/tankRegistry'

let defaultCore: TankCorePort | null = null

function getDefaultCore(seed: number): TankCorePort {
  if (!defaultCore) {
    defaultCore = new DeterministicTankCore(DEFAULT_WORLD_WIDTH, DEFAULT_WORLD_HEIGHT, seed)
  }
  return defaultCore
}

export interface PreparedShotPlan {
  readonly cmd: FireActionCommand
  readonly hit: TrajectoryHit
  /** 傷害範圍 (px)：決定誰會受傷、傷害衰減 */
  readonly damageRadius: number
  /** 挖坑半徑 (px)：決定地形被破壞多大 */
  readonly terrainRadius: number
  readonly maxDamage: number
  readonly bulletType: BulletType
}

export interface ImpactResult {
  readonly dirty: DirtyRect | null
  /** 本次命中造成的總傷害（爆炸 + 摔落 + 墜入深淵），供畫面跳出傷害數字 */
  readonly damageByPlayer: Record<PlayerId, number>
}

export function syncAllTanksToTerrain(state: BattleState, core: TankCorePort): void {
  for (const tank of Object.values(state.tanks)) {
    const spawn = findSpawnGround(core, tank.x)
    tank.x = spawn.x
    syncTankToSurface(tank, spawn.groundY, slopeAt(core, spawn.x, spawn.groundY))
  }
}

/**
 * 第一階段：計算確定性彈道並將狀態切為 'FIRING'，此時尚未挖坑或扣血（等待砲彈飛抵目標）
 */
export function prepareFireTrajectory(
  state: BattleState,
  cmd: FireActionCommand,
  core?: TankCorePort,
): PreparedShotPlan | null {
  if (
    state.phase === 'GAME_OVER' ||
    cmd.playerId !== state.activePlayer ||
    cmd.turnId !== state.turnId
  ) {
    return null
  }
  const engine = core ?? getDefaultCore(state.seed)
  const shooter = state.tanks[cmd.playerId]
  if (!shooter || shooter.hp <= 0) return null

  shooter.angle = cmd.angle
  shooter.power = cmd.power
  state.phase = 'FIRING'

  const shooterSpec = TANK_REGISTRY[shooter.tankId] ?? TANK_REGISTRY.aegis
  // 只接受這台坦克的專屬砲彈，其餘一律退回預設彈（兩端確定性一致）
  const bulletType = shooterSpec.shots.includes(cmd.bulletType) ? cmd.bulletType : shooterSpec.shots[0]
  const projSpec = PROJECTILE_REGISTRY[bulletType]

  const { vxMilli, vyMilli } = launchVelocity(cmd.angle, cmd.power, projSpec.speedMultiplier)

  let hit = engine.simulateShot({
    startX: shooter.x,
    startY: shooter.y - MUZZLE_RISE,
    vxMilli,
    vyMilli,
    windMilli: cmd.wind * projSpec.windMultiplier,
    gravityMilli: projSpec.gravityMilli,
    maxSteps: 1200,
  })

  const aliveOthers = Object.values(state.tanks).filter(
    (t) => t.id !== shooter.id && t.hp > 0,
  )
  const tankRadiusSq = 22 * 22

  for (let i = 0; i < hit.path.length; i++) {
    const pt = hit.path[i]
    const hitTankEntity = aliveOthers.find((t) => {
      const dx = pt.x - t.x
      const dy = pt.y - (t.y - 10)
      return dx * dx + dy * dy <= tankRadiusSq
    })
    if (hitTankEntity) {
      hit = {
        hitX: pt.x,
        hitY: pt.y,
        impactedTerrain: false,
        hitTank: true,
        stepsTaken: Math.max(1, i * 2),
        path: hit.path.slice(0, i + 1),
      }
      break
    }
  }

  state.lastShotPath = hit.path.map((pt) => ({ x: pt.x, y: pt.y }))

  const damageRadius = projSpec.damageRadius + shooterSpec.damageRadiusBonus
  const terrainRadius = projSpec.terrainRadius + shooterSpec.terrainRadiusBonus
  const maxDamage = Math.round(projSpec.maxDamage * shooterSpec.damageMultiplier)

  return {
    cmd,
    hit,
    damageRadius,
    terrainRadius,
    maxDamage,
    bulletType,
  }
}

/**
 * 第二階段：當砲彈飛行結束、命中目標瞬間呼叫，執行地形挖洞、坦克扣血與下墜貼地。
 * 地形被挖空後坦克會下墜：落差超過安全高度扣摔落傷害，墜出地圖底部（深淵）直接陣亡。
 */
export function commitFireImpact(
  state: BattleState,
  plan: PreparedShotPlan,
  core?: TankCorePort,
): ImpactResult {
  const engine = core ?? getDefaultCore(state.seed)
  const { hit, damageRadius, terrainRadius, maxDamage } = plan
  const damageByPlayer: Record<PlayerId, number> = {}
  let dirty: DirtyRect | null = null

  if (hit.impactedTerrain || hit.hitTank) {
    dirty = engine.carveCircle(hit.hitX, hit.hitY, terrainRadius)

    for (const tank of Object.values(state.tanks)) {
      if (tank.hp <= 0) continue
      damageByPlayer[tank.id] = engine.computeExplosionDamage(
        hit.hitX,
        hit.hitY,
        tank.x,
        tank.y,
        damageRadius,
        maxDamage,
      )
    }

    state.lastExplosion = {
      x: hit.hitX,
      y: hit.hitY,
      radius: Math.max(damageRadius, terrainRadius),
      timestamp: Date.now(),
    }
  }

  for (const tank of Object.values(state.tanks)) {
    const beforeY = tank.y
    const surfaceY = groundUnderTank(engine, tank)
    syncTankToSurface(tank, surfaceY, slopeAt(engine, tank.x, surfaceY))
    if (tank.hp <= 0) continue
    const extra = surfaceY >= engine.height ? tank.maxHp : fallDamageFor(tank.y - beforeY)
    if (extra > 0) {
      damageByPlayer[tank.id] = (damageByPlayer[tank.id] ?? 0) + extra
    }
  }

  applyDamageAndCheckWinner(state, damageByPlayer)
  return { dirty, damageByPlayer }
}

/**
 * 第三階段：爆炸停留觀察結束後，推進至下一位玩家回合
 */
export function finalizeTurnAfterHold(state: BattleState): void {
  const maxWind = (MAP_REGISTRY[state.mapId] ?? MAP_REGISTRY.harvest_plains).maxWind
  const nextWind = nextWindSpeed({
    seed: state.seed,
    nextTurnId: state.turnId + 1,
    currentWind: state.wind,
    maxWind,
    playerCount: state.turnOrder.length,
  })
  advanceTurn(state, nextWind)
}

/**
 * 同步單步執行（保留供無動畫純邏輯測試使用）
 */
export function executeFireAction(
  state: BattleState,
  cmd: FireActionCommand,
  core?: TankCorePort,
): void {
  const plan = prepareFireTrajectory(state, cmd, core)
  if (!plan) return
  commitFireImpact(state, plan, core)
  finalizeTurnAfterHold(state)
}

function isGameOver(state: BattleState): boolean {
  return state.phase === 'GAME_OVER'
}

export function moveActiveTank(
  state: BattleState,
  deltaX: number,
  core?: TankCorePort,
): boolean {
  if (state.phase !== 'AIMING') {
    return false
  }
  const tank = state.tanks[state.activePlayer]
  if (!tank || tank.hp <= 0 || tank.moveFuel <= 0 || deltaX === 0) {
    return false
  }

  const engine = core ?? getDefaultCore(state.seed)
  const fuelCost = Math.min(tank.moveFuel, Math.abs(deltaX))
  const dest = walkAlongTerrain(engine, tank.x, groundUnderTank(engine, tank), Math.sign(deltaX) * fuelCost, true)
  const moved = Math.abs(dest.x - tank.x)
  if (moved === 0) return false

  tank.x = dest.x
  tank.moveFuel = Math.max(0, tank.moveFuel - moved)
  if (dest.fell) {
    // 踏出邊緣：車身往下掉（深淵時一路掉出地圖底部），摔落直接陣亡
    tank.y = dest.groundY >= engine.height ? engine.height + 60 : dest.groundY - TANK_GROUND_OFFSET
    tank.slopeDeg = 0
    applyDamageAndCheckWinner(state, { [tank.id]: tank.hp })
    // 出手的坦克死了，直接換下一位（整場結束則維持 GAME_OVER）
    if (!isGameOver(state)) finalizeTurnAfterHold(state)
  } else {
    syncTankToSurface(tank, dest.groundY, slopeAt(engine, dest.x, dest.groundY))
  }
  return true
}
