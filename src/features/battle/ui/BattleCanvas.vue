<script setup lang="ts">
/**
 * BattleCanvas (Phaser 3 全畫面容器 + 內嵌式鏡頭與雷達小地圖)
 */
import Phaser from 'phaser'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { BulletType } from '@/shared/kernel/types'
import type { DirtyRect, TankCorePort } from '@/shared/wasm'
import type { BattleState } from '../domain/battleState'
import { BattleScene, type ProjectileFlightOptions } from '../engine/BattleScene'

const VIEW_W = 1280
const VIEW_H = 720

const props = defineProps<{
  state: BattleState
  core: TankCorePort
  bulletType?: BulletType
}>()

const phaserRoot = ref<HTMLDivElement | null>(null)
const minimapCanvas = ref<HTMLCanvasElement | null>(null)

let game: Phaser.Game | null = null
let sceneInstance: BattleScene | null = null

function updateMinimap(camX: number, camY: number, viewW: number, viewH: number): void {
  const mini = minimapCanvas.value
  if (!mini) return
  const mctx = mini.getContext('2d')
  if (!mctx) return

  const mw = mini.width
  const mh = mini.height
  mctx.clearRect(0, 0, mw, mh)
  mctx.fillStyle = '#bfe3ff'
  mctx.fillRect(0, 0, mw, mh)

  const terrainCanvas = sceneInstance?.getTerrainCanvasSource()
  if (terrainCanvas) {
    mctx.drawImage(terrainCanvas, 0, 0, mw, mh)
  }

  const scaleX = mw / props.core.width
  const scaleY = mh / props.core.height

  for (const tank of Object.values(props.state.tanks)) {
    if (tank.hp <= 0) continue
    // 與大廳 token 同色：--color-team-a / --color-team-b，外框 --color-ink
    mctx.fillStyle = tank.team === 'A' ? '#ff9a1f' : '#3d8bff'
    mctx.strokeStyle = '#1d2340'
    mctx.lineWidth = 1.5
    mctx.beginPath()
    mctx.arc(tank.x * scaleX, tank.y * scaleY, 4, 0, Math.PI * 2)
    mctx.fill()
    mctx.stroke()
  }

  mctx.strokeStyle = '#1d2340'
  mctx.lineWidth = 2
  mctx.strokeRect(camX * scaleX, camY * scaleY, viewW * scaleX, viewH * scaleY)
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

function onMinimapClick(e: MouseEvent): void {
  const mini = minimapCanvas.value
  if (!mini) return
  const rect = mini.getBoundingClientRect()
  const clickX = (e.clientX - rect.left) / rect.width
  const clickY = (e.clientY - rect.top) / rect.height
  sceneInstance?.centerCameraAt(clickX * props.core.width, clickY * props.core.height)
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
    <div ref="phaserRoot" class="h-full w-full cursor-grab active:cursor-grabbing" />

    <!-- 右上角：全場雷達小地圖 + 鏡頭控制（卡通粗描邊，與大廳同一套 token） -->
    <div class="toon-panel pointer-events-auto absolute right-3 top-3 z-20 rounded-2xl p-1.5 font-toon">
      <div class="mb-1 flex items-center justify-between px-1 text-sm leading-none">
        <span>戰場雷達</span>
        <span class="text-[13px] text-ink-soft">點擊跳轉</span>
      </div>
      <canvas
        ref="minimapCanvas"
        :width="190"
        :height="86"
        class="block h-auto w-[150px] cursor-pointer rounded-lg border-[2.5px] border-ink lg:w-[190px]"
        @click="onMinimapClick"
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
