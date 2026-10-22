<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import {
  MAP_LIST,
  renderMapPreview,
  type MapBlueprint,
} from '@/features/battle'
import { soundController } from '@/features/audio'
import type { MapPresetId } from '@/shared/kernel/types'

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
      class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in"
      @click.self="emit('close')"
    >
      <div
        class="relative flex max-h-[90vh] w-full max-w-5xl flex-col rounded-3xl border-2 border-amber-400/50 bg-slate-900/95 p-6 shadow-[0_0_50px_rgba(245,158,11,0.25)] text-slate-100 overflow-hidden"
      >
        <!-- Modal 頂部標題列 -->
        <div class="flex items-center justify-between border-b border-slate-700/80 pb-4">
          <div class="flex items-center gap-3">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950 shadow-lg text-xl font-black">
              🗺️
            </span>
            <div>
              <h2 class="text-lg font-black tracking-wide text-white drop-shadow">
                作戰空域與地形圖庫 (STAGE SELECT)
              </h2>
              <p class="text-xs text-amber-300/80">
                點擊任一空島或峽谷戰場即可指派為本次對戰舞台
              </p>
            </div>
          </div>

          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-800/80 text-slate-300 hover:border-rose-400 hover:bg-rose-500/20 hover:text-white transition cursor-pointer"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <!-- 8 張地圖網格 (3 或 4 欄，遊戲卡片式呈現) -->
        <div class="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4 overflow-y-auto pr-1 py-1">
          <button
            v-for="m in MAP_LIST"
            :key="m.id"
            type="button"
            class="group relative flex flex-col overflow-hidden rounded-2xl border-2 text-left transition-all duration-200 cursor-pointer"
            :class="
              selectedMapId === m.id
                ? 'border-amber-400 bg-slate-800 shadow-[0_0_20px_rgba(251,191,36,0.35)] scale-[1.02] ring-2 ring-amber-400/40'
                : 'border-slate-700/70 bg-slate-800/60 hover:border-sky-400 hover:bg-slate-800/90 hover:scale-[1.01]'
            "
            @click="onSelect(m)"
          >
            <!-- 當前選中角標 -->
            <div
              v-if="selectedMapId === m.id"
              class="absolute top-2 right-2 z-10 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-slate-950 shadow"
            >
              ✓ 選擇中
            </div>

            <!-- 地圖縮圖即時渲染 -->
            <div class="relative h-28 w-full overflow-hidden bg-slate-950">
              <img
                :src="renderMapPreview(m, 280, 140)"
                :alt="m.name"
                class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div class="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-900 to-transparent" />
              <!-- 風速標籤 -->
              <span class="absolute bottom-2 left-2 rounded-md bg-slate-950/80 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-300 border border-sky-400/30 backdrop-blur-sm">
                💨 風速 ≤ {{ m.maxWind }}
              </span>
            </div>

            <!-- 地圖內容資訊 -->
            <div class="flex flex-1 flex-col justify-between p-3 space-y-1.5">
              <div>
                <div class="flex items-center justify-between gap-1">
                  <h3 class="truncate text-xs font-black text-white group-hover:text-amber-300 transition">
                    {{ m.name }}
                  </h3>
                </div>
                <div class="mt-0.5 text-[10px] font-bold text-amber-400/90">
                  {{ m.badge }}
                </div>
                <p class="mt-1 line-clamp-2 text-[10px] text-slate-300 leading-relaxed">
                  {{ m.description }}
                </p>
              </div>

              <div class="pt-1 border-t border-slate-700/50 flex items-center justify-between text-[9px] text-slate-400 font-mono">
                <span>尺寸: {{ m.width }}×{{ m.height }}</span>
                <span class="text-amber-400 group-hover:underline">確認指派 ➔</span>
              </div>
            </div>
          </button>
        </div>

        <!-- 底部快速提示 -->
        <div class="mt-4 flex items-center justify-between border-t border-slate-700/80 pt-3 text-[11px] text-slate-400">
          <span>💡 提示：點擊任何地圖即可立即套用，戰場背景將隨之切換</span>
          <button
            type="button"
            class="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-1.5 font-bold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
            @click="emit('close')"
          >
            關閉圖庫 (Esc)
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.animate-fade-in {
  animation: fadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
