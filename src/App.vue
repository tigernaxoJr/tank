<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { BattleArena, tankAt } from '@/features/battle'
import { LobbyPanel, type StartGamePayload } from '@/features/lobby'
import type { LoadoutSecret } from '@/features/battle'
import type { MapPresetId, PlayerId, ProtocolMessage, RosterSlot } from '@/shared/kernel/types'

const inBattle = ref(false)
const mode = ref<'hotseat' | 'p2p'>('p2p')
const localRole = ref<PlayerId>('p1')
const isHost = ref(true)
const matchSeed = ref(1024)
const mapId = ref<MapPresetId>('harvest_plains')
const loadoutSecret = ref<LoadoutSecret | undefined>()
const roster = ref<RosterSlot[]>([
  { id: 'p1', name: 'Player 1', team: 'A', tankId: tankAt(0), isHost: true },
  { id: 'p2', name: 'Player 2', team: 'B', tankId: tankAt(1), isHost: false },
])

const lobbyRef = ref<InstanceType<typeof LobbyPanel> | null>(null)
const battleRef = ref<InstanceType<typeof BattleArena> | null>(null)

async function onStartGame(payload: StartGamePayload): Promise<void> {
  mode.value = payload.mode
  localRole.value = payload.localRole
  isHost.value = payload.isHost
  matchSeed.value = payload.seed
  mapId.value = payload.mapId
  roster.value = payload.roster
  loadoutSecret.value = payload.loadoutSecret
  inBattle.value = true
  await nextTick()
  battleRef.value?.resetMatch(payload.seed, payload.initialWind, payload.roster, payload.mapId)
}

function onLeaveGame(): void {
  inBattle.value = false
  lobbyRef.value?.handleDisconnect()
}

function onRemoteMessage(msg: ProtocolMessage): void {
  battleRef.value?.handleRemoteMessage(msg)
}

function onOutgoingMessage(msg: ProtocolMessage): void {
  lobbyRef.value?.sendMessage(msg)
}
</script>

<template>
  <main class="mx-auto max-w-7xl w-full space-y-3.5 p-3 sm:p-5">
    <!-- 大廳本身是全畫面（fixed inset-0），標題與操作說明在 LobbyHub 頂部列 -->
    <LobbyPanel
      ref="lobbyRef"
      :in-battle="inBattle"
      @start-game="onStartGame"
      @leave-game="onLeaveGame"
      @remote-message="onRemoteMessage"
    />

    <BattleArena
      v-if="inBattle"
      ref="battleRef"
      :mode="mode"
      :local-role="localRole"
      :is-host="isHost"
      :initial-seed="matchSeed"
      :map-id="mapId"
      :roster="roster"
      :loadout-secret="loadoutSecret"
      @outgoing-message="onOutgoingMessage"
      @leave-game="onLeaveGame"
    />
  </main>
</template>
