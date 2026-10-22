/**
 * Battle Slice (中大型複雜模組 - 完整 DDD 輕量分層)
 * 支援 1v1 ~ 5v5 (最多 10 台坦克) 與模組化 TankBlueprint / MapBlueprint 引擎
 */
import type { BotLevel, BulletType, MapPresetId, PlayerId, RosterSlot, TankArchetypeId, TeamId } from '@/shared/kernel/types'
import type { TankCorePort } from '@/shared/wasm'
import { sanitizeLoadout } from './loadout'
import { MAP_REGISTRY } from './mapRegistry'
import {
  applyStatus,
  expireStatusesAtTurnEnd,
  hasStatusFlag,
  mitigateForTank,
  tickStatusesAtTurnStart,
  type StatusInstance,
} from './statusEffects'
import { getTankSpec, tankAt } from './tankRegistry'

export type TurnPhase = 'AIMING' | 'FIRING' | 'GAME_OVER'

export interface TankEntity {
  readonly id: PlayerId
  name: string
  team: TeamId
  tankId: TankArchetypeId
  x: number
  y: number
  hp: number
  maxHp: number
  shield: number
  maxShield: number
  angle: number
  power: number
  slopeDeg: number
  moveFuel: number
  maxMoveFuel: number
  isBot: boolean
  botLevel: BotLevel
  /** 明牌的主彈、副彈（單機、電腦、被電腦接手後）；連線對戰的真人坦克為了迷霧不帶此欄位 */
  loadout?: BulletType[]
  /** 連線對戰的彈藥承諾（Merkle 根），開火時以 `reveal` 驗證，見 loadout.ts */
  loadoutRoot?: string
  /** 身上的回合制狀態（中毒、冰凍、破甲、紮根、偵察），規則見 statusEffects.ts */
  statuses: StatusInstance[]
  /** 本回合是否移動過（紮根被動用），回合開始時重設 */
  movedThisTurn: boolean
}

export interface BattleState {
  turnId: number
  activePlayer: PlayerId
  turnOrder: PlayerId[]
  wind: number
  seed: number
  mapId: MapPresetId
  tanks: Record<PlayerId, TankEntity>
  phase: TurnPhase
  winner: TeamId | 'draw' | null
  lastShotPath: { x: number; y: number }[]
  lastExplosion: { x: number; y: number; radius: number; timestamp: number } | null
  /** 最近一次換回合時，狀態造成的持續傷害（供畫面跳傷害數字）；換回合時重設 */
  lastStatusDamage: Record<PlayerId, number>
}

const DEFAULT_ROSTER: RosterSlot[] = [
  { id: 'p1', name: 'Player 1', team: 'A', tankId: tankAt(0), isHost: true },
  { id: 'p2', name: 'Player 2', team: 'B', tankId: tankAt(1), isHost: false },
]

export function buildInterleavedTurnOrder(roster: RosterSlot[]): PlayerId[] {
  const teamA = roster.filter((r) => r.team === 'A').map((r) => r.id)
  const teamB = roster.filter((r) => r.team === 'B').map((r) => r.id)
  const order: PlayerId[] = []
  const maxLen = Math.max(teamA.length, teamB.length)
  for (let i = 0; i < maxLen; i++) {
    if (i < teamA.length) order.push(teamA[i])
    if (i < teamB.length) order.push(teamB[i])
  }
  return order.length > 0 ? order : ['p1', 'p2']
}

/** 名單上的彈藥資訊：有承諾（連線真人）就只記根；否則明牌，電腦沒指定時帶預設 */
function loadoutFields(slot: RosterSlot): Pick<TankEntity, 'loadout' | 'loadoutRoot'> {
  if (slot.loadoutRoot) return { loadoutRoot: slot.loadoutRoot }
  if (slot.loadout || slot.isBot) return { loadout: sanitizeLoadout(slot.tankId, slot.loadout) }
  return {}
}

export function createInitialBattleState(
  seed = 1024,
  roster: RosterSlot[] = DEFAULT_ROSTER,
  mapId: MapPresetId = 'harvest_plains',
): BattleState {
  const mapSpec = MAP_REGISTRY[mapId] ?? MAP_REGISTRY.harvest_plains
  const arenaWidth = mapSpec.width
  const effectiveRoster = roster.length >= 2 ? roster : DEFAULT_ROSTER
  const teamASlots = effectiveRoster.filter((r) => r.team === 'A')
  const teamBSlots = effectiveRoster.filter((r) => r.team === 'B')

  const tanks: Record<PlayerId, TankEntity> = {}

  // Team A 部署於大型地圖左翼
  const leftMargin = 180
  const leftSpan = Math.floor(arenaWidth * 0.32)
  teamASlots.forEach((slot, idx) => {
    const spec = getTankSpec(slot.tankId)
    const count = teamASlots.length
    const step = count > 1 ? Math.floor(leftSpan / (count - 1)) : 0
    const x = count === 1 ? leftMargin + Math.floor(leftSpan * 0.35) : leftMargin + idx * step
    tanks[slot.id] = {
      id: slot.id,
      name: slot.name,
      team: 'A',
      tankId: spec.id,
      x,
      y: 400,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      shield: spec.shield,
      maxShield: spec.shield,
      angle: 45,
      power: 65,
      slopeDeg: 0,
      moveFuel: spec.moveFuel,
      maxMoveFuel: spec.moveFuel,
      isBot: slot.isBot === true,
      botLevel: slot.botLevel ?? 'hard',
      statuses: [],
      movedThisTurn: false,
      ...loadoutFields(slot),
    }
  })

  // Team B 部署於大型地圖右翼
  const rightMargin = 180
  const rightSpan = Math.floor(arenaWidth * 0.32)
  teamBSlots.forEach((slot, idx) => {
    const spec = getTankSpec(slot.tankId)
    const count = teamBSlots.length
    const step = count > 1 ? Math.floor(rightSpan / (count - 1)) : 0
    const x =
      count === 1
        ? arenaWidth - rightMargin - Math.floor(rightSpan * 0.35)
        : arenaWidth - rightMargin - idx * step
    tanks[slot.id] = {
      id: slot.id,
      name: slot.name,
      team: 'B',
      tankId: spec.id,
      x,
      y: 400,
      hp: spec.maxHp,
      maxHp: spec.maxHp,
      shield: spec.shield,
      maxShield: spec.shield,
      angle: 135,
      power: 65,
      slopeDeg: 0,
      moveFuel: spec.moveFuel,
      maxMoveFuel: spec.moveFuel,
      isBot: slot.isBot === true,
      botLevel: slot.botLevel ?? 'hard',
      statuses: [],
      movedThisTurn: false,
      ...loadoutFields(slot),
    }
  })

  const turnOrder = buildInterleavedTurnOrder(effectiveRoster)

  return {
    turnId: 1,
    activePlayer: turnOrder[0],
    turnOrder,
    wind: 0,
    seed,
    mapId,
    tanks,
    phase: 'AIMING',
    winner: null,
    lastShotPath: [],
    lastExplosion: null,
    lastStatusDamage: {},
  }
}

/** 力道精度：兩位小數（0.01）。HUD、瞄準動畫與電腦 AI 都經此函式，確保送出的力道值一致 */
export function quantizePower(power: number): number {
  return Math.round(power * 100) / 100
}

/** 砲口初速（千分位整數），開火結算、瞄準預覽與電腦 AI 共用同一公式以確保一致 */
export function launchVelocity(
  angleDeg: number,
  power: number,
  speedMultiplier = 1,
): { vxMilli: number; vyMilli: number } {
  const rad = (angleDeg * Math.PI) / 180
  const speed = power * 165 * speedMultiplier
  return {
    vxMilli: Math.round(Math.cos(rad) * speed),
    vyMilli: -Math.round(Math.sin(rad) * speed),
  }
}

/** 坦克容器原點距離地表的高度 (px)；砲彈從 tank.y - MUZZLE_RISE 射出 */
export const TANK_GROUND_OFFSET = 12
export const MUZZLE_RISE = 12

/** 下墜超過此高度才開始計算摔落傷害 */
const FALL_SAFE_PX = 30
const FALL_PX_PER_DAMAGE = 6
const MAX_FALL_DAMAGE = 30

export function fallDamageFor(dropPx: number, safePx = FALL_SAFE_PX): number {
  if (dropPx <= safePx) return 0
  return Math.min(MAX_FALL_DAMAGE, Math.floor((dropPx - safePx) / FALL_PX_PER_DAMAGE))
}

export function syncTankToSurface(tank: TankEntity, surfaceY: number, slopeDeg: number): void {
  tank.y = surfaceY - TANK_GROUND_OFFSET
  tank.slopeDeg = slopeDeg
}

/** 每水平移動 1px 最多可爬升的高度（約 70°），更陡的牆面會擋住坦克 */
export const MAX_CLIMB_PER_PX = 3
/**
 * 像履帶輾過小土堆：短而陡的凸起（彈坑邊緣、碎石、小土丘）可以直接爬過去，只有大片連續陡坡與高牆擋得住。
 * 尺度以車身為準（車寬約 60px、履帶約 24px 高），比履帶矮的垂直斷面都不算牆。
 * - 單步（1px 水平）最多可上 STEP_UP_PX，比這更高的垂直斷面就是牆。
 * - 最近 STEP_WINDOW_PX（約三分之一車身）水平距離內的總爬升不得超過 climbPerPx × STEP_WINDOW_PX；坡持續陡下去就會超過而停住。
 */
export const STEP_UP_PX = 24
const STEP_WINDOW_PX = 20
/** 坦克車身高度：前方地形的淨空不足（例如橋下、洞穴天花板太低）就無法通過 */
const TANK_HEADROOM = 18
/**
 * 窄縫跨越：車身約 60px 寬，比 2 × GAP_BRIDGE_PX 窄的裂縫（例如橋面被打穿的小洞）直接跨過去，
 * 不會卡在縫前、也不會整台掉進去。彈坑都比這寬，被炸出坑照樣會掉下去。
 */
const GAP_BRIDGE_PX = 8

/** 從 fromY 往下找，地面在可站立範圍（沒有落差超過 FALL_SAFE_PX，也不是深淵）就回傳，否則 null */
function nearGround(core: TankCorePort, x: number, fromY: number, refY: number): number | null {
  const g = core.groundBelow(x, fromY)
  return g < core.height && g - refY <= FALL_SAFE_PX ? g : null
}

/** 左右 GAP_BRIDGE_PX 內都有可站立的地面就是窄縫，回傳較高的一側；否則 null */
function bridgeAcross(core: TankCorePort, x: number, fromY: number, refY: number): number | null {
  let left: number | null = null
  let right: number | null = null
  for (let k = 1; k <= GAP_BRIDGE_PX && (left === null || right === null); k++) {
    left ??= nearGround(core, x - k, fromY, refY)
    right ??= nearGround(core, x + k, fromY, refY)
  }
  return left !== null && right !== null ? Math.min(left, right) : null
}

/** 坦克腳下的地面 y（多層地形時從坦克目前高度往下找，而不是整欄最上層；跨在窄縫上時以兩側地面為準） */
export function groundUnderTank(core: TankCorePort, tank: Pick<TankEntity, 'x' | 'y'>): number {
  const foot = tank.y + TANK_GROUND_OFFSET
  const from = foot - MAX_CLIMB_PER_PX
  const g = core.groundBelow(tank.x, from)
  if (g < core.height && g - foot <= FALL_SAFE_PX) return g
  return bridgeAcross(core, tank.x, from, foot) ?? g
}

export function slopeAt(core: TankCorePort, x: number, groundY: number): number {
  return core.surfaceSlopeDeg(x, 6, groundY - 12)
}

/**
 * 沿地形逐像素行走：可爬上緩坡、走下台階，但會被陡壁、低矮天花板擋住（可爬高度 climbPerPx 依機種而異）。
 * 前方沒有地面（橋面 / 浮空島邊緣、深淵）或落差超過 FALL_SAFE_PX（懸崖）時：預設停在邊緣（供電腦規劃走位，不會自殺）；
 * allowFall = true（玩家真的走出去）則踏空下墜，回傳 fell = true 與落差 dropPx：下方是深淵（groundY >= core.height）直接陣亡，
 * 落在下層地面則由呼叫端依 dropPx 與機種摔落抗性結算摔落傷害。
 */
export function walkAlongTerrain(
  core: TankCorePort,
  startX: number,
  startGroundY: number,
  deltaX: number,
  allowFall = false,
  climbPerPx = MAX_CLIMB_PER_PX,
): { x: number; groundY: number; fell?: boolean; dropPx?: number } {
  const dir = Math.sign(deltaX)
  const minX = 30
  const maxX = core.width - 30
  let x = startX
  let groundY = startGroundY
  // 走過的每一步地面高度，用來檢查最近一段距離的平均坡度
  const trail: number[] = [startGroundY]
  for (let i = 0; i < Math.abs(Math.round(deltaX)); i++) {
    const nx = x + dir
    if (nx < minX || nx > maxX) break
    const stepUp = Math.max(climbPerPx, STEP_UP_PX)
    const probe = groundY - stepUp
    if (core.isSolid(nx, probe)) break
    const ng = core.groundBelow(nx, probe)
    const rise = groundY - ng
    if (rise > climbPerPx) {
      const windowStart = trail[Math.max(0, trail.length - STEP_WINDOW_PX)]
      if (windowStart - ng > climbPerPx * STEP_WINDOW_PX) break
    }
    // 前方沒有地面，或落差超過安全高度（懸崖）：窄縫就跨過去（車身維持原高度）；
    // 否則踏出去就是墜落（落地後的摔落傷害由呼叫端依 dropPx 結算）
    if (ng >= core.height || ng - groundY > FALL_SAFE_PX) {
      if (spansGap(core, nx, dir, probe, groundY)) {
        x = nx
        trail.push(groundY)
        continue
      }
      if (allowFall) return { x: nx, groundY: ng, fell: true, dropPx: ng - groundY }
      break
    }
    if (core.isSolid(nx, ng - TANK_HEADROOM)) break
    x = nx
    groundY = ng
    trail.push(ng)
  }
  return { x, groundY }
}

/** 前方 2 × GAP_BRIDGE_PX 內又有差不多高的地面：這是窄縫，可以跨過 */
function spansGap(core: TankCorePort, gapX: number, dir: number, fromY: number, groundY: number): boolean {
  for (let k = 1; k < GAP_BRIDGE_PX * 2; k++) {
    const g = core.groundBelow(gapX + dir * k, fromY)
    if (g < core.height && Math.abs(g - groundY) <= STEP_UP_PX) return true
  }
  return false
}

/** 出生點：取該欄最上層地表；若該欄是深淵（浮空島地圖的空隙）就往兩側尋找最近的地面 */
export function findSpawnGround(core: TankCorePort, x: number): { x: number; groundY: number } {
  for (let d = 0; d < core.width; d += 4) {
    for (const cx of [x + d, x - d]) {
      if (cx < 30 || cx > core.width - 30) continue
      const g = core.surfaceY(cx)
      if (g < core.height) return { x: cx, groundY: g }
    }
  }
  return { x, groundY: core.height }
}

export function applyDamageAndCheckWinner(
  state: BattleState,
  damageByPlayer: Record<PlayerId, number>,
): void {
  for (const [pid, dmg] of Object.entries(damageByPlayer)) {
    const tank = state.tanks[pid]
    if (tank && dmg > 0) {
      // 破甲時護盾不吸收傷害（護盾值保留，狀態結束後恢復作用）
      const absorbed = hasStatusFlag(tank, 'ignoresArmor') ? 0 : Math.min(tank.shield, dmg)
      tank.shield -= absorbed
      tank.hp = Math.max(0, Math.min(tank.maxHp, tank.hp - (dmg - absorbed)))
    }
  }

  const allTanks = Object.values(state.tanks)
  const teamAAlive = allTanks.some((t) => t.team === 'A' && t.hp > 0)
  const teamBAlive = allTanks.some((t) => t.team === 'B' && t.hp > 0)

  if (!teamAAlive || !teamBAlive) {
    state.phase = 'GAME_OVER'
    if (!teamAAlive && !teamBAlive) {
      state.winner = 'draw'
    } else if (!teamAAlive) {
      state.winner = 'B'
    } else {
      state.winner = 'A'
    }
  }
}

/**
 * 換下一位：先結束目前出手者的回合（狀態到期、整回合沒動的機種掛上 idleStatus），
 * 再讓下一位存活的坦克開始回合（結算中毒等持續傷害、套用冰凍的燃料上限）。
 * 被持續傷害打倒的坦克直接跳過，換再下一位；因此陣亡而分出勝負時維持 GAME_OVER。
 */
export function advanceTurn(state: BattleState, nextWind: number): void {
  state.turnId += 1
  state.wind = nextWind
  state.lastStatusDamage = {}

  if (state.phase === 'GAME_OVER') {
    return
  }

  const outgoing = state.tanks[state.activePlayer]
  if (outgoing) {
    expireStatusesAtTurnEnd(outgoing)
    const idle = getTankSpec(outgoing.tankId).idleStatus
    if (idle && outgoing.hp > 0 && !outgoing.movedThisTurn) applyStatus(outgoing, idle)
  }

  const order = state.turnOrder
  const currentIdx = order.indexOf(state.activePlayer)
  for (let offset = 1; offset <= order.length; offset++) {
    const candidateId = order[(currentIdx + offset) % order.length]
    const candidateTank = state.tanks[candidateId]
    if (!candidateTank || candidateTank.hp <= 0) continue
    state.activePlayer = candidateId
    const spec = getTankSpec(candidateTank.tankId)
    const { damage, fuelPermille } = tickStatusesAtTurnStart(candidateTank)
    candidateTank.moveFuel = Math.floor((candidateTank.maxMoveFuel * fuelPermille) / 1000)
    candidateTank.movedThisTurn = false
    let dot = 0
    for (const [type, raw] of damage) dot += mitigateForTank(candidateTank, spec, type, raw)
    if (dot > 0) {
      state.lastStatusDamage[candidateId] = dot
      applyDamageAndCheckWinner(state, { [candidateId]: dot })
      if ((state.phase as TurnPhase) === 'GAME_OVER') return
    }
    if (candidateTank.hp > 0) break
  }

  state.phase = 'AIMING'
}

/**
 * 對戰狀態雜湊（地形雜湊 + 各坦克位置/生命/護盾），供連線同步檢查；
 * 任何一端的坦克數值與對手不一致都能被偵測。FNV-1a 整數運算，確定性。
 */
export function battleStateHash(state: BattleState, terrainHash: number): number {
  let h = (0x811c9dc5 ^ terrainHash) >>> 0
  const mix = (v: number) => {
    h = Math.imul(h ^ (Math.round(v) | 0), 0x01000193) >>> 0
  }
  for (const id of Object.keys(state.tanks).sort()) {
    const t = state.tanks[id]
    mix(t.x)
    mix(t.y)
    mix(t.hp)
    mix(t.shield)
    for (const s of t.statuses) {
      for (let i = 0; i < s.id.length; i++) mix(s.id.charCodeAt(i))
      mix(s.turnsLeft)
      mix(s.power)
    }
  }
  return h
}
