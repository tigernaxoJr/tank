<script setup lang="ts">
import { computed } from 'vue'
import {
  MAP_LIST,
  renderMapPreview,
  type MapBlueprint,
} from '@/features/battle'
import { soundController } from '@/features/audio'
import type { MapPresetId } from '@/shared/kernel/types'

const props = defineProps<{
  selectedMapId: MapPresetId
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'select', mapId: MapPresetId): void
  (e: 'open-gallery'): void
}>()

const currentIndex = computed(() => {
  const idx = MAP_LIST.findIndex((m) => m.id === props.selectedMapId)
  return idx >= 0 ? idx : 0
})

const currentMap = computed<MapBlueprint>(() => MAP_LIST[currentIndex.value] ?? MAP_LIST[0])

function prevMap(): void {
  if (props.disabled) return
  soundController.play('ui_click')
  const prevIdx = (currentIndex.value - 1 + MAP_LIST.length) % MAP_LIST.length
  emit('select', MAP_LIST[prevIdx].id)
}

function nextMap(): void {
  if (props.disabled) return
  soundController.play('ui_click')
  const nextIdx = (currentIndex.value + 1) % MAP_LIST.length
  emit('select', MAP_LIST[nextIdx].id)
}

function hexColor(colorNum: number): string {
  return `#${colorNum.toString(16).padStart(6, '0')}`
}
</script>

<template>
  <div class="relative flex flex-col justify-between rounded-3xl border-2 border-sky-400/50 bg-slate-900/85 p-4 shadow-2xl backdrop-blur-md space-y-3">
    <!-- 頂部列：標題 + 序號 + 全圖庫按鈕 -->
    <div class="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-2.5">
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center gap-1.5 rounded-full border-2 border-sky-400/60 bg-sky-500/25 px-2.5 py-0.5 text-xs font-black text-sky-200">
          🗺️ 作戰空域
        </span>
        <span class="font-mono text-xs font-bold text-sky-200/80">
          STAGE {{ currentIndex + 1 }} / {{ MAP_LIST.length }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="disabled" class="text-[10px] font-extrabold text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-0.5 rounded-lg">
          👑 房主選定中
        </span>
        <button
          type="button"
          :disabled="disabled"
          class="rounded-xl border border-sky-400/40 bg-sky-500/20 px-3 py-1 text-xs font-black text-sky-200 hover:border-sky-300 hover:bg-sky-400/30 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          @click="emit('open-gallery')"
        >
          全圖庫列表 (8) ↗
        </button>
      </div>
    </div>

    <!-- 舞台展示大視窗 (附左右切換箭頭) -->
    <div class="relative flex-1 group overflow-hidden rounded-2xl border-2 border-slate-700/70 bg-slate-950 shadow-inner">
      <!-- 地圖即時剪影預覽 -->
      <img
        :src="renderMapPreview(currentMap, 400, 200)"
        :alt="currentMap.name"
        class="h-44 w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
      />

      <!-- 視窗四角科幻裁切線條裝飾 -->
      <div class="pointer-events-none absolute inset-0 border border-sky-400/20" />
      <div class="pointer-events-none absolute top-2 left-2 h-3 w-3 border-t-2 border-l-2 border-amber-400" />
      <div class="pointer-events-none absolute top-2 right-2 h-3 w-3 border-t-2 border-r-2 border-amber-400" />
      <div class="pointer-events-none absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2 border-amber-400" />
      <div class="pointer-events-none absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2 border-amber-400" />

      <!-- 左切換按鈕 -->
      <button
        type="button"
        :disabled="disabled"
        title="上一張地圖"
        class="absolute left-2.5 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-400/60 bg-slate-900/85 text-amber-300 shadow-xl backdrop-blur-sm transition hover:scale-110 hover:border-amber-300 hover:bg-amber-400 hover:text-slate-950 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        @click="prevMap"
      >
        <span class="text-base font-black">◀</span>
      </button>

      <!-- 右切換按鈕 -->
      <button
        type="button"
        :disabled="disabled"
        title="下一張地圖"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-400/60 bg-slate-900/85 text-amber-300 shadow-xl backdrop-blur-sm transition hover:scale-110 hover:border-amber-300 hover:bg-amber-400 hover:text-slate-950 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        @click="nextMap"
      >
        <span class="text-base font-black">▶</span>
      </button>

      <!-- 底部漸層浮層：地圖名稱與規格 -->
      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent p-3.5 pt-7">
        <div class="flex items-center justify-between gap-2">
          <h3 class="truncate text-base font-black text-white drop-shadow">
            {{ currentMap.name }}
          </h3>
          <span class="shrink-0 rounded-md bg-amber-400/25 px-2 py-0.5 font-mono text-[11px] font-black text-amber-300 border border-amber-400/40">
            {{ currentMap.width }} × {{ currentMap.height }}
          </span>
        </div>
        <p class="mt-0.5 text-xs font-semibold text-amber-300/90 drop-shadow">
          {{ currentMap.badge }}
        </p>
      </div>
    </div>

    <!-- 地圖環境情資儀表板 (風速 / 特性 / 殘骸土質) -->
    <div class="space-y-2 rounded-2xl border-2 border-slate-700/70 bg-slate-800/80 p-3 shadow-md">
      <p class="text-xs text-slate-200 leading-relaxed line-clamp-2">
        {{ currentMap.description }}
      </p>

      <div class="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
        <!-- 風速指標 -->
        <div class="flex items-center gap-2">
          <span class="shrink-0 font-extrabold text-slate-400">💨 風速上限:</span>
          <div class="flex-1 flex items-center gap-1">
            <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-800 border border-slate-700">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="currentMap.maxWind > 10 ? 'bg-rose-400' : currentMap.maxWind > 6 ? 'bg-amber-400' : 'bg-emerald-400'"
                :style="{ width: `${Math.min(100, Math.round((currentMap.maxWind / 15) * 100))}%` }"
              />
            </div>
            <span class="font-mono font-bold text-slate-200">{{ currentMap.maxWind }}</span>
          </div>
        </div>

        <!-- 土質殘骸色彩 -->
        <div class="flex items-center justify-end gap-1.5">
          <span class="font-extrabold text-slate-400">爆破土質:</span>
          <div class="flex items-center gap-1">
            <span
              v-for="(c, i) in currentMap.debrisColors"
              :key="i"
              class="h-3 w-3 rounded-full border border-slate-600 shadow-sm"
              :style="{ backgroundColor: hexColor(c) }"
              :title="`土質色彩 ${i + 1}`"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
