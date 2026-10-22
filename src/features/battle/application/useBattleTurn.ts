/**
 * Battle Application Service: 接收玩家或網路傳來的 FireActionCommand，
 * 支援兩階段「投籃節奏」開火編排：
 *   1. `prepareFireTrajectory`: 進入 FIRING 階段並回傳確定性軌跡，供 Phaser 播放 1.8~3.2s 砲彈飛行與尾焰特效。
 *   2. `commitFireImpact`: 砲彈實際飛抵落點瞬間，才執行挖坑、扣血、坦克下墜（含摔落/墜入深淵傷害）。
 *   3. `finalizeTurnAfterHold`: 爆炸停留結束後才切換回合與風向。
 */
import type { BotLevel, BulletType, FireActionCommand, PassActionCommand, PlayerId } from '@/shared/kernel/types'
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
  worldAimAngle,
  type BattleState,
  type TankEntity,
} from '../domain/battleState'
import { defaultLoadout, verifyReveal } from '../domain/loadout'
import { MAP_REGISTRY } from '../domain/mapRegistry'
import { nextWindSpeed } from '../domain/windRules'
import { getProjectileSpec, PROJECTILE_REGISTRY, type ProjectileBlueprint } from '../domain/projectileRegistry'
import { traceShell, type TracedShell } from '../domain/shellFlight'
import { SINGLE_SHOT } from '../domain/shotExtensions'
import { applyStatus, mitigateForTank } from '../domain/statusEffects'
import { clampAim, effectiveWindMilli, getTankSpec, type TankBlueprint } from '../domain/tankRegistry'

let defaultCore: TankCorePort | null = null

function getDefaultCore(seed: number): TankCorePort {
  if (!defaultCore) {
    defaultCore = new DeterministicTankCore(DEFAULT_WORLD_WIDTH, DEFAULT_WORLD_HEIGHT, seed)
  }
  return defaultCore
}

/** 一顆彈丸的確定性彈道與它的單發傷害（已含機種傷害倍率與樣式的傷害比例） */
export interface PreparedShot {
  readonly hit: TrajectoryHit
  readonly maxDamage: number
}

export interface PreparedShotPlan {
  readonly cmd: FireActionCommand
  /** 一次開火的所有彈丸（單發 = 1 顆），依開火樣式 `pattern` 產生，結算順序即陣列順序 */
  readonly shots: readonly PreparedShot[]
  /** 傷害範圍 (px)：決定誰會受傷、傷害衰減 */
  readonly damageRadius: number
  /** 挖坑半徑 (px)：決定地形被破壞多大 */
  readonly terrainRadius: number
  readonly directHitMultiplier: number
  readonly bulletType: BulletType
}

/** 一次地形變化：供畫面重繪地形與連線重播紀錄（'carve' 挖坑、'fill' 堆土） */
export interface CarveEvent {
  readonly op: 'carve' | 'fill'
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly dirty: DirtyRect
}

export interface ImpactResult {
  /** 依彈丸順序的地形事件（沒有命中任何東西的彈丸不產生） */
  readonly carves: readonly CarveEvent[]
  /** 每顆彈丸實際的爆心（鑽地彈在地面下方），順序同 plan.shots；沒命中的為 null */
  readonly blasts: readonly ({ x: number; y: number } | null)[]
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
/** 砲彈吸附（放大判定）：吸附半徑與直擊倍率由各砲彈 blueprint 決定；此為坦克本體碰撞半徑與直擊判定半徑 */
export const TANK_HIT_RADIUS_PX = 22
/** 可命中範圍：砲彈飛過此圈就引爆（比車身大，免得像在瞄一個點）；越靠中心傷害越高 */
export const HIT_CAPTURE_RADIUS_PX = 36
/** 核心：約車身面積 1/4~1/5（π·10² ≈ π·22²/4.8），核心內吃滿傷害 */
export const HIT_CORE_RADIUS_PX = 10
/** 捕捉圈邊緣的傷害比例（核心 = 1，往外線性遞減到此值） */
export const HIT_EDGE_DAMAGE_RATIO = 0.4

/** 命中點離車心 dist 時的傷害比例：核心內 1，往捕捉圈邊緣線性降到 HIT_EDGE_DAMAGE_RATIO */
export function hitGradeRatio(dist: number): number {
  if (dist <= HIT_CORE_RADIUS_PX) return 1
  if (dist >= HIT_CAPTURE_RADIUS_PX) return HIT_EDGE_DAMAGE_RATIO
  const t = (dist - HIT_CORE_RADIUS_PX) / (HIT_CAPTURE_RADIUS_PX - HIT_CORE_RADIUS_PX)
  return 1 - t * (1 - HIT_EDGE_DAMAGE_RATIO)
}

/** 兩點間是否沒有地形遮擋（每 3px 取樣，略過終點附近 8px 以免誤判坦克所貼的地面） */
function hasClearLine(core: TankCorePort, x0: number, y0: number, x1: number, y1: number): boolean {
  const len = Math.hypot(x1 - x0, y1 - y0)
  for (let d = 0; d < len - 8; d += 3) {
    const r = d / len
    if (core.isSolid(Math.round(x0 + (x1 - x0) * r), Math.round(y0 + (y1 - y0) * r))) return false
  }
  return true
}

/**
 * 模擬一顆彈丸：依砲彈的飛行行為（跳彈、高拋、碎裂）追蹤彈道，每一段都套用坦克吸附
 * （飛行途中進入坦克吸附範圍且無遮擋，就在該點引爆；不彎折彈道）。碎裂彈會回傳多個彈體。
 */
function simulatePellet(
  engine: TankCorePort,
  shooter: TankEntity,
  shooterSpec: TankBlueprint,
  projSpec: ProjectileBlueprint,
  angle: number,
  power: number,
  wind: number,
  aliveOthers: readonly TankEntity[],
): TracedShell[] {
  const { vxMilli, vyMilli } = launchVelocity(angle, power, projSpec.speedMultiplier)
  const magnetRadius = Math.max(HIT_CAPTURE_RADIUS_PX, projSpec.magnetRadius)
  const magnetRadiusSq = magnetRadius * magnetRadius

  // 吸附力：不分敵我（友傷是刻意的技術風險），進入坦克本體碰撞半徑則一定命中
  const magnet = (hit: TrajectoryHit): TrajectoryHit => {
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
        // 不彎折彈道：砲彈沿原拋物線飛行，在判定範圍內取最接近車心的那一點引爆（越靠中心傷害越高）
        let best = i
        let bestSq = Infinity
        for (let j = i; j < hit.path.length; j++) {
          const q = hit.path[j]
          const d2 = (q.x - target.x) ** 2 + (q.y - (target.y - 10)) ** 2
          if (d2 > magnetRadiusSq) break
          if (d2 < bestSq) {
            bestSq = d2
            best = j
          }
        }
        const bp = hit.path[best]
        return {
          hitX: bp.x,
          hitY: bp.y,
          impactedTerrain: false,
          hitTank: true,
          stepsTaken: Math.max(1, best * 2),
          path: hit.path.slice(0, best + 1),
        }
      }
    }
    return hit
  }

  return traceShell(
    engine,
    {
      startX: shooter.x,
      startY: shooter.y - MUZZLE_RISE,
      vxMilli,
      vyMilli,
      windMilli: effectiveWindMilli(wind, projSpec.windMultiplier, shooterSpec),
      gravityMilli: projSpec.gravityMilli,
      maxSteps: 1200,
    },
    projSpec.flight,
    magnet,
  )
}

/**
 * 這次開火實際使用的砲彈（兩端確定性一致）：
 *  - 有承諾（連線真人）：必須附上通過驗證的揭露，否則回傳 null 拒絕開火；
 *  - 明牌配置（單機、電腦、被接手）：不在配置內就退回主彈；
 *  - 都沒有：只接受這台坦克的砲彈池，其餘退回預設彈。
 */
function resolveBullet(tank: TankEntity, spec: TankBlueprint, cmd: FireActionCommand): BulletType | null {
  if (tank.loadoutRoot) {
    const inPool = spec.shots.includes(cmd.bulletType)
    return inPool && verifyReveal(tank.tankId, tank.loadoutRoot, cmd.bulletType, cmd.reveal) ? cmd.bulletType : null
  }
  const allowed = tank.loadout ?? spec.shots
  return allowed.includes(cmd.bulletType) ? cmd.bulletType : allowed[0]
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

  const shooterSpec = getTankSpec(shooter.tankId)
  const bulletType = resolveBullet(shooter, shooterSpec, cmd)
  // 彈藥承諾驗證失敗（偽造或偷換）：兩端都拒絕這次開火，狀態維持不動
  if (!bulletType) return null

  // 仰角範圍由機種決定：超出範圍（外掛或舊資料）一律夾回，兩端結算一致
  const aimAngle = clampAim(shooterSpec, cmd.angle)
  shooter.angle = aimAngle
  shooter.power = cmd.power
  state.phase = 'FIRING'

  const projSpec = PROJECTILE_REGISTRY[bulletType]

  const aliveOthers = Object.values(state.tanks).filter((t) => t.id !== shooter.id && t.hp > 0)
  const pellets = (projSpec.pattern ?? SINGLE_SHOT)({ state, shooter, projectile: projSpec, cmd })
  const baseDamage = Math.round(projSpec.maxDamage * shooterSpec.damageMultiplier)
  const shots: PreparedShot[] = pellets.flatMap((pellet) =>
    simulatePellet(
      engine,
      shooter,
      shooterSpec,
      projSpec,
      worldAimAngle(aimAngle, shooter.slopeDeg) + pellet.angleDelta,
      cmd.power + pellet.powerDelta,
      cmd.wind,
      aliveOthers,
    ).map(({ hit, damageScale }) => ({ hit, maxDamage: Math.round(baseDamage * pellet.damageScale * damageScale) })),
  )

  state.lastShotPath = shots[0].hit.path.map((pt) => ({ x: pt.x, y: pt.y }))

  return {
    cmd,
    shots,
    damageRadius: projSpec.damageRadius + shooterSpec.damageRadiusBonus,
    terrainRadius: projSpec.terrainRadius + shooterSpec.terrainRadiusBonus,
    directHitMultiplier: projSpec.directHitMultiplier,
    bulletType,
  }
}

/** 擊退：沿地形把坦克往遠離爆心的方向推（可能被推下懸崖；落差由之後的下墜結算處理） */
function knockBack(engine: TankCorePort, tank: TankEntity, ex: number, push: number): void {
  if (push <= 0) return
  const dir = tank.x === ex ? 1 : Math.sign(tank.x - ex)
  const dest = walkAlongTerrain(engine, tank.x, groundUnderTank(engine, tank), dir * push, true, getTankSpec(tank.tankId).climbPerPx)
  tank.x = dest.x
}

/** 堆土蓋住坦克時把它抬到新地表上（不把人活埋，避免硬控） */
function liftOutOfTerrain(engine: TankCorePort, tank: TankEntity): void {
  if (!engine.isSolid(tank.x, tank.y)) return
  let ground = tank.y + TANK_GROUND_OFFSET
  while (ground > 0 && engine.isSolid(tank.x, ground - 1)) ground--
  syncTankToSurface(tank, ground, slopeAt(engine, tank.x, ground))
}

/**
 * 第二階段：當砲彈飛行結束、命中目標瞬間呼叫，執行地形挖洞（或堆土）、坦克扣血、擊退、掛狀態與下墜貼地。
 * 地形被挖空後坦克會下墜：落差超過安全高度扣摔落傷害，墜出地圖底部（深淵）直接陣亡。
 */
export function commitFireImpact(
  state: BattleState,
  plan: PreparedShotPlan,
  core?: TankCorePort,
): ImpactResult {
  const engine = core ?? getDefaultCore(state.seed)
  const { shots, damageRadius, terrainRadius, directHitMultiplier } = plan
  const proj = getProjectileSpec(plan.bulletType)
  const depth = proj.terrainDepth ?? 0
  const damageByPlayer: Record<PlayerId, number> = {}
  const blastByPlayer: Record<PlayerId, number> = {}
  const carves: CarveEvent[] = []
  const blasts: ({ x: number; y: number } | null)[] = []
  const hitTanks = new Set<PlayerId>()

  // 依序結算每顆彈丸；各自經過裝甲 / 抗性 / 狀態後再加總
  for (const { hit, maxDamage } of shots) {
    if (!hit.impactedTerrain && !hit.hitTank) {
      blasts.push(null)
      continue
    }
    // 鑽地彈：打在地面上時往下鑽 depth 再爆（直接命中坦克則在原地爆）
    const ex = hit.hitX
    const ey = hit.hitTank ? hit.hitY : Math.min(engine.height - 1, hit.hitY + depth)
    blasts.push({ x: ex, y: ey })
    if (terrainRadius > 0) {
      const op = proj.terrainOp === 'fill' ? 'fill' : 'carve'
      const dirty = op === 'fill' ? engine.fillCircle(ex, ey, terrainRadius) : engine.carveCircle(ex, ey, terrainRadius)
      carves.push({ op, x: ex, y: ey, radius: terrainRadius, dirty })
    }

    for (const tank of Object.values(state.tanks)) {
      if (tank.hp <= 0) continue
      const spec = getTankSpec(tank.tankId)
      if (maxDamage > 0) {
        const base = engine.computeExplosionDamage(ex, ey, tank.x, tank.y, damageRadius, maxDamage)
        const centerDist = Math.hypot(ex - tank.x, ey - (tank.y - 10))
        const inCapture = hit.hitTank && centerDist <= Math.max(HIT_CAPTURE_RADIUS_PX, proj.magnetRadius)
        // 命中（爆心落在可命中範圍內）：核心吃滿傷害，往外遞減；不低於一般爆炸衰減
        const graded = inCapture ? Math.round(maxDamage * directHitMultiplier * hitGradeRatio(centerDist)) : 0
        const raw = Math.max(base, graded)
        const dmg = mitigateForTank(tank, spec, 'explosion', raw)
        if (dmg > 0) {
          blastByPlayer[tank.id] = (blastByPlayer[tank.id] ?? 0) + dmg
          hitTanks.add(tank.id)
        }
      }
      if (proj.knockbackPx && damageRadius > 0) {
        const d = Math.hypot(tank.x - ex, tank.y - 10 - ey)
        if (d < damageRadius) knockBack(engine, tank, ex, Math.round((proj.knockbackPx * (damageRadius - d)) / damageRadius))
      }
    }

    state.lastExplosion = {
      x: ex,
      y: ey,
      radius: Math.max(damageRadius, terrainRadius),
      timestamp: Date.now(),
    }
  }

  for (const [id, dmg] of Object.entries(blastByPlayer)) {
    damageByPlayer[id] = proj.damageCapPerTank ? Math.min(proj.damageCapPerTank, dmg) : dmg
  }

  if (proj.terrainOp === 'fill') {
    for (const tank of Object.values(state.tanks)) liftOutOfTerrain(engine, tank)
  }

  for (const tank of Object.values(state.tanks)) {
    const beforeY = tank.y
    const surfaceY = groundUnderTank(engine, tank)
    syncTankToSurface(tank, surfaceY, slopeAt(engine, tank.x, surfaceY))
    if (tank.hp <= 0) continue
    const spec = getTankSpec(tank.tankId)
    let extra = 0
    if (surfaceY >= engine.height) {
      // 墜入深淵：無視護盾與抗性直接陣亡
      tank.shield = 0
      extra = tank.maxHp
    } else {
      extra = mitigateForTank(tank, spec, 'fall', fallDamageFor(tank.y - beforeY, spec.fallSafePx))
    }
    if (extra > 0) {
      damageByPlayer[tank.id] = (damageByPlayer[tank.id] ?? 0) + extra
    }
  }

  applyDamageAndCheckWinner(state, damageByPlayer)

  // 狀態在扣血之後才掛上（破甲不影響本次命中）；已陣亡的不掛
  if (proj.onHit) {
    for (const id of hitTanks) if (state.tanks[id].hp > 0) applyStatus(state.tanks[id], proj.onHit)
  }
  const shooter = state.tanks[plan.cmd.playerId]
  if (proj.selfEffect && shooter && shooter.hp > 0) applyStatus(shooter, proj.selfEffect)

  return { carves, blasts, damageByPlayer }
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

/**
 * 執行跳過回合動作（主動 PASS 或倒數計時超時）
 */
export function executePassAction(
  state: BattleState,
  cmd: PassActionCommand,
): boolean {
  if (state.phase !== 'AIMING' || isGameOver(state)) return false
  if (cmd.turnId !== state.turnId || cmd.playerId !== state.activePlayer) return false
  finalizeTurnAfterHold(state)
  return true
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
  const climbPerPx = getTankSpec(tank.tankId).climbPerPx
  const dest = walkAlongTerrain(engine, tank.x, groundUnderTank(engine, tank), Math.sign(deltaX) * fuelCost, true, climbPerPx)
  const moved = Math.abs(dest.x - tank.x)
  if (moved === 0) return false

  tank.x = dest.x
  tank.moveFuel = Math.max(0, tank.moveFuel - moved)
  tank.movedThisTurn = true
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
    const spec = getTankSpec(tank.tankId)
    syncTankToSurface(tank, dest.groundY, slopeAt(engine, dest.x, dest.groundY))
    const dmg = mitigateForTank(tank, spec, 'fall', fallDamageFor(dest.dropPx ?? 0, spec.fallSafePx))
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

/**
 * 玩家中途離線、房間設定為「電腦接手」：該坦克改由電腦操控（難度預設中等），其餘規則不變。
 * 實際的瞄準 / 開火由房主端的 AI 算出後以一般動作訊息廣播，所以各端只需切換旗標。
 */
export function takeOverWithBot(state: BattleState, id: PlayerId, level: BotLevel = 'normal'): boolean {
  const tank = state.tanks[id]
  if (!tank || tank.hp <= 0 || state.phase === 'GAME_OVER' || tank.isBot) return false
  tank.isBot = true
  tank.botLevel = level
  // 接手的電腦沒有真人的承諾原文，改用預設的明牌配置（PLAYER_LEFT 兩端都會執行，結果一致）
  if (tank.loadoutRoot) {
    delete tank.loadoutRoot
    tank.loadout = defaultLoadout(tank.tankId)
  }
  if (!tank.name.startsWith('🤖')) tank.name = `🤖 ${tank.name}`
  return true
}
