<script setup lang="ts">
import { computed } from 'vue'
import { uiUrl } from '@/shared/ui'

/**
 * 仰角盤：外框是 gauges/angle_dial（半圓、刻度、圓心鈕），指針、已瞄準弧與打不到的角度由程式畫。
 * 角度用標準方向：右 0°、上 90°、左 180°（朝左時呼叫端傳 180 − 仰角）。
 */
const props = defineProps<{
  /** 指針角度（0~180），已含車體傾斜 */
  needleDeg: number
  /** 顯示在盤面的數字（相對地面的實際仰角） */
  label: number
  facingLeft: boolean
  /** 這台車打不出去的角段（度，from > to），隨車體傾斜一起轉 */
  blocked: readonly (readonly [number, number])[]
  slopeDeg: number
}>()
const frame = uiUrl('gauges', 'angle_dial')

// 切割圖座標 329×194：圓心鈕在 (164, 162)；奶油區半徑約 100~125
const CX = 164
const CY = 162
const pt = (deg: number, r: number) => {
  const rad = (deg * Math.PI) / 180
  return { x: CX + Math.cos(rad) * r, y: CY - Math.sin(rad) * r }
}
const arc = (from: number, to: number, r: number) => {
  const a = pt(from, r)
  const b = pt(to, r)
  return `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`
}
const end = computed(() => Math.max(0, Math.min(180, props.needleDeg)))
const needle = computed(() => pt(end.value, 118))
// 朝右：從 0° 掃到指針（逆時針）；朝左：從 180° 掃到指針（順時針）
const sweep = computed(() => {
  const a = pt(props.facingLeft ? 180 : 0, 96)
  const b = pt(end.value, 96)
  return `M ${a.x} ${a.y} A 96 96 0 0 ${props.facingLeft ? 1 : 0} ${b.x} ${b.y}`
})
</script>

<template>
  <div class="dial relative">
    <img :src="frame" alt="" draggable="false" class="absolute inset-0 h-full w-full" />
    <svg viewBox="0 0 329 194" class="absolute inset-0 h-full w-full">
      <defs>
        <clipPath id="dial-clip"><rect x="0" y="0" width="329" :height="CY + 2" /></clipPath>
      </defs>
      <g :transform="`rotate(${slopeDeg} ${CX} ${CY})`" clip-path="url(#dial-clip)">
        <path v-for="(b, i) in blocked" :key="i" :d="arc(b[0], b[1], 108)" fill="none" stroke="var(--color-ink)" stroke-width="30" opacity=".22" />
      </g>
      <path :d="sweep" fill="none" stroke="var(--color-sun)" stroke-width="12" stroke-linecap="round" />
      <line :x1="CX" :y1="CY" :x2="needle.x" :y2="needle.y" stroke="var(--color-ink)" stroke-width="9" stroke-linecap="round" />
      <circle :cx="CX" :cy="CY" r="13" fill="var(--color-coral)" stroke="var(--color-ink)" stroke-width="6" />
      <text :x="CX" y="106" text-anchor="middle" font-size="46" font-weight="800" fill="var(--color-ink)" style="font-family: var(--font-num)">{{ label }}°</text>
    </svg>
  </div>
</template>

<style scoped>
.dial { aspect-ratio: 329 / 194; }
</style>
