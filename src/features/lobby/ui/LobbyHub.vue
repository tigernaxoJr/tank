<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAP_REGISTRY, MapPreview, TANK_LIST, getTankSpec } from '@/features/battle'
import { soundController } from '@/features/audio'
import type { BulletType, MapPresetId, TankArchetypeId } from '@/shared/kernel/types'
import type { RoomListing } from '../infra/roomDirectory'
import type { SignalingEndpointInfo } from '../infra/peerAdapter'
import TankHangarPodium from './TankHangarPodium.vue'
import { splitDisplayName } from './displayNames'
import type { TankChoice } from './tankChoice'

const props = defineProps<{
  rooms: readonly RoomListing[]
  loading: boolean
  loaded: boolean
  directoryAvailable: boolean
  signaling: SignalingEndpointInfo
  selectedTankId: TankArchetypeId
  randomTank: boolean
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
  (e: 'select-tank', choice: TankChoice): void
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
// 連線對戰插圖的對手：清單裡下一台，塗藍隊色（隨機時固定，免得洩漏抽到的機種）
const rivalUrl = computed(() => {
  const i = props.randomTank ? 0 : TANK_LIST.findIndex((t) => t.id === props.selectedTankId)
  return TANK_LIST[(i + 1) % TANK_LIST.length].getSprites('B').hullUrl
})

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
  <div class="relative flex min-h-full flex-col gap-5 lg:h-full lg:min-h-0 phone:h-full phone:min-h-0 phone:gap-1">
    <!-- 頂欄：標題字 + 玩家牌 -->
    <header class="flex flex-wrap items-center gap-3 phone:flex-nowrap phone:gap-2">
      <div class="mr-auto flex flex-col items-start gap-3 phone:min-w-0 phone:flex-row phone:items-center">
        <h1 class="toon-title font-num text-[2.1rem] font-extrabold leading-none phone:text-2xl">TANK ARTILLERY</h1>
        <span class="toon-pill bg-sun text-sm phone:truncate phone:text-xs">空域砲決 · 回合制砲擊</span>
      </div>

      <div class="toon-panel flex items-center gap-2 rounded-full py-1 pl-1 pr-2 phone:shrink-0 phone:py-0.5">
        <span class="flex h-10 w-10 phone:h-8 phone:w-8 items-center justify-center rounded-full border-[3px] border-ink bg-sky">
          <span v-if="randomTank" class="toon-mystery h-7 text-base">?</span>
          <img v-else :src="avatarUrl" alt="" class="h-7 w-7 object-contain" />
        </span>
        <input
          v-model="playerName"
          type="text"
          maxlength="16"
          placeholder="Commander"
          aria-label="玩家名稱"
          class="w-32 bg-transparent text-lg outline-none phone:w-24 phone:text-base placeholder:text-ink-soft/50"
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
        class="toon-btn toon-btn--sky h-11 w-11 rounded-full p-0 text-xl phone:h-9 phone:w-9 phone:shrink-0"
        @click="tap(() => emit('guide'))"
      >
        ?
      </button>
    </header>

    <!-- 手機橫放：戰車、入口、戰局列表三欄並排，一屏放完 -->
    <div class="grid grid-cols-1 gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[340px_minmax(0,1fr)] phone:min-h-0 phone:flex-1 phone:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] phone:gap-3">
      <aside class="min-h-0 pt-4 lg:overflow-y-auto lg:pb-2 phone:overflow-y-auto phone:pb-1">
        <TankHangarPodium
          :selected-tank-id="selectedTankId"
          :random="randomTank"
          :loadout-picks="loadoutPicks"
          @select-tank="(c) => emit('select-tank', c)"
          @change-loadout="(p) => emit('change-loadout', p)"
        />
      </aside>

      <div class="flex min-h-0 flex-col gap-5 pt-4 lg:pb-2 phone:grid phone:grid-cols-2 phone:grid-rows-1 phone:gap-3 phone:pb-1">
        <!-- 兩個主要入口：連線對戰、單機練習 -->
        <div
          class="grid grid-cols-1 gap-5 md:grid-cols-2 phone:min-h-0"
          :class="directoryAvailable ? 'phone:grid-cols-1 phone:grid-rows-[auto_minmax(0,1fr)]' : 'phone:col-span-2 phone:grid-cols-2 phone:grid-rows-1'"
        >
          <section class="toon-panel relative flex flex-col gap-3 p-4 pt-6 phone:gap-2 phone:p-2.5 phone:pt-5">
            <span class="toon-ribbon absolute -top-4 left-4">連線對戰</span>
            <div
              class="scene scene--stage relative h-36 overflow-hidden rounded-2xl border-[3px] border-ink phone:h-auto phone:min-h-0 phone:flex-1"
              :class="directoryAvailable ? 'phone:hidden' : ''"
            >
              <span v-if="randomTank" class="toon-mystery absolute bottom-4 left-[18%] h-12 text-3xl">?</span>
              <img v-else :src="avatarUrl" alt="" class="absolute bottom-4 left-[16%] h-14" />
              <img :src="rivalUrl" alt="" class="absolute bottom-4 right-[16%] h-14 -scale-x-100" />
              <span class="font-num absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-ink bg-sun text-base font-extrabold shadow-[0_3px_0_var(--color-ink)]">VS</span>
            </div>
            <p class="text-sm text-ink-soft phone:hidden">跟朋友各用一台電腦，用 6 碼房號連線對打</p>
            <div class="flex items-center gap-2">
              <input
                v-model="joinCode"
                type="text"
                maxlength="6"
                placeholder="房號"
                aria-label="6 碼房號"
                class="toon-input font-num min-w-0 flex-1 py-1.5 text-center text-lg phone:py-1 phone:text-base phone:tracking-[0.2em] font-extrabold uppercase tracking-[0.3em]"
                @keyup.enter="emit('join-code')"
              />
              <button
                type="button"
                :disabled="joinCode.trim().length !== 6"
                class="toon-btn toon-btn--sky shrink-0 px-4 py-1.5 text-lg phone:px-3 phone:py-1 phone:text-base"
                @click="emit('join-code')"
              >
                加入
              </button>
            </div>
            <div class="flex items-center gap-2 text-xs text-ink-soft">
              <span class="h-0 flex-1 border-t-[3px] border-dashed border-ink/20" />或<span class="h-0 flex-1 border-t-[3px] border-dashed border-ink/20" />
            </div>
            <button type="button" class="toon-btn toon-btn--sun w-full py-2.5 text-xl phone:py-1.5 phone:text-lg" @click="tap(() => emit('create'))">
              ＋ 開新戰局
            </button>
            <div
              v-if="errorMessage"
              class="flex items-center justify-between gap-3 rounded-xl border-[3px] border-ink bg-coral px-3 py-1.5 text-sm text-white"
            >
              <span>{{ errorMessage }}</span>
              <button type="button" class="shrink-0 underline cursor-pointer" @click="emit('dismiss-error')">關閉</button>
            </div>
          </section>

          <section class="toon-panel relative flex flex-col gap-3 p-4 pt-6 phone:gap-2 phone:p-2.5 phone:pt-5">
            <span class="toon-ribbon absolute -top-4 left-4" style="background: var(--color-grass); color: var(--color-ink); text-shadow: none">單機練習</span>
            <div class="scene scene--sky relative h-36 phone:h-auto phone:min-h-0 phone:flex-1 overflow-hidden rounded-2xl border-[3px] border-ink">
              <span v-if="randomTank" class="toon-mystery absolute bottom-4 left-1/2 h-12 -translate-x-1/2 text-3xl">?</span>
              <img v-else :src="avatarUrl" alt="" class="absolute bottom-4 left-1/2 h-14 -translate-x-1/2" />
            </div>
            <p class="text-sm text-ink-soft phone:text-xs">跟電腦對打，或同一台電腦輪流操作；不用連線</p>
            <button type="button" class="toon-btn toon-btn--grass mt-auto w-full py-2.5 text-xl phone:py-1.5 phone:text-lg" @click="tap(() => emit('hotseat'))">
              開始練習
            </button>
          </section>
        </div>

        <!-- 戰局列表：伺服器有提供時才出現，排在主要入口之後 -->
        <section v-if="directoryAvailable" class="toon-panel relative flex min-h-[220px] flex-1 flex-col gap-3 p-4 pt-6 phone:min-h-0 phone:gap-2 phone:p-2.5 phone:pt-5">
          <span class="toon-ribbon absolute -top-4 left-4" style="background: var(--color-paper); color: var(--color-ink); text-shadow: none">
            公開戰局
            <span class="font-num rounded-full border-2 border-ink bg-sun px-1.5 text-sm leading-tight">{{ rooms.length }}</span>
          </span>

          <div class="flex items-center gap-2">
            <input
              v-model="query"
              type="text"
              placeholder="搜尋房號或名稱"
              class="toon-input w-56 py-1 text-sm phone:w-auto phone:min-w-0 phone:flex-1"
            />
            <button
              type="button"
              title="重新整理"
              aria-label="重新整理"
              :disabled="loading"
              class="toon-btn h-9 w-9 rounded-full p-0 text-lg phone:h-8 phone:w-8 phone:shrink-0"
              @click="tap(() => emit('refresh'))"
            >
              <span :class="loading ? 'inline-block animate-spin' : ''">↻</span>
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto pr-1">
            <div v-if="rows.length" class="grid grid-cols-1 gap-3 pb-2 xl:grid-cols-2">
              <button
                v-for="room in rows"
                :key="room.code"
                type="button"
                :disabled="!joinable(room)"
                class="room-card group flex items-stretch gap-3 rounded-2xl border-[3px] border-ink bg-paper p-2 text-left phone:gap-2 phone:p-1.5"
                @click="emit('join-room', room)"
              >
                <MapPreview
                  v-if="MAP_REGISTRY[room.mapId]"
                  :map="MAP_REGISTRY[room.mapId]"
                  :width="124"
                  :height="72"
                  class="h-[72px] w-[124px] shrink-0 rounded-xl border-[3px] border-ink phone:h-[52px] phone:w-[84px]"
                />
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="flex items-center gap-1.5">
                    <span class="font-num shrink-0 rounded-md bg-ink px-1.5 text-xs font-bold tracking-wider text-sun">{{ room.code }}</span>
                    <span class="truncate text-lg leading-tight phone:text-base">{{ room.name }}</span>
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
            <div v-else class="flex h-full items-center justify-center py-4 text-center text-sm text-ink-soft">
              {{ query ? '找不到符合的戰局' : '現在還沒有公開的戰局，自己開一局吧！' }}
            </div>
          </div>
        </section>
      </div>
    </div>

    <!-- 連線中遮罩 -->
    <div v-if="connecting" class="absolute inset-0 z-20 flex items-center justify-center bg-ink/40">
      <div class="toon-panel flex flex-col items-center gap-3 px-10 py-6">
        <span v-if="randomTank" class="toon-mystery tank-drive h-12 text-3xl">?</span>
        <img v-else :src="avatarUrl" alt="" class="tank-drive h-12" />
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
.scene--sky {
  background: url('@/assets/ui/empty_sky.svg') center bottom / cover no-repeat, #cdeaff;
}
.scene--stage {
  background: url('@/assets/ui/stage_sky.svg') center bottom / cover no-repeat, #bfe4ff;
}
.tank-drive {
  animation: drive 0.6s ease-in-out infinite alternate;
}
@keyframes drive {
  from { transform: translateX(-10px) rotate(-2deg); }
  to { transform: translateX(10px) rotate(2deg); }
}
</style>
