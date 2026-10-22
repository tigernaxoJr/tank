<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAP_REGISTRY, getTankSpec, renderMapPreview } from '@/features/battle'
import { soundController } from '@/features/audio'
import type { BulletType, MapPresetId, TankArchetypeId } from '@/shared/kernel/types'
import type { RoomListing } from '../infra/roomDirectory'
import type { SignalingEndpointInfo } from '../infra/peerAdapter'
import TankHangarPodium from './TankHangarPodium.vue'
import { splitDisplayName } from './displayNames'

const props = defineProps<{
  rooms: readonly RoomListing[]
  loading: boolean
  loaded: boolean
  directoryAvailable: boolean
  signaling: SignalingEndpointInfo
  selectedTankId: TankArchetypeId
  loadoutPicks: readonly BulletType[]
  /** 'hosting' / 'joining' 時蓋上連線中遮罩 */
  connecting: boolean
  connectingCode: string
  errorMessage?: string
}>()

const emit = defineEmits<{
  (e: 'create'): void
  (e: 'refresh'): void
  (e: 'join-room', room: RoomListing): void
  (e: 'join-code'): void
  (e: 'hotseat'): void
  (e: 'guide'): void
  (e: 'cancel-connect'): void
  (e: 'dismiss-error'): void
  (e: 'select-tank', tankId: TankArchetypeId): void
  (e: 'change-loadout', picks: BulletType[]): void
}>()

const playerName = defineModel<string>('playerName', { required: true })
const joinCode = defineModel<string>('joinCode', { required: true })

const query = ref('')

// 可加入的排前面，其餘依建立時間（新的在前）
const rows = computed(() => {
  const q = query.value.trim().toUpperCase()
  return props.rooms
    .filter((r) => !q || r.code.includes(q) || r.name.toUpperCase().includes(q))
    .slice()
    .sort((a, b) => Number(joinable(b)) - Number(joinable(a)) || a.ageSec - b.ageSec)
})

const avatarUrl = computed(() => getTankSpec(props.selectedTankId).getSprites('A').hullUrl)

const previewCache = new Map<string, string>()
function mapThumb(mapId: MapPresetId): string {
  const map = MAP_REGISTRY[mapId]
  if (!map) return ''
  let url = previewCache.get(mapId)
  if (!url) {
    url = renderMapPreview(map, 200, 110)
    previewCache.set(mapId, url)
  }
  return url
}

function mapLabel(mapId: MapPresetId): string {
  const map = MAP_REGISTRY[mapId]
  return map ? splitDisplayName(map.name).zh : mapId
}

function joinable(room: RoomListing): boolean {
  return room.status === 'waiting' && room.players < room.maxPlayers
}

function tap(fn: () => void): void {
  soundController.play('ui_click')
  fn()
}
</script>

<template>
  <div class="relative flex h-full min-h-0 flex-col gap-5">
    <!-- 頂欄：標題字 + 玩家牌 -->
    <header class="flex flex-wrap items-center gap-3">
      <div class="mr-auto leading-none">
        <h1 class="toon-title font-num text-[2.1rem] font-extrabold">TANK ARTILLERY</h1>
        <span class="toon-pill mt-1 bg-sun text-sm">空域砲決 · 回合制砲擊</span>
      </div>

      <div class="toon-panel flex items-center gap-2 rounded-full py-1 pl-1 pr-2">
        <span class="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-ink bg-sky">
          <img :src="avatarUrl" alt="" class="h-7 w-7 object-contain" />
        </span>
        <input
          v-model="playerName"
          type="text"
          maxlength="16"
          placeholder="Commander"
          aria-label="玩家名稱"
          class="w-32 bg-transparent text-lg outline-none placeholder:text-ink-soft/50"
        />
        <span
          class="h-3 w-3 shrink-0 rounded-full border-2 border-ink"
          :class="signaling.mode === 'fallback-public' ? 'bg-sun' : 'bg-grass'"
          :title="`信令：${signaling.label}`"
        />
      </div>
      <button
        type="button"
        title="作戰手冊"
        aria-label="作戰手冊"
        class="toon-btn toon-btn--sky h-11 w-11 rounded-full p-0 text-xl"
        @click="tap(() => emit('guide'))"
      >
        ?
      </button>
    </header>

    <div class="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside class="min-h-0 pt-4 lg:overflow-y-auto lg:pb-2">
        <TankHangarPodium
          :selected-tank-id="selectedTankId"
          :loadout-picks="loadoutPicks"
          @select-tank="(id) => emit('select-tank', id)"
          @change-loadout="(p) => emit('change-loadout', p)"
        />
      </aside>

      <!-- 戰局列表 -->
      <section class="toon-panel relative mt-4 flex min-h-[420px] flex-col gap-3 p-4 pt-6 lg:mb-2">
        <span class="toon-ribbon absolute -top-4 left-4">
          戰局列表
          <span class="font-num rounded-full border-2 border-ink bg-paper px-1.5 text-sm leading-tight text-ink" style="text-shadow: none">{{ rooms.length }}</span>
        </span>

        <div class="flex items-center gap-2">
          <input
            v-model="query"
            type="text"
            placeholder="搜尋房號或名稱"
            class="toon-input w-56 py-1 text-sm"
          />
          <button
            type="button"
            title="重新整理"
            aria-label="重新整理"
            :disabled="!directoryAvailable || loading"
            class="toon-btn h-9 w-9 rounded-full p-0 text-lg"
            @click="tap(() => emit('refresh'))"
          >
            <span :class="loading ? 'inline-block animate-spin' : ''">↻</span>
          </button>
        </div>

        <!-- 房間卡 -->
        <div class="min-h-0 flex-1 overflow-y-auto pr-1">
          <div v-if="rows.length" class="grid grid-cols-1 gap-3 pb-2 xl:grid-cols-2">
            <button
              v-for="room in rows"
              :key="room.code"
              type="button"
              :disabled="!joinable(room)"
              class="room-card group flex items-stretch gap-3 rounded-2xl border-[3px] border-ink bg-paper p-2 text-left"
              @click="emit('join-room', room)"
            >
              <img :src="mapThumb(room.mapId)" alt="" class="h-[72px] w-[124px] shrink-0 rounded-xl border-[3px] border-ink object-cover" />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="flex items-center gap-1.5">
                  <span class="font-num shrink-0 rounded-md bg-ink px-1.5 text-xs font-bold tracking-wider text-sun">{{ room.code }}</span>
                  <span class="truncate text-lg leading-tight">{{ room.name }}</span>
                </span>
                <span class="truncate text-sm text-ink-soft">{{ room.hostName }} · {{ mapLabel(room.mapId) }}</span>
                <span class="mt-auto flex items-center gap-2">
                  <span class="flex gap-[3px]">
                    <span
                      v-for="i in room.maxPlayers"
                      :key="i"
                      class="h-2.5 w-2.5 rounded-full border-2 border-ink"
                      :class="i <= room.players ? 'bg-team-a' : 'bg-paper'"
                    />
                  </span>
                  <span
                    class="toon-pill ml-auto text-xs"
                    :class="joinable(room) ? 'bg-grass' : room.status === 'playing' ? 'bg-coral text-white' : 'bg-mist'"
                  >
                    {{ joinable(room) ? '可加入' : room.status === 'playing' ? '對戰中' : '已滿' }}
                  </span>
                </span>
              </span>
            </button>
          </div>

          <!-- 空狀態 -->
          <div v-else class="flex h-full flex-col items-center justify-center gap-3 py-6 text-center">
            <div class="empty-sky relative h-28 w-64 rounded-[28px] border-[3px] border-ink">
              <img :src="avatarUrl" alt="" class="absolute bottom-3 left-1/2 h-14 -translate-x-1/2" />
              <div class="absolute bottom-2 left-1/2 h-3 w-24 -translate-x-1/2 rounded-[50%] bg-ink/20" />
            </div>
            <div class="text-xl">
              {{ !directoryAvailable ? '這個伺服器不提供戰局列表' : query ? '找不到符合的戰局' : '現在還沒有人開局' }}
            </div>
            <div class="max-w-sm text-sm text-ink-soft">
              {{ !directoryAvailable ? '請朋友把 6 碼房號傳給你，在下方輸入加入；或自己開一局。' : '自己開一局，把房號傳給朋友！' }}
            </div>
          </div>
        </div>

        <!-- 動作列 -->
        <div class="flex flex-wrap items-center gap-3 border-t-[3px] border-dashed border-ink/20 pt-3">
          <div class="flex items-center gap-2">
            <input
              v-model="joinCode"
              type="text"
              maxlength="6"
              placeholder="房號"
              aria-label="6 碼房號"
              class="toon-input font-num w-36 py-1.5 text-center text-lg font-extrabold uppercase tracking-[0.3em]"
              @keyup.enter="emit('join-code')"
            />
            <button
              type="button"
              :disabled="joinCode.trim().length !== 6"
              class="toon-btn toon-btn--sky px-4 py-1.5 text-lg"
              @click="emit('join-code')"
            >
              加入
            </button>
          </div>
          <div class="ml-auto flex items-center gap-3">
            <button type="button" class="toon-btn px-4 py-2 text-lg" @click="tap(() => emit('hotseat'))">
              單機練習
            </button>
            <button type="button" class="toon-btn toon-btn--sun px-6 py-2 text-xl" @click="tap(() => emit('create'))">
              ＋ 開新戰局
            </button>
          </div>
        </div>

        <div
          v-if="errorMessage"
          class="flex items-center justify-between gap-3 rounded-xl border-[3px] border-ink bg-coral px-3 py-1.5 text-sm text-white"
        >
          <span>{{ errorMessage }}</span>
          <button type="button" class="shrink-0 underline cursor-pointer" @click="emit('dismiss-error')">關閉</button>
        </div>
      </section>
    </div>

    <!-- 連線中遮罩 -->
    <div v-if="connecting" class="absolute inset-0 z-20 flex items-center justify-center bg-ink/40">
      <div class="toon-panel flex flex-col items-center gap-3 px-10 py-6">
        <img :src="avatarUrl" alt="" class="tank-drive h-12" />
        <div class="text-xl">{{ connectingCode ? `正在加入 ${connectingCode}` : '正在開房' }}…</div>
        <button type="button" class="toon-btn px-5 py-1" @click="emit('cancel-connect')">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.room-card {
  box-shadow: 0 4px 0 var(--color-ink);
  transition: transform 0.1s ease, box-shadow 0.1s ease;
  cursor: pointer;
}
.room-card:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 0 var(--color-ink);
  background: #fffbe0;
}
.room-card:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.empty-sky {
  background: url('@/assets/ui/empty_sky.svg') center bottom / cover no-repeat, #cdeaff;
  overflow: hidden;
}
.tank-drive {
  animation: drive 0.6s ease-in-out infinite alternate;
}
@keyframes drive {
  from { transform: translateX(-10px) rotate(-2deg); }
  to { transform: translateX(10px) rotate(2deg); }
}
</style>
