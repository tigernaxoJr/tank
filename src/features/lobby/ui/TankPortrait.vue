<script setup lang="ts">
/**
 * 戰車立繪：照遊戲內的 rig 組合砲管、車身與待機表情，整組畫成一張 SVG，隨外框縮放。
 * rig 座標 = PNG 原尺寸 × 該機種的 sprite.scale（多半 0.4，海馬 0.34，同 BattleScene）；車身底線在 rig y = HULL_BASE_Y，砲管轉軸在圖寬 8%（同 BattleScene）。
 * 有拆件設計的坦克（sprite.parts）依 barrelZ 與零件 z 排圖層，零件畫待機姿勢；座標換算與 BattleScene 共用 tankRig.ts。
 * 面向左（藍隊）時整組水平鏡像，等同遊戲裡 dir = -1 的畫法。
 */
import { computed, reactive } from 'vue'
import { HULL_BASE_Y, getTankSpec, partPlacement, restFaceSvg, rigPivot } from '@/features/battle'
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
    /** 立繪最高幾 CSS px；比 unit 換算的高時改縮小（海馬這類高個子） */
    maxHeight?: number
  }>(),
  { barrel: true, aimDeg: 14, facingLeft: false, unit: undefined, maxHeight: undefined },
)

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
const hullTex = computed(() => sizeOf(sprites.value.hullUrl))
const hull = computed(() => {
  const s = hullTex.value
  return s && { w: s.w * spec.value.sprite.scale, h: s.h * spec.value.sprite.scale }
})
const barrel = computed(() => {
  const s = sizeOf(sprites.value.barrelUrl)
  return s && { w: s.w * spec.value.sprite.scale, h: s.h * spec.value.sprite.scale }
})
const pivot = computed(() => (hullTex.value ? rigPivot(spec.value.sprite, hullTex.value) : null))
/** 獨立零件（旗子、艙蓋、護套前圈）：待機姿勢，不套動作；圖左上角的 rig 座標與尺寸 */
const parts = computed(() =>
  (spec.value.sprite.parts ?? []).flatMap((def) => {
    const s = sizeOf(sprites.value.partUrls[def.id])
    if (!s || !hullTex.value) return []
    const p = partPlacement(spec.value.sprite, hullTex.value, def)
    const w = s.w * spec.value.sprite.scale
    const h = s.h * spec.value.sprite.scale
    return [{ def, href: sprites.value.partUrls[def.id], x: p.x - p.ox * w, y: p.y - p.oy * h, w, h }]
  }),
)
/** 圖層由下往上：同 BattleScene（barrelZ = front 時砲管在車身與 overHull 零件之上） */
const layers = computed(() => {
  const h = hull.value
  if (!h) return []
  const hullLayer = { key: 'hull', href: sprites.value.hullUrl, x: -h.w / 2, y: HULL_BASE_Y - h.h, w: h.w, h: h.h, transform: undefined as string | undefined }
  const b = barrel.value
  const pv = pivot.value
  const barrelLayer =
    props.barrel && b && pv
      ? [{ key: 'barrel', href: sprites.value.barrelUrl, x: pv.x - b.w * 0.08, y: pv.y - b.h / 2, w: b.w, h: b.h, transform: `rotate(${-props.aimDeg} ${pv.x} ${pv.y})` as string | undefined }]
      : []
  const over = (z: 'overHull' | 'overBarrel') =>
    parts.value.filter((p) => p.def.z === z).map((p) => ({ key: `part_${p.def.id}`, href: p.href, x: p.x, y: p.y, w: p.w, h: p.h, transform: undefined as string | undefined }))
  return spec.value.sprite.barrelZ === 'front'
    ? [hullLayer, ...over('overHull'), ...barrelLayer, ...over('overBarrel')]
    : [...barrelLayer, hullLayer, ...over('overHull'), ...over('overBarrel')]
})
/** 外框包住車身、零件與抬起的砲管 */
const viewBox = computed(() => {
  const h = hull.value
  if (!h) return [-50, -60, 100, 76]
  let x0 = -h.w / 2
  let x1 = h.w / 2
  let y0 = HULL_BASE_Y - h.h
  for (const p of parts.value) {
    x0 = Math.min(x0, p.x)
    x1 = Math.max(x1, p.x + p.w)
    y0 = Math.min(y0, p.y)
  }
  const b = barrel.value
  const pv = pivot.value
  if (props.barrel && b && pv) {
    const a = (props.aimDeg * Math.PI) / 180
    const tipX = pv.x + Math.cos(a) * b.w * 0.92
    const tipY = pv.y - Math.sin(a) * b.w * 0.92 - b.h / 2
    x1 = Math.max(x1, tipX + 2)
    y0 = Math.min(y0, tipY)
  }
  // 左右對稱：面向左時整組鏡像，外框不能因此裁掉
  x0 = Math.min(x0, -x1)
  x1 = Math.max(x1, -x0)
  return [x0, y0 - 1, x1 - x0, HULL_BASE_Y - y0 + 2]
})
const fixedSize = computed(() => {
  if (!props.unit) return {}
  const [, , w, h] = viewBox.value
  const unit = props.maxHeight ? Math.min(props.unit, props.maxHeight / h) : props.unit
  return { width: w * unit, height: h * unit }
})
</script>

<template>
  <svg :viewBox="viewBox.join(' ')" v-bind="fixedSize" class="block overflow-visible" role="img" :aria-label="spec.name">
    <g v-if="hull" :transform="facingLeft ? 'scale(-1 1)' : undefined">
      <image v-for="l in layers" :key="l.key" :href="l.href" :x="l.x" :y="l.y" :width="l.w" :height="l.h" :transform="l.transform" />
      <g v-html="face" />
    </g>
  </svg>
</template>
