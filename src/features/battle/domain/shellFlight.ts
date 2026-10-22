/**
 * 砲彈飛行追蹤：在確定性核心 `simulateShot` 之上加上 `FlightBehavior`（跳彈、高拋、碎裂）。
 * 開火結算（useBattleTurn）、電腦瞄準（botBrain）與瞄準預覽（BattleScene）都走這裡，三者的彈道才會一致。
 *
 * 每一段彈道都是一次 `simulateShot`；接續下一段時以「上一段最後一步的速度」從碰撞點（或前一個路徑點）重新發射，
 * 只用整數，P2P 兩端得到相同結果。`check` 讓呼叫端在每一段結束後截斷路徑（坦克吸附、電腦判定打中目標）。
 */
import type { TankCorePort, TrajectoryHit } from '@/shared/wasm'
import type { FlightBehavior } from './shotExtensions'

export interface ShellLaunch {
  readonly startX: number
  readonly startY: number
  readonly vxMilli: number
  readonly vyMilli: number
  readonly windMilli: number
  readonly gravityMilli: number
  readonly maxSteps: number
}

/** 一段彈道結束後的檢查：回傳原段或截斷後（命中坦克）的段 */
export type SegmentCheck = (segment: TrajectoryHit) => TrajectoryHit

/** 一顆最終引爆的彈體：完整路徑（含前面各段）與它的傷害比例 */
export interface TracedShell {
  readonly hit: TrajectoryHit
  readonly damageScale: number
}

const keep: SegmentCheck = (s) => s
/** 高拋彈連續穿地的接續上限（每次至少前進一步，牆再厚也會結束） */
const MAX_LOB_HOPS = 400

function join(a: TrajectoryHit, b: TrajectoryHit): TrajectoryHit {
  return {
    hitX: b.hitX,
    hitY: b.hitY,
    impactedTerrain: b.impactedTerrain,
    hitTank: b.hitTank,
    stepsTaken: a.stepsTaken + b.stepsTaken,
    path: [...a.path, ...b.path.slice(1)],
  }
}

/** 第 `steps` 步結束後的速度（simulateShot：位置 += 速度，速度 += 風 / 重力） */
function velocityAfter(launch: ShellLaunch, steps: number): { vx: number; vy: number } {
  return { vx: launch.vxMilli + launch.windMilli * steps, vy: launch.vyMilli + launch.gravityMilli * steps }
}

function relaunch(launch: ShellLaunch, x: number, y: number, vx: number, vy: number, usedSteps: number): ShellLaunch {
  return { ...launch, startX: x, startY: y, vxMilli: vx, vyMilli: vy, maxSteps: Math.max(1, launch.maxSteps - usedSteps) }
}

function simulate(engine: TankCorePort, l: ShellLaunch): TrajectoryHit {
  return engine.simulateShot({
    startX: l.startX,
    startY: l.startY,
    vxMilli: l.vxMilli,
    vyMilli: l.vyMilli,
    windMilli: l.windMilli,
    gravityMilli: l.gravityMilli,
    maxSteps: l.maxSteps,
  })
}

/** 找一個不在地形裡的接續點：從路徑倒數第二點往回找 */
function freePoint(engine: TankCorePort, path: readonly { x: number; y: number }[]): { x: number; y: number } {
  for (let i = path.length - 2; i >= 0; i--) {
    if (!engine.isSolid(path[i].x, path[i].y)) return path[i]
  }
  return path[0]
}

/**
 * 追蹤一次射擊：回傳最終要引爆的彈體（一般 1 顆；碎裂彈 = 每片冰錐各 1 顆）。
 * 沒有命中地形或坦克（飛出地圖）的彈體也會回傳，由呼叫端略過結算。
 */
export function traceShell(
  engine: TankCorePort,
  launch: ShellLaunch,
  flight?: FlightBehavior,
  check: SegmentCheck = keep,
): TracedShell[] {
  const first = traceSegments(engine, launch, check, flight?.kind === 'lob')
  if (!flight || flight.kind === 'lob' || first.hit.hitTank || !first.hit.impactedTerrain) {
    return [{ hit: first.hit, damageScale: 1 }]
  }

  const impact = velocityAfter(first.last, first.lastSteps - 1)
  if (flight.kind === 'bounce') {
    const from = freePoint(engine, first.hit.path)
    // 撞牆（水平方向被擋）反轉 vx，撞地板 / 天花板反轉 vy；角落兩者都反轉
    const wall = engine.isSolid(first.hit.hitX, from.y)
    const floor = engine.isSolid(from.x, first.hit.hitY)
    const k = flight.keepPermille
    const vx = Math.trunc(((wall ? -impact.vx : impact.vx) * k) / 1000)
    const vy = Math.trunc(((floor || !wall ? -impact.vy : impact.vy) * k) / 1000)
    const second = check(simulate(engine, relaunch(launch, from.x, from.y, vx, vy, first.hit.stepsTaken)))
    return [{ hit: join(first.hit, second), damageScale: 1 }]
  }

  // 碎裂：從碰撞點上方的空氣往射擊方向貼地飛出
  const dir = impact.vx < 0 ? -1 : 1
  let sy = first.hit.hitY - 3
  for (let i = 0; i < 24 && engine.isSolid(first.hit.hitX, sy); i++) sy -= 2
  return flight.angles.map((deg) => {
    const rad = (deg * Math.PI) / 180
    const vx = dir * Math.round(Math.cos(rad) * flight.speedMilli)
    const vy = -Math.round(Math.sin(rad) * flight.speedMilli)
    const shard = check(simulate(engine, relaunch(launch, first.hit.hitX, sy, vx, vy, first.hit.stepsTaken)))
    return { hit: join(first.hit, shard), damageScale: flight.damageScale }
  })
}

/**
 * 主彈道（含高拋的連續穿地），回傳完整路徑，以及最後一段的發射參數與步數（給跳彈 / 碎裂計算碰撞速度）。
 */
function traceSegments(
  engine: TankCorePort,
  launch: ShellLaunch,
  check: SegmentCheck,
  lob: boolean,
): { hit: TrajectoryHit; last: ShellLaunch; lastSteps: number } {
  let last = launch
  let seg = check(simulate(engine, last))
  let hit = seg
  for (let hop = 0; lob && hop < MAX_LOB_HOPS && seg.impactedTerrain && !seg.hitTank; hop++) {
    if (velocityAfter(last, seg.stepsTaken - 1).vy >= 0) break
    const v = velocityAfter(last, seg.stepsTaken)
    const next = relaunch(launch, seg.hitX, seg.hitY, v.vx, v.vy, hit.stepsTaken)
    if (next.maxSteps <= 1) break
    last = next
    seg = check(simulate(engine, last))
    hit = join(hit, seg)
  }
  return { hit, last, lastSteps: seg.stepsTaken }
}
