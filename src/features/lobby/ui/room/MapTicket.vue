<script setup lang="ts">
import { computed } from 'vue'
import { MAP_LIST, MapPreview } from '@/features/battle'
import { soundController } from '@/features/audio'
import { GameButton, IconGlyph, uiUrl } from '@/shared/ui'
import type { MapPresetId } from '@/shared/kernel/types'
import { splitDisplayName } from '../displayNames'

/** 地圖票券：外框是 ui_kit/ticket（左右缺口），中間放地圖縮圖與名稱；可編輯時左右箭頭換圖、點縮圖開圖庫 */
const props = defineProps<{
  mapId: MapPresetId
  /** false 時只顯示不可切換（非房主、已開戰） */
  editable: boolean
}>()
const emit = defineEmits<{
  (e: 'select', mapId: MapPresetId): void
  (e: 'open-gallery'): void
}>()

const frame = `url(${uiUrl('ui_kit', 'ticket')})`
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
  <div class="ticket" :style="{ backgroundImage: frame }">
    <div class="inner">
      <div class="shot relative">
        <MapPreview :map="map" :width="360" :height="170" class="block aspect-[36/17] w-full" />
        <span class="tag num font-num">{{ index + 1 }}/{{ MAP_LIST.length }}</span>
        <span class="tag wind"><IconGlyph name="wind" :size="14" />≤<b class="font-num">{{ map.maxWind }}</b></span>
        <template v-if="editable">
          <GameButton variant="white" round class="arrow left-1" aria-label="上一張地圖" @click="step(-1)"><IconGlyph name="chevron_left" :size="18" /></GameButton>
          <GameButton variant="white" round class="arrow right-1" aria-label="下一張地圖" @click="step(1)"><IconGlyph name="chevron_left" :size="18" class="-scale-x-100" /></GameButton>
        </template>
      </div>
      <div class="mt-1 flex items-center gap-2">
        <div class="min-w-0 flex-1">
          <div class="truncate text-base leading-tight">{{ label.zh }}</div>
          <div class="font-num truncate text-xs font-bold text-ink-soft phone:hidden">{{ label.en }}</div>
        </div>
        <button v-if="editable" type="button" class="gallery" @click="soundController.play('ui_click'); emit('open-gallery')">全部</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ticket {
  aspect-ratio: 206 / 128;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  filter: drop-shadow(0 3px 0 rgb(29 35 64 / 0.4));
  container-type: inline-size;
}
.inner { height: 100%; padding: 9% 9% 7%; display: flex; flex-direction: column; justify-content: center; }
.shot { overflow: hidden; border-radius: 8px; box-shadow: inset 0 0 0 2px var(--color-ink); }
.tag {
  position: absolute;
  top: 3px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.9);
  box-shadow: inset 0 0 0 1.5px var(--color-ink);
  font-size: 10px;
  line-height: 1.5;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.tag.num { left: 3px; }
.tag.wind { right: 3px; }
.arrow { position: absolute; top: 50%; translate: 0 -50%; --gb-size: 28px; }
.gallery {
  padding: 1px 10px;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 2px 0 rgb(29 35 64 / 0.45), inset 0 0 0 2px var(--color-ink);
  font-size: 12px;
  cursor: pointer;
}
</style>
