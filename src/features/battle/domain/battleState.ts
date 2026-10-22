/**
 * Battle Slice (中大型複雜模組 - 完整 DDD 輕量分層)
 * 支援 1v1 ~ 5v5 (最多 10 台坦克) 與模組化 TankBlueprint / MapBlueprint 引擎
 */
import type { BotLevel, BulletType, MapPresetId, PlayerId, RosterSlot, TankArchetypeId, TeamId } from '@/shared/kernel/types'
import type { TankCorePort } from '@/shared/wasm'
import { sanitizeLoadout } from './loadout'
import { MAP_REGISTRY } from './mapRegistry'
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
 * 像人跨過小土堆：短而陡的凸起（彈坑邊緣、碎石、小土丘）可以直接爬過去，只有大片連續陡坡與高牆擋得住。
 * - 單步（1px 水平）最多可上 STEP_UP_PX，比這更高的垂直斷面就是牆。
 * - 最近 STEP_WINDOW_PX 水平距離內的總爬升不得超過 climbPerPx × STEP_WINDOW_PX；坡持續陡下去就會超過而停住。
 */
export const STEP_UP_PX = 16
const STEP_WINDOW_PX = 16
/** 坦克車身高度：前方地形的淨空不足（例如橋下、洞穴天花板太低）就無法通過 */
const TANK_HEADROOM = 18

/** 坦克腳下的地面 y（多層地形時從坦克目前高度往下找，而不是整欄最上層） */
export function groundUnderTank(core: TankCorePort, tank: Pick<TankEntity, 'x' | 'y'>): number {
  return core.groundBelow(tank.x, tank.y + TANK_GROUND_OFFSET - MAX_CLIMB_PER_PX)
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
    // 前方沒有地面，或落差超過安全高度（懸崖）：踏出去就是墜落（落地後的摔落傷害由呼叫端依 dropPx 結算）
    if (ng >= core.height || ng - groundY > FALL_SAFE_PX) {
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
      const absorbed = Math.min(tank.shield, dmg)
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

export function advanceTurn(state: BattleState, nextWind: number): void {
  state.turnId += 1
  state.wind = nextWind

  if (state.phase === 'GAME_OVER') {
    return
  }

  const order = state.turnOrder
  const currentIdx = order.indexOf(state.activePlayer)
  for (let offset = 1; offset <= order.length; offset++) {
    const candidateId = order[(currentIdx + offset) % order.length]
    const candidateTank = state.tanks[candidateId]
    if (candidateTank && candidateTank.hp > 0) {
      state.activePlayer = candidateId
      candidateTank.moveFuel = candidateTank.maxMoveFuel
      break
    }
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
  }
  return h
}
