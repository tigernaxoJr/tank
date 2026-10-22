<script setup lang="ts">
import { isForgedAction } from '../infra/messageGuards'
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  MAP_REGISTRY,
  TANK_LIST,
  tankAt,
  type LoadoutSecret,
  type MapBlueprint,
} from '@/features/battle'
import { soundController } from '@/features/audio'
import LobbyBackdrop from './LobbyBackdrop.vue'
import MapPickerCard from './MapPickerCard.vue'
import StageSelectModal from './StageSelectModal.vue'
import TankHangarPodium from './TankHangarPodium.vue'
import TacticalGuideModal from './TacticalGuideModal.vue'
import LobbyHub from './LobbyHub.vue'
import RoomView from './RoomView.vue'
import CreateRoomDialog from './CreateRoomDialog.vue'
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
import type {
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
import { useLocalSkirmish } from './composables/useLocalSkirmish'
import { useRoomDirectorySession } from './composables/useRoomDirectorySession'
import { useLoadoutCommitment } from './composables/useLoadoutCommitment'
import type { RoomListing } from '../infra/roomDirectory'

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
const showCreateDialog = ref(false)

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
const {
  loadoutPicks,
  picksFor,
  localRoot,
  getLocalSecret,
  syncWithTank,
  onPickLoadout,
} = useLoadoutCommitment(() => session.selectedTankId)

// --- 單機熱座 / 挑戰電腦設定 ---
const {
  hotseatCountPerTeam,
  hotseatTeamATanks,
  hotseatTeamBTanks,
  hotseatBotTeams,
  hotseatBotLevels,
  BOT_LEVELS,
  hotseatStartLabel,
  setHotseatSlotTank,
  buildHotseatRoster,
} = useLocalSkirmish(picksFor, (tankId) => {
  session.selectedTankId = tankId
  syncWithTank(tankId)
})

/** 只接受格式正確的承諾（64 位十六進位字元） */
const isRoot = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)

const transport: PeerTransportPort = createPeerTransport()
const signalingInfo = ref<SignalingEndpointInfo>(transport.getSignalingInfo())

// --- 房間列表（需要房間目錄 API；未設定時降級為輸入房號） ---
const {
  directory,
  roomName,
  roomList,
  roomListLoading,
  roomListLoaded,
  refreshRoomList,
  announceRoom,
  setRoomStatus,
  startHeartbeat,
  removeRoom,
} = useRoomDirectorySession({
  isHost: () => session.isHost,
  roomCode: () => session.roomCode,
  localPlayerName: () => session.localPlayerName,
  selectedMapId: () => session.selectedMapId,
  disconnectPolicy: () => session.disconnectPolicy,
  playerCount: () => session.roster.length,
})

let roomPollTimer: ReturnType<typeof setInterval> | null = null

/** 大廳三個畫面：房間牆 → 房間內；單機設定獨立一頁 */
const lobbyView = computed<'hub' | 'room' | 'hotseat'>(() => {
  if (gameMode.value === 'hotseat') return 'hotseat'
  return session.phase === 'connected' ? 'room' : 'hub'
})

// 房間名稱只存在房主本機與目錄；加入者以房號顯示
const roomTitle = computed(() =>
  session.isHost
    ? roomName.value.trim() || `${session.localPlayerName} 的戰局`
    : `${session.roster.find((r) => r.isHost)?.name ?? '房主'} 的戰局`,
)

function confirmCreateRoom(): void {
  showCreateDialog.value = false
  void handleHost()
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

  if (
    msg.type === 'ACTION_FIRE' ||
    msg.type === 'ACTION_MOVE' ||
    msg.type === 'ACTION_PASS' ||
    msg.type === 'SYNC_HASH'
  ) {
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
      loadoutSecret: getLocalSecret() ?? undefined,
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
  syncWithTank(tankId)
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

function handlePickLoadout(picks: BulletType[]): void {
  if (session.locked) return
  onPickLoadout(picks, session.locked)
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
  setRoomStatus('playing')

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
    loadoutSecret: getLocalSecret() ?? undefined,
  })
}

function handleStartHotseatBattle(): void {
  soundController.play('ui_start')
  const seed = Math.floor(Math.random() * 90000) + 1000
  const roster = buildHotseatRoster()
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
  void removeRoom()
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
    announceRoom()
  },
)

onUnmounted(() => {
  void removeRoom()
  if (roomPollTimer !== null) clearInterval(roomPollTimer)
  transport.disconnect()
})
</script>

<template>
  <!-- 大廳動態視差背景：跟隨所選地圖無縫呈現高空浮島、雪原、峽谷或黃沙質感 -->
  <LobbyBackdrop v-if="!props.inBattle" :map="currentMapBlueprint" />

  <!-- 全圖庫、操作指南與開房彈窗 -->
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
  <CreateRoomDialog
    v-model:room-name="roomName"
    :captain="session.localPlayerName.trim() || 'Commander'"
    :open="showCreateDialog"
    :map-id="session.selectedMapId"
    :disconnect-policy="session.disconnectPolicy"
    @select-map="selectMapPreset"
    @select-policy="selectDisconnectPolicy"
    @open-gallery="showStageModal = true"
    @confirm="confirmCreateRoom"
    @cancel="showCreateDialog = false; soundController.play('ui_click')"
  />

  <!-- 全畫面大廳：戰局列表 (hub) → 房間 (room)；單機練習 (hotseat) 另一頁 -->
  <section v-if="!props.inBattle" class="fixed inset-0 z-10 flex flex-col overflow-y-auto p-4 font-toon text-ink sm:p-6 lg:overflow-hidden">
    <LobbyHub
      v-if="lobbyView === 'hub'"
      v-model:player-name="session.localPlayerName"
      v-model:join-code="joinInputCode"
      :rooms="roomList"
      :loading="roomListLoading"
      :loaded="roomListLoaded"
      :directory-available="directory.available"
      :signaling="signalingInfo"
      :selected-tank-id="session.selectedTankId"
      :loadout-picks="loadoutPicks"
      :connecting="session.phase === 'hosting' || session.phase === 'joining'"
      :connecting-code="session.phase === 'joining' ? session.roomCode : ''"
      :error-message="session.errorMessage"
      @create="showCreateDialog = true"
      @refresh="refreshRoomList"
      @join-room="joinFromList"
      @join-code="handleJoin"
      @hotseat="handleDisconnect(); gameMode = 'hotseat'"
      @guide="showGuideModal = true"
      @cancel-connect="handleDisconnect"
      @dismiss-error="session.errorMessage = undefined"
      @select-tank="selectTankArchetype"
      @change-loadout="handlePickLoadout"
    />

    <RoomView
      v-else-if="lobbyView === 'room'"
      :room-code="session.roomCode"
      :room-title="roomTitle"
      :roster="session.roster"
      :local-player-id="session.localPlayerId"
      :is-host="session.isHost"
      :locked="session.locked"
      :can-start="canStartMatch"
      :all-guests-ready="allGuestsReady"
      :local-ready="localReady"
      :selected-map-id="session.selectedMapId"
      :disconnect-policy="session.disconnectPolicy"
      :selected-tank-id="session.selectedTankId"
      :loadout-picks="loadoutPicks"
      :copied="copied"
      :copied-link="copiedLink"
      :error-message="session.errorMessage"
      @switch-team="handleSwitchTeam"
      @toggle-ready="handleToggleReady"
      @start="handleStartP2PBattle"
      @leave="handleDisconnect"
      @copy-code="copyRoomCode"
      @copy-link="copyInviteLink"
      @select-map="selectMapPreset"
      @open-gallery="showStageModal = true"
      @select-policy="selectDisconnectPolicy"
      @select-tank="selectTankArchetype"
      @change-loadout="handlePickLoadout"
      @dismiss-error="session.errorMessage = undefined"
    />

    <!-- 單機練習：同機輪流或讓電腦接手任一隊 -->
    <div v-else class="flex h-full min-h-0 flex-col gap-5">
      <header class="flex items-center gap-3">
        <button
          type="button"
          aria-label="返回大廳"
          class="toon-btn h-11 w-11 rounded-full p-0 text-2xl"
          @click="gameMode = 'p2p'; soundController.play('ui_click')"
        >
          ‹
        </button>
        <div class="leading-none">
          <h1 class="toon-title text-[1.9rem]">單機練習</h1>
          <span class="toon-pill mt-1 bg-paper text-sm">同一台電腦輪流操作，或讓電腦接手任一隊</span>
        </div>
      </header>

      <div class="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
        <aside class="min-h-0 pt-4 lg:overflow-y-auto lg:pb-2">
          <TankHangarPodium
            :selected-tank-id="session.selectedTankId"
            :loadout-picks="loadoutPicks"
            @select-tank="selectTankArchetype"
            @change-loadout="handlePickLoadout"
          />
        </aside>

        <section class="toon-panel relative mt-4 flex min-h-0 flex-col gap-3 p-4 pt-6 lg:mb-2">
          <span class="toon-ribbon absolute -top-4 left-4">隊伍</span>
          <div class="flex items-center gap-3">
            <span class="text-sm">人數</span>
            <div class="toon-segment font-num flex-1 text-base font-extrabold">
              <button
                v-for="n in [1, 2, 3, 4, 5]"
                :key="n"
                type="button"
                :aria-pressed="hotseatCountPerTeam === n"
                @click="hotseatCountPerTeam = n; soundController.play('ui_click')"
              >
                {{ n }}v{{ n }}
              </button>
            </div>
          </div>

          <div class="grid min-h-0 flex-1 grid-cols-1 content-start gap-4 overflow-y-auto pr-1 xl:grid-cols-2">
            <div
              v-for="team in ([
                { id: 'A', label: '橘隊', color: 'var(--color-team-a)', tanks: hotseatTeamATanks, offset: 0 },
                { id: 'B', label: '藍隊', color: 'var(--color-team-b)', tanks: hotseatTeamBTanks, offset: 1 },
              ] as const)"
              :key="team.id"
              class="flex flex-col gap-2"
            >
              <span class="toon-pill w-fit px-3 text-base text-white" :style="{ background: team.color, textShadow: '0 2px 0 rgb(29 35 64 / .35)' }">
                {{ team.label }}
              </span>
              <div class="toon-segment text-sm">
                <button type="button" :aria-pressed="!hotseatBotTeams[team.id]" @click="hotseatBotTeams[team.id] = false; soundController.play('ui_click')">玩家</button>
                <button type="button" :aria-pressed="hotseatBotTeams[team.id]" @click="hotseatBotTeams[team.id] = true; soundController.play('ui_click')">電腦</button>
              </div>
              <div v-if="hotseatBotTeams[team.id]" class="toon-segment text-xs">
                <button
                  v-for="[level, spec] in BOT_LEVELS"
                  :key="level"
                  type="button"
                  :aria-pressed="hotseatBotLevels[team.id] === level"
                  @click="hotseatBotLevels[team.id] = level; soundController.play('ui_click')"
                >
                  {{ spec.label }}
                </button>
              </div>
              <div
                v-for="idx in hotseatCountPerTeam"
                :key="`${team.id}-${idx}`"
                class="flex items-center gap-2 rounded-2xl border-[3px] border-ink bg-paper p-1.5"
              >
                <span class="font-num w-8 shrink-0 text-center text-base font-extrabold">{{ team.id }}{{ idx }}</span>
                <button
                  v-for="t in TANK_LIST"
                  :key="t.id"
                  type="button"
                  :title="t.name"
                  class="toon-btn h-10 flex-1 rounded-xl p-0"
                  :class="(team.tanks[idx - 1] ?? tankAt(idx - 1 + team.offset)) === t.id ? 'toon-btn--sun' : ''"
                  @click="setHotseatSlotTank(team.id, idx - 1, t.id)"
                >
                  <img :src="t.getSprites(team.id).hullUrl" alt="" class="h-6 w-auto" :class="team.id === 'B' ? '-scale-x-100' : ''" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="toon-panel relative mt-4 flex flex-col gap-3 p-4 pt-6 lg:mb-2">
          <span class="toon-ribbon absolute -top-4 left-4" style="background: var(--color-grass); color: var(--color-ink); text-shadow: none">戰場</span>
          <MapPickerCard
            :map-id="session.selectedMapId"
            editable
            @select="selectMapPreset"
            @open-gallery="showStageModal = true"
          />
          <div class="mt-auto pt-2">
            <button type="button" class="toon-btn toon-btn--sun w-full py-3 text-2xl" @click="handleStartHotseatBattle">
              開打！
            </button>
            <p class="mt-2 text-center text-sm text-ink-soft">{{ hotseatStartLabel }}</p>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>
