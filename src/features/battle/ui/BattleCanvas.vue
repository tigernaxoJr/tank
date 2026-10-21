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
  mctx.fillStyle = 'rgba(14, 116, 144, 0.75)'
  mctx.fillRect(0, 0, mw, mh)

  const terrainCanvas = sceneInstance?.getTerrainCanvasSource()
  if (terrainCanvas) {
    mctx.drawImage(terrainCanvas, 0, 0, mw, mh)
  }

  const scaleX = mw / props.core.width
  const scaleY = mh / props.core.height

  for (const tank of Object.values(props.state.tanks)) {
    if (tank.hp <= 0) continue
    mctx.fillStyle = tank.team === 'A' ? '#fb923c' : '#38bdf8'
    mctx.strokeStyle = '#ffffff'
    mctx.lineWidth = 1
    mctx.beginPath()
    mctx.arc(tank.x * scaleX, tank.y * scaleY, 3.5, 0, Math.PI * 2)
    mctx.fill()
    mctx.stroke()
  }

  mctx.strokeStyle = '#fde047'
  mctx.lineWidth = 1.8
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

function showDamage(x: number, y: number, amount: number, killed: boolean): void {
  sceneInstance?.showDamage(x, y, amount, killed)
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
  showDamage,
  playProjectileFlight,
  focusActiveTank,
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-sky-500 select-none">
    <!-- Phaser 3 WebGL 戰場畫布 -->
    <div ref="phaserRoot" class="h-full w-full cursor-grab active:cursor-grabbing" />

    <!-- 右上角：全場雷達小地圖 -->
    <div class="pointer-events-auto absolute right-3 top-2.5 z-20 rounded-2xl border-[3px] border-white bg-white/85 p-1.5 shadow-lg backdrop-blur-md">
      <div class="mb-0.5 flex items-center justify-between px-1 text-[10px] font-extrabold text-orange-600">
        <span>🗺️ 戰場雷達</span>
        <span class="text-teal-700">點擊跳轉</span>
      </div>
      <canvas
        ref="minimapCanvas"
        :width="190"
        :height="86"
        class="block h-auto w-[150px] rounded-lg border-2 border-teal-600/30 cursor-pointer lg:w-[190px]"
        @click="onMinimapClick"
      />
    </div>

    <!-- 左上角：鏡頭方向控制與鎖定按鈕 -->
    <div class="pointer-events-auto absolute left-3 top-2.5 z-20 flex flex-wrap items-center gap-1.5">
      <div class="inline-flex items-center gap-1 rounded-2xl border-[3px] border-white bg-white/85 p-1 text-xs font-bold text-teal-950 shadow-md backdrop-blur-md">
        <button type="button" class="rounded-lg bg-gradient-to-b from-cyan-300 to-sky-500 px-2 py-1 text-slate-950 hover:brightness-110 cursor-pointer" @click="panCameraBy(-260, 0)">◀</button>
        <button type="button" class="rounded-lg bg-gradient-to-b from-cyan-300 to-sky-500 px-2 py-1 text-slate-950 hover:brightness-110 cursor-pointer" @click="panCameraBy(0, -180)">▲</button>
        <button type="button" class="rounded-lg bg-gradient-to-b from-cyan-300 to-sky-500 px-2 py-1 text-slate-950 hover:brightness-110 cursor-pointer" @click="panCameraBy(0, 180)">▼</button>
        <button type="button" class="rounded-lg bg-gradient-to-b from-cyan-300 to-sky-500 px-2 py-1 text-slate-950 hover:brightness-110 cursor-pointer" @click="panCameraBy(260, 0)">▶</button>
      </div>

      <button
        type="button"
        class="rounded-2xl border-[3px] border-white bg-amber-400 px-2.5 py-1.5 text-xs font-extrabold text-slate-950 shadow-md hover:bg-amber-300 cursor-pointer"
        @click="focusActiveTank(false)"
      >
        🎯 鎖定坦克
      </button>
    </div>

    <!-- 插槽：直接將街機駕駛艙 HUD 疊加在遊戲畫布上 -->
    <slot />
  </div>
</template>
