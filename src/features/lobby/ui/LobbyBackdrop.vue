<script setup lang="ts">
import { computed } from 'vue'
import {
  THEME_REGISTRY,
  mapAssetUrl,
  type MapBlueprint,
} from '@/features/battle'

const props = defineProps<{
  map: MapBlueprint
}>()

const themeSpec = computed(() => THEME_REGISTRY[props.map.theme])

const cloudsUrl = computed(() => mapAssetUrl(props.map.theme, 'clouds_far.png'))
const mountainsUrl = computed(() => mapAssetUrl(props.map.theme, 'mountains.png'))
const hillsFarUrl = computed(() => mapAssetUrl(props.map.theme, 'hills_far.png'))
const hillsNearUrl = computed(() => mapAssetUrl(props.map.theme, 'hills_near.png'))

const celestialKind = computed(() => themeSpec.value?.celestial?.kind ?? 'none')
const celestialStyle = computed(() => {
  const c = themeSpec.value?.celestial
  if (!c || c.kind === 'none') return {}
  return {
    left: `${Math.round(c.x * 100)}%`,
    top: `${Math.min(220, Math.max(30, c.y * 0.45))}px`,
  }
})
</script>

<template>
  <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none">
    <!-- 天空動態漸層 -->
    <div
      class="absolute inset-0 transition-all duration-700 ease-out"
      :style="{
        background: `linear-gradient(to bottom, ${map.sky.top} 0%, ${map.sky.bottom} 100%)`,
      }"
    />

    <!-- 天體：太陽 / 月亮 -->
    <div
      v-if="celestialKind !== 'none'"
      class="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-700"
      :style="celestialStyle"
    >
      <!-- 太陽 -->
      <div
        v-if="celestialKind === 'sun'"
        class="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-tr from-amber-300 via-yellow-100 to-white shadow-[0_0_60px_rgba(255,220,120,0.85)] ring-4 ring-yellow-200/40"
      >
        <div class="absolute -inset-6 rounded-full bg-yellow-300/20 blur-xl animate-pulse" />
      </div>
      <!-- 月亮 -->
      <div
        v-else-if="celestialKind === 'moon'"
        class="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 via-sky-100 to-slate-200 shadow-[0_0_50px_rgba(190,225,255,0.7)] ring-4 ring-sky-200/30"
      >
        <div class="absolute -inset-4 rounded-full bg-indigo-300/15 blur-lg" />
        <!-- 月海紋理斑點 -->
        <div class="absolute h-6 w-7 rounded-full bg-slate-300/40 blur-[1px] top-4 left-4" />
        <div class="absolute h-4 w-5 rounded-full bg-slate-300/30 blur-[1px] bottom-5 right-5" />
      </div>
    </div>

    <!-- 視差圖層 1：遠方飄移雲層 (無縫循環) -->
    <div
      class="cloud-scroll absolute inset-x-0 top-0 h-[380px] opacity-75 mix-blend-screen"
      :style="{
        backgroundImage: `url('${cloudsUrl}')`,
      }"
    />

    <!-- 視差圖層 2：遠景高山剪影 -->
    <div
      class="mountain-layer absolute inset-x-0 bottom-0 h-[320px] opacity-85"
      :style="{
        backgroundImage: `url('${mountainsUrl}')`,
      }"
    />

    <!-- 視差圖層 3：中景遠丘 -->
    <div
      class="hills-far-layer absolute inset-x-0 bottom-0 h-[240px] opacity-90"
      :style="{
        backgroundImage: `url('${hillsFarUrl}')`,
      }"
    />

    <!-- 視差圖層 4：近景山陵與地貌起伏 -->
    <div
      class="hills-near-layer absolute inset-x-0 bottom-0 h-[170px]"
      :style="{
        backgroundImage: `url('${hillsNearUrl}')`,
      }"
    />

    <!-- 柔和微光地平線 (保留地貌剪影同時確保明亮通透) -->
    <div
      class="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-slate-900/50 via-sky-950/20 to-transparent"
    />

    <!-- 戰術指揮艦橋微弱高空雲層微光，無壓抑暗角 -->
    <div
      class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.15)_0%,transparent_60%)]"
    />
  </div>
</template>

<style scoped>
.cloud-scroll {
  background-repeat: repeat-x;
  background-size: 1024px 380px;
  background-position: 0 0;
  animation: driftClouds 80s linear infinite;
}

@keyframes driftClouds {
  0% {
    background-position-x: 0;
  }
  100% {
    background-position-x: 1024px;
  }
}

.mountain-layer {
  background-repeat: repeat-x;
  background-size: 1024px 320px;
  background-position: bottom center;
}

.hills-far-layer {
  background-repeat: repeat-x;
  background-size: 1024px 240px;
  background-position: bottom center;
}

.hills-near-layer {
  background-repeat: repeat-x;
  background-size: 1024px 170px;
  background-position: bottom center;
}
</style>
