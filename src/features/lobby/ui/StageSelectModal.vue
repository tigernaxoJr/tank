<script setup lang="ts">
/**
 * 地圖圖庫：地圖票券「全部」打開的彈窗；z-60，疊在開房彈窗之上。點一張就換成這個戰場。
 */
import { MAP_LIST, MapPreview, type MapBlueprint } from '@/features/battle'
import { soundController } from '@/features/audio'
import { IconGlyph, ModalSheet } from '@/shared/ui'
import type { MapPresetId } from '@/shared/kernel/types'
import { splitDisplayName } from './displayNames'

defineProps<{
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
</script>

<template>
  <ModalSheet :open="open" title="全部地圖" size="lg" :z="60" @close="emit('close')">
    <div class="grid grid-cols-2 gap-2.5 p-1 lg:grid-cols-4 phone:grid-cols-4 phone:gap-2">
      <button
        v-for="(m, i) in MAP_LIST"
        :key="m.id"
        type="button"
        class="map-tile flex flex-col text-left"
        :aria-pressed="selectedMapId === m.id"
        @click="onSelect(m)"
      >
        <span class="relative block overflow-hidden rounded-t-[10px]">
          <MapPreview :map="m" :width="280" :height="112" class="block aspect-[5/2] w-full" />
          <span class="tag font-num left-1.5">{{ i + 1 }}</span>
          <span class="tag right-1.5"><IconGlyph name="wind" :size="12" />≤<b class="font-num">{{ m.maxWind }}</b></span>
          <span v-if="selectedMapId === m.id" class="tag using"><IconGlyph name="check" :size="12" />使用中</span>
        </span>
        <span class="flex flex-col gap-0.5 px-2 pb-2 pt-1 leading-tight">
          <span class="truncate text-base">{{ splitDisplayName(m.name).zh }}</span>
          <span class="font-num truncate text-xs font-bold text-ink/60 phone:hidden">{{ splitDisplayName(m.name).en }}</span>
          <span class="line-clamp-2 text-xs leading-snug text-ink/70 phone:hidden">{{ m.description }}</span>
        </span>
      </button>
    </div>
  </ModalSheet>
</template>

<style scoped>
.map-tile {
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 3px 0 rgb(29 35 64 / 0.4), inset 0 0 0 2.5px var(--color-ink);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.1s ease;
}
.map-tile:hover { transform: translateY(-2px); }
.map-tile[aria-pressed='true'] { background: #fff4c4; box-shadow: 0 3px 0 rgb(29 35 64 / 0.4), inset 0 0 0 2.5px var(--color-ink), 0 0 0 3px var(--color-sun); }
.tag {
  position: absolute;
  top: 4px;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.92);
  box-shadow: inset 0 0 0 1.5px var(--color-ink);
  font-size: 10px;
  line-height: 1.5;
}
.tag.using { background: var(--color-sun); top: auto; bottom: 6px; left: 6px; }
</style>
