<script setup lang="ts">
/**
 * BattleCanvas (Phaser 3 全畫面容器 + 內嵌式鏡頭與雷達小地圖)
 */
import Phaser from 'phaser'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { BulletType } from '@/shared/kernel/types'
import type { DirtyRect, TankCorePort } from '@/shared/wasm'
import type { BattleState } from '../domain/battleState'
import { BattleScene, type ProjectileFlightOptions } from '../engine/BattleScene'
import { MAP_REGISTRY } from '../domain/mapRegistry'
import { loadThemeArt, paintMapBackdrop } from './mapPreview'

const VIEW_W = 1280
const VIEW_H = 720

const props = defineProps<{
  state: BattleState
  core: TankCorePort
  bulletType?: BulletType
}>()

const phaserRoot = ref<HTMLDivElement | null>(null)
/** 手機直立時雷達預設收起 */
const radarOpen = ref(false)
const minimapCanvas = ref<HTMLCanvasElement | null>(null)

let game: Phaser.Game | null = null
let sceneInstance: BattleScene | null = null

// 雷達以 2 倍像素繪製；高度依地圖長寬比
const MINI_SCALE = 2
const MINI_W = 200
const mapSpec = computed(() => MAP_REGISTRY[props.state.mapId] ?? MAP_REGISTRY.harvest_plains)
const miniH = computed(() => Math.round((MINI_W * props.core.height) / props.core.width))
/** 主題天空 + 視差山丘，素材載入後畫一次快取起來 */
let miniBackdrop: HTMLCanvasElement | null = null
watch(
  [mapSpec, miniH],
  ([map, h]) => {
    miniBackdrop = null
    void loadThemeArt(map.theme).then((art) => {
      const c = document.createElement('canvas')
      c.width = MINI_W * MINI_SCALE
      c.height = h * MINI_SCALE
      const ctx = c.getContext('2d')
      if (!ctx) return
      paintMapBackdrop(ctx, map, art, c.width, c.height)
      miniBackdrop = c
    })
  },
  { immediate: true },
)

const INK = '#1d2340'
const TEAM_COLOR = { A: '#ff9a1f', B: '#3d8bff' } as const

/** 雷達最高重畫頻率：脈動圈與坦克位置不需要 60fps，手機上每幀縮放整張地形太吃主執行緒 */
const MINI_MIN_INTERVAL_MS = 100
let miniLastDraw = 0
let miniTrailing: ReturnType<typeof setTimeout> | undefined
/** 縮好的地形快取，地形沒變就直接貼這張 */
let miniTerrain: HTMLCanvasElement | null = null
let miniTerrainVersion = -1

function updateMinimap(camX: number, camY: number, viewW: number, viewH: number): void {
  const mini = minimapCanvas.value
  if (!mini) return
  const now = performance.now()
  if (now - miniLastDraw < MINI_MIN_INTERVAL_MS) {
    // 鏡頭停下來前最後一次回報可能被略過，補一次，雷達框才不會停在舊位置
    if (miniTrailing) clearTimeout(miniTrailing)
    miniTrailing = setTimeout(() => updateMinimap(camX, camY, viewW, viewH), MINI_MIN_INTERVAL_MS)
    return
  }
  miniLastDraw = now
  const mctx = mini.getContext('2d')
  if (!mctx) return

  const mw = mini.width
  const mh = mini.height
  if (miniBackdrop) {
    mctx.drawImage(miniBackdrop, 0, 0, mw, mh)
  } else {
    mctx.fillStyle = mapSpec.value.sky.bottom
    mctx.fillRect(0, 0, mw, mh)
  }

  const terrainCanvas = sceneInstance?.getTerrainCanvasSource()
  if (terrainCanvas) {
    const version = sceneInstance?.terrainVersion ?? 0
    if (!miniTerrain || miniTerrain.width !== mw || miniTerrain.height !== mh || miniTerrainVersion !== version) {
      miniTerrain ??= document.createElement('canvas')
      miniTerrain.width = mw
      miniTerrain.height = mh
      const tctx = miniTerrain.getContext('2d')
      if (tctx) {
        tctx.imageSmoothingEnabled = true
        tctx.imageSmoothingQuality = 'high'
        tctx.drawImage(terrainCanvas, 0, 0, mw, mh)
      }
      miniTerrainVersion = version
    }
    mctx.drawImage(miniTerrain, 0, 0)
  }

  const scaleX = mw / props.core.width
  const scaleY = mh / props.core.height

  // 鏡頭範圍外壓暗，範圍框用白底墨線
  const vx = Math.max(0, camX * scaleX)
  const vy = Math.max(0, camY * scaleY)
  const vw = Math.min(mw, (camX + viewW) * scaleX) - vx
  const vh = Math.min(mh, (camY + viewH) * scaleY) - vy
  mctx.fillStyle = 'rgba(29,35,64,0.28)'
  mctx.beginPath()
  mctx.rect(0, 0, mw, mh)
  mctx.rect(vx, vy, vw, vh)
  mctx.fill('evenodd')
  mctx.lineJoin = 'round'
  mctx.strokeStyle = '#ffffff'
  mctx.lineWidth = 4 * MINI_SCALE
  mctx.strokeRect(vx, vy, vw, vh)
  mctx.strokeStyle = INK
  mctx.lineWidth = 1.5 * MINI_SCALE
  mctx.strokeRect(vx, vy, vw, vh)

  const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 180)
  for (const tank of Object.values(props.state.tanks)) {
    const x = tank.x * scaleX
    const y = (tank.y - 8) * scaleY
    if (tank.hp <= 0) {
      // 陣亡：灰色叉叉
      const r = 3 * MINI_SCALE
      mctx.strokeStyle = 'rgba(29,35,64,0.55)'
      mctx.lineWidth = 1.5 * MINI_SCALE
      mctx.beginPath()
      mctx.moveTo(x - r, y - r)
      mctx.lineTo(x + r, y + r)
      mctx.moveTo(x + r, y - r)
      mctx.lineTo(x - r, y + r)
      mctx.stroke()
      continue
    }
    const active = tank.id === props.state.activePlayer && props.state.phase !== 'GAME_OVER'
    if (active) {
      mctx.beginPath()
      mctx.arc(x, y, (7 + pulse * 3) * MINI_SCALE, 0, Math.PI * 2)
      mctx.fillStyle = `rgba(255,210,63,${0.35 + pulse * 0.3})`
      mctx.fill()
      // 頭上的小倒三角
      const ty = y - 9 * MINI_SCALE
      mctx.beginPath()
      mctx.moveTo(x - 3.5 * MINI_SCALE, ty - 4 * MINI_SCALE)
      mctx.lineTo(x + 3.5 * MINI_SCALE, ty - 4 * MINI_SCALE)
      mctx.lineTo(x, ty)
      mctx.closePath()
      mctx.fillStyle = '#ffd23f'
      mctx.strokeStyle = INK
      mctx.lineWidth = 1.2 * MINI_SCALE
      mctx.fill()
      mctx.stroke()
    }
    // 與大廳 token 同色：--color-team-a / --color-team-b，外框 --color-ink
    mctx.beginPath()
    mctx.arc(x, y, 4.2 * MINI_SCALE, 0, Math.PI * 2)
    mctx.fillStyle = TEAM_COLOR[tank.team]
    mctx.strokeStyle = INK
    mctx.lineWidth = 1.5 * MINI_SCALE
    mctx.fill()
    mctx.stroke()
  }
}

function redrawTerrain(dirty?: DirtyRect): void {
  if (!dirty) {
    sceneInstance?.rebuildBackdropAndTerrain()
  } else {
    sceneInstance?.redrawTerrain(dirty)
  }
}

function onTerrainCarved(x: number, y: number, radius: number): void {
  sceneInstance?.onTerrainCarved(x, y, radius)
}

function onTerrainFilled(x: number, y: number, radius: number, dirty: DirtyRect): void {
  sceneInstance?.onTerrainFilled(x, y, radius, dirty)
}

function showDamage(x: number, y: number, amount: number, killed: boolean, color?: string): void {
  sceneInstance?.showDamage(x, y, amount, killed, color)
}

function playProjectileFlight(options: ProjectileFlightOptions): void {
  if (!sceneInstance) {
    options.onArriveImpact()
    options.onSequenceComplete()
    return
  }
  sceneInstance.playProjectileFlight(options)
}

function focusActiveTank(immediate = false): void {
  sceneInstance?.focusActiveTank(immediate)
}

function panCameraBy(dx: number, dy: number): void {
  sceneInstance?.panCameraBy(dx, dy)
}

const CAMERA_PANS = [
  { label: '鏡頭往左', dx: -260, dy: 0, rotate: 0 },
  { label: '鏡頭往上', dx: 0, dy: -180, rotate: 90 },
  { label: '鏡頭往下', dx: 0, dy: 180, rotate: -90 },
  { label: '鏡頭往右', dx: 260, dy: 0, rotate: 180 },
]

/** 點擊或拖曳雷達：鏡頭跳到該處（手機上用手指拖也可以） */
let draggingMinimap = false
function jumpFromMinimap(e: PointerEvent): void {
  const mini = minimapCanvas.value
  if (!mini) return
  const rect = mini.getBoundingClientRect()
  const clickX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const clickY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
  sceneInstance?.centerCameraAt(clickX * props.core.width, clickY * props.core.height)
}
function onMinimapDown(e: PointerEvent): void {
  draggingMinimap = true
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  jumpFromMinimap(e)
}
function onMinimapMove(e: PointerEvent): void {
  if (draggingMinimap) jumpFromMinimap(e)
}
function onMinimapUp(): void {
  draggingMinimap = false
}

watch(
  () => props.bulletType,
  (bt) => {
    if (bt) {
      sceneInstance?.setSelectedBulletType(bt)
    }
  },
)

watch(
  () => props.state.activePlayer,
  () => {
    sceneInstance?.focusActiveTank(false)
  },
)

onMounted(() => {
  if (!phaserRoot.value) return
  sceneInstance = new BattleScene()
  sceneInstance.bindContext(props.state, props.core, updateMinimap)
  if (props.bulletType) {
    sceneInstance.setSelectedBulletType(props.bulletType)
  }

  game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: phaserRoot.value,
    width: VIEW_W,
    height: VIEW_H,
    backgroundColor: '#0284c7',
    // Canvas Renderer：地形 CanvasTexture 每次挖坑都要整張重新上傳，在 WebGL 反而較慢且部分環境無 WebGL
    transparent: false,
    // RESIZE：畫布永遠等於視窗大小，不裁切左右兩側（ENVELOP 在窄螢幕會把地圖邊緣的坦克切掉）
    scale: {
      mode: Phaser.Scale.RESIZE,
    },
    scene: [sceneInstance],
  })
})

onUnmounted(() => {
  clearTimeout(miniTrailing)
  if (game) {
    game.destroy(true)
    game = null
    sceneInstance = null
  }
})

defineExpose({
  redrawTerrain,
  onTerrainCarved,
  onTerrainFilled,
  showDamage,
  playProjectileFlight,
  focusActiveTank,
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-sky-500 select-none">
    <!-- Phaser 3 WebGL 戰場畫布 -->
    <div ref="phaserRoot" class="h-full w-full cursor-grab touch-none active:cursor-grabbing" />

    <!-- 右上角：全場雷達小地圖 + 鏡頭控制（卡通粗描邊，與大廳同一套 token） -->
    <!-- 直立的手機畫面太窄：雷達收成右上角的按鈕，點開才顯示（記分板移到第二列） -->
    <button
      type="button"
      :aria-label="radarOpen ? '收起雷達' : '打開雷達'"
      :aria-pressed="radarOpen"
      class="toon-btn pointer-events-auto absolute right-3 top-3 z-30 h-11 w-11 rounded-full p-0 sm:hidden"
      :class="radarOpen ? 'toon-btn--sun' : ''"
      @click="radarOpen = !radarOpen"
    >
      <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 15l5-4 4 3 4-5 5 4" />
      </svg>
    </button>
    <div
      class="toon-panel pointer-events-auto absolute right-3 top-3 z-20 rounded-2xl p-1.5 font-toon max-sm:top-16 max-sm:p-1"
      :class="radarOpen ? '' : 'max-sm:hidden'"
    >
      <div class="mb-1 flex items-center justify-between px-1 text-sm leading-none">
        <span>戰場雷達</span>
        <span class="text-[13px] text-ink-soft">點擊 / 拖曳</span>
      </div>
      <canvas
        ref="minimapCanvas"
        :width="MINI_W * MINI_SCALE"
        :height="miniH * MINI_SCALE"
        class="block h-auto w-[120px] cursor-pointer touch-none sm:w-[150px] rounded-lg border-[2.5px] border-ink lg:w-[200px]"
        @pointerdown="onMinimapDown"
        @pointermove="onMinimapMove"
        @pointerup="onMinimapUp"
        @pointercancel="onMinimapUp"
      />
      <div class="mt-1.5 flex items-center gap-1">
        <button
          v-for="pan in CAMERA_PANS"
          :key="pan.label"
          type="button"
          :aria-label="pan.label"
          :title="pan.label"
          class="toon-btn hidden h-8 w-8 rounded-lg p-0 [border-width:2.5px] [box-shadow:0_3px_0_var(--color-ink)] lg:inline-flex"
          @click="panCameraBy(pan.dx, pan.dy)"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" :style="{ transform: `rotate(${pan.rotate}deg)` }" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M15 5 8 12l7 7" />
          </svg>
        </button>
        <button
          type="button"
          title="鏡頭回到出手的戰車"
          class="toon-btn toon-btn--sun ml-auto h-8 rounded-lg px-2 text-sm [border-width:2.5px] [box-shadow:0_3px_0_var(--color-ink)]"
          @click="focusActiveTank(false)"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
          對準
        </button>
      </div>
    </div>

    <!-- 插槽：直接將街機駕駛艙 HUD 疊加在遊戲畫布上 -->
    <slot />
  </div>
</template>
