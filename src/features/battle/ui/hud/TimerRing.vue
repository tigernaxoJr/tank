<script setup lang="ts">
import { computed } from 'vue'
import { uiUrl } from '@/shared/ui'

/** 回合計時環：外框是 gauges/timer_ring（鬧鐘），進度弧與數字由程式畫在奶油色圓內 */
const props = defineProps<{ seconds: number | null; ratio: number; turn: number }>()
const frame = uiUrl('gauges', 'timer_ring')

// 奶油圓：圓心 (94, 121)（切割圖座標 190×213），進度弧半徑 56
const R = 56
const C = 2 * Math.PI * R
const color = computed(() => {
  const s = props.seconds ?? 99
  return s <= 3 ? 'var(--color-coral)' : s <= 7 ? 'var(--color-sun-deep)' : 'var(--color-grass)'
})
</script>

<template>
  <div class="timer relative" :class="seconds !== null && seconds <= 3 ? 'timer-hurry' : ''">
    <img :src="frame" alt="" draggable="false" class="absolute inset-0 h-full w-full" />
    <svg viewBox="0 0 190 213" class="absolute inset-0 h-full w-full">
      <g transform="rotate(-90 94 121)">
        <circle cx="94" cy="121" :r="R" fill="none" stroke="rgb(29 35 64 / 0.1)" stroke-width="12" />
        <circle
          v-if="seconds !== null"
          cx="94"
          cy="121"
          :r="R"
          fill="none"
          :stroke="color"
          stroke-width="12"
          stroke-linecap="round"
          :stroke-dasharray="C"
          :stroke-dashoffset="C * (1 - ratio)"
          class="transition-[stroke-dashoffset] duration-300"
        />
      </g>
    </svg>
    <div class="num absolute left-0 right-0 flex flex-col items-center leading-none text-ink">
      <template v-if="seconds !== null">
        <b class="font-num text-[1.6em] font-extrabold">{{ seconds }}</b>
      </template>
      <template v-else>
        <small class="text-[0.7em] opacity-60">回合</small>
        <b class="font-num text-[1.4em] font-extrabold">{{ turn }}</b>
      </template>
    </div>
  </div>
</template>

<style scoped>
.timer { aspect-ratio: 190 / 213; font-size: 0.95em; }
.num { top: 43%; }
.timer-hurry { animation: hurry 0.5s ease-in-out infinite alternate; }
@keyframes hurry { from { transform: scale(1); } to { transform: scale(1.1); } }
@media (prefers-reduced-motion: reduce) { .timer-hurry { animation: none; } }
</style>
