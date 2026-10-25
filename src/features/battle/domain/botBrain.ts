/**
 * Bot Brain (電腦對手 AI)：純函數，暴力搜尋仰角 × 力道組合，挑選落點最接近敵方坦克的射擊，
 * 再依難度加入人性化誤差。只負責「決定」射擊參數，實際開火仍走一般的 FireActionCommand 流程，
 * 因此與玩家共用同一套確定性彈道與投籃節奏演出。
 */
import type { BotLevel, BulletType, PlayerId } from '@/shared/kernel/types'
import type { TankCorePort, TrajectoryHit } from '@/shared/wasm'
import {
  chargesOf,
  groundUnderTank,
  launchVelocity,
  MUZZLE_RISE,
  quantizePower,
  TANK_GROUND_OFFSET,
  walkAlongTerrain,
  type BattleState,
  type TankEntity,
} from './battleState'
import { PROJECTILE_REGISTRY } from './projectileRegistry'
import { availableShots } from './loadout'
import { traceShell } from './shellFlight'
import { clampAim, effectiveWindMilli, getTankSpec } from './tankRegistry'

export interface BotShotPlan {
  readonly targetId: PlayerId
  readonly angle: number
  readonly power: number
  readonly bulletType: BulletType
  /** 預估落點與目標的距離 (px)；>= BLOCKED_SCORE 代表只能炸到自己附近（被地形擋住） */
  readonly score: number
}

const BLOCKED_SCORE = 1000
/** 最佳落點離目標超過這個距離 (px) 就視為「這種砲彈打不到」，改試其他砲彈（遠方目標 vs 短射程砲彈、被地形擋住） */
const UNREACHABLE_PX = 80
/** 移動後預估誤差至少要改善這麼多才值得花燃料 */
const MOVE_GAIN_PX = 25

/**
 * 各難度的瞄準誤差：力道 ±power、仰角 ±angle（均勻分布）。
 * perfect 不加誤差並以 1° / 1 力道細搜，百發百中；其餘等級誤差越大越常落空。
 */
export const BOT_LEVEL_SPECS: Record<BotLevel, { readonly label: string; readonly power: number; readonly angle: number; readonly refine: boolean; readonly repositions: boolean }> = {
  rookie: { label: '新手', power: 30, angle: 16, refine: false, repositions: false },
  weak: { label: '弱', power: 14, angle: 8, refine: false, repositions: true },
  normal: { label: '中等', power: 6, angle: 4, refine: false, repositions: true },
  hard: { label: '強', power: 3, angle: 2, refine: false, repositions: true },
  perfect: { label: '變態', power: 0, angle: 0, refine: true, repositions: true },
}
const TANK_HIT_RADIUS = 22

function pickTarget(state: BattleState, bot: TankEntity): TankEntity | null {
  const enemies = Object.values(state.tanks).filter((t) => t.team !== bot.team && t.hp > 0)
  if (enemies.length === 0) return null
  // 偏好殘血且距離近的目標
  return enemies.reduce((best, t) => {
    const score = Math.abs(t.x - bot.x) + t.hp * 6
    const bestScore = Math.abs(best.x - bot.x) + best.hp * 6
    return score < bestScore ? t : best
  })
}

/** 殘血門檻：目標血量不高於此值時，電腦改用單發傷害最高的砲彈補刀 */
const FINISHER_HP = 40

/** 電腦只用會造成傷害的砲彈（築壘、偵察這類輔助彈留給玩家）；全都沒有傷害時退回所有可用砲彈 */
function damagingShots(bot: TankEntity): readonly BulletType[] {
  const all = availableShots(bot)
  const damaging = all.filter((id) => (PROJECTILE_REGISTRY[id]?.maxDamage ?? 0) > 0)
  return damaging.length > 0 ? damaging : all
}

function pickBullet(bot: TankEntity, target: TankEntity, random: () => number): BulletType {
  const shots = damagingShots(bot)
  // 目標殘血時優先用單發傷害最高的砲彈（不指定特定彈種）；否則在可用砲彈中隨機
  if (target.hp <= FINISHER_HP) {
    return shots.reduce((best, id) => (PROJECTILE_REGISTRY[id].maxDamage > PROJECTILE_REGISTRY[best].maxDamage ? id : best))
  }
  // 第一種（預設彈）55%，其餘平分剩下的 45%；只抽一次亂數，兩種彈時與舊版序列完全相同
  const u = random()
  if (u < 0.55 || shots.length === 1) return shots[0]
  return shots[1 + Math.min(shots.length - 2, Math.floor(((u - 0.55) / 0.45) * (shots.length - 1)))]
}

export function planBotShot(
  state: BattleState,
  core: TankCorePort,
  botId: PlayerId,
  random: () => number = Math.random,
): BotShotPlan | null {
  const bot = state.tanks[botId]
  if (!bot || bot.hp <= 0) return null
  const target = pickTarget(state, bot)
  if (!target) return null

  const level = BOT_LEVEL_SPECS[bot.botLevel ?? 'hard']
  const botSpec = getTankSpec(bot.tankId)
  const facingRight = target.x >= bot.x

  type Aim = { angle: number; power: number; score: number }
  /** 用指定砲彈暴力搜尋最佳（仰角, 力道）；不用亂數，所以可以多試幾種砲彈而不影響亂數序列 */
  const searchAim = (bulletType: BulletType): Aim | null => {
    const proj = PROJECTILE_REGISTRY[bulletType]
    // 避免炸到自己只需要看傷害範圍
    const blast = proj.damageRadius + botSpec.damageRadiusBonus
    const found: { best: Aim | null } = { best: null }
    // 彈道經過目標就算打中（截斷路徑），與開火結算一樣走 traceShell，跳彈 / 高拋 / 碎裂都算得準
    const targetY = target.y - 10
    const throughTarget = (hit: TrajectoryHit): TrajectoryHit => {
      const i = hit.path.findIndex((p) => (p.x - target.x) ** 2 + (p.y - targetY) ** 2 <= TANK_HIT_RADIUS * TANK_HIT_RADIUS)
      return i < 0 ? hit : { ...hit, hitX: hit.path[i].x, hitY: hit.path[i].y, hitTank: true, impactedTerrain: false, path: hit.path.slice(0, i + 1) }
    }
    const consider = (angle: number, power: number): void => {
      const { vxMilli, vyMilli } = launchVelocity(angle, power, proj.speedMultiplier)
      const traced = traceShell(
        core,
        {
          startX: bot.x,
          startY: bot.y - MUZZLE_RISE,
          vxMilli,
          vyMilli,
          windMilli: effectiveWindMilli(state.wind, proj.windMultiplier, getTankSpec(bot.tankId)),
          gravityMilli: proj.gravityMilli,
          maxSteps: 1200,
        },
        proj.flight,
        throughTarget,
      )
      // 碎裂彈取最接近目標的那一片
      let hit: TrajectoryHit | null = null
      let best = Infinity
      for (const t of traced) {
        if (!t.hit.hitTank && !t.hit.impactedTerrain) continue
        const d = (t.hit.hitX - target.x) ** 2 + (t.hit.hitY - target.y) ** 2
        if (d < best) {
          best = d
          hit = t.hit
        }
      }
      if (!hit) return
      let score = Math.sqrt(best)
      // 避免炸到自己
      const sx = hit.hitX - bot.x
      const sy = hit.hitY - bot.y
      if (sx * sx + sy * sy < (blast + 20) * (blast + 20)) score += BLOCKED_SCORE
      // 同分時偏好較低力道（彈道較穩定、受風影響小）
      score += power * 0.01
      if (!found.best || score < found.best.score) found.best = { angle, power, score }
    }
    // 只搜尋這台車打得出去的仰角（世界仰角 = 相對仰角 - 坡度的方向；粗搜以相對仰角為準）
    for (let elev = Math.max(20, botSpec.aimMinDeg); elev <= Math.min(84, botSpec.aimMaxDeg); elev += 4) {
      for (let power = 18; power <= 100; power += 2) consider(facingRight ? elev : 180 - elev, power)
    }
    if (found.best && level.refine) {
      // 粗搜格點解析度有限；變態等級在最佳解附近細化：角度 1°（人類最小單位），力道 ±1 以 0.01 為步長
      const { angle: a0, power: p0 } = found.best
      for (let da = -4; da <= 4; da++) {
        for (let dp = -100; dp <= 100; dp++) {
          const power = quantizePower(p0 + dp * 0.01)
          if (power >= 10 && power <= 100) consider(a0 + da, power)
        }
      }
    }
    return found.best
  }

  const bulletType = pickBullet(bot, target, random)
  let chosen = bulletType
  let aim = searchAim(bulletType)
  // 抽到的砲彈打不到（例如射程短的鉗擊彈遇到遠方目標）就改試其他會造成傷害的砲彈，取落點最接近目標的
  if (!aim || aim.score > UNREACHABLE_PX) {
    for (const id of damagingShots(bot)) {
      if (id === bulletType) continue
      const alt = searchAim(id)
      if (alt && (!aim || alt.score < aim.score)) {
        aim = alt
        chosen = id
      }
    }
  }
  if (!aim) return null

  const jitter = (range: number) => Math.round((random() * 2 - 1) * range)
  return {
    targetId: target.id,
    // 搜尋用的是世界角度；換回相對車體的砲管角（車體傾斜時兩者不同）
    angle: clampAim(botSpec, aim.angle + bot.slopeDeg + jitter(level.angle)),
    power: quantizePower(Math.max(10, Math.min(100, aim.power + jitter(level.power)))),
    bulletType: chosen,
    score: aim.score,
  }
}

/** 定時彈引爆前要退到爆炸半徑外多遠 (px) 才算安全 */
const CHARGE_SAFE_MARGIN_PX = 14

/**
 * 站在場上定時彈（`fuse`）的爆炸範圍內時，朝離它最遠的方向逃出範圍。
 * 走得出去就回傳要移動的 deltaX；沒有威脅回傳 null（交給一般走位）；有威脅但燃料不夠走出範圍，仍盡力往外走。
 */
function planFleeFromCharges(state: BattleState, core: TankCorePort, bot: TankEntity): number | null {
  const threats = chargesOf(state).filter((c) => Math.abs(c.x - bot.x) < c.damageRadius + CHARGE_SAFE_MARGIN_PX)
  if (threats.length === 0) return null
  // 往威脅較少的一側走：兩側各算一次需要走多遠才能離開所有威脅，選走得出去且最近的
  const need = (dir: 1 | -1): number =>
    Math.max(...threats.map((c) => c.x + dir * (c.damageRadius + CHARGE_SAFE_MARGIN_PX) - bot.x).map((d) => Math.max(0, dir * d)))
  const originGround = groundUnderTank(core, bot)
  let best: { dx: number; clear: boolean } | null = null
  for (const dir of [1, -1] as const) {
    const want = Math.min(bot.moveFuel, Math.ceil(need(dir)))
    const dest = walkAlongTerrain(core, bot.x, originGround, dir * want, false, getTankSpec(bot.tankId).climbPerPx)
    const dx = dest.x - bot.x
    const clear = threats.every((c) => Math.abs(dest.x - c.x) >= c.damageRadius + 2)
    if (dx === 0) continue
    if (!best || (clear && !best.clear) || (clear === best.clear && Math.abs(dx) < Math.abs(best.dx))) best = { dx, clear }
  }
  return best ? best.dx : null
}

/**
 * 決定這回合要不要先移動：在燃料範圍內試算幾個站位的最佳射擊，
 * 只有在原地被地形擋住、或換位置能明顯提高命中率時才移動。回傳要移動的 deltaX（0 = 不動）。
 */
export function planBotMove(
  state: BattleState,
  core: TankCorePort,
  botId: PlayerId,
  random: () => number = Math.random,
): number {
  const bot = state.tanks[botId]
  if (!bot || bot.hp <= 0 || bot.moveFuel <= 0) return 0
  if (!BOT_LEVEL_SPECS[bot.botLevel ?? 'hard'].repositions) return 0
  const fuel = bot.moveFuel
  const flee = planFleeFromCharges(state, core, bot)
  if (flee !== null) return flee
  const origin = { x: bot.x, y: bot.y }
  const candidates = [0, -fuel, fuel, -Math.round(fuel / 2), Math.round(fuel / 2)]
  const originGround = groundUnderTank(core, bot)

  let bestDx = 0
  let bestScore = Infinity
  try {
    for (const dx of candidates) {
      // 實際模擬沿地形行走（會被陡壁擋住），避免把橋下或島上的位置當成可抵達
      const dest = walkAlongTerrain(core, origin.x, originGround, dx, false, getTankSpec(bot.tankId).climbPerPx)
      if (dx !== 0 && dest.x === origin.x) continue
      const x = dest.x
      bot.x = x
      bot.y = dest.groundY - TANK_GROUND_OFFSET
      const plan = planBotShot(state, core, botId, random)
      if (!plan) continue
      const score = plan.score + (dx === 0 ? 0 : MOVE_GAIN_PX)
      if (score < bestScore) {
        bestScore = score
        bestDx = x - origin.x
      }
    }
  } finally {
    bot.x = origin.x
    bot.y = origin.y
  }
  return bestDx
}
