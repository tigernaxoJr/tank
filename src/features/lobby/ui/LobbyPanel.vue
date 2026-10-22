<script setup lang="ts">
import { isForgedAction } from '../infra/messageGuards'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { BOT_LEVEL_SPECS, MAP_LIST, MAP_REGISTRY, renderMapPreview, TANK_LIST, TANK_REGISTRY } from '@/features/battle'
import TankStatPanel from './TankStatPanel.vue'
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
import { createRoomDirectory, type RoomListing, type RoomStatus } from '../infra/roomDirectory'
import type {
  BotLevel,
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
const hotseatCountPerTeam = ref(1)
const hotseatTeamATanks = reactive<TankArchetypeId[]>([
  'aegis',
  'goliath',
  'zephyr',
  'aegis',
  'goliath',
])
const hotseatTeamBTanks = reactive<TankArchetypeId[]>([
  'goliath',
  'zephyr',
  'aegis',
  'goliath',
  'zephyr',
])
// 單機模式各隊由玩家或電腦操控（預設：玩家 vs 電腦）
const hotseatBotTeams = reactive<Record<TeamId, boolean>>({ A: false, B: true })
// 各隊電腦難度（預設中等：會有瞄準偏差，不至於每發都命中）
const hotseatBotLevels = reactive<Record<TeamId, BotLevel>>({ A: 'normal', B: 'normal' })
const BOT_LEVELS = Object.entries(BOT_LEVEL_SPECS) as [BotLevel, (typeof BOT_LEVEL_SPECS)[BotLevel]][]
const hotseatStartLabel = computed(() => {
  const n = hotseatCountPerTeam.value
  if (hotseatBotTeams.A && hotseatBotTeams.B) return `🍿 觀戰 ${n}v${n} 電腦對決`
  if (hotseatBotTeams.A || hotseatBotTeams.B) return `🚀 開始 ${n}v${n} 挑戰電腦`
  return `🚀 開始 ${n}v${n} 單機熱座對戰`
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
  selectedTankId: 'aegis',
  selectedMapId: 'harvest_plains',
  locked: false,
  roster: [],
  errorMessage: undefined,
})

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
  })
}

function startHeartbeat(): void {
  stopHeartbeat()
  roomStatus = 'waiting'
  announceRoom()
  // 伺服器 30 秒沒收到心跳就會清除房間
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
      slot.tankId = msg.tankId || 'aegis'
      broadcastRosterFromHost()
    }
    return
  }

  if (msg.type === 'UPDATE_PLAYER_SETUP') {
    const slot = session.roster.find((r) => r.id === peerSlotId)
    if (slot) {
      slot.tankId = msg.tankId
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

  // 動作只能由該槽位本人送出，不信任訊息裡自稱的 playerId（防止替別人的坦克開火 / 移動）
  if (isForgedAction(msg, peerSlotId)) return

  if (msg.type === 'ACTION_FIRE' || msg.type === 'ACTION_MOVE' || msg.type === 'SYNC_HASH') {
    transport.broadcast(msg, peerSlotId)
    emit('remote-message', msg)
    return
  }

  // 重新同步請求只給房主處理，不轉發給其他客端
  if (msg.type === 'RESYNC_REQUEST') emit('remote-message', msg)
}

function handleClientReceiveMessage(msg: ProtocolMessage): void {
  if (msg.type === 'LOBBY_ROSTER_UPDATE') {
    session.localPlayerId = msg.assignedPlayerId
    session.selectedMapId = msg.mapId
    session.roster = msg.roster
    return
  }

  if (msg.type === 'START_BATTLE') {
    session.roster = msg.roster
    session.selectedMapId = msg.mapId
    session.locked = true
    emit('start-game', {
      mode: 'p2p',
      localRole: session.localPlayerId,
      isHost: false,
      seed: msg.seed,
      initialWind: msg.initialWind,
      mapId: msg.mapId,
      roster: msg.roster,
      roomCode: session.roomCode,
    })
    return
  }

  emit('remote-message', msg)
}

async function handleHost(): Promise<void> {
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
    },
  ]

  try {
    const finalCode = await transport.hostRoomWithRetry(initialCode, {
      onPeerConnected: (peerSlotId) => {
        const team = pickBalancedTeam(session.roster)
        if (!team || session.roster.length >= MAX_TOTAL_PLAYERS) {
          return
        }
        session.roster.push({
          id: peerSlotId,
          name: `Player ${peerSlotId.toUpperCase()}`,
          team,
          tankId: 'aegis',
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
          // 對戰中斷線視為認輸：通知所有人（含房主自己的戰場），避免輪到他時全場卡住
          const left: ProtocolMessage = { type: 'PLAYER_LEFT', playerId: peerSlotId }
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
        const joinInfo: PlayerJoinInfoEvent = {
          type: 'PLAYER_JOIN_INFO',
          guestName: session.localPlayerName,
          tankId: session.selectedTankId,
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
  if (session.phase !== 'connected') return

  const localSlot = session.roster.find((r) => r.id === session.localPlayerId)
  const currentTeam = localSlot?.team ?? 'A'
  if (session.isHost) {
    if (localSlot) {
      localSlot.tankId = tankId
      broadcastRosterFromHost()
    }
  } else {
    const req: UpdatePlayerSetupEvent = {
      type: 'UPDATE_PLAYER_SETUP',
      playerId: session.localPlayerId,
      targetTeam: currentTeam,
      tankId,
    }
    transport.sendToHost(req)
  }
}

function setHotseatSlotTank(team: TeamId, slotIndex: number, tankId: TankArchetypeId): void {
  if (team === 'A') {
    hotseatTeamATanks[slotIndex] = tankId
    if (slotIndex === 0) {
      session.selectedTankId = tankId
    }
  } else {
    hotseatTeamBTanks[slotIndex] = tankId
  }
}

function handleToggleReady(): void {
  if (session.isHost) return
  const localSlot = session.roster.find((r) => r.id === session.localPlayerId)
  const req: UpdatePlayerSetupEvent = {
    type: 'UPDATE_PLAYER_SETUP',
    playerId: session.localPlayerId,
    targetTeam: localSlot?.team ?? 'A',
    tankId: session.selectedTankId,
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

function handleSwitchTeam(targetTeam: TeamId): void {
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
    }
    transport.sendToHost(req)
  }
}

function handleStartP2PBattle(): void {
  if (!canStartMatch.value) return
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
  })
}

function handleStartHotseatBattle(): void {
  const seed = Math.floor(Math.random() * 90000) + 1000
  const n = Math.max(1, Math.min(5, hotseatCountPerTeam.value))
  const roster: RosterSlot[] = []
  for (let i = 1; i <= n; i++) {
    const tankId = hotseatTeamATanks[i - 1] ?? 'aegis'
    const isBot = hotseatBotTeams.A
    roster.push({ id: `a${i}`, name: isBot ? `🤖 CPU A${i}` : `琥珀 A${i}`, team: 'A', tankId, isHost: i === 1, isBot, botLevel: isBot ? hotseatBotLevels.A : undefined })
  }
  for (let i = 1; i <= n; i++) {
    const tankId = hotseatTeamBTanks[i - 1] ?? 'goliath'
    const isBot = hotseatBotTeams.B
    roster.push({ id: `b${i}`, name: isBot ? `🤖 CPU B${i}` : `皇家藍 B${i}`, team: 'B', tankId, isHost: false, isBot, botLevel: isBot ? hotseatBotLevels.B : undefined })
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
  // 在大廳閒置畫面每 5 秒自動刷新房間列表（進房、對戰中不輪詢）
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

// 人數 / 地圖變動時立即更新房間列表，不必等下一次心跳
watch(
  () => [session.roster.length, session.selectedMapId],
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
  <!-- 進入遊戲前的完整首頁大廳：2.5D 戰車格納庫 + 地圖選擇 + P2P 5v5 配對 -->
  <section v-if="!props.inBattle" class="grid grid-cols-1 gap-6 lg:grid-cols-12">
    <!-- 左欄：戰車選角格納庫與地圖選擇 (col 5) -->
    <div class="lg:col-span-5 flex flex-col justify-between rounded-3xl border-2 border-white/90 bg-gradient-to-b from-emerald-200 via-teal-200 to-cyan-200 p-5 shadow-2xl space-y-5 backdrop-blur-md">
      <!-- 1. 2.5D 戰車選角格納庫 -->
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-200 px-3 py-0.5 text-xs font-extrabold text-amber-700">
            🛡️ 戰車格納庫
          </span>
          <span class="text-[11px] text-teal-800">點擊選擇你的出戰坦克</span>
        </div>

        <div class="grid grid-cols-3 gap-2.5">
          <button
            v-for="tank in TANK_LIST"
            :key="tank.id"
            type="button"
            class="group flex flex-col items-center rounded-2xl border-2 p-2.5 text-center transition cursor-pointer"
            :class="
              session.selectedTankId === tank.id
                ? 'border-amber-500 bg-gradient-to-b from-white to-amber-100 shadow-lg shadow-amber-500/30 scale-[1.02]'
                : 'border-teal-600/40 bg-white/80 hover:border-teal-600/40'
            "
            @click="selectTankArchetype(tank.id)"
          >
            <div class="relative flex h-16 w-full items-center justify-center rounded-xl bg-gradient-to-b from-white/70 to-transparent">
              <img
                :src="tank.getSprites('A').hullUrl"
                :alt="tank.name"
                class="h-14 w-auto object-contain drop-shadow-md transition group-hover:scale-110"
              />
            </div>
            <div class="mt-1.5 text-xs font-extrabold text-teal-950">{{ tank.name }}</div>
            <div class="mt-0.5 text-[10px] font-semibold text-amber-700">
              HP {{ tank.maxHp }} · 輸出 ×{{ tank.damageMultiplier.toFixed(2) }}
            </div>
          </button>
        </div>

        <TankStatPanel :tank-id="session.selectedTankId" />
      </div>

      <!-- 2. 模組化跨螢幕地圖選擇器 -->
      <div class="space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-xs font-extrabold text-amber-700">🗺️ 選擇對戰地圖</span>
          <span class="text-[11px] text-teal-800">支援滑鼠拖曳與小地圖跳轉</span>
        </div>

        <div class="space-y-2">
          <button
            v-for="m in MAP_LIST"
            :key="m.id"
            type="button"
            class="flex w-full items-center gap-3 rounded-2xl border-2 p-2.5 text-left transition cursor-pointer"
            :class="
              session.selectedMapId === m.id
                ? 'border-amber-500 bg-white shadow-md'
                : 'border-teal-600/40 bg-white/80 hover:border-teal-600/40'
            "
            @click="selectMapPreset(m.id)"
          >
            <img
              :src="renderMapPreview(m)"
              :alt="m.name"
              class="h-11 w-20 shrink-0 rounded-xl border-2 border-white/70 object-cover shadow"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-1">
                <span class="truncate text-xs font-extrabold text-teal-950">{{ m.name }}</span>
                <span class="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-700">
                  {{ m.width }}×{{ m.height }}
                </span>
              </div>
              <p class="mt-0.5 line-clamp-1 text-[11px] text-teal-800">{{ m.description }}</p>
            </div>
          </button>
        </div>
      </div>

      <!-- 3. 遊戲快速指南 -->
      <div class="rounded-2xl border border-teal-600/40 bg-white/80 p-3.5 text-xs space-y-1.5">
        <div class="font-extrabold text-amber-700">⚡ 30 秒快速上手說明</div>
        <p class="text-[11px] leading-relaxed text-teal-900">
          1. 右側輸入暱稱，建立或輸入 <strong>6 碼房號</strong> 配對（支援 1v1 ~ 5v5）。<br />
          2. 輪到你的回合時，用 <kbd class="rounded bg-amber-400 px-1 font-bold text-slate-950">←/→</kbd> 移動、<kbd class="rounded bg-amber-400 px-1 font-bold text-slate-950">↑/↓</kbd> 調仰角，按住 <kbd class="rounded bg-amber-400 px-1 font-bold text-slate-950">空白鍵</kbd> 蓄力放開即開火！
        </p>
      </div>
    </div>

    <!-- 右欄：填入玩家資訊與 1v1~5v5 房間配對 (col 7) -->
    <div class="lg:col-span-7 rounded-3xl border-2 border-white/90 bg-gradient-to-b from-teal-200 via-emerald-200 to-lime-100 p-6 shadow-2xl space-y-6 backdrop-blur-md">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-teal-600/40 pb-4">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-lg font-black text-teal-950">連線配對大廳 (1v1 ~ 5v5)</h2>
            <span
              class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold"
              :class="
                signalingInfo.mode === 'custom'
                  ? 'border-emerald-600/60 bg-emerald-200 text-emerald-700'
                  : signalingInfo.mode === 'fallback-public'
                    ? 'border-amber-500/60 bg-amber-200 text-amber-800'
                    : 'border-teal-600/40 bg-sky-200 text-teal-800'
              "
            >
              📡 {{ signalingInfo.label }}
            </span>
          </div>
          <p class="text-xs text-teal-800">填寫玩家名稱，與好友建立點對點連線或單機同樂</p>
        </div>

        <div class="inline-flex rounded-xl bg-white/80 p-1 border border-teal-600/40 text-xs">
          <button
            type="button"
            class="rounded-lg px-3.5 py-1.5 font-extrabold transition cursor-pointer"
            :class="
              gameMode === 'p2p'
                ? 'bg-amber-400 text-slate-950 shadow'
                : 'text-teal-800 hover:text-teal-950'
            "
            @click="gameMode = 'p2p'"
          >
            🌐 多人連線大廳 (P2P)
          </button>
          <button
            type="button"
            class="rounded-lg px-3.5 py-1.5 font-extrabold transition cursor-pointer"
            :class="
              gameMode === 'hotseat'
                ? 'bg-amber-400 text-slate-950 shadow'
                : 'text-teal-800 hover:text-teal-950'
            "
            @click="handleDisconnect(); gameMode = 'hotseat'"
          >
            🖥️ 單機 / 挑戰電腦
          </button>
        </div>
      </div>

      <!-- P2P 連線對戰表單 -->
      <div v-if="gameMode === 'p2p'" class="space-y-5">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="block text-xs font-extrabold text-amber-700">
              步驟 1：輸入你的玩家暱稱 (Player Name)
            </label>
            <input
              v-model="session.localPlayerName"
              type="text"
              maxlength="16"
              :disabled="session.phase !== 'idle' && session.phase !== 'error'"
              placeholder="例如：TankMaster"
              class="w-full rounded-xl border-2 border-teal-600/40 bg-white/80 px-3.5 py-2.5 text-sm font-bold text-teal-950 placeholder-teal-600/70 focus:border-amber-300 focus:outline-none disabled:opacity-60"
            />
          </div>

          <div class="space-y-1.5">
            <label class="block text-xs font-extrabold text-amber-700">
              選擇你的出戰坦克 (進房前後皆可切換)
            </label>
            <div class="grid grid-cols-3 gap-1.5">
              <button
                v-for="tank in TANK_LIST"
                :key="tank.id"
                type="button"
                class="flex items-center gap-1.5 rounded-xl border-2 px-2 py-1.5 text-left transition cursor-pointer"
                :class="
                  session.selectedTankId === tank.id
                    ? 'border-amber-300 bg-amber-200 text-amber-800 shadow'
                    : 'border-teal-600/40 bg-white/80 text-teal-800 hover:border-teal-700'
                "
                @click="selectTankArchetype(tank.id)"
              >
                <img
                  :src="tank.getSprites('A').hullUrl"
                  :alt="tank.name"
                  class="h-7 w-7 shrink-0 object-contain"
                />
                <div class="min-w-0">
                  <div class="truncate text-[11px] font-black text-teal-950">{{ tank.name }}</div>
                  <div class="text-[9px] text-amber-700">HP {{ tank.maxHp }}</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div v-if="session.phase === 'idle' || session.phase === 'error'" class="space-y-4">
          <label class="block text-xs font-extrabold text-amber-700">
            步驟 2：建立新房間 (最多 10 人)，或輸入朋友的 6 碼房號加入
          </label>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="flex flex-col justify-between rounded-2xl border-2 border-amber-500/60 bg-white/80 p-4 space-y-3">
              <div>
                <div class="text-sm font-extrabold text-amber-700">👑 我是房主 (建立房間)</div>
                <p class="mt-1 text-xs text-teal-800">
                  自動避開重複房號，產生專屬 6 碼與邀請連結，最多可容納 10 人分隊。
                </p>
                <input
                  v-model="roomName"
                  type="text"
                  maxlength="24"
                  placeholder="房間名稱（選填，顯示在房間列表）"
                  class="mt-2 w-full rounded-xl border-2 border-amber-500/60 bg-white px-3 py-2 text-xs font-bold text-teal-950 placeholder-teal-600/70 focus:border-amber-300 focus:outline-none"
                />
              </div>
              <button
                type="button"
                class="w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-3 text-xs font-black text-slate-950 shadow-lg hover:from-amber-300 hover:to-orange-400 transition cursor-pointer"
                @click="handleHost"
              >
                ➕ 建立房間取得 6 碼房號
              </button>
            </div>

            <div class="flex flex-col justify-between rounded-2xl border-2 border-teal-600/40 bg-white/80 p-4 space-y-3">
              <div class="space-y-2">
                <div class="text-sm font-extrabold text-sky-700">🚀 我是隊友/對手 (加入房間)</div>
                <input
                  v-model="joinInputCode"
                  type="text"
                  maxlength="6"
                  placeholder="輸入 6 碼房號 (如 AB3K9P)"
                  class="w-full rounded-xl border-2 border-teal-600/40 bg-white px-3 py-2 font-mono text-sm font-black uppercase tracking-widest text-amber-700 placeholder-teal-600/70 focus:border-amber-300 focus:outline-none"
                  @keyup.enter="handleJoin"
                />
              </div>
              <button
                type="button"
                :disabled="joinInputCode.trim().length !== 6"
                class="w-full rounded-xl bg-gradient-to-r from-cyan-300 to-sky-400 py-3 text-xs font-black text-slate-950 shadow-lg hover:from-cyan-200 hover:to-sky-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                @click="handleJoin"
              >
                🔗 連線加入房間
              </button>
            </div>
          </div>

          <!-- 房間列表：只有連線到自建信令伺服器時才有；否則降級為輸入房號 -->
          <div class="rounded-2xl border-2 border-teal-600/40 bg-white/80 p-4 space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-extrabold text-sky-700">📋 房間列表</div>
              <button
                v-if="directory.available"
                type="button"
                :disabled="roomListLoading"
                class="rounded-lg bg-teal-100 px-2.5 py-1 text-xs font-bold text-teal-950 hover:bg-teal-200 disabled:opacity-50 cursor-pointer"
                @click="refreshRoomList"
              >
                {{ roomListLoading ? '更新中…' : '🔄 重新整理' }}
              </button>
            </div>

            <p v-if="!directory.available" class="text-xs text-teal-700">
              目前使用公共信令伺服器，沒有房間列表功能。請向房主索取 6 碼房號後輸入加入；
              若要啟用列表，請部署自建信令伺服器並設定 <code class="rounded bg-teal-100 px-1">VITE_PEER_HOST</code>。
            </p>
            <p v-else-if="roomListError" class="text-xs text-amber-700">
              ⚠️ 無法連線到房間目錄（自建信令伺服器可能離線）。仍可輸入房號加入。
            </p>
            <p v-else-if="roomListLoaded && roomList.length === 0" class="text-xs text-teal-700">
              目前沒有房間，建立一間吧！
            </p>

            <ul v-if="directory.available && roomList.length > 0" class="space-y-1.5">
              <li
                v-for="room in roomList"
                :key="room.code"
                class="flex items-center gap-2.5 rounded-xl border border-teal-600/40 bg-white/80 px-3 py-2"
              >
                <span
                  class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold"
                  :class="room.status === 'waiting' ? 'bg-emerald-200 text-emerald-700' : 'bg-teal-200 text-teal-800'"
                >
                  {{ room.status === 'waiting' ? '等待中' : '遊戲中' }}
                </span>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-xs font-black text-teal-950">{{ room.name }}</div>
                  <div class="truncate text-[10px] text-teal-800">
                    房主 {{ room.hostName }} · {{ formatMapName(room.mapId) }}
                  </div>
                </div>
                <span class="shrink-0 font-mono text-xs font-bold text-amber-700">
                  {{ room.players }}/{{ room.maxPlayers }}
                </span>
                <button
                  type="button"
                  :disabled="room.status !== 'waiting' || room.players >= room.maxPlayers"
                  class="shrink-0 rounded-lg bg-gradient-to-r from-cyan-300 to-sky-400 px-3 py-1 text-xs font-black text-slate-950 hover:from-cyan-200 hover:to-sky-300 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  @click="joinFromList(room)"
                >
                  加入
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div
          v-else-if="session.phase === 'joining' || session.phase === 'hosting'"
          class="rounded-2xl border-2 border-teal-600/40 bg-white/70 p-5 text-center space-y-3"
        >
          <div class="text-sm font-bold text-teal-800 animate-pulse">
            🔄 正在建立/連線至房間 {{ session.roomCode }}...
          </div>
          <button
            type="button"
            class="rounded-lg border border-teal-600/40 px-4 py-1.5 text-xs text-teal-800 hover:text-teal-950 cursor-pointer"
            @click="handleDisconnect"
          >
            取消
          </button>
        </div>

        <!-- 已進入房間大廳：顯示房號邀請連結 + 5v5 兩隊編制列表 (含每位玩家的 2.5D 坦克縮圖) -->
        <div
          v-else-if="session.phase === 'connected'"
          class="rounded-2xl border-2 border-emerald-600/60 bg-white/80 p-4 space-y-4"
        >
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-teal-600/40 pb-3">
            <div class="flex items-center gap-2">
              <span class="text-xs font-extrabold text-emerald-700">
                ● 房間大廳 ({{ session.roster.length }} / {{ MAX_TOTAL_PLAYERS }} 人)
              </span>
              <span class="rounded-lg bg-white px-2.5 py-0.5 font-mono text-base font-black tracking-widest text-amber-700 border border-amber-500/60">
                {{ session.roomCode }}
              </span>
            </div>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class="rounded-lg bg-teal-100 px-2.5 py-1 text-xs font-bold text-teal-950 hover:bg-teal-200 cursor-pointer"
                @click="copyRoomCode"
              >
                {{ copied ? '✓ 已複製房號' : '複製房號' }}
              </button>
              <button
                type="button"
                class="rounded-lg bg-amber-400 px-2.5 py-1 text-xs font-extrabold text-slate-950 hover:bg-amber-300 cursor-pointer"
                @click="copyInviteLink"
              >
                {{ copiedLink ? '✓ 已複製連結' : '🔗 複製邀請連結' }}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <!-- Team A (琥珀隊) -->
            <div class="rounded-xl border-2 border-amber-500/60 bg-white/80 p-3 space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-extrabold text-amber-700">
                  琥珀隊 Team A ({{ teamARoster.length }}/{{ MAX_PLAYERS_PER_TEAM }})
                </span>
                <button
                  type="button"
                  :disabled="teamARoster.length >= MAX_PLAYERS_PER_TEAM"
                  class="rounded-lg bg-amber-400/25 px-2 py-0.5 text-[11px] font-bold text-amber-800 hover:bg-amber-400/40 disabled:opacity-40 cursor-pointer"
                  @click="handleSwitchTeam('A')"
                >
                  加入琥珀隊
                </button>
              </div>
              <ul class="space-y-1.5 text-xs">
                <li
                  v-for="member in teamARoster"
                  :key="member.id"
                  class="flex items-center justify-between rounded-lg bg-white/80 px-2.5 py-1.5 border border-amber-500/40"
                >
                  <div class="flex items-center gap-2">
                    <img
                      :src="TANK_REGISTRY[member.tankId]?.getSprites('A').hullUrl"
                      class="h-7 w-7 object-contain"
                      alt=""
                    />
                    <div>
                      <div class="font-bold text-teal-950">
                        {{ member.name }}
                        <span v-if="member.id === session.localPlayerId" class="text-[10px] text-amber-700">(你)</span>
                      </div>
                      <div class="text-[10px] text-amber-700">
                        {{ TANK_REGISTRY[member.tankId]?.name }}
                      </div>
                    </div>
                  </div>
                  <span
                    class="font-mono text-[10px] font-bold"
                    :class="member.isHost || member.ready ? 'text-emerald-700' : 'text-teal-700'"
                  >
                    {{ member.isHost ? '👑 房主' : member.ready ? '✅ 準備完畢' : '⏳ 未準備' }}
                  </span>
                </li>
                <li
                  v-for="n in MAX_PLAYERS_PER_TEAM - teamARoster.length"
                  :key="`a-empty-${n}`"
                  class="rounded-lg border border-dashed border-teal-600/40 px-2.5 py-2 text-center text-[11px] text-teal-600"
                >
                  空位
                </li>
              </ul>
            </div>

            <!-- Team B (皇家藍隊) -->
            <div class="rounded-xl border-2 border-teal-600/40 bg-white/80 p-3 space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-extrabold text-sky-700">
                  皇家藍隊 Team B ({{ teamBRoster.length }}/{{ MAX_PLAYERS_PER_TEAM }})
                </span>
                <button
                  type="button"
                  :disabled="teamBRoster.length >= MAX_PLAYERS_PER_TEAM"
                  class="rounded-lg bg-sky-400/25 px-2 py-0.5 text-[11px] font-bold text-teal-800 hover:bg-sky-400/40 disabled:opacity-40 cursor-pointer"
                  @click="handleSwitchTeam('B')"
                >
                  加入皇家藍隊
                </button>
              </div>
              <ul class="space-y-1.5 text-xs">
                <li
                  v-for="member in teamBRoster"
                  :key="member.id"
                  class="flex items-center justify-between rounded-lg bg-white/80 px-2.5 py-1.5 border border-teal-600/40"
                >
                  <div class="flex items-center gap-2">
                    <img
                      :src="TANK_REGISTRY[member.tankId]?.getSprites('B').hullUrl"
                      class="h-7 w-7 object-contain"
                      alt=""
                    />
                    <div>
                      <div class="font-bold text-teal-950">
                        {{ member.name }}
                        <span v-if="member.id === session.localPlayerId" class="text-[10px] text-sky-700">(你)</span>
                      </div>
                      <div class="text-[10px] text-sky-700">
                        {{ TANK_REGISTRY[member.tankId]?.name }}
                      </div>
                    </div>
                  </div>
                  <span
                    class="font-mono text-[10px] font-bold"
                    :class="member.isHost || member.ready ? 'text-emerald-700' : 'text-teal-700'"
                  >
                    {{ member.isHost ? '👑 房主' : member.ready ? '✅ 準備完畢' : '⏳ 未準備' }}
                  </span>
                </li>
                <li
                  v-for="n in MAX_PLAYERS_PER_TEAM - teamBRoster.length"
                  :key="`b-empty-${n}`"
                  class="rounded-lg border border-dashed border-teal-600/40 px-2.5 py-2 text-center text-[11px] text-teal-600"
                >
                  空位
                </li>
              </ul>
            </div>
          </div>

          <div class="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              class="rounded-xl border border-teal-600/40 px-4 py-2.5 text-xs font-bold text-teal-800 hover:text-teal-950 cursor-pointer"
              @click="handleDisconnect"
            >
              離開房間
            </button>

            <button
              v-if="session.isHost"
              type="button"
              :disabled="!canStartMatch"
              class="flex-1 rounded-xl bg-gradient-to-r from-emerald-400 to-green-500 py-3 text-sm font-black text-slate-950 shadow-lg hover:from-emerald-300 hover:to-green-400 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              @click="handleStartP2PBattle"
            >
              {{
                canStartMatch
                  ? `🚀 鎖定房間並開戰 (${teamARoster.length}v${teamBRoster.length})`
                  : !allGuestsReady
                    ? '等待所有玩家按下「準備完畢」...'
                    : '等待兩隊至少各 1 名玩家...'
              }}
            </button>
            <button
              v-else
              type="button"
              class="flex-1 rounded-xl py-3 text-sm font-black shadow-lg transition cursor-pointer"
              :class="
                localReady
                  ? 'border-2 border-emerald-400 bg-white text-emerald-700'
                  : 'bg-gradient-to-r from-emerald-400 to-green-500 text-slate-950 hover:from-emerald-300 hover:to-green-400'
              "
              @click="handleToggleReady"
            >
              {{ localReady ? '✅ 已準備（點擊取消）' : '準備完畢' }}
            </button>
          </div>
        </div>

        <div
          v-if="session.errorMessage"
          class="flex items-center justify-between rounded-xl border-2 border-rose-500 bg-rose-100 px-4 py-2.5 text-xs font-bold text-rose-800"
        >
          <span>⚠️ {{ session.errorMessage }}</span>
          <button
            type="button"
            class="underline hover:text-teal-950 cursor-pointer"
            @click="session.errorMessage = undefined"
          >
            關閉
          </button>
        </div>
      </div>

      <!-- 單機雙隊熱座表單 (支援選擇 1v1 ~ 5v5 與每台出戰坦克型號) -->
      <div v-else class="space-y-4">
        <div class="space-y-2">
          <label class="block text-xs font-extrabold text-amber-700">
            步驟 1：選擇每隊出戰坦克數量 (1v1 至 5v5)
          </label>
          <div class="grid grid-cols-5 gap-2">
            <button
              v-for="n in [1, 2, 3, 4, 5]"
              :key="n"
              type="button"
              class="rounded-xl border-2 py-2 text-xs font-black transition cursor-pointer"
              :class="
                hotseatCountPerTeam === n
                  ? 'border-amber-300 bg-amber-400 text-slate-950 shadow-md'
                  : 'border-teal-600/40 bg-white/80 text-teal-900 hover:border-teal-700'
              "
              @click="hotseatCountPerTeam = n"
            >
              {{ n }} vs {{ n }}
            </button>
          </div>
        </div>

        <!-- 步驟 2：直接為兩隊每一位玩家挑選 2.5D 坦克 -->
        <div class="space-y-2">
          <label class="block text-xs font-extrabold text-amber-700">
            步驟 2：設定兩隊由玩家或電腦操控，並挑選出戰坦克
          </label>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <!-- 琥珀隊 Team A 陣容選車 -->
            <div class="rounded-2xl border-2 border-amber-500/60 bg-white/80 p-3 space-y-2">
              <div class="flex items-center justify-between gap-2">
                <div class="text-xs font-black text-amber-700">
                  🟠 琥珀隊 Team A ({{ hotseatCountPerTeam }} 台)
                </div>
                <div class="inline-flex overflow-hidden rounded-lg border border-amber-500/60 text-[10px] font-extrabold">
                  <button
                    type="button"
                    class="px-2 py-1 transition cursor-pointer"
                    :class="!hotseatBotTeams.A ? 'bg-amber-400 text-slate-950' : 'bg-white text-teal-800 hover:text-teal-950'"
                    @click="hotseatBotTeams.A = false"
                  >
                    👤 玩家
                  </button>
                  <button
                    type="button"
                    class="px-2 py-1 transition cursor-pointer"
                    :class="hotseatBotTeams.A ? 'bg-amber-400 text-slate-950' : 'bg-white text-teal-800 hover:text-teal-950'"
                    @click="hotseatBotTeams.A = true"
                  >
                    🤖 電腦
                  </button>
                </div>
              </div>
              <div v-if="hotseatBotTeams.A" class="flex items-center gap-1">
                <span class="shrink-0 text-[10px] font-extrabold text-teal-800">電腦強度</span>
                <button
                  v-for="[level, spec] in BOT_LEVELS"
                  :key="level"
                  type="button"
                  class="flex-1 rounded-lg border px-1 py-1 text-[10px] font-extrabold transition cursor-pointer"
                  :class="
                    hotseatBotLevels.A === level
                      ? 'border-amber-500 bg-amber-400 text-slate-950 shadow'
                      : 'border-teal-600/40 bg-white text-teal-800 hover:border-teal-700'
                  "
                  @click="hotseatBotLevels.A = level"
                >
                  {{ spec.label }}
                </button>
              </div>
              <div
                v-for="idx in hotseatCountPerTeam"
                :key="`a-${idx}`"
                class="flex items-center justify-between gap-2 rounded-xl border border-amber-500/60 bg-white/80 px-2.5 py-1.5"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <img
                    :src="TANK_REGISTRY[hotseatTeamATanks[idx - 1] ?? 'aegis'].getSprites('A').hullUrl"
                    class="h-8 w-8 shrink-0 object-contain drop-shadow"
                    alt=""
                  />
                  <div class="min-w-0">
                    <div class="text-xs font-extrabold text-teal-950">{{ hotseatBotTeams.A ? '🤖 CPU' : '琥珀' }} A{{ idx }}</div>
                    <div class="truncate text-[10px] text-amber-700">
                      {{ TANK_REGISTRY[hotseatTeamATanks[idx - 1] ?? 'aegis'].name }}
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-1">
                  <button
                    v-for="tank in TANK_LIST"
                    :key="tank.id"
                    type="button"
                    class="rounded-lg border px-1.5 py-1 text-[10px] font-extrabold transition cursor-pointer"
                    :class="
                      (hotseatTeamATanks[idx - 1] ?? 'aegis') === tank.id
                        ? 'border-amber-300 bg-amber-400 text-slate-950 shadow'
                        : 'border-teal-600/40 bg-white text-teal-800 hover:border-amber-300/60'
                    "
                    @click="setHotseatSlotTank('A', idx - 1, tank.id)"
                  >
                    {{ tank.name.slice(0, 2) }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 皇家藍隊 Team B 陣容選車 -->
            <div class="rounded-2xl border-2 border-teal-600/40 bg-white/80 p-3 space-y-2">
              <div class="flex items-center justify-between gap-2">
                <div class="text-xs font-black text-sky-700">
                  🔵 皇家藍隊 Team B ({{ hotseatCountPerTeam }} 台)
                </div>
                <div class="inline-flex overflow-hidden rounded-lg border border-teal-600/40 text-[10px] font-extrabold">
                  <button
                    type="button"
                    class="px-2 py-1 transition cursor-pointer"
                    :class="!hotseatBotTeams.B ? 'bg-sky-400 text-slate-950' : 'bg-white text-teal-800 hover:text-teal-950'"
                    @click="hotseatBotTeams.B = false"
                  >
                    👤 玩家
                  </button>
                  <button
                    type="button"
                    class="px-2 py-1 transition cursor-pointer"
                    :class="hotseatBotTeams.B ? 'bg-sky-400 text-slate-950' : 'bg-white text-teal-800 hover:text-teal-950'"
                    @click="hotseatBotTeams.B = true"
                  >
                    🤖 電腦
                  </button>
                </div>
              </div>
              <div v-if="hotseatBotTeams.B" class="flex items-center gap-1">
                <span class="shrink-0 text-[10px] font-extrabold text-teal-800">電腦強度</span>
                <button
                  v-for="[level, spec] in BOT_LEVELS"
                  :key="level"
                  type="button"
                  class="flex-1 rounded-lg border px-1 py-1 text-[10px] font-extrabold transition cursor-pointer"
                  :class="
                    hotseatBotLevels.B === level
                      ? 'border-sky-500 bg-sky-400 text-slate-950 shadow'
                      : 'border-teal-600/40 bg-white text-teal-800 hover:border-teal-700'
                  "
                  @click="hotseatBotLevels.B = level"
                >
                  {{ spec.label }}
                </button>
              </div>
              <div
                v-for="idx in hotseatCountPerTeam"
                :key="`b-${idx}`"
                class="flex items-center justify-between gap-2 rounded-xl border border-teal-600/40 bg-white/80 px-2.5 py-1.5"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <img
                    :src="TANK_REGISTRY[hotseatTeamBTanks[idx - 1] ?? 'goliath'].getSprites('B').hullUrl"
                    class="h-8 w-8 shrink-0 object-contain drop-shadow"
                    alt=""
                  />
                  <div class="min-w-0">
                    <div class="text-xs font-extrabold text-teal-950">{{ hotseatBotTeams.B ? '🤖 CPU' : '皇家藍' }} B{{ idx }}</div>
                    <div class="truncate text-[10px] text-sky-700">
                      {{ TANK_REGISTRY[hotseatTeamBTanks[idx - 1] ?? 'goliath'].name }}
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-1">
                  <button
                    v-for="tank in TANK_LIST"
                    :key="tank.id"
                    type="button"
                    class="rounded-lg border px-1.5 py-1 text-[10px] font-extrabold transition cursor-pointer"
                    :class="
                      (hotseatTeamBTanks[idx - 1] ?? 'goliath') === tank.id
                        ? 'border-sky-300 bg-sky-400 text-slate-950 shadow'
                        : 'border-teal-600/40 bg-white text-teal-800 hover:border-teal-600/40'
                    "
                    @click="setHotseatSlotTank('B', idx - 1, tank.id)"
                  >
                    {{ tank.name.slice(0, 2) }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 text-sm font-black text-slate-950 shadow-xl hover:from-amber-300 hover:to-orange-400 transition cursor-pointer"
          @click="handleStartHotseatBattle"
        >
          {{ hotseatStartLabel }}
        </button>
      </div>
    </div>
  </section>
</template>
