<script setup lang="ts">
import { computed } from 'vue'
import { uiUrl } from '@/shared/ui'

/** 風向羅盤：外框是 gauges/wind_compass，箭頭方向 = 風向（右正左負），長度與數字 = 風力 */
const props = defineProps<{ wind: number }>()
const frame = uiUrl('gauges', 'wind_compass')

const len = computed(() => Math.min(56, 18 + Math.abs(props.wind) * 4))
const dir = computed(() => (props.wind < 0 ? -1 : 1))
</script>

<template>
  <div class="compass relative" :title="wind === 0 ? '無風' : `風力 ${Math.abs(wind)}`">
    <img :src="frame" alt="" draggable="false" class="absolute inset-0 h-full w-full" />
    <svg viewBox="0 0 225 226" class="absolute inset-0 h-full w-full">
      <g v-if="wind !== 0" :transform="`translate(112.5 100) scale(${dir} 1)`">
        <path
          :d="`M${-len} -9 H${len - 14} V-24 L${len + 8} 0 L${len - 14} 24 V9 H${-len} Z`"
          fill="var(--color-sky-deep)"
          stroke="var(--color-ink)"
          stroke-width="7"
          stroke-linejoin="round"
        />
      </g>
      <circle v-else cx="112.5" cy="100" r="12" fill="var(--color-ink-soft)" opacity=".5" />
      <text x="112.5" y="168" text-anchor="middle" font-size="50" font-weight="800" fill="var(--color-ink)" style="font-family: var(--font-num)">{{ Math.abs(wind) }}</text>
    </svg>
  </div>
</template>

<style scoped>
.compass { aspect-ratio: 225 / 226; }
</style>
