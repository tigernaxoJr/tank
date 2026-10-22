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
  syncTankToSurface,
  walkAlongTerrain,
  type BattleState,
} from '../domain/battleState'
import { MAP_REGISTRY } from '../domain/mapRegistry'
import { nextWindSpeed } from '../domain/windRules'
import { PROJECTILE_REGISTRY } from '../domain/projectileRegistry'
import { TANK_REGISTRY, effectiveWindMilli, mitigateDamage } from '../domain/tankRegistry'

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
  readonly directHitMultiplier: number
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
/** 砲彈吸附：吸附半徑與直擊倍率由各砲彈 blueprint 決定；此為坦克本體碰撞半徑與吸附彎折步數 */
const TANK_HIT_RADIUS_PX = 22
const MAGNET_PULL_STEPS = 6

/** 兩點間是否沒有地形遮擋（每 3px 取樣，略過終點附近 8px 以免誤判坦克所貼的地面） */
function hasClearLine(core: TankCorePort, x0: number, y0: number, x1: number, y1: number): boolean {
  const len = Math.hypot(x1 - x0, y1 - y0)
  for (let d = 0; d < len - 8; d += 3) {
    const r = d / len
    if (core.isSolid(Math.round(x0 + (x1 - x0) * r), Math.round(y0 + (y1 - y0) * r))) return false
  }
  return true
}

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
    windMilli: effectiveWindMilli(cmd.wind, projSpec.windMultiplier, shooterSpec),
    gravityMilli: projSpec.gravityMilli,
    maxSteps: 1200,
  })

  const aliveOthers = Object.values(state.tanks).filter(
    (t) => t.id !== shooter.id && t.hp > 0,
  )
  const magnetRadius = Math.max(TANK_HIT_RADIUS_PX, projSpec.magnetRadius)
  const magnetRadiusSq = magnetRadius * magnetRadius

  // 吸附力：砲彈飛行途中進入坦克（不分敵我，友傷是刻意的技術風險）吸附範圍且無地形遮擋，
  // 後段彈道向坦克中心彎曲並直接命中；進入坦克本體碰撞半徑則直接命中
  for (let i = 0; i < hit.path.length; i++) {
    const pt = hit.path[i]
    const target = aliveOthers.find((t) => {
      const dx = pt.x - t.x
      const dy = pt.y - (t.y - 10)
      const distSq = dx * dx + dy * dy
      if (distSq > magnetRadiusSq) return false
      return distSq <= TANK_HIT_RADIUS_PX * TANK_HIT_RADIUS_PX || hasClearLine(engine, pt.x, pt.y, t.x, t.y - 10)
    })
    if (target) {
      const tx = target.x
      const ty = target.y - 10
      const pull = Array.from({ length: MAGNET_PULL_STEPS }, (_, k) => {
        const r = (k + 1) / MAGNET_PULL_STEPS
        return { x: Math.round(pt.x + (tx - pt.x) * r), y: Math.round(pt.y + (ty - pt.y) * r) }
      })
      hit = {
        hitX: tx,
        hitY: ty,
        impactedTerrain: false,
        hitTank: true,
        stepsTaken: Math.max(1, i * 2),
        path: [...hit.path.slice(0, i + 1), ...pull],
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
    directHitMultiplier: projSpec.directHitMultiplier,
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
  const { hit, damageRadius, terrainRadius, maxDamage, directHitMultiplier } = plan
  const damageByPlayer: Record<PlayerId, number> = {}
  let dirty: DirtyRect | null = null

  if (hit.impactedTerrain || hit.hitTank) {
    dirty = engine.carveCircle(hit.hitX, hit.hitY, terrainRadius)

    for (const tank of Object.values(state.tanks)) {
      if (tank.hp <= 0) continue
      const base = engine.computeExplosionDamage(
        hit.hitX,
        hit.hitY,
        tank.x,
        tank.y,
        damageRadius,
        maxDamage,
      )
      const isDirect = hit.hitTank && Math.hypot(hit.hitX - tank.x, hit.hitY - (tank.y - 10)) <= 2
      // 直擊（爆心已吸附到車身中心）吃滿傷害，不吃 tank.y 與車身中心的 10px 衰減
      const raw = isDirect ? Math.round(maxDamage * directHitMultiplier) : base
      damageByPlayer[tank.id] = mitigateDamage(TANK_REGISTRY[tank.tankId] ?? TANK_REGISTRY.aegis, 'explosion', raw)
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
    const spec = TANK_REGISTRY[tank.tankId] ?? TANK_REGISTRY.aegis
    let extra = 0
    if (surfaceY >= engine.height) {
      // 墜入深淵：無視護盾與抗性直接陣亡
      tank.shield = 0
      extra = tank.maxHp
    } else {
      extra = mitigateDamage(spec, 'fall', fallDamageFor(tank.y - beforeY, spec.fallSafePx))
    }
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
  const climbPerPx = (TANK_REGISTRY[tank.tankId] ?? TANK_REGISTRY.aegis).climbPerPx
  const dest = walkAlongTerrain(engine, tank.x, groundUnderTank(engine, tank), Math.sign(deltaX) * fuelCost, true, climbPerPx)
  const moved = Math.abs(dest.x - tank.x)
  if (moved === 0) return false

  tank.x = dest.x
  tank.moveFuel = Math.max(0, tank.moveFuel - moved)
  if (dest.fell && dest.groundY >= engine.height) {
    // 踏出邊緣掉進深淵：車身一路掉出地圖底部，直接陣亡
    tank.y = engine.height + 60
    tank.slopeDeg = 0
    tank.shield = 0
    applyDamageAndCheckWinner(state, { [tank.id]: tank.hp })
    // 出手的坦克死了，直接換下一位（整場結束則維持 GAME_OVER）
    if (!isGameOver(state)) finalizeTurnAfterHold(state)
  } else if (dest.fell) {
    // 從高處（橋緣、台地邊）走下去：落在下層地面，依落差與機種抗性結算摔落傷害（與被炸下墜同一套規則）
    const spec = TANK_REGISTRY[tank.tankId] ?? TANK_REGISTRY.aegis
    syncTankToSurface(tank, dest.groundY, slopeAt(engine, dest.x, dest.groundY))
    const dmg = mitigateDamage(spec, 'fall', fallDamageFor(dest.dropPx ?? 0, spec.fallSafePx))
    if (dmg > 0) {
      applyDamageAndCheckWinner(state, { [tank.id]: dmg })
      if (tank.hp <= 0 && !isGameOver(state)) finalizeTurnAfterHold(state)
    }
  } else {
    syncTankToSurface(tank, dest.groundY, slopeAt(engine, dest.x, dest.groundY))
  }
  return true
}

/**
 * 玩家中途離線視為認輸：坦克陣亡並退出出手順序；若正輪到他且沒有砲彈在飛就直接換下一位
 * （砲彈在飛時由該回合結算自然推進，advanceTurn 會跳過陣亡者）。已陣亡 / 不存在 / 對局已結束回傳 false。
 */
export function forfeitPlayer(state: BattleState, id: PlayerId): boolean {
  const tank = state.tanks[id]
  if (!tank || tank.hp <= 0 || state.phase === 'GAME_OVER') return false
  tank.shield = 0
  const wasActive = state.activePlayer === id
  applyDamageAndCheckWinner(state, { [id]: tank.hp })
  if (wasActive && state.phase === 'AIMING') finalizeTurnAfterHold(state)
  return true
}
