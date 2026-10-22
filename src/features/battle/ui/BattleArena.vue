<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { soundController } from '@/features/audio'
import type {
  BulletType,
  FireActionCommand,
  MapPresetId,
  MoveActionCommand,
  PlayerId,
  ProtocolMessage,
  ResyncRequestEvent,
  ResyncStateEvent,
  RosterSlot,
  SyncHashEvent,
} from '@/shared/kernel/types'
import { DEFAULT_WORLD_HEIGHT, DEFAULT_WORLD_WIDTH, DeterministicTankCore } from '@/shared/wasm'
import {
  commitFireImpact,
  finalizeTurnAfterHold,
  forfeitPlayer,
  moveActiveTank,
  prepareFireTrajectory,
  syncAllTanksToTerrain,
} from '../application/useBattleTurn'
import { battleStateHash, createInitialBattleState } from '../domain/battleState'
import { planBotMove, planBotShot } from '../domain/botBrain'
import { MAP_REGISTRY, terrainOptionsFor } from '../domain/mapRegistry'
import { TANK_REGISTRY } from '../domain/tankRegistry'
import BattleCanvas from './BattleCanvas.vue'
import BattleHud from './BattleHud.vue'

const props = withDefaults(
  defineProps<{
    mode?: 'hotseat' | 'p2p'
    localRole?: PlayerId
    isHost?: boolean
    initialSeed?: number
    mapId?: MapPresetId
    roster?: RosterSlot[]
  }>(),
  {
    mode: 'hotseat',
    localRole: 'p1',
    isHost: true,
    initialSeed: 1024,
    mapId: 'harvest_plains',
    roster: () => [
      { id: 'p1', name: 'Player 1', team: 'A', tankId: 'aegis', isHost: true },
      { id: 'p2', name: 'Player 2', team: 'B', tankId: 'goliath', isHost: false },
    ],
  },
)

const emit = defineEmits<{
  (e: 'outgoing-message', msg: ProtocolMessage): void
  (e: 'leave-game'): void
}>()

const core = new DeterministicTankCore(
  DEFAULT_WORLD_WIDTH,
  DEFAULT_WORLD_HEIGHT,
  props.initialSeed,
)
const state = reactive(
  createInitialBattleState(props.initialSeed, props.roster, props.mapId),
)
// 每位玩家各自記住選用的彈種（熱座輪流時不會互相覆蓋）
const bulletChoice = reactive<Record<PlayerId, BulletType>>({})
const bulletType = computed<BulletType>(() => {
  const tank = state.tanks[state.activePlayer]
  const shots = (TANK_REGISTRY[tank?.tankId ?? 'aegis'] ?? TANK_REGISTRY.aegis).shots
  const chosen = bulletChoice[state.activePlayer]
  return chosen && shots.includes(chosen) ? chosen : shots[0]
})

// --- 回合倒數：輪到真人時開始計時，歸零就以目前瞄準自動開火（走一般開火流程，P2P 會同步廣播） ---
const TURN_TIME_SEC = 30
const turnSecondsLeft = ref(TURN_TIME_SEC)
let turnDeadline = Date.now() + TURN_TIME_SEC * 1000
const turnClock = setInterval(() => {
  if (state.phase !== 'AIMING') return
  const left = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000))
  turnSecondsLeft.value = left
  if (left === 0 && canControl.value) handleFire()
}, 250)
watch(
  () => [state.turnId, state.phase],
  () => {
    if (state.phase !== 'AIMING') return
    turnDeadline = Date.now() + TURN_TIME_SEC * 1000
    turnSecondsLeft.value = TURN_TIME_SEC
  },
  { immediate: true },
)
const isMuted = ref(soundController.isMuted())
const syncStatus = ref<'ok' | 'mismatch' | null>(null)
const canvasRef = ref<InstanceType<typeof BattleCanvas> | null>(null)

// --- 連線同步：雜湊比對與房主權威重新同步 ---
// 地形只會被 carveCircle 改變，記下本局所有挖坑即可在另一端重建完全相同的地形
let carveLog: number[] = []
// 對手送來的回合結束雜湊：等本機也播完同一回合再比對，避免動畫還沒結束就誤判不一致
let pendingHash: SyncHashEvent | null = null
let lastResyncTurn = -1
// 房主收到請求時若正在播放砲彈，等回合結束再送；客端收到快照時同理
let resyncOwed = false
let pendingSnapshot: ResyncStateEvent | null = null
// 對戰中斷線的玩家（下一局不再帶入）
const departed = new Set<PlayerId>()

const isBotTurn = computed(
  () => props.mode === 'hotseat' && state.tanks[state.activePlayer]?.isBot === true,
)

const canControl = computed(() => {
  if (state.phase !== 'AIMING' || isBotTurn.value) return false
  if (props.mode === 'hotseat') return true
  return state.activePlayer === props.localRole
})

function resetMatch(
  newSeed = 1024,
  initialWind = 0,
  newRoster: RosterSlot[] = props.roster,
  newMapId: MapPresetId = props.mapId,
): void {
  const mapSpec = MAP_REGISTRY[newMapId] ?? MAP_REGISTRY.harvest_plains
  const fresh = createInitialBattleState(newSeed, newRoster, newMapId)
  fresh.wind = initialWind
  Object.assign(state, fresh)
  core.resetTerrain(newSeed, terrainOptionsFor(mapSpec))
  syncAllTanksToTerrain(state, core)
  syncStatus.value = null
  carveLog = []
  departed.clear()
  pendingHash = null
  resyncOwed = false
  pendingSnapshot = null
  lastResyncTurn = -1
  for (const key of Object.keys(bulletChoice)) delete bulletChoice[key]
  canvasRef.value?.redrawTerrain()
  canvasRef.value?.focusActiveTank(true)
  // 新局的回合/階段可能與上一局相同而不會觸發 watch，因此在此明確重新排程
  scheduleBotTurn()
}

/** 移動當前坦克；走下高處的摔落傷害（或墜入深淵）跳出傷害數字 */
function moveAndShowFall(deltaX: number): boolean {
  const tank = state.tanks[state.activePlayer]
  const hpBefore = tank ? tank.hp + tank.shield : 0
  const moved = moveActiveTank(state, deltaX, core)
  if (moved && tank) {
    const lost = hpBefore - (tank.hp + tank.shield)
    if (lost > 0) canvasRef.value?.showDamage(tank.x, tank.y - 48, lost, tank.hp <= 0)
  }
  return moved
}

function handleMove(deltaX: number): void {
  if (!canControl.value) return
  const activeId = state.activePlayer
  const activeTank = state.tanks[activeId]
  if (!activeTank) return
  if (moveAndShowFall(deltaX)) {
    soundController.play('move')
    if (props.mode === 'p2p') {
      const msg: MoveActionCommand = {
        type: 'ACTION_MOVE',
        turnId: state.turnId,
        playerId: activeId,
        targetX: activeTank.x,
      }
      emit('outgoing-message', msg)
    }
  }
}

function handleUpdateAim(angle: number, power: number): void {
  if (!canControl.value) return
  const tank = state.tanks[state.activePlayer]
  if (!tank) return
  tank.angle = angle
  tank.power = power
}

function handleFire(): void {
  if (!canControl.value) return
  const shooter = state.tanks[state.activePlayer]
  if (!shooter) return
  const cmd: FireActionCommand = {
    type: 'ACTION_FIRE',
    turnId: state.turnId,
    playerId: state.activePlayer,
    angle: shooter.angle,
    power: shooter.power,
    wind: state.wind,
    bulletType: bulletType.value,
  }
  applyFireCommand(cmd, true)
}

function applyFireCommand(cmd: FireActionCommand, isLocal: boolean): void {
  const plan = prepareFireTrajectory(state, cmd, core)
  if (!plan) return

  soundController.play('fire')
  if (props.mode === 'p2p' && isLocal) {
    emit('outgoing-message', cmd)
  }

  canvasRef.value?.playProjectileFlight({
    shooterId: cmd.playerId,
    path: plan.hit.path,
    bulletType: plan.bulletType,
    explosionX: plan.hit.hitX,
    explosionY: plan.hit.hitY,
    explosionRadius: Math.max(plan.damageRadius, plan.terrainRadius),
    onArriveImpact: () => {
      const { dirty, damageByPlayer } = commitFireImpact(state, plan, core)
      if (dirty) {
        carveLog.push(plan.hit.hitX, plan.hit.hitY, plan.terrainRadius)
        canvasRef.value?.redrawTerrain(dirty)
        canvasRef.value?.onTerrainCarved(plan.hit.hitX, plan.hit.hitY, plan.terrainRadius)
        soundController.play('explosion')
      }
      for (const [pid, dmg] of Object.entries(damageByPlayer)) {
        const tank = state.tanks[pid]
        if (tank && dmg > 0) canvasRef.value?.showDamage(tank.x, tank.y - 48, dmg, tank.hp <= 0)
      }
    },
    onSequenceComplete: () => {
      finalizeTurnAfterHold(state)
      afterTurnSettled()
      if (props.mode === 'p2p' && isLocal) {
        const hashMsg: SyncHashEvent = {
          type: 'SYNC_HASH',
          turnId: state.turnId,
          stateHash: battleStateHash(state, core.getStateHash()),
        }
        emit('outgoing-message', hashMsg)
      }
    },
  })
}

/** 回合結算完（沒有砲彈在飛）時：套用延後的快照、補送欠的快照、比對對手雜湊 */
function afterTurnSettled(): void {
  if (props.mode !== 'p2p' || state.phase === 'FIRING') return
  if (pendingSnapshot) {
    const snap = pendingSnapshot
    pendingSnapshot = null
    applySnapshot(snap)
  }
  if (resyncOwed) sendSnapshot()
  if (pendingHash && pendingHash.turnId === state.turnId) {
    const remote = pendingHash
    pendingHash = null
    const same = battleStateHash(state, core.getStateHash()) === remote.stateHash
    syncStatus.value = same ? 'ok' : 'mismatch'
    if (!same) recoverFromMismatch()
  }
}

/** 房主即權威：自己偵測到不一致就直接推送快照；客端則請房主重送（同一回合只請求一次） */
function recoverFromMismatch(): void {
  if (props.isHost) {
    sendSnapshot()
    return
  }
  if (lastResyncTurn === state.turnId) return
  lastResyncTurn = state.turnId
  const req: ResyncRequestEvent = { type: 'RESYNC_REQUEST', turnId: state.turnId }
  emit('outgoing-message', req)
}

function sendSnapshot(): void {
  if (state.phase === 'FIRING') {
    resyncOwed = true
    return
  }
  resyncOwed = false
  const msg: ResyncStateEvent = {
    type: 'RESYNC_STATE',
    turnId: state.turnId,
    snapshot: JSON.stringify(state),
    carves: [...carveLog],
  }
  emit('outgoing-message', msg)
}

function applySnapshot(msg: ResyncStateEvent): void {
  if (msg.turnId < state.turnId) return
  const snap = JSON.parse(msg.snapshot) as typeof state
  const mapSpec = MAP_REGISTRY[snap.mapId] ?? MAP_REGISTRY.harvest_plains
  core.resetTerrain(snap.seed, terrainOptionsFor(mapSpec))
  for (let i = 0; i + 2 < msg.carves.length; i += 3) {
    core.carveCircle(msg.carves[i], msg.carves[i + 1], msg.carves[i + 2])
  }
  carveLog = [...msg.carves]
  Object.assign(state, snap)
  syncStatus.value = 'ok'
  canvasRef.value?.redrawTerrain()
  canvasRef.value?.focusActiveTank(true)
}

function handleRemoteMessage(msg: ProtocolMessage): void {
  if (msg.type === 'START_BATTLE') {
    resetMatch(msg.seed, msg.initialWind, msg.roster, msg.mapId)
    return
  }
  if (msg.type === 'PLAYER_LEFT') {
    handlePlayerLeft(msg.playerId)
    return
  }
  if (msg.type === 'ACTION_MOVE') {
    // 只接受當前出手玩家本人的移動；亂序 / 過期的訊息直接丟棄，避免移錯車
    if (msg.playerId !== state.activePlayer) return
    const tank = state.tanks[msg.playerId]
    if (!tank) return
    const delta = msg.targetX - tank.x
    if (moveAndShowFall(delta)) {
      soundController.play('move')
    }
    return
  }
  if (msg.type === 'ACTION_FIRE') {
    applyFireCommand(msg, false)
    return
  }
  if (msg.type === 'SYNC_HASH') {
    pendingHash = msg
    afterTurnSettled()
    return
  }
  if (msg.type === 'RESYNC_REQUEST') {
    if (props.isHost) sendSnapshot()
    return
  }
  if (msg.type === 'RESYNC_STATE') {
    if (props.isHost) return
    if (state.phase === 'FIRING') pendingSnapshot = msg
    else applySnapshot(msg)
  }
}

function handleToggleMute(): void {
  isMuted.value = !isMuted.value
  soundController.setMuted(isMuted.value)
}

/** 對戰中玩家斷線：視為認輸，坦克陣亡；輪到他就直接換下一位（砲彈還在飛則等回合結算自然推進） */
function handlePlayerLeft(id: PlayerId): void {
  if (forfeitPlayer(state, id)) departed.add(id)
}

function handleRequestNewMatch(): void {
  if (props.mode === 'p2p' && !props.isHost) return
  // 已離線的玩家不帶進下一局；剩下的人不足兩隊就沒有對手可打
  const roster = props.roster.filter((r) => !departed.has(r.id))
  if (!roster.some((r) => r.team === 'A') || !roster.some((r) => r.team === 'B')) return
  const newSeed = Math.floor(Math.random() * 90000) + 1000
  resetMatch(newSeed, 0, roster, state.mapId)
  if (props.mode === 'p2p') {
    emit('outgoing-message', {
      type: 'START_BATTLE',
      seed: newSeed,
      initialWind: 0,
      mapId: state.mapId,
      roster,
    })
  }
}

// --- 電腦對手：輪到 Bot 時先「思考」，再以動畫轉動砲管與蓄力，最後走一般開火流程 ---
let botTimer: ReturnType<typeof setTimeout> | null = null
let botFrame: number | null = null

function cancelBotTurn(): void {
  if (botTimer !== null) clearTimeout(botTimer)
  if (botFrame !== null) cancelAnimationFrame(botFrame)
  botTimer = null
  botFrame = null
}

function runBotTurn(): void {
  const botId = state.activePlayer
  const turnId = state.turnId
  const tank = state.tanks[botId]
  if (!tank) return

  // 先移動（每幀 3px，與玩家按方向鍵相同走 moveActiveTank，燃料規則一致），到位後再瞄準
  const targetX = tank.x + planBotMove(state, core, botId)
  const walk = () => {
    if (state.turnId !== turnId || state.phase !== 'AIMING') return
    const remaining = targetX - tank.x
    if (Math.abs(remaining) >= 1 && tank.moveFuel > 0) {
      const moved = moveActiveTank(state, Math.sign(remaining) * Math.min(3, Math.abs(remaining)), core)
      if (moved) {
        botFrame = requestAnimationFrame(walk)
        return
      }
    }
    botFrame = null
    aimAndFireBot(botId, turnId)
  }
  botFrame = requestAnimationFrame(walk)
}

function aimAndFireBot(botId: PlayerId, turnId: number): void {
  const plan = planBotShot(state, core, botId)
  const tank = state.tanks[botId]
  if (!plan || !tank) return

  const startAngle = tank.angle
  const startPower = tank.power
  const aimMs = 900
  let startTs: number | null = null

  const step = (ts: number) => {
    if (state.turnId !== turnId || state.phase !== 'AIMING') return
    startTs ??= ts
    const t = Math.min(1, (ts - startTs) / aimMs)
    const ease = 1 - (1 - t) * (1 - t)
    tank.angle = Math.round(startAngle + (plan.angle - startAngle) * ease)
    tank.power = Math.round(startPower + (plan.power - startPower) * ease)
    if (t < 1) {
      botFrame = requestAnimationFrame(step)
      return
    }
    botFrame = null
    bulletChoice[botId] = plan.bulletType
    botTimer = setTimeout(() => {
      botTimer = null
      if (state.turnId !== turnId || state.phase !== 'AIMING') return
      applyFireCommand(
        {
          type: 'ACTION_FIRE',
          turnId,
          playerId: botId,
          angle: plan.angle,
          power: plan.power,
          wind: state.wind,
          bulletType: plan.bulletType,
        },
        true,
      )
    }, 350)
  }
  botFrame = requestAnimationFrame(step)
}

function scheduleBotTurn(): void {
  cancelBotTurn()
  if (state.phase !== 'AIMING' || !isBotTurn.value) return
  // 等鏡頭移交到 Bot 坦克後再開始瞄準
  botTimer = setTimeout(() => {
    botTimer = null
    runBotTurn()
  }, 1100)
}

watch(() => [state.turnId, state.phase, isBotTurn.value], scheduleBotTurn, { immediate: true })

onUnmounted(() => {
  cancelBotTurn()
  clearInterval(turnClock)
})

defineExpose({
  handleRemoteMessage,
  resetMatch,
})

onMounted(() => {
  const mapSpec = MAP_REGISTRY[props.mapId] ?? MAP_REGISTRY.harvest_plains
  core.resetTerrain(props.initialSeed, terrainOptionsFor(mapSpec))
  syncAllTanksToTerrain(state, core)
  canvasRef.value?.redrawTerrain()
})
</script>

<template>
  <!-- 100dvh 零捲軸全畫面遊戲視窗：HUD 直接內嵌疊加在 BattleCanvas 內 -->
  <section class="fixed inset-0 z-30 h-dvh w-screen overflow-hidden bg-slate-950">
    <BattleCanvas ref="canvasRef" :state="state" :core="core" :bullet-type="bulletType">
      <BattleHud
        :state="state"
        :bullet-type="bulletType"
        :can-control="canControl"
        :is-bot-turn="isBotTurn"
        :is-muted="isMuted"
        :sync-status="syncStatus"
        :turn-seconds-left="isBotTurn ? null : turnSecondsLeft"
        @move="handleMove"
        @update-aim="handleUpdateAim"
        @change-bullet="(b) => (bulletChoice[state.activePlayer] = b)"
        @fire="handleFire"
        @reset-match="handleRequestNewMatch"
        @toggle-mute="handleToggleMute"
        @leave-game="emit('leave-game')"
      />
    </BattleCanvas>
  </section>
</template>
