<script setup lang="ts">
/**
 * 戰車立繪：照遊戲內的 rig 組合砲管、車身與待機表情，整組畫成一張 SVG，隨外框縮放。
 * 精靈圖以 2.5 倍繪製，rig 座標 = PNG 原尺寸 / 2.5；車身底線在 rig y = HULL_BASE_Y，砲管轉軸在圖寬 8%（同 BattleScene）。
 * 面向左（藍隊）時整組水平鏡像，等同遊戲裡 dir = -1 的畫法。
 */
import { computed, reactive } from 'vue'
import { getTankSpec, restFaceSvg } from '@/features/battle'
import type { TankArchetypeId, TeamId } from '@/shared/kernel/types'

const props = withDefaults(
  defineProps<{
    tankId: TankArchetypeId
    team: TeamId
    /** 是否畫砲管（小縮圖可省略） */
    barrel?: boolean
    /** 砲管仰角（度） */
    aimDeg?: number
    facingLeft?: boolean
    /** 每 rig 單位幾個 CSS px；不給就隨外框縮放 */
    unit?: number
  }>(),
  { barrel: true, aimDeg: 14, facingLeft: false, unit: undefined },
)

const ART_ZOOM = 2.5
const HULL_BASE_Y = 14

/** PNG 原尺寸快取（所有立繪共用） */
const sizes = reactive<Record<string, { w: number; h: number }>>({})
function sizeOf(url: string): { w: number; h: number } | null {
  if (!sizes[url]) {
    const img = new Image()
    img.onload = () => (sizes[url] = { w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
  }
  return sizes[url] ?? null
}

const spec = computed(() => getTankSpec(props.tankId))
const sprites = computed(() => spec.value.getSprites(props.team))
const face = computed(() => restFaceSvg(spec.value.sprite.face))
const hull = computed(() => {
  const s = sizeOf(sprites.value.hullUrl)
  return s && { w: s.w / ART_ZOOM, h: s.h / ART_ZOOM }
})
const barrel = computed(() => {
  const s = sizeOf(sprites.value.barrelUrl)
  return s && { w: s.w / ART_ZOOM, h: s.h / ART_ZOOM }
})
/** 外框包住車身與抬起的砲管 */
const viewBox = computed(() => {
  const h = hull.value
  if (!h) return [-50, -60, 100, 76]
  let x0 = -h.w / 2
  let x1 = h.w / 2
  let y0 = HULL_BASE_Y - h.h
  const b = barrel.value
  if (props.barrel && b) {
    const a = (props.aimDeg * Math.PI) / 180
    const tipX = spec.value.sprite.pivotX + Math.cos(a) * b.w * 0.92
    const tipY = spec.value.sprite.pivotY - Math.sin(a) * b.w * 0.92 - b.h / 2
    x1 = Math.max(x1, tipX + 2)
    x0 = Math.min(x0, -x1)
    x1 = Math.max(x1, -x0)
    y0 = Math.min(y0, tipY)
  }
  return [x0, y0 - 1, x1 - x0, HULL_BASE_Y - y0 + 2]
})
const fixedSize = computed(() => (props.unit ? { width: viewBox.value[2] * props.unit, height: viewBox.value[3] * props.unit } : {}))
</script>

<template>
  <svg :viewBox="viewBox.join(' ')" v-bind="fixedSize" class="block overflow-visible" role="img" :aria-label="spec.name">
    <g v-if="hull" :transform="facingLeft ? 'scale(-1 1)' : undefined">
      <image
        v-if="barrel && props.barrel"
        :href="sprites.barrelUrl"
        :x="spec.sprite.pivotX - barrel.w * 0.08"
        :y="spec.sprite.pivotY - barrel.h / 2"
        :width="barrel.w"
        :height="barrel.h"
        :transform="`rotate(${-aimDeg} ${spec.sprite.pivotX} ${spec.sprite.pivotY})`"
      />
      <image :href="sprites.hullUrl" :x="-hull.w / 2" :y="HULL_BASE_Y - hull.h" :width="hull.w" :height="hull.h" />
      <g v-html="face" />
    </g>
  </svg>
</template>
