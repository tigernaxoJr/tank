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
  <main class="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
    <!-- 街機風明亮遊戲橫幅 Header (僅在大廳顯示，對戰時全螢幕不捲動) -->
    <header
      v-if="!inBattle"
      class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-400/30 bg-slate-900/80 px-5 py-3.5 shadow-2xl backdrop-blur-md"
    >
      <div class="flex items-center gap-3">
        <div class="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/60 bg-gradient-to-br from-amber-400 to-orange-500 p-1 shadow-lg shadow-amber-500/20">
          <img src="/assets/units/tanks/aegis_a_hull.png" alt="Tank Icon" class="h-full w-full object-contain drop-shadow" />
        </div>
        <div>
          <h1 class="text-2xl font-black tracking-wide text-white drop-shadow">
            TANK ARTILLERY <span class="rounded-md bg-gradient-to-r from-sky-400 to-blue-500 px-2 py-0.5 text-xs font-black text-slate-950 align-middle shadow">2.5D ARCADE</span>
          </h1>
          <p class="text-xs font-medium text-slate-300">
            高空浮空艦空戰砲決 · 挑戰電腦或 1v1 ~ 5v5 WebRTC 即時連線 · 原創 Q 版美術 + Kenney (CC0)
          </p>
        </div>
      </div>
      <div class="flex items-center gap-1.5 rounded-xl border border-sky-500/30 bg-slate-800/80 px-3 py-1.5 text-xs text-slate-200">
        <span>🎮 操作：</span>
        <kbd class="rounded bg-amber-400 px-1.5 py-0.5 font-mono font-bold text-slate-950">←/→</kbd> 移動 ·
        <kbd class="rounded bg-amber-400 px-1.5 py-0.5 font-mono font-bold text-slate-950">↑/↓</kbd> 仰角 ·
        <kbd class="rounded bg-amber-400 px-1.5 py-0.5 font-mono font-bold text-slate-950">空白鍵</kbd> 蓄力開火
      </div>
    </header>

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
