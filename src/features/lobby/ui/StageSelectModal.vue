<script setup lang="ts">
/**
 * 地圖圖庫：地圖卡「全部地圖」打開的彈窗。卡通粗描邊風格，與地圖卡（MapPickerCard）同一套縮圖與標籤；
 * z-50，疊在開房彈窗（z-40）之上。
 */
import { onMounted, onUnmounted } from 'vue'
import {
  MAP_LIST,
  MapPreview,
  type MapBlueprint,
} from '@/features/battle'
import { soundController } from '@/features/audio'
import type { MapPresetId } from '@/shared/kernel/types'
import { splitDisplayName } from './displayNames'

const props = defineProps<{
  open: boolean
  selectedMapId: MapPresetId
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', mapId: MapPresetId): void
}>()

function onSelect(map: MapBlueprint): void {
  soundController.play('ui_select')
  emit('select', map.id)
  emit('close')
}

function onKeydown(e: KeyboardEvent): void {
  if (props.open && e.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 font-toon text-ink sm:p-6"
      @click.self="emit('close')"
    >
      <div class="toon-panel pop relative flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col p-5 pt-8">
        <span class="toon-ribbon absolute -top-5 left-1/2 -translate-x-1/2 px-6 text-xl" style="background: var(--color-grass); color: var(--color-ink); text-shadow: none">
          全部地圖
        </span>
        <button
          type="button"
          aria-label="關閉圖庫"
          class="toon-btn absolute right-3 top-3 h-9 w-9 rounded-full p-0"
          @click="emit('close')"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <p class="text-center text-sm text-ink-soft">點一張地圖就會換成這個戰場</p>

        <!-- 地圖卡片網格 -->
        <div class="mt-3 grid min-h-0 grid-cols-1 gap-4 overflow-y-auto overflow-x-hidden p-2 pb-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            v-for="(m, i) in MAP_LIST"
            :key="m.id"
            type="button"
            class="map-tile group flex flex-col text-left"
            :aria-pressed="selectedMapId === m.id"
            @click="onSelect(m)"
          >
            <div class="relative overflow-hidden rounded-[13px] border-b-[3px] border-ink bg-mist">
              <MapPreview
                :map="m"
                :width="280"
                :height="112"
                class="aspect-[5/2] w-full transition-transform duration-300 group-hover:scale-105"
              />
              <span class="font-num toon-pill absolute left-2 top-2 bg-paper text-xs font-extrabold">{{ i + 1 }}</span>
              <span class="toon-pill absolute right-2 top-2 bg-paper text-xs">風 ≤ <b class="font-num">{{ m.maxWind }}</b></span>
              <span
                v-if="selectedMapId === m.id"
                class="toon-pill absolute bottom-2 left-2 bg-sun text-xs shadow-[0_2px_0_var(--color-ink)]"
              >
                <svg viewBox="0 0 12 12" class="h-3 w-3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 6.5 2.5 2.5 4.5-6" /></svg>
                使用中
              </span>
            </div>
            <div class="flex flex-1 flex-col gap-1 px-3 pb-3 pt-2">
              <div class="min-w-0 leading-tight">
                <div class="truncate text-lg">{{ splitDisplayName(m.name).zh }}</div>
                <div class="font-num truncate text-sm font-bold text-ink-soft">{{ splitDisplayName(m.name).en }}</div>
              </div>
              <span v-if="m.badge" class="truncate text-xs text-ink-soft" :title="m.badge">{{ m.badge }}</span>
              <p class="line-clamp-2 text-sm leading-snug text-ink-soft">{{ m.description }}</p>
            </div>
          </button>
        </div>

        <div class="mt-3 flex justify-end">
          <button type="button" class="toon-btn rounded-xl px-4 py-1.5 text-base" @click="emit('close')">
            關閉 <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pop {
  animation: pop 0.18s cubic-bezier(0.2, 1.4, 0.4, 1);
}
@keyframes pop {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.map-tile {
  border: 3px solid var(--color-ink);
  border-radius: 18px;
  background: var(--color-paper);
  box-shadow: 0 4px 0 var(--color-ink);
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.map-tile:hover {
  transform: translateY(-3px);
  box-shadow: 0 7px 0 var(--color-ink);
}
.map-tile:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--color-ink);
}
.map-tile[aria-pressed='true'] {
  background: #fffbe0;
  box-shadow: 0 0 0 4px var(--color-sun), 0 4px 0 4px var(--color-ink);
}

kbd {
  display: inline-flex;
  min-width: 1.6rem;
  justify-content: center;
  padding: 0 0.35rem;
  border: 2px solid var(--color-ink);
  border-radius: 7px;
  background: var(--color-cream);
  box-shadow: 0 2px 0 var(--color-ink);
  font-family: var(--font-num);
  font-size: 0.8rem;
  line-height: 1.4;
}
</style>
