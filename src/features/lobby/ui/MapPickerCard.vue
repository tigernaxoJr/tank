<script setup lang="ts">
import { computed } from 'vue'
import { MAP_LIST, renderMapPreview } from '@/features/battle'
import { soundController } from '@/features/audio'
import type { MapPresetId } from '@/shared/kernel/types'
import { splitDisplayName } from './displayNames'

const props = defineProps<{
  mapId: MapPresetId
  /** false 時只顯示不可切換（非房主、已開戰） */
  editable: boolean
}>()

const emit = defineEmits<{
  (e: 'select', mapId: MapPresetId): void
  (e: 'open-gallery'): void
}>()

const index = computed(() => Math.max(0, MAP_LIST.findIndex((m) => m.id === props.mapId)))
const map = computed(() => MAP_LIST[index.value] ?? MAP_LIST[0])
const label = computed(() => splitDisplayName(map.value.name))

function step(delta: number): void {
  if (!props.editable) return
  soundController.play('ui_click')
  emit('select', MAP_LIST[(index.value + delta + MAP_LIST.length) % MAP_LIST.length].id)
}
</script>

<template>
  <div class="space-y-2">
    <div class="relative overflow-hidden rounded-2xl border-[3px] border-ink bg-mist">
      <img :src="renderMapPreview(map, 360, 170)" :alt="map.name" class="aspect-[36/17] w-full object-cover" />
      <span class="font-num toon-pill absolute left-2 top-2 bg-paper text-xs font-extrabold">
        {{ index + 1 }} / {{ MAP_LIST.length }}
      </span>
      <span class="toon-pill absolute right-2 top-2 bg-paper text-xs">風 ≤ <b class="font-num">{{ map.maxWind }}</b></span>
      <template v-if="editable">
        <button
          type="button"
          aria-label="上一張地圖"
          class="toon-btn absolute left-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full p-0 text-lg"
          @click="step(-1)"
        >‹</button>
        <button
          type="button"
          aria-label="下一張地圖"
          class="toon-btn absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full p-0 text-lg"
          @click="step(1)"
        >›</button>
      </template>
    </div>
    <div class="flex items-start justify-between gap-2 px-1">
      <div class="min-w-0">
        <div class="truncate text-xl leading-tight">{{ label.zh }}</div>
        <div class="font-num truncate text-sm font-bold text-ink-soft">{{ label.en }}</div>
      </div>
      <button
        v-if="editable"
        type="button"
        class="toon-btn shrink-0 rounded-xl px-2.5 py-1 text-sm"
        @click="soundController.play('ui_click'); emit('open-gallery')"
      >
        全部地圖
      </button>
    </div>
    <p class="line-clamp-2 px-1 text-sm leading-snug text-ink-soft">{{ map.description }}</p>
  </div>
</template>
