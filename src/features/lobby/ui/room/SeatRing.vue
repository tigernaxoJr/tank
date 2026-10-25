<script setup lang="ts">
import { computed } from 'vue'
import { IconGlyph, uiUrl } from '@/shared/ui'

/**
 * 座位環：外框是 ui_kit 的 seat_*（空位 / 有人 / 準備 / 房主），中間是隊色圓盤 + 車身圖。
 * 橘隊的「有人」環用 hue-rotate 把藍環轉成橘（素材只有藍色版）。
 */
const props = defineProps<{
  state: 'empty' | 'occupied' | 'ready' | 'host'
  color: string
  hullUrl?: string | null
  /** 面向左（藍隊）時車身鏡像 */
  mirror?: boolean
  /** 選了隨機：車身位置顯示問號 */
  mystery?: boolean
  bot?: boolean
  name?: string
  mine?: boolean
  disabled?: boolean
  /** 橘隊 'A'：有人環轉色用 */
  team: 'A' | 'B'
}>()

const SHEET: Record<typeof props.state, string> = {
  empty: 'seat_empty',
  occupied: 'seat_occupied',
  ready: 'seat_ready',
  host: 'seat_host',
}
const ringUrl = computed(() => uiUrl('ui_kit', SHEET[props.state]))
const tint = computed(() => (props.state === 'occupied' && props.team === 'A' ? 'hue-rotate(172deg) saturate(1.15)' : 'none'))
</script>

<template>
  <button type="button" class="seat" :class="{ mine, 'is-empty': state === 'empty' }" :disabled="disabled" :title="name">
    <span class="box">
      <span v-if="state !== 'empty'" class="face" :style="{ background: color }">
        <span v-if="mystery" class="mystery font-num">?</span>
        <img v-else-if="hullUrl" :src="hullUrl" alt="" draggable="false" :class="mirror ? '-scale-x-100' : ''" />
      </span>
      <img :src="ringUrl" alt="" draggable="false" class="ring" :style="{ filter: tint }" />
      <span v-if="bot && state !== 'empty'" class="bot"><IconGlyph name="robot" :size="14" /></span>
    </span>
    <span v-if="name !== undefined" class="name text-xs leading-tight">{{ name }}</span>
  </button>
</template>

<style scoped>
.seat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: calc(var(--seat, 64px) + 14px);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.seat:disabled { cursor: default; }
.box { position: relative; width: var(--seat, 64px); height: var(--seat, 64px); }
.ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 0 rgb(29 35 64 / 0.35));
}
.face {
  position: absolute;
  inset: 23%;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.face img { width: 74%; height: auto; }
.mystery { font-size: 1.4em; font-weight: 800; color: #fff; text-shadow: 0 2px 0 var(--color-ink); }
.bot {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: #fff;
  box-shadow: inset 0 0 0 2px var(--color-ink);
  display: flex;
  align-items: center;
  justify-content: center;
}
.name {
  max-width: 100%;
  padding: 0 5px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.85);
  box-shadow: inset 0 0 0 1.5px var(--color-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mine .box::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 999px;
  box-shadow: 0 0 0 3px var(--color-sun), 0 0 12px 2px rgb(255 201 61 / 0.8);
  pointer-events: none;
}
.is-empty:not(:disabled):hover .ring { transform: scale(1.06); }
.ring { transition: transform 0.1s ease; }
</style>
