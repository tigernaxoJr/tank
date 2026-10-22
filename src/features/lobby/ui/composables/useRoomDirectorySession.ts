import { ref } from 'vue'
import {
  createRoomDirectory,
  type RoomListing,
  type RoomStatus,
} from '../../infra/roomDirectory'
import { MAX_TOTAL_PLAYERS } from '../../domain/roomSession'
import type { DisconnectPolicy, MapPresetId } from '@/shared/kernel/types'

export interface RoomDirectoryHostContext {
  isHost: () => boolean
  roomCode: () => string
  localPlayerName: () => string
  selectedMapId: () => MapPresetId
  disconnectPolicy: () => DisconnectPolicy
  playerCount: () => number
}

export function useRoomDirectorySession(ctx: RoomDirectoryHostContext) {
  const directory = createRoomDirectory()
  const roomName = ref('')
  const roomList = ref<RoomListing[]>([])
  const roomListLoading = ref(false)
  const roomListLoaded = ref(false)
  const roomListError = ref(false)
  let roomStatus: RoomStatus = 'waiting'
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
    if (!ctx.isHost() || !ctx.roomCode()) return
    void directory.announce(ctx.roomCode(), {
      name: roomName.value.trim() || `${ctx.localPlayerName()} 的房間`,
      hostName: ctx.localPlayerName(),
      mapId: ctx.selectedMapId(),
      players: Math.max(1, ctx.playerCount()),
      maxPlayers: MAX_TOTAL_PLAYERS,
      status: roomStatus,
      disconnectPolicy: ctx.disconnectPolicy(),
    })
  }

  function setRoomStatus(status: RoomStatus): void {
    roomStatus = status
    announceRoom()
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

  async function removeRoom(): Promise<void> {
    stopHeartbeat()
    const code = ctx.roomCode()
    if (ctx.isHost() && code) {
      await directory.remove(code)
    }
  }

  return {
    directory,
    roomName,
    roomList,
    roomListLoading,
    roomListLoaded,
    roomListError,
    refreshRoomList,
    announceRoom,
    setRoomStatus,
    startHeartbeat,
    stopHeartbeat,
    removeRoom,
  }
}
