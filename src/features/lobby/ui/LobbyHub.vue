<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAP_REGISTRY, MapPreview } from '@/features/battle'
import { soundController } from '@/features/audio'
import { GameButton, IconGlyph, UiPanel, uiUrl } from '@/shared/ui'
import type { BulletType, MapPresetId, TankArchetypeId } from '@/shared/kernel/types'
import type { RoomListing } from '../infra/roomDirectory'
import type { SignalingEndpointInfo } from '../infra/peerAdapter'
import TankStand from './room/TankStand.vue'
import TankPortrait from './TankPortrait.vue'
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

const buildId = __BUILD_ID__
const query = ref('')
const showRooms = ref(false)
const showGarage = ref(false)

const logoUrl = uiUrl('title', 'logo')
const flagUrl = uiUrl('title', 'flag')
const sandbagsUrl = uiUrl('title', 'sandbags')
const cloudBigUrl = uiUrl('title', 'cloud_big')
const cloudSmallUrl = uiUrl('title', 'cloud_small')

// 可加入的排前面，其餘依建立時間（新的在前）
const rows = computed(() => {
  const q = query.value.trim().toUpperCase()
  return props.rooms
    .filter((r) => !q || r.code.includes(q) || r.name.toUpperCase().includes(q))
    .slice()
    .sort((a, b) => Number(joinable(b)) - Number(joinable(a)) || a.ageSec - b.ageSec)
})

/** 主角坦克立繪：每 rig 單位幾 px 與最高 px（横放手機靠 CSS 縮小外框） */
const PORTRAIT_UNIT = 1.6
const PORTRAIT_MAX_H = 150

function mapLabel(mapId: MapPresetId): string {
  const map = MAP_REGISTRY[mapId]
  return map ? splitDisplayName(map.name).zh : mapId
}

function joinable(room: RoomListing): boolean {
  return room.status === 'waiting' && room.players < room.maxPlayers
}

/** 快速開戰：有可加入的公開戰局就直接進，沒有就自己開一局 */
function quickPlay(): void {
  const open = rows.value.find(joinable)
  if (open) emit('join-room', open)
  else emit('create')
}

function openRooms(): void {
  showRooms.value = true
  emit('refresh')
}

function openGarage(): void {
  soundController.play('ui_click')
  showGarage.value = true
}
</script>

<template>
  <div class="title-scene relative flex min-h-[340px] flex-1 flex-col overflow-hidden font-toon">
    <!-- 背景點綴：雲飄過（背景本身是大廳的地圖視差圖層） -->
    <img :src="cloudBigUrl" alt="" class="cloud cloud--a pointer-events-none absolute" draggable="false" />
    <img :src="cloudSmallUrl" alt="" class="cloud cloud--b pointer-events-none absolute" draggable="false" />

    <!-- 左上：指揮官牌；右上：作戰手冊 -->
    <header class="relative z-10 flex items-start gap-2">
      <div class="commander flex items-center gap-2">
        <span class="commander-avatar flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky">
          <span v-if="randomTank" class="font-num text-xl font-extrabold text-white">?</span>
          <TankPortrait v-else :tank-id="selectedTankId" team="A" :barrel="false" :unit="0.4" />
        </span>
        <input
          v-model="playerName"
          type="text"
          maxlength="16"
          placeholder="Commander"
          aria-label="玩家名稱"
          class="w-32 bg-transparent text-lg outline-none placeholder:text-ink-soft/50 phone:w-28"
        />
        <span
          class="h-3 w-3 shrink-0 rounded-full"
          :class="signaling.mode === 'fallback-public' ? 'bg-sun' : 'bg-grass'"
          :title="`信令：${signaling.label}`"
        />
      </div>
      <GameButton variant="white" round class="ml-auto" aria-label="作戰手冊" title="作戰手冊" @click="emit('guide')">
        <IconGlyph name="question" :size="26" />
      </GameButton>
    </header>

    <!-- 主體：直放上下排；橫放左（Logo + 主角坦克）右（三個入口） -->
    <div class="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-between gap-2 lg:flex-row phone:flex-row">
      <section class="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 lg:items-start lg:pl-12 phone:items-start phone:pl-9">
        <img :src="logoUrl" alt="TANK ARTILLERY" draggable="false" class="logo w-[min(78vw,420px)] phone:w-[min(40vw,260px)]" />
        <button type="button" class="hero relative flex flex-col items-center" aria-label="更換戰車" @click="openGarage">
          <img :src="sandbagsUrl" alt="" draggable="false" class="sandbags absolute -bottom-1 -left-12 w-24 phone:-left-9 phone:w-16" />
          <img :src="flagUrl" alt="" draggable="false" class="flag absolute -right-10 bottom-1 w-14 phone:-right-8 phone:w-10" />
          <span v-if="randomTank" class="font-num flex h-24 w-24 items-center justify-center rounded-full bg-sky text-5xl font-extrabold text-white">?</span>
          <TankPortrait v-else :tank-id="selectedTankId" team="A" :unit="PORTRAIT_UNIT" :max-height="PORTRAIT_MAX_H" class="hero-tank phone:scale-[0.8]" />
          <span class="hero-tag mt-1 flex items-center gap-1 text-sm">
            <IconGlyph name="gear" :size="16" /> 點坦克換車
          </span>
        </button>
      </section>

      <nav class="flex w-full max-w-xs flex-col items-stretch gap-3 pb-2 lg:w-72 phone:w-60 phone:gap-2 phone:pb-0">
        <GameButton variant="gold" class="cta text-2xl phone:text-xl" @click="quickPlay">
          <IconGlyph name="shell" :size="30" /> 快速開戰
        </GameButton>
        <div class="grid grid-cols-2 gap-3 phone:gap-2">
          <GameButton variant="white" @click="openRooms">
            <IconGlyph name="link" :size="22" /> 房間
          </GameButton>
          <GameButton variant="sky" @click="emit('hotseat')">
            <IconGlyph name="robot" :size="22" /> 練習
          </GameButton>
        </div>
      </nav>
    </div>

    <!-- 房間抽屜：房號輸入、開新戰局、公開戰局 -->
    <Transition name="sheet">
      <div v-if="showRooms" class="absolute inset-0 z-30 flex items-stretch justify-end bg-ink/40" @click.self="showRooms = false">
        <UiPanel class="sheet-panel flex h-full w-[min(440px,100%)] flex-col">
          <div class="flex items-center gap-2 pb-2">
            <h2 class="font-num text-xl font-extrabold">加入戰局</h2>
            <GameButton variant="white" round class="ml-auto" aria-label="關閉" @click="showRooms = false">
              <IconGlyph name="close" :size="22" />
            </GameButton>
          </div>
          <div class="flex items-center gap-2">
            <input
              v-model="joinCode"
              type="text"
              maxlength="6"
              placeholder="輸入 6 碼房號"
              aria-label="6 碼房號"
              class="code-input font-num min-w-0 flex-1 text-center text-xl font-extrabold uppercase tracking-[0.25em]"
              @keyup.enter="emit('join-code')"
            />
            <GameButton variant="sky" :disabled="joinCode.trim().length !== 6" @click="emit('join-code')">加入</GameButton>
          </div>
          <GameButton variant="gold" class="mt-3" @click="emit('create')"><IconGlyph name="plus" :size="22" /> 開新戰局</GameButton>

          <div v-if="directoryAvailable" class="mt-3 flex min-h-0 flex-1 flex-col">
            <div class="mb-1 flex items-center gap-2 text-sm text-ink-soft">
              公開戰局 <b class="font-num">{{ rooms.length }}</b>
              <input v-model="query" type="text" placeholder="搜尋" class="code-input min-w-0 flex-1 text-sm" />
              <GameButton variant="white" round aria-label="重新整理" :disabled="loading" @click="emit('refresh')">
                <IconGlyph name="refresh" :size="22" :class="loading ? 'animate-spin' : ''" />
              </GameButton>
            </div>
            <ul class="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              <li v-for="room in rows" :key="room.code">
                <button type="button" :disabled="!joinable(room)" class="room-row flex w-full items-center gap-2 text-left" @click="emit('join-room', room)">
                  <MapPreview v-if="MAP_REGISTRY[room.mapId]" :map="MAP_REGISTRY[room.mapId]" :width="96" :height="56" class="h-14 w-24 shrink-0 rounded-lg" />
                  <span class="min-w-0 flex-1">
                    <span class="flex items-center gap-1.5">
                      <span class="font-num rounded bg-ink px-1.5 text-xs font-bold tracking-wider text-sun">{{ room.code }}</span>
                      <span class="truncate">{{ room.name }}</span>
                    </span>
                    <span class="block truncate text-xs text-ink-soft">{{ room.hostName }} · {{ mapLabel(room.mapId) }} · {{ room.players }}/{{ room.maxPlayers }}</span>
                  </span>
                  <span class="shrink-0 text-xs" :class="joinable(room) ? 'text-grass' : 'text-coral'">
                    {{ joinable(room) ? '可加入' : room.status === 'playing' ? '對戰中' : '已滿' }}
                  </span>
                </button>
              </li>
              <li v-if="!rows.length" class="py-4 text-center text-sm text-ink-soft">{{ query ? '找不到符合的戰局' : '還沒有公開的戰局，自己開一局吧！' }}</li>
            </ul>
          </div>
        </UiPanel>
      </div>
    </Transition>

    <!-- 車庫抽屜：換車與砲彈（沿用現有展示台，房間重寫時一併換掉） -->
    <Transition name="sheet">
      <div v-if="showGarage" class="absolute inset-0 z-30 flex items-stretch justify-start bg-ink/40" @click.self="showGarage = false">
        <UiPanel class="sheet-panel flex h-full w-[min(380px,100%)] flex-col">
          <div class="flex items-center gap-2 pb-2">
            <h2 class="font-num text-xl font-extrabold">我的戰車</h2>
            <GameButton variant="white" round class="ml-auto" aria-label="關閉" @click="showGarage = false">
              <IconGlyph name="close" :size="22" />
            </GameButton>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto pt-3">
            <TankStand
              :selected-tank-id="selectedTankId"
              :random="randomTank"
              :loadout-picks="loadoutPicks"
              @select-tank="(c) => emit('select-tank', c)"
              @change-loadout="(p) => emit('change-loadout', p)"
            />
          </div>
        </UiPanel>
      </div>
    </Transition>

    <p v-if="errorMessage" class="error-toast absolute inset-x-0 bottom-3 z-20 mx-auto flex w-fit max-w-[90%] items-center gap-2 text-white">
      <span>{{ errorMessage }}</span>
      <button type="button" class="underline" @click="emit('dismiss-error')">關閉</button>
    </p>

    <!-- 建置版本（不顯眼）：確認 PWA 是否還在吃舊快取 -->
    <span class="pointer-events-none absolute bottom-0.5 right-1.5 select-none font-mono text-[9px] text-ink/30">{{ buildId }}</span>

    <!-- 連線中遮罩 -->
    <div v-if="connecting" class="absolute inset-0 z-40 flex items-center justify-center bg-ink/45">
      <UiPanel class="flex flex-col items-center gap-3 px-6 py-3">
        <span v-if="randomTank" class="font-num tank-drive flex h-14 w-14 items-center justify-center rounded-full bg-sky text-3xl font-extrabold text-white">?</span>
        <TankPortrait v-else :tank-id="selectedTankId" team="A" :barrel="false" :unit="0.9" class="tank-drive" />
        <div class="text-xl">{{ connectingCode ? `正在加入 ${connectingCode}` : '正在開房' }}…</div>
        <GameButton variant="white" @click="emit('cancel-connect')">取消</GameButton>
      </UiPanel>
    </div>
  </div>
</template>

<style scoped>
.commander {
  padding: 4px 12px 4px 4px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.85);
  box-shadow: 0 3px 0 rgb(29 35 64 / 0.5), inset 0 0 0 2px var(--color-ink);
}
.commander-avatar { box-shadow: inset 0 0 0 2px var(--color-ink); }
.logo { filter: drop-shadow(0 4px 0 rgb(29 35 64 / 0.35)); }
.hero { cursor: pointer; -webkit-tap-highlight-color: transparent; padding: 0 3rem; }
.hero-tank { transition: transform 0.15s ease; animation: idle 2.4s ease-in-out infinite alternate; }
.hero-tag {
  padding: 1px 10px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.85);
  box-shadow: inset 0 0 0 2px var(--color-ink);
}
.flag { transform-origin: 8% 100%; animation: wave 2.6s ease-in-out infinite alternate; }
.cta { min-height: 64px; }
.cloud { opacity: 0.95; animation: drift linear infinite; }
.cloud--a { width: 190px; top: 14%; left: -220px; animation-duration: 70s; }
.cloud--b { width: 120px; top: 34%; left: -140px; animation-duration: 95s; animation-delay: -40s; }
.sheet-panel { padding: 0.25rem 0.5rem; }
.code-input {
  padding: 0.4rem 0.75rem;
  border-radius: 12px;
  border: 3px solid var(--color-ink);
  background: #fff;
  outline: none;
}
.code-input:focus { border-color: var(--color-sky-deep); }
.room-row {
  padding: 4px 8px 4px 4px;
  border-radius: 12px;
  background: rgb(255 255 255 / 0.8);
  box-shadow: inset 0 0 0 2px var(--color-ink);
  cursor: pointer;
}
.room-row:disabled { opacity: 0.55; cursor: not-allowed; }
.error-toast {
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--color-coral);
  box-shadow: 0 3px 0 rgb(29 35 64 / 0.5), inset 0 0 0 2px var(--color-ink);
}
.tank-drive { animation: drive 0.6s ease-in-out infinite alternate; }
.sheet-enter-active, .sheet-leave-active { transition: opacity 0.18s ease; }
.sheet-enter-active .sheet-panel, .sheet-leave-active .sheet-panel { transition: transform 0.22s ease; }
.sheet-enter-from, .sheet-leave-to { opacity: 0; }
.sheet-enter-from .sheet-panel, .sheet-leave-to .sheet-panel { transform: translateX(40px); }
@keyframes idle { from { transform: translateY(0); } to { transform: translateY(-3px); } }
@keyframes wave { from { transform: rotate(-3deg); } to { transform: rotate(4deg) skewX(-3deg); } }
@keyframes drift { from { transform: translateX(0); } to { transform: translateX(calc(100vw + 400px)); } }
@keyframes drive {
  from { transform: translateX(-10px) rotate(-2deg); }
  to { transform: translateX(10px) rotate(2deg); }
}
@media (prefers-reduced-motion: reduce) {
  .cloud, .flag, .hero-tank, .tank-drive { animation: none; }
}
</style>
