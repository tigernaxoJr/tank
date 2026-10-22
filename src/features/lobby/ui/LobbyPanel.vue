<script setup lang="ts">
import { isForgedAction } from '../infra/messageGuards'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  BOT_LEVEL_SPECS,
  MAP_REGISTRY,
  TANK_LIST,
  createLoadoutSecret,
  loadoutRoot,
  sanitizeLoadout,
  tankAt,
  type LoadoutSecret,
  type MapBlueprint,
} from '@/features/battle'
import { soundController } from '@/features/audio'
import LobbyBackdrop from './LobbyBackdrop.vue'
import StageShowcase from './StageShowcase.vue'
import StageSelectModal from './StageSelectModal.vue'
import TankHangarPodium from './TankHangarPodium.vue'
import TacticalGuideModal from './TacticalGuideModal.vue'
import {
  countTeamMembers,
  generateRoomCode,
  MAX_PLAYERS_PER_TEAM,
  MAX_TOTAL_PLAYERS,
  pickBalancedTeam,
  type RoomSession,
} from '../domain/roomSession'
import {
  createPeerTransport,
  type PeerTransportPort,
  type SignalingEndpointInfo,
} from '../infra/peerAdapter'
import { loadLoadoutPicks, saveLoadoutPicks } from '../infra/loadoutStorage'
import { createRoomDirectory, type RoomListing, type RoomStatus } from '../infra/roomDirectory'
import type {
  BotLevel,
  BulletType,
  DisconnectPolicy,
  LobbyRosterUpdateEvent,
  MapPresetId,
  PlayerId,
  PlayerJoinInfoEvent,
  ProtocolMessage,
  RosterSlot,
  StartBattleEvent,
  TankArchetypeId,
  TeamId,
  UpdatePlayerSetupEvent,
} from '@/shared/kernel/types'

export interface StartGamePayload {
  mode: 'hotseat' | 'p2p'
  localRole: PlayerId
  isHost: boolean
  seed: number
  initialWind: number
  mapId: MapPresetId
  roster: RosterSlot[]
  roomCode: string
  /** 連線對戰中本機玩家的彈藥承諾原文（只留在本機，不得廣播）；單機沒有 */
  loadoutSecret?: LoadoutSecret
}

const props = defineProps<{
  inBattle: boolean
}>()

const emit = defineEmits<{
  (e: 'start-game', payload: StartGamePayload): void
  (e: 'leave-game'): void
  (e: 'remote-message', msg: ProtocolMessage): void
}>()

const gameMode = ref<'p2p' | 'hotseat'>('p2p')
const showStageModal = ref(false)
const showGuideModal = ref(false)

const hotseatCountPerTeam = ref(1)
// 預設陣容依註冊表輪流排（B 隊錯開一台），新增機種自動納入
const hotseatTeamATanks = reactive<TankArchetypeId[]>(Array.from({ length: 5 }, (_, i) => tankAt(i)))
const hotseatTeamBTanks = reactive<TankArchetypeId[]>(Array.from({ length: 5 }, (_, i) => tankAt(i + 1)))
// 單機模式各隊由玩家或電腦操控（預設：玩家 vs 電腦）
const hotseatBotTeams = reactive<Record<TeamId, boolean>>({ A: false, B: true })
// 各隊電腦難度（預設中等：會有瞄準偏差，不至於每發都命中）
const hotseatBotLevels = reactive<Record<TeamId, BotLevel>>({ A: 'normal', B: 'normal' })
const BOT_LEVELS = Object.entries(BOT_LEVEL_SPECS) as [BotLevel, (typeof BOT_LEVEL_SPECS)[BotLevel]][]
const hotseatStartLabel = computed(() => {
  const n = hotseatCountPerTeam.value
  if (hotseatBotTeams.A && hotseatBotTeams.B) return `🍿 觀戰 ${n}v${n} 電腦對決`
  if (hotseatBotTeams.A || hotseatBotTeams.B) return `🚀 啟動 ${n}v${n} 挑戰電腦`
  return `🚀 啟動 ${n}v${n} 單機熱座對戰`
})
const joinInputCode = ref('')
const copied = ref(false)
const copiedLink = ref(false)
const pendingSeed = ref(1024)

const session = reactive<RoomSession>({
  roomCode: '',
  phase: 'idle',
  isHost: true,
  localPlayerId: 'p1',
  localPlayerName: 'Commander',
  selectedTankId: tankAt(0),
  selectedMapId: 'harvest_plains',
  disconnectPolicy: 'forfeit',
  locked: false,
  roster: [],
  errorMessage: undefined,
})

const currentMapBlueprint = computed<MapBlueprint>(
  () => MAP_REGISTRY[session.selectedMapId] ?? MAP_REGISTRY.harvest_plains,
)

// --- 彈藥配置：選擇記在 localStorage；連線對戰只廣播承諾（Merkle 根），原文留在本機直到開火時逐格揭露 ---
const loadoutPicks = ref<BulletType[]>(loadLoadoutPicks(session.selectedTankId))
// 單機各隊的配置（同機種共用一份，與連線對戰選的是同一份記憶）
const loadoutCache = reactive<Record<string, BulletType[]>>({})
function picksFor(tankId: TankArchetypeId): BulletType[] {
  return (loadoutCache[tankId] ??= loadLoadoutPicks(tankId))
}
const localRoot = ref('')
let localSecret: LoadoutSecret | null = null
function refreshCommitment(): void {
  localSecret = createLoadoutSecret(session.selectedTankId, loadoutPicks.value)
  localRoot.value = loadoutRoot(session.selectedTankId, localSecret)
}
refreshCommitment()

/** 只接受格式正確的承諾（64 位十六進位字元） */
const isRoot = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)

const transport: PeerTransportPort = createPeerTransport()
const signalingInfo = ref<SignalingEndpointInfo>(transport.getSignalingInfo())

// --- 房間列表（需要房間目錄 API；未設定時降級為輸入房號） ---
const directory = createRoomDirectory()
const roomName = ref('')
const roomList = ref<RoomListing[]>([])
const roomListLoading = ref(false)
const roomListLoaded = ref(false)
const roomListError = ref(false)
let roomStatus: RoomStatus = 'waiting'
let roomPollTimer: ReturnType<typeof setInterval> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

async function refreshRoomList(): Promise<void> {
  if (!directory.available || roomListLoading.value) return
  roomListLoading.value = true
  const rooms = await directory.list()
  roomListLoading.value = false
  roomListLoaded.value = true
  roomListError.value = rooms === null
  if (rooms) roomList.value = rooms
}

function announceRoom(): void {
  if (!session.isHost || !session.roomCode) return
  void directory.announce(session.roomCode, {
    name: roomName.value.trim() || `${session.localPlayerName} 的房間`,
    hostName: session.localPlayerName,
    mapId: session.selectedMapId,
    players: Math.max(1, session.roster.length),
    maxPlayers: MAX_TOTAL_PLAYERS,
    status: roomStatus,
    disconnectPolicy: session.disconnectPolicy,
  })
}

function startHeartbeat(): void {
  stopHeartbeat()
  roomStatus = 'waiting'
  announceRoom()
  heartbeatTimer = setInterval(announceRoom, 10_000)
}

function stopHeartbeat(): void {
  if (heartbeatTimer !== null) clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

function formatMapName(mapId: string): string {
  return (MAP_REGISTRY as Record<string, { name: string } | undefined>)[mapId]?.name ?? mapId
}

async function joinFromList(room: RoomListing): Promise<void> {
  if (room.status !== 'waiting' || room.players >= room.maxPlayers) return
  soundController.play('ui_click')
  joinInputCode.value = room.code
  await handleJoin()
}

const teamARoster = computed(() => session.roster.filter((r) => r.team === 'A'))
const teamBRoster = computed(() => session.roster.filter((r) => r.team === 'B'))
// 房主不需要準備；其餘玩家全部按下「準備完畢」才能開戰
const allGuestsReady = computed(() => session.roster.every((r) => r.isHost || r.ready === true))
const localReady = computed(
  () => session.roster.find((r) => r.id === session.localPlayerId)?.ready === true,
)
const canStartMatch = computed(
  () =>
    session.isHost &&
    teamARoster.value.length >= 1 &&
    teamBRoster.value.length >= 1 &&
    session.roster.length <= MAX_TOTAL_PLAYERS &&
    allGuestsReady.value,
)

function broadcastRosterFromHost(): void {
  if (!session.isHost) return
  for (const slot of session.roster) {
    if (slot.id === 'p1') continue
    const msg: LobbyRosterUpdateEvent = {
      type: 'LOBBY_ROSTER_UPDATE',
      assignedPlayerId: slot.id,
      mapId: session.selectedMapId,
      disconnectPolicy: session.disconnectPolicy,
      roster: session.roster.map((r) => ({ ...r })),
    }
    transport.sendToPeer(slot.id, msg)
  }
}

function handleHostReceivePeerMessage(peerSlotId: PlayerId, msg: ProtocolMessage): void {
  if (msg.type === 'PLAYER_JOIN_INFO') {
    const slot = session.roster.find((r) => r.id === peerSlotId)
    if (slot) {
      slot.name = msg.guestName.trim() || peerSlotId.toUpperCase()
      slot.tankId = msg.tankId || tankAt(0)
      if (isRoot(msg.loadoutRoot)) slot.loadoutRoot = msg.loadoutRoot
      broadcastRosterFromHost()
    }
    return
  }

  if (msg.type === 'UPDATE_PLAYER_SETUP') {
    const slot = session.roster.find((r) => r.id === peerSlotId)
    if (slot) {
      slot.tankId = msg.tankId
      if (isRoot(msg.loadoutRoot)) slot.loadoutRoot = msg.loadoutRoot
      if (msg.ready !== undefined) slot.ready = msg.ready
      if (slot.team !== msg.targetTeam) {
        if (countTeamMembers(session.roster, msg.targetTeam) < MAX_PLAYERS_PER_TEAM) {
          slot.team = msg.targetTeam
        }
      }
      broadcastRosterFromHost()
    }
    return
  }

  if (isForgedAction(msg, peerSlotId)) return

  if (msg.type === 'ACTION_FIRE' || msg.type === 'ACTION_MOVE' || msg.type === 'SYNC_HASH') {
    transport.broadcast(msg, peerSlotId)
    emit('remote-message', msg)
    return
  }

  if (msg.type === 'RESYNC_REQUEST') emit('remote-message', msg)
}

function handleClientReceiveMessage(msg: ProtocolMessage): void {
  if (msg.type === 'LOBBY_ROSTER_UPDATE') {
    session.localPlayerId = msg.assignedPlayerId
    session.selectedMapId = msg.mapId
    if (msg.disconnectPolicy) session.disconnectPolicy = msg.disconnectPolicy
    session.roster = msg.roster
    return
  }

  if (msg.type === 'START_BATTLE') {
    session.roster = msg.roster
    session.selectedMapId = msg.mapId
    session.locked = true
    soundController.play('ui_start')
    emit('start-game', {
      mode: 'p2p',
      localRole: session.localPlayerId,
      isHost: false,
      seed: msg.seed,
      initialWind: msg.initialWind,
      mapId: msg.mapId,
      roster: msg.roster,
      roomCode: session.roomCode,
      loadoutSecret: localSecret ?? undefined,
    })
    return
  }

  emit('remote-message', msg)
}

async function handleHost(): Promise<void> {
  soundController.play('ui_click')
  const name = session.localPlayerName.trim() || 'Commander'
  session.localPlayerName = name
  const initialCode = generateRoomCode()
  session.isHost = true
  session.localPlayerId = 'p1'
  session.locked = false
  session.phase = 'hosting'
  session.errorMessage = undefined
  session.roster = [
    {
      id: 'p1',
      name,
      team: 'A',
      tankId: session.selectedTankId,
      isHost: true,
      loadoutRoot: localRoot.value,
    },
  ]

  try {
    const finalCode = await transport.hostRoomWithRetry(initialCode, {
      onPeerConnected: (peerSlotId) => {
        soundController.play('ui_ready')
        const team = pickBalancedTeam(session.roster)
        if (!team || session.roster.length >= MAX_TOTAL_PLAYERS) {
          return
        }
        session.roster.push({
          id: peerSlotId,
          name: `Player ${peerSlotId.toUpperCase()}`,
          team,
          tankId: tankAt(0),
          isHost: false,
          ready: false,
        })
        session.phase = 'connected'
        broadcastRosterFromHost()
      },
      onPeerMessage: (peerSlotId, msg) => handleHostReceivePeerMessage(peerSlotId, msg),
      onPeerDisconnected: (peerSlotId) => {
        session.roster = session.roster.filter((r) => r.id !== peerSlotId)
        broadcastRosterFromHost()
        if (props.inBattle) {
          const left: ProtocolMessage = { type: 'PLAYER_LEFT', playerId: peerSlotId, takeover: session.disconnectPolicy === 'bot' }
          transport.broadcast(left)
          emit('remote-message', left)
        }
      },
      onSignalingChanged: (info) => {
        signalingInfo.value = info
      },
    })
    session.roomCode = finalCode
    session.phase = 'connected'
    startHeartbeat()
  } catch (err: unknown) {
    session.phase = 'error'
    session.errorMessage = err instanceof Error ? err.message : String(err)
  }
}

async function handleJoin(): Promise<void> {
  const code = joinInputCode.value.trim().toUpperCase()
  if (code.length !== 6) return
  soundController.play('ui_click')

  const name = session.localPlayerName.trim() || 'Challenger'
  session.localPlayerName = name
  session.roomCode = code
  session.isHost = false
  session.locked = false
  session.phase = 'joining'
  session.errorMessage = undefined

  try {
    await transport.joinRoom(code, {
      onConnected: () => {
        session.phase = 'connected'
        soundController.play('ui_ready')
        const joinInfo: PlayerJoinInfoEvent = {
          type: 'PLAYER_JOIN_INFO',
          guestName: session.localPlayerName,
          tankId: session.selectedTankId,
          loadoutRoot: localRoot.value,
        }
        transport.sendToHost(joinInfo)
      },
      onMessage: (msg) => handleClientReceiveMessage(msg),
      onDisconnected: (reason) => {
        session.phase = 'error'
        session.roster = []
        session.errorMessage = reason || '與房主的連線已中斷'
        if (props.inBattle) {
          emit('leave-game')
        }
      },
      onSignalingChanged: (info) => {
        signalingInfo.value = info
      },
    })
  } catch (err: unknown) {
    session.phase = 'error'
    session.errorMessage = err instanceof Error ? err.message : String(err)
  }
}

function selectTankArchetype(tankId: TankArchetypeId): void {
  session.selectedTankId = tankId
  hotseatTeamATanks[0] = tankId
  loadoutPicks.value = loadLoadoutPicks(tankId)
  refreshCommitment()
  if (session.phase !== 'connected') return

  const localSlot = session.roster.find((r) => r.id === session.localPlayerId)
  const currentTeam = localSlot?.team ?? 'A'
  if (session.isHost) {
    if (localSlot) {
      localSlot.tankId = tankId
      localSlot.loadoutRoot = localRoot.value
      broadcastRosterFromHost()
    }
  } else {
    const req: UpdatePlayerSetupEvent = {
      type: 'UPDATE_PLAYER_SETUP',
      playerId: session.localPlayerId,
      targetTeam: currentTeam,
      tankId,
      loadoutRoot: localRoot.value,
    }
    transport.sendToHost(req)
  }
}

function setHotseatSlotTank(team: TeamId, slotIndex: number, tankId: TankArchetypeId): void {
  soundController.play('ui_click')
  if (team === 'A') {
    hotseatTeamATanks[slotIndex] = tankId
    if (slotIndex === 0) {
      session.selectedTankId = tankId
    }
  } else {
    hotseatTeamBTanks[slotIndex] = tankId
  }
}

function onPickLoadout(picks: BulletType[]): void {
  if (session.locked) return
  loadoutPicks.value = sanitizeLoadout(session.selectedTankId, picks)
  saveLoadoutPicks(session.selectedTankId, loadoutPicks.value)
  loadoutCache[session.selectedTankId] = loadoutPicks.value
  refreshCommitment()
  if (session.phase !== 'connected') return
  const localSlot = session.roster.find((r) => r.id === session.localPlayerId)
  if (session.isHost) {
    if (localSlot) {
      localSlot.loadoutRoot = localRoot.value
      broadcastRosterFromHost()
    }
  } else {
    const req: UpdatePlayerSetupEvent = {
      type: 'UPDATE_PLAYER_SETUP',
      playerId: session.localPlayerId,
      targetTeam: localSlot?.team ?? 'A',
      tankId: session.selectedTankId,
      loadoutRoot: localRoot.value,
    }
    transport.sendToHost(req)
  }
}

function handleToggleReady(): void {
  if (session.isHost) return
  soundController.play('ui_ready')
  const localSlot = session.roster.find((r) => r.id === session.localPlayerId)
  const req: UpdatePlayerSetupEvent = {
    type: 'UPDATE_PLAYER_SETUP',
    playerId: session.localPlayerId,
    targetTeam: localSlot?.team ?? 'A',
    tankId: session.selectedTankId,
    loadoutRoot: localRoot.value,
    ready: !localReady.value,
  }
  transport.sendToHost(req)
}

function selectMapPreset(mapId: MapPresetId): void {
  if (!session.isHost && session.phase === 'connected') return
  session.selectedMapId = mapId
  if (session.isHost && session.phase === 'connected') {
    broadcastRosterFromHost()
  }
}

function selectDisconnectPolicy(policy: DisconnectPolicy): void {
  if (session.locked || (!session.isHost && session.phase === 'connected')) return
  soundController.play('ui_click')
  session.disconnectPolicy = policy
  if (session.isHost && session.phase === 'connected') broadcastRosterFromHost()
}

function handleSwitchTeam(targetTeam: TeamId): void {
  soundController.play('ui_click')
  if (session.isHost) {
    const slot = session.roster.find((r) => r.id === session.localPlayerId)
    if (slot && slot.team !== targetTeam) {
      if (countTeamMembers(session.roster, targetTeam) < MAX_PLAYERS_PER_TEAM) {
        slot.team = targetTeam
        broadcastRosterFromHost()
      }
    }
  } else {
    const req: UpdatePlayerSetupEvent = {
      type: 'UPDATE_PLAYER_SETUP',
      playerId: session.localPlayerId,
      targetTeam,
      tankId: session.selectedTankId,
      loadoutRoot: localRoot.value,
    }
    transport.sendToHost(req)
  }
}

function handleStartP2PBattle(): void {
  if (!canStartMatch.value) return
  soundController.play('ui_start')
  const seed = Math.floor(Math.random() * 90000) + 1000
  pendingSeed.value = seed
  session.locked = true
  transport.lockRoom()
  roomStatus = 'playing'
  announceRoom()

  const rosterSnapshot = session.roster.map((r) => ({ ...r }))
  const startMsg: StartBattleEvent = {
    type: 'START_BATTLE',
    seed,
    initialWind: 0,
    mapId: session.selectedMapId,
    roster: rosterSnapshot,
  }
  transport.broadcast(startMsg)
  emit('start-game', {
    mode: 'p2p',
    localRole: session.localPlayerId,
    isHost: true,
    seed,
    initialWind: 0,
    mapId: session.selectedMapId,
    roster: rosterSnapshot,
    roomCode: session.roomCode,
    loadoutSecret: localSecret ?? undefined,
  })
}

function handleStartHotseatBattle(): void {
  soundController.play('ui_start')
  const seed = Math.floor(Math.random() * 90000) + 1000
  const n = Math.max(1, Math.min(5, hotseatCountPerTeam.value))
  const roster: RosterSlot[] = []
  for (let i = 1; i <= n; i++) {
    const tankId = hotseatTeamATanks[i - 1] ?? tankAt(i - 1)
    const isBot = hotseatBotTeams.A
    roster.push({ id: `a${i}`, name: isBot ? `🤖 CPU A${i}` : `琥珀 A${i}`, team: 'A', tankId, isHost: i === 1, isBot, loadout: picksFor(tankId), botLevel: isBot ? hotseatBotLevels.A : undefined })
  }
  for (let i = 1; i <= n; i++) {
    const tankId = hotseatTeamBTanks[i - 1] ?? tankAt(i)
    const isBot = hotseatBotTeams.B
    roster.push({ id: `b${i}`, name: isBot ? `🤖 CPU B${i}` : `皇家藍 B${i}`, team: 'B', tankId, isHost: false, isBot, loadout: picksFor(tankId), botLevel: isBot ? hotseatBotLevels.B : undefined })
  }
  emit('start-game', {
    mode: 'hotseat',
    localRole: 'a1',
    isHost: true,
    seed,
    initialWind: 0,
    mapId: session.selectedMapId,
    roster,
    roomCode: 'LOCAL',
  })
}

function handleDisconnect(): void {
  soundController.play('ui_click')
  stopHeartbeat()
  if (session.isHost && session.roomCode) void directory.remove(session.roomCode)
  transport.disconnect()
  session.phase = 'idle'
  session.roster = []
  session.locked = false
  session.errorMessage = undefined
  if (props.inBattle) {
    emit('leave-game')
  }
}

async function copyRoomCode(): Promise<void> {
  if (!session.roomCode || typeof navigator === 'undefined' || !navigator.clipboard) return
  try {
    await navigator.clipboard.writeText(session.roomCode)
    copied.value = true
    soundController.play('ui_click')
    setTimeout(() => {
      copied.value = false
    }, 1800)
  } catch {
    // ignore
  }
}

async function copyInviteLink(): Promise<void> {
  if (!session.roomCode || typeof window === 'undefined' || !navigator.clipboard) return
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('room', session.roomCode)
    await navigator.clipboard.writeText(url.toString())
    copiedLink.value = true
    soundController.play('ui_click')
    setTimeout(() => {
      copiedLink.value = false
    }, 1800)
  } catch {
    // ignore
  }
}

function sendMessage(msg: ProtocolMessage): void {
  if (session.isHost) {
    transport.broadcast(msg)
  } else {
    transport.sendToHost(msg)
  }
}

defineExpose({
  sendMessage,
  handleDisconnect,
})

onMounted(() => {
  void refreshRoomList()
  roomPollTimer = setInterval(() => {
    const idle = session.phase === 'idle' || session.phase === 'error'
    if (!props.inBattle && gameMode.value === 'p2p' && idle) void refreshRoomList()
  }, 5000)

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    const roomParam = params.get('room')?.trim().toUpperCase()
    if (roomParam && roomParam.length === 6) {
      gameMode.value = 'p2p'
      joinInputCode.value = roomParam
    }
  }
})

watch(
  () => [session.roster.length, session.selectedMapId, session.disconnectPolicy],
  () => {
    if (heartbeatTimer !== null) announceRoom()
  },
)

onUnmounted(() => {
  stopHeartbeat()
  if (roomPollTimer !== null) clearInterval(roomPollTimer)
  if (session.isHost && session.roomCode) void directory.remove(session.roomCode)
  transport.disconnect()
})
</script>

<template>
  <!-- 大廳動態視差背景：跟隨所選地圖無縫呈現高空浮島、雪原、峽谷或黃沙質感 -->
  <LobbyBackdrop v-if="!props.inBattle" :map="currentMapBlueprint" />

  <!-- 全圖庫與操作指南彈窗 -->
  <StageSelectModal
    :open="showStageModal"
    :selected-map-id="session.selectedMapId"
    @select="selectMapPreset"
    @close="showStageModal = false"
  />
  <TacticalGuideModal
    :open="showGuideModal"
    @close="showGuideModal = false"
  />

  <section v-if="!props.inBattle" class="relative z-10 flex flex-col justify-between space-y-4">
    <!-- 頂部指揮艦橋導航列 (Arcade Command Bar) -->
    <header class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-sky-400/30 bg-slate-900/90 px-4 py-2.5 shadow-2xl backdrop-blur-md">
      <!-- 模式切換按鈕組 -->
      <div class="inline-flex rounded-xl bg-slate-950/80 p-1 border border-slate-700/80 text-xs">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-black transition cursor-pointer"
          :class="
            gameMode === 'p2p'
              ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-[0_0_15px_rgba(251,191,36,0.5)]'
              : 'text-slate-300 hover:text-white'
          "
          @click="gameMode = 'p2p'; soundController.play('ui_select')"
        >
          <span>🌐</span> 多人連線大廳 (P2P)
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-black transition cursor-pointer"
          :class="
            gameMode === 'hotseat'
              ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-[0_0_15px_rgba(251,191,36,0.5)]'
              : 'text-slate-300 hover:text-white'
          "
          @click="handleDisconnect(); gameMode = 'hotseat'; soundController.play('ui_select')"
        >
          <span>🤖</span> 單機 / 挑戰電腦
        </button>
      </div>

      <!-- 右側快捷狀態與手冊 -->
      <div class="flex items-center gap-2 text-xs">
        <span
          class="hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold"
          :class="
            signalingInfo.mode === 'custom'
              ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
              : signalingInfo.mode === 'fallback-public'
                ? 'border-amber-400/50 bg-amber-500/20 text-amber-300'
                : 'border-sky-400/40 bg-sky-500/20 text-sky-300'
          "
        >
          📡 {{ signalingInfo.label }}
        </span>

        <button
          type="button"
          class="flex items-center gap-1 rounded-xl border border-sky-400/40 bg-sky-500/20 px-3 py-1.5 font-bold text-sky-200 hover:border-sky-300 hover:bg-sky-400/30 hover:text-white transition cursor-pointer"
          @click="showGuideModal = true; soundController.play('ui_click')"
        >
          <span>📖</span> 作戰指南
        </button>
      </div>
    </header>

    <!-- 核心作戰主控台 (3 欄遊戲專案佈局：戰車機庫、空域展示卡、作戰編制) -->
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <!-- 欄 1：戰車格納庫展示 (4 欄) -->
      <div class="lg:col-span-4">
        <TankHangarPodium
          :selected-tank-id="session.selectedTankId"
          :loadout-picks="loadoutPicks"
          :locked="session.locked"
          @select-tank="selectTankArchetype"
          @change-loadout="onPickLoadout"
        />
      </div>

      <!-- 欄 2：空域地貌展示卡 (4 欄) — 零表單捲動、遊戲卡片式輪播 -->
      <div class="lg:col-span-4">
        <StageShowcase
          :selected-map-id="session.selectedMapId"
          :disabled="!session.isHost && session.phase === 'connected'"
          @select="selectMapPreset"
          @open-gallery="showStageModal = true; soundController.play('ui_click')"
        />
      </div>

      <!-- 欄 3：作戰編制與對戰大廳 (4 欄) -->
      <div class="lg:col-span-4 flex flex-col justify-between rounded-3xl border-2 border-sky-400/30 bg-slate-900/90 p-4 shadow-2xl backdrop-blur-md space-y-3">
        <!-- P2P 模式 -->
        <div v-if="gameMode === 'p2p'" class="space-y-3">
          <!-- 玩家名稱輸入 -->
          <div class="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-2">
            <span class="text-xs font-black text-amber-300">👤 指揮官代號</span>
            <input
              v-model="session.localPlayerName"
              type="text"
              maxlength="16"
              :disabled="session.phase !== 'idle' && session.phase !== 'error'"
              placeholder="Commander"
              class="rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs font-bold text-amber-300 placeholder-slate-500 focus:border-amber-400 focus:outline-none disabled:opacity-60"
            />
          </div>

          <!-- 閒置狀態：建立房間或輸入房號 -->
          <div v-if="session.phase === 'idle' || session.phase === 'error'" class="space-y-3">
            <!-- 建立房間卡 -->
            <div class="rounded-2xl border-2 border-amber-400/50 bg-slate-800/80 p-3 space-y-2 shadow-md">
              <div class="flex items-center justify-between text-xs font-black text-amber-300">
                <span>👑 建立新戰局 (HOST)</span>
                <span class="text-[10px] text-amber-200/70">最多 10 人 (5v5)</span>
              </div>
              <input
                v-model="roomName"
                type="text"
                maxlength="24"
                placeholder="戰局名稱（選填）"
                class="w-full rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-xs text-white placeholder-slate-400 focus:border-amber-300 focus:outline-none"
              />
              <button
                type="button"
                class="w-full rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-500 py-2.5 text-xs font-black text-slate-950 shadow-lg hover:from-amber-300 hover:to-orange-400 transition cursor-pointer"
                @click="handleHost"
              >
                ➕ 建立戰局取得 6 碼代碼
              </button>
            </div>

            <!-- 輸入房號加入卡 -->
            <div class="rounded-2xl border-2 border-sky-400/50 bg-slate-800/80 p-3 space-y-2 shadow-md">
              <div class="text-xs font-black text-sky-200">🚀 加入好友戰局 (JOIN)</div>
              <div class="flex items-center gap-1.5">
                <input
                  v-model="joinInputCode"
                  type="text"
                  maxlength="6"
                  placeholder="輸入 6 碼房號"
                  class="flex-1 rounded-xl border border-slate-700 bg-slate-900/90 px-3 py-1.5 font-mono text-xs font-black uppercase tracking-widest text-amber-300 placeholder-slate-400 focus:border-sky-300 focus:outline-none"
                  @keyup.enter="handleJoin"
                />
                <button
                  type="button"
                  :disabled="joinInputCode.trim().length !== 6"
                  class="rounded-xl bg-gradient-to-r from-sky-400 to-blue-600 px-4 py-1.5 text-xs font-black text-white shadow-md hover:from-sky-300 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                  @click="handleJoin"
                >
                  連線
                </button>
              </div>
            </div>

            <!-- 公共房間目錄雷達 -->
            <div class="rounded-2xl border border-sky-400/30 bg-slate-800/70 p-3 space-y-2 text-xs shadow-md">
              <div class="flex items-center justify-between">
                <span class="font-black text-slate-300">📡 公開戰局雷達</span>
                <button
                  v-if="directory.available"
                  type="button"
                  :disabled="roomListLoading"
                  class="rounded-lg bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:text-white cursor-pointer"
                  @click="refreshRoomList"
                >
                  {{ roomListLoading ? '更新中…' : '🔄 重新整理' }}
                </button>
              </div>

              <div v-if="!directory.available" class="text-[11px] text-slate-400">
                目前使用公共信令，請直接輸入房號加入。
              </div>
              <div v-else-if="roomListLoaded && roomList.length === 0" class="text-[11px] text-slate-400">
                目前沒有等待中的房間，建立一間吧！
              </div>
              <ul v-else-if="roomList.length > 0" class="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                <li
                  v-for="room in roomList"
                  :key="room.code"
                  class="flex items-center justify-between gap-1.5 rounded-xl border border-slate-700/60 bg-slate-900/80 p-2"
                >
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-xs font-black text-white">{{ room.name }}</div>
                    <div class="truncate text-[10px] text-slate-400 font-mono">
                      房主 {{ room.hostName }} · {{ formatMapName(room.mapId) }}
                    </div>
                  </div>
                  <span class="shrink-0 font-mono text-[10px] font-bold text-amber-400">
                    {{ room.players }}/{{ room.maxPlayers }}
                  </span>
                  <button
                    type="button"
                    :disabled="room.status !== 'waiting' || room.players >= room.maxPlayers"
                    class="shrink-0 rounded-lg bg-amber-400 px-2 py-1 text-[10px] font-black text-slate-950 hover:bg-amber-300 disabled:opacity-40 cursor-pointer"
                    @click="joinFromList(room)"
                  >
                    加入
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <!-- 連線中狀態 -->
          <div
            v-else-if="session.phase === 'joining' || session.phase === 'hosting'"
            class="rounded-2xl border-2 border-slate-700 bg-slate-950/70 p-6 text-center space-y-3"
          >
            <div class="text-xs font-black text-amber-300 animate-pulse">
              🔄 正在連線至房間 {{ session.roomCode }}...
            </div>
            <button
              type="button"
              class="rounded-xl border border-slate-700 px-4 py-1.5 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
              @click="handleDisconnect"
            >
              取消連線
            </button>
          </div>

          <!-- 已進入房間大廳 (Ready Room 雙隊編制) -->
          <div v-else-if="session.phase === 'connected'" class="space-y-3">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-2">
              <div class="flex items-center gap-1.5">
                <span class="text-xs font-black text-emerald-400">● 戰鬥室</span>
                <span class="rounded-lg bg-slate-950 px-2.5 py-0.5 font-mono text-sm font-black tracking-widest text-amber-400 border border-amber-400/40">
                  {{ session.roomCode }}
                </span>
              </div>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="rounded-lg bg-slate-800 px-2 py-1 text-[10px] font-black text-slate-200 hover:text-white cursor-pointer"
                  @click="copyRoomCode"
                >
                  {{ copied ? '✓ 已複製' : '複製代號' }}
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-amber-400 px-2 py-1 text-[10px] font-black text-slate-950 hover:bg-amber-300 cursor-pointer"
                  @click="copyInviteLink"
                >
                  {{ copiedLink ? '✓ 已複製' : '🔗 邀請' }}
                </button>
              </div>
            </div>

            <!-- 兩隊名冊 (Team A vs Team B) -->
            <div class="grid grid-cols-2 gap-2 text-xs">
              <!-- Team A -->
              <div class="rounded-2xl border-2 border-amber-400/50 bg-slate-800/80 p-2.5 space-y-2 shadow-md">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-black text-amber-300">
                    🟠 琥珀隊 ({{ teamARoster.length }}/5)
                  </span>
                  <button
                    type="button"
                    :disabled="teamARoster.length >= MAX_PLAYERS_PER_TEAM"
                    class="rounded-lg bg-amber-400 px-2 py-0.5 text-[10px] font-black text-slate-950 hover:bg-amber-300 disabled:opacity-40 cursor-pointer shadow-sm"
                    @click="handleSwitchTeam('A')"
                  >
                    加入
                  </button>
                </div>
                <div class="space-y-1">
                  <div
                    v-for="m in teamARoster"
                    :key="m.id"
                    class="flex items-center justify-between rounded-xl bg-slate-900/90 px-2.5 py-1.5 border border-amber-400/30"
                  >
                    <div class="truncate font-bold text-slate-100 text-[11px]">
                      {{ m.name }}
                      <span v-if="m.id === session.localPlayerId" class="text-amber-400">(你)</span>
                    </div>
                    <span
                      class="shrink-0 font-mono text-[10px] font-black"
                      :class="m.isHost || m.ready ? 'text-emerald-400' : 'text-amber-300/70'"
                    >
                      {{ m.isHost ? '👑 房主' : m.ready ? '✅ 準備' : '⏳ 等待' }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Team B -->
              <div class="rounded-2xl border-2 border-sky-400/50 bg-slate-800/80 p-2.5 space-y-2 shadow-md">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-black text-sky-200">
                    🔵 皇家藍隊 ({{ teamBRoster.length }}/5)
                  </span>
                  <button
                    type="button"
                    :disabled="teamBRoster.length >= MAX_PLAYERS_PER_TEAM"
                    class="rounded-lg bg-sky-400 px-2 py-0.5 text-[10px] font-black text-slate-950 hover:bg-sky-300 disabled:opacity-40 cursor-pointer shadow-sm"
                    @click="handleSwitchTeam('B')"
                  >
                    加入
                  </button>
                </div>
                <div class="space-y-1">
                  <div
                    v-for="m in teamBRoster"
                    :key="m.id"
                    class="flex items-center justify-between rounded-xl bg-slate-900/90 px-2.5 py-1.5 border border-sky-400/30"
                  >
                    <div class="truncate font-bold text-slate-100 text-[11px]">
                      {{ m.name }}
                      <span v-if="m.id === session.localPlayerId" class="text-sky-300">(你)</span>
                    </div>
                    <span
                      class="shrink-0 font-mono text-[10px] font-black"
                      :class="m.isHost || m.ready ? 'text-emerald-400' : 'text-sky-200/70'"
                    >
                      {{ m.isHost ? '👑 房主' : m.ready ? '✅ 準備' : '⏳ 等待' }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 房主設定：斷線處置 -->
            <div v-if="session.isHost" class="flex items-center justify-between rounded-xl border border-sky-400/30 bg-slate-800/80 px-3 py-2 text-[11px] shadow-sm">
              <span class="font-black text-slate-200">斷線替補策略:</span>
              <div class="inline-flex rounded-lg bg-slate-950/80 p-0.5 border border-slate-700">
                <button
                  type="button"
                  class="rounded px-2.5 py-0.5 text-[10px] font-black transition cursor-pointer"
                  :class="session.disconnectPolicy === 'forfeit' ? 'bg-amber-400 text-slate-950 shadow' : 'text-slate-400 hover:text-white'"
                  @click="selectDisconnectPolicy('forfeit')"
                >
                  認輸陣亡
                </button>
                <button
                  type="button"
                  class="rounded px-2.5 py-0.5 text-[10px] font-black transition cursor-pointer"
                  :class="session.disconnectPolicy === 'bot' ? 'bg-amber-400 text-slate-950 shadow' : 'text-slate-400 hover:text-white'"
                  @click="selectDisconnectPolicy('bot')"
                >
                  電腦代打
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 單機熱座 / CPU 對抗模式 -->
        <div v-else class="space-y-3">
          <div class="flex items-center justify-between border-b border-slate-700/60 pb-2">
            <span class="text-xs font-black text-amber-300">⚔️ 對戰編制規模</span>
            <div class="inline-flex gap-1">
              <button
                v-for="n in [1, 2, 3, 4, 5]"
                :key="n"
                type="button"
                class="rounded-lg border-2 px-2.5 py-0.5 text-[11px] font-black transition cursor-pointer"
                :class="
                  hotseatCountPerTeam === n
                    ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-md'
                    : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-amber-400/50'
                "
                @click="hotseatCountPerTeam = n; soundController.play('ui_click')"
              >
                {{ n }}v{{ n }}
              </button>
            </div>
          </div>

          <!-- 兩隊陣容與電腦操控設定 -->
          <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs">
            <!-- Team A -->
            <div class="rounded-2xl border-2 border-amber-400/50 bg-slate-800/80 p-3 space-y-2.5 shadow-md">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-black text-amber-300">🟠 琥珀隊</span>
                <div class="inline-flex overflow-hidden rounded-lg border border-amber-500/50 text-[10px] font-black">
                  <button
                    type="button"
                    class="px-2.5 py-0.5 transition cursor-pointer"
                    :class="!hotseatBotTeams.A ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-300 hover:text-white'"
                    @click="hotseatBotTeams.A = false; soundController.play('ui_click')"
                  >
                    👤 玩家
                  </button>
                  <button
                    type="button"
                    class="px-2.5 py-0.5 transition cursor-pointer"
                    :class="hotseatBotTeams.A ? 'bg-amber-400 text-slate-950' : 'bg-slate-900 text-slate-300 hover:text-white'"
                    @click="hotseatBotTeams.A = true; soundController.play('ui_click')"
                  >
                    🤖 CPU
                  </button>
                </div>
              </div>

              <!-- 電腦強度選擇 -->
              <div v-if="hotseatBotTeams.A" class="flex items-center gap-1 pt-1 border-t border-amber-400/20">
                <span class="shrink-0 text-[10px] font-black text-amber-300">強度:</span>
                <button
                  v-for="[level, spec] in BOT_LEVELS"
                  :key="level"
                  type="button"
                  class="flex-1 rounded-md px-1 py-0.5 text-[9px] font-black transition cursor-pointer"
                  :class="
                    hotseatBotLevels.A === level
                      ? 'bg-amber-400 text-slate-950 font-black shadow-sm'
                      : 'bg-slate-900/80 text-slate-300 hover:text-white'
                  "
                  @click="hotseatBotLevels.A = level; soundController.play('ui_click')"
                >
                  {{ spec.label }}
                </button>
              </div>

              <!-- 出戰坦克輪替 -->
              <div
                v-for="idx in hotseatCountPerTeam"
                :key="`solo-a-${idx}`"
                class="flex items-center justify-between gap-1 rounded-xl bg-slate-900/90 p-2 border border-amber-400/25"
              >
                <span class="text-[11px] font-black text-amber-300">A{{ idx }}</span>
                <div class="flex gap-1">
                  <button
                    v-for="t in TANK_LIST"
                    :key="t.id"
                    type="button"
                    class="rounded-lg px-2 py-0.5 text-[10px] font-black transition cursor-pointer"
                    :class="
                      (hotseatTeamATanks[idx - 1] ?? tankAt(idx - 1)) === t.id
                        ? 'bg-amber-400 text-slate-950 font-black shadow'
                        : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                    "
                    @click="setHotseatSlotTank('A', idx - 1, t.id)"
                  >
                    {{ t.name.split(' ')[0] }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Team B -->
            <div class="rounded-2xl border-2 border-sky-400/50 bg-slate-800/80 p-3 space-y-2.5 shadow-md">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-black text-sky-200">🔵 皇家藍隊</span>
                <div class="inline-flex overflow-hidden rounded-lg border border-sky-500/50 text-[10px] font-black">
                  <button
                    type="button"
                    class="px-2.5 py-0.5 transition cursor-pointer"
                    :class="!hotseatBotTeams.B ? 'bg-sky-400 text-slate-950' : 'bg-slate-900 text-slate-300 hover:text-white'"
                    @click="hotseatBotTeams.B = false; soundController.play('ui_click')"
                  >
                    👤 玩家
                  </button>
                  <button
                    type="button"
                    class="px-2.5 py-0.5 transition cursor-pointer"
                    :class="hotseatBotTeams.B ? 'bg-sky-400 text-slate-950' : 'bg-slate-900 text-slate-300 hover:text-white'"
                    @click="hotseatBotTeams.B = true; soundController.play('ui_click')"
                  >
                    🤖 CPU
                  </button>
                </div>
              </div>

              <!-- 電腦強度選擇 -->
              <div v-if="hotseatBotTeams.B" class="flex items-center gap-1 pt-1 border-t border-sky-400/20">
                <span class="shrink-0 text-[10px] font-black text-sky-200">強度:</span>
                <button
                  v-for="[level, spec] in BOT_LEVELS"
                  :key="level"
                  type="button"
                  class="flex-1 rounded-md px-1 py-0.5 text-[9px] font-black transition cursor-pointer"
                  :class="
                    hotseatBotLevels.B === level
                      ? 'bg-sky-400 text-slate-950 font-black shadow-sm'
                      : 'bg-slate-900/80 text-slate-300 hover:text-white'
                  "
                  @click="hotseatBotLevels.B = level; soundController.play('ui_click')"
                >
                  {{ spec.label }}
                </button>
              </div>

              <!-- 出戰坦克輪替 -->
              <div
                v-for="idx in hotseatCountPerTeam"
                :key="`solo-b-${idx}`"
                class="flex items-center justify-between gap-1 rounded-xl bg-slate-900/90 p-2 border border-sky-400/25"
              >
                <span class="text-[11px] font-black text-sky-200">B{{ idx }}</span>
                <div class="flex gap-1">
                  <button
                    v-for="t in TANK_LIST"
                    :key="t.id"
                    type="button"
                    class="rounded-lg px-2 py-0.5 text-[10px] font-black transition cursor-pointer"
                    :class="
                      (hotseatTeamBTanks[idx - 1] ?? tankAt(idx)) === t.id
                        ? 'bg-sky-400 text-slate-950 font-black shadow'
                        : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                    "
                    @click="setHotseatSlotTank('B', idx - 1, t.id)"
                  >
                    {{ t.name.split(' ')[0] }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 錯誤警告條 -->
        <div
          v-if="session.errorMessage"
          class="flex items-center justify-between rounded-xl border border-rose-500 bg-rose-500/20 px-3 py-1.5 text-xs text-rose-300"
        >
          <span>⚠️ {{ session.errorMessage }}</span>
          <button
            type="button"
            class="text-[10px] underline hover:text-white cursor-pointer"
            @click="session.errorMessage = undefined"
          >
            關閉
          </button>
        </div>

        <!-- 底部出擊控制區 (巨大街機發射鈕) -->
        <div class="pt-2 border-t border-slate-700/60 flex items-center gap-2">
          <button
            v-if="session.phase === 'connected'"
            type="button"
            class="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer"
            @click="handleDisconnect"
          >
            離開
          </button>

          <!-- P2P 開戰鈕 -->
          <template v-if="gameMode === 'p2p' && session.phase === 'connected'">
            <button
              v-if="session.isHost"
              type="button"
              :disabled="!canStartMatch"
              class="flex-1 rounded-2xl bg-gradient-to-r from-emerald-400 to-green-500 py-3 text-sm font-black text-slate-950 shadow-[0_0_25px_rgba(52,211,153,0.4)] hover:from-emerald-300 hover:to-green-400 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              @click="handleStartP2PBattle"
            >
              {{
                canStartMatch
                  ? `🚀 鎖定房間並出擊 (${teamARoster.length}v${teamBRoster.length})`
                  : !allGuestsReady
                    ? '等待所有玩家按下準備…'
                    : '等待雙方各至少 1 人…'
              }}
            </button>
            <button
              v-else
              type="button"
              class="flex-1 rounded-2xl py-3 text-sm font-black shadow-lg transition cursor-pointer"
              :class="
                localReady
                  ? 'border-2 border-emerald-400 bg-emerald-500/20 text-emerald-300'
                  : 'bg-gradient-to-r from-emerald-400 to-green-500 text-slate-950 hover:from-emerald-300 hover:to-green-400'
              "
              @click="handleToggleReady"
            >
              {{ localReady ? '✅ 準備就緒 (點擊取消)' : '⚡ 準備出擊 (READY)' }}
            </button>
          </template>

          <!-- 單機開戰鈕 -->
          <button
            v-else-if="gameMode === 'hotseat'"
            type="button"
            class="w-full rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-500 py-3.5 text-sm font-black text-slate-950 shadow-[0_0_25px_rgba(251,191,36,0.5)] hover:from-amber-300 hover:to-orange-400 transition cursor-pointer"
            @click="handleStartHotseatBattle"
          >
            {{ hotseatStartLabel }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
