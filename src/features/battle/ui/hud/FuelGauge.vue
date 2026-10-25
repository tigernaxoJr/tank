<script setup lang="ts">
import { computed } from 'vue'
import { IconGlyph, uiUrl } from '@/shared/ui'

/** 燃料環：外框是 gauges/fuel_ring（頂端油桶），奶油圓內由下往上漲橘色燃料；中間有油桶圖示，下方顯示百分比，剩不到 25% 轉紅閃爍 */
const props = defineProps<{ percent: number }>()
const frame = uiUrl('gauges', 'fuel_ring')
const pct = computed(() => Math.max(0, Math.min(100, props.percent)))
const low = computed(() => pct.value < 25)
</script>

<template>
  <div class="fuel flex flex-col items-center" title="燃料" role="meter" aria-label="燃料" :aria-valuenow="Math.round(pct)" aria-valuemin="0" aria-valuemax="100">
    <div class="ring relative w-full">
      <img :src="frame" alt="" draggable="false" class="absolute inset-0 h-full w-full" />
      <!-- 奶油圓：圓心 (113.5, 136)、半徑 66（228×250 圖座標） -->
      <div class="tank absolute overflow-hidden rounded-full">
        <div class="liquid absolute inset-x-0 bottom-0" :class="{ low }" :style="{ height: `${pct}%` }" />
        <span class="glyph absolute inset-0 flex items-center justify-center"><IconGlyph name="fuel" :size="16" /></span>
      </div>
    </div>
    <b class="num font-num" :class="{ low }">{{ Math.round(pct) }}</b>
  </div>
</template>

<style scoped>
.ring { aspect-ratio: 228 / 250; }
.tank { left: 21%; top: 41.5%; width: 58%; height: 52.8%; background: #fff6df; }
.liquid {
  background: linear-gradient(#ff9a3c, #f2561d);
  transition: height 0.15s ease;
  box-shadow: inset 0 3px 0 rgb(255 255 255 / 0.55);
}
.liquid.low { background: linear-gradient(#ff6b5a, #d6281c); animation: blink 0.7s ease-in-out infinite alternate; }
.glyph { opacity: 0.55; mix-blend-mode: multiply; }
.num {
  margin-top: -2px;
  padding: 0 7px;
  border-radius: 999px;
  background: #fff;
  box-shadow: inset 0 0 0 2px var(--color-ink);
  font-size: 0.7em;
  line-height: 1.35;
}
.num.low { background: var(--color-coral); color: #fff; }
@keyframes blink { from { opacity: 1; } to { opacity: 0.6; } }
@media (prefers-reduced-motion: reduce) { .liquid.low { animation: none; } }
</style>
