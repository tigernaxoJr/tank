<script setup lang="ts">
import { uiUrl } from '@/shared/ui'

/** 血條：外框是 gauges/hp_bar（左端愛心），內部填色由程式畫；mirror 時整條左右翻轉（右隊用） */
defineProps<{ percent: number; color: string; mirror?: boolean }>()
const frame = `url(${uiUrl('gauges', 'hp_bar')})`
</script>

<template>
  <div class="hp-bar relative" :class="mirror ? '-scale-x-100' : ''" :style="{ backgroundImage: frame }">
    <div class="hp-fill" :style="{ width: `${Math.max(0, Math.min(100, percent)) * 0.736}%`, background: color }" />
  </div>
</template>

<style scoped>
.hp-bar { aspect-ratio: 512 / 106; background-size: 100% 100%; background-repeat: no-repeat; }
/* 內部凹槽：x 21.9%~95.5%、y 27.5%~78.3%；填色寬度 = 凹槽寬 73.6% × 血量比 */
.hp-fill {
  position: absolute;
  left: 21.9%;
  top: 27.5%;
  bottom: 21.7%;
  border-radius: 999px;
  box-shadow: inset 0 -3px 0 rgb(29 35 64 / 0.18), inset 0 2px 0 rgb(255 255 255 / 0.5);
  transition: width 0.4s ease;
}
</style>
