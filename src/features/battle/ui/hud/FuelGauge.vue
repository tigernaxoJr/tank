<script setup lang="ts">
import { uiUrl } from '@/shared/ui'

/** 燃料環：外框是 gauges/fuel_ring（頂端油桶），奶油圓內由下往上漲金色燃料 */
defineProps<{ percent: number }>()
const frame = uiUrl('gauges', 'fuel_ring')
</script>

<template>
  <div class="fuel relative" title="燃料" role="meter" aria-label="燃料" :aria-valuenow="Math.round(percent)" aria-valuemin="0" aria-valuemax="100">
    <img :src="frame" alt="" draggable="false" class="absolute inset-0 h-full w-full" />
    <!-- 奶油圓：圓心 (113.5, 136)、半徑 66（228×250 圖座標） -->
    <div class="tank absolute overflow-hidden rounded-full">
      <div class="liquid absolute inset-x-0 bottom-0" :style="{ height: `${Math.max(0, Math.min(100, percent))}%` }" />
    </div>
  </div>
</template>

<style scoped>
.fuel { aspect-ratio: 228 / 250; }
.tank { left: 21%; top: 41.5%; width: 58%; height: 52.8%; }
.liquid {
  background: linear-gradient(#ffd96b, var(--color-sun-deep));
  transition: height 0.15s ease;
  box-shadow: inset 0 3px 0 rgb(255 255 255 / 0.55);
}
</style>
