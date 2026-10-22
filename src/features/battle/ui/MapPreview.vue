<script setup lang="ts">
/** 地圖預覽圖：素材載入完成前先顯示天空色，畫好後淡入 */
import { ref, watchEffect } from 'vue'
import type { MapBlueprint } from '../domain/mapRegistry'
import { loadMapPreview } from './mapPreview'

const props = withDefaults(defineProps<{ map: MapBlueprint; width?: number; height?: number }>(), {
  width: 360,
  height: 170,
})

const src = ref('')
watchEffect((onCleanup) => {
  let alive = true
  onCleanup(() => (alive = false))
  src.value = ''
  void loadMapPreview(props.map, props.width, props.height).then((url) => {
    if (alive) src.value = url
  })
})
</script>

<template>
  <div class="relative overflow-hidden" :style="{ background: `linear-gradient(${map.sky.top}, ${map.sky.bottom})` }">
    <img
      v-if="src"
      :src="src"
      :alt="map.name"
      class="map-preview-img block h-full w-full object-cover"
    />
  </div>
</template>

<style scoped>
.map-preview-img {
  animation: preview-in 0.25s ease-out;
}
@keyframes preview-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
