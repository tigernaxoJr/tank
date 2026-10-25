<script setup lang="ts">
/**
 * RoomShell：房間 / 單機練習共用的版面（規格見 docs/07-ui-redesign-spec.md §二之 2）。
 * 橫放（含手機橫放）：左 戰車展示台、中 兩隊座位環、右 地圖票券 + 主按鈕，一屏放完；
 * 直放（平板 / 窄視窗）：三區改成底部分頁（戰車 / 隊伍 / 戰場），一次顯示一區。
 */
import { ref } from 'vue'
import { GameButton, IconGlyph } from '@/shared/ui'

defineProps<{ title: string; subtitle?: string }>()
const emit = defineEmits<{ (e: 'back'): void }>()

type Tab = 'stand' | 'seats' | 'side'
const tab = ref<Tab>('seats')
const TABS: { id: Tab; label: string }[] = [
  { id: 'stand', label: '戰車' },
  { id: 'seats', label: '隊伍' },
  { id: 'side', label: '戰場' },
]
</script>

<template>
  <div class="room flex min-h-0 flex-1 flex-col gap-2 font-toon text-ink">
    <header class="flex items-center gap-2">
      <GameButton variant="white" round aria-label="返回" title="返回" @click="emit('back')">
        <IconGlyph name="chevron_left" :size="22" />
      </GameButton>
      <div class="mr-auto min-w-0">
        <h1 class="room-title truncate font-num text-2xl font-extrabold leading-tight phone:text-xl">{{ title }}</h1>
        <p v-if="subtitle" class="truncate text-xs text-ink/70 phone:hidden">{{ subtitle }}</p>
      </div>
      <slot name="header-right" />
    </header>

    <div class="zones min-h-0 flex-1">
      <section class="zone" :class="{ on: tab === 'stand' }"><slot name="stand" /></section>
      <section class="zone" :class="{ on: tab === 'seats' }"><slot name="seats" /></section>
      <section class="zone" :class="{ on: tab === 'side' }"><slot name="side" /></section>
    </div>

    <nav class="tabs gap-2" aria-label="房間分頁">
      <GameButton v-for="t in TABS" :key="t.id" :variant="tab === t.id ? 'gold' : 'white'" class="flex-1" @click="tab = t.id">{{ t.label }}</GameButton>
    </nav>
  </div>
</template>

<style scoped>
.room-title {
  color: #fff;
  -webkit-text-stroke: 5px var(--color-ink);
  paint-order: stroke fill;
  text-shadow: 0 3px 0 var(--color-ink);
}
.zones {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.5fr) minmax(0, 1.05fr);
}
.zone {
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}
.zone::-webkit-scrollbar { display: none; }
.tabs { display: none; }

/* 直放（平板直拿）或視窗很窄（< 700px）：三區改成分頁，一次顯示一區；手機直拿由 index.html 的轉橫提示擋下 */
@media (max-width: 699px), (orientation: portrait) and (max-width: 1023px) {
  .zones { display: block; }
  .zone { display: none; height: 100%; }
  .zone.on { display: block; }
  .tabs { display: flex; }
}
</style>
