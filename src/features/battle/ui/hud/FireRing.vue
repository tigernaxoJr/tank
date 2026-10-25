<script setup lang="ts">
import { computed } from 'vue'
import { uiUrl } from '@/shared/ui'

/**
 * 發射環：外框是 gauges/fire_*（待機 / 蓄力 / 停用）；溝槽裡的力道弧與「上一發」刻度由程式畫。
 * pointerdown 由呼叫端綁在這顆按鈕上：按住蓄力、放開發射。
 */
const props = defineProps<{ power: number; charging: boolean; disabled: boolean; lastFired: number | null }>()

const frame = computed(() => uiUrl('gauges', props.disabled ? 'fire_disabled' : props.charging ? 'fire_charging' : 'fire_idle'))

// 切割圖座標 227×229：圓心 (113, 114)，溝槽半徑約 75
const R = 75
const C = 2 * Math.PI * R
const ratio = computed(() => Math.max(0, Math.min(1, props.power / 100)))
const tick = computed(() => {
  if (props.lastFired === null) return null
  const rad = (props.lastFired / 100) * 2 * Math.PI - Math.PI / 2
  return {
    x1: 113 + Math.cos(rad) * (R - 9),
    y1: 114 + Math.sin(rad) * (R - 9),
    x2: 113 + Math.cos(rad) * (R + 9),
    y2: 114 + Math.sin(rad) * (R + 9),
  }
})
</script>

<template>
  <button
    type="button"
    class="fire relative touch-none"
    :class="charging ? 'is-charging' : ''"
    :disabled="disabled"
    aria-label="發射（按住蓄力，放開發射）"
    @contextmenu.prevent
  >
    <img :src="frame" alt="" draggable="false" class="absolute inset-0 h-full w-full" />
    <svg viewBox="0 0 227 229" class="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="fire-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stop-color="var(--color-grass)" />
          <stop offset=".55" stop-color="var(--color-sun)" />
          <stop offset="1" stop-color="var(--color-coral)" />
        </linearGradient>
      </defs>
      <g transform="rotate(-90 113 114)">
        <circle
          v-if="!disabled"
          cx="113"
          cy="114"
          :r="R"
          fill="none"
          stroke="url(#fire-grad)"
          stroke-width="11"
          stroke-linecap="round"
          :stroke-dasharray="C"
          :stroke-dashoffset="C * (1 - ratio)"
        />
      </g>
      <line v-if="tick && !disabled" v-bind="tick" stroke="var(--color-ink)" stroke-width="7" stroke-linecap="round" />
    </svg>
    <span class="label absolute inset-0 flex flex-col items-center justify-center leading-none" :class="disabled ? 'text-[#6f7a96]' : 'text-white'">
      <b class="text-[1.15em]">{{ disabled ? '等待' : charging ? '放開！' : '發射' }}</b>
      <span class="font-num mt-1 text-[0.85em]">{{ power.toFixed(0) }}</span>
    </span>
  </button>
</template>

<style scoped>
.fire {
  aspect-ratio: 227 / 229;
  cursor: pointer;
  font-family: var(--font-toon);
  filter: drop-shadow(0 3px 0 rgb(29 35 64 / 0.5));
  -webkit-tap-highlight-color: transparent;
}
.fire:disabled { cursor: not-allowed; }
.label { text-shadow: 0 2px 0 rgb(29 35 64 / 0.55); pointer-events: none; }
.is-charging { animation: throb 0.35s ease-in-out infinite alternate; }
@keyframes throb { from { transform: scale(0.97); } to { transform: scale(1.03); } }
@media (prefers-reduced-motion: reduce) { .is-charging { animation: none; } }
</style>
