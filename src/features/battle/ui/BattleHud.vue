<script setup lang="ts">
/**
 * BattleHud (街機風格的遊戲內嵌式駕駛艙 HUD Overlay)
 *
 * 設計規範：
 * - 嚴禁使用傳統 HTML 表單滑桿 (<input type="range">) 或佔用畫面高度導致出現網頁捲軸。
 * - 全部採用 `absolute` 疊加於全畫面 Phaser 戰場畫布之上 (`pointer-events-none` 容器 + `pointer-events-auto` 面板)。
 * - 頂部中央：雙陣營總血條、風向羅盤與回合橫幅。
 * - 底部中央：街機裝甲儀表板（當前 2.5D 戰車頭像、半圓角度扇形錶、MOVE 燃料錶、刻度式 POWER 蓄力槽、彈種圖示與 FIRE 巨型發射鈕）。
 */
import { computed } from 'vue'
import type { BattleState } from '../domain/battleState'
import { PROJECTILE_REGISTRY } from '../domain/projectileRegistry'
import { TANK_LIST, getTankSpec } from '../domain/tankRegistry'
import type { BulletType } from '@/shared/kernel/types'

interface Props {
  state: BattleState
  bulletType: BulletType
  /** 出手坦克的主彈、副彈；連線對戰中對手尚未揭露時為 null（顯示「？」） */
  shots: readonly BulletType[] | null
  canControl: boolean
  isBotTurn?: boolean
  isMuted: boolean
  syncStatus?: 'ok' | 'mismatch' | null
  roomLabel?: string
  /** 回合剩餘秒數；電腦回合為 null（不顯示） */
  turnSecondsLeft?: number | null
}

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'move', deltaX: number): void
  (e: 'update-aim', angle: number, power: number): void
  (e: 'change-bullet', bullet: BulletType): void
  (e: 'fire'): void
  (e: 'reset-match'): void
  (e: 'toggle-mute'): void
  (e: 'leave-game'): void
}>()

const activeTank = computed(() => props.state.tanks[props.state.activePlayer])
const activeTankSpec = computed(() =>
  activeTank.value ? getTankSpec(activeTank.value.tankId) : TANK_LIST[0],
)
const activeSpriteUrl = computed(() => {
  if (!activeTank.value) return TANK_LIST[0].getSprites('A').hullUrl
  return activeTankSpec.value.getSprites(activeTank.value.team).hullUrl
})

/** 目前出手坦克可用的砲彈（主彈、副彈）；未揭露時為 null */
const activeShots = computed(() => props.shots?.map((id) => PROJECTILE_REGISTRY[id]) ?? null)

const teamATanks = computed(() =>
  Object.values(props.state.tanks).filter((t) => t.team === 'A'),
)
const teamBTanks = computed(() =>
  Object.values(props.state.tanks).filter((t) => t.team === 'B'),
)

const isAiming = computed(() => props.state.phase === 'AIMING')
const controlsDisabled = computed(() => !props.canControl || !isAiming.value || !activeTank.value)

const teamAHpPercent = computed(() => {
  const list = teamATanks.value
  if (list.length === 0) return 0
  const sum = list.reduce((acc, t) => acc + t.hp / t.maxHp, 0)
  return Math.round((sum / list.length) * 100)
})
const teamBHpPercent = computed(() => {
  const list = teamBTanks.value
  if (list.length === 0) return 0
  const sum = list.reduce((acc, t) => acc + t.hp / t.maxHp, 0)
  return Math.round((sum / list.length) * 100)
})
const fuelPercent = computed(() =>
  activeTank.value
    ? Math.max(0, Math.min(100, (activeTank.value.moveFuel / activeTank.value.maxMoveFuel) * 100))
    : 0,
)
const activeHpPercent = computed(() =>
  activeTank.value
    ? Math.max(0, Math.min(100, Math.round((activeTank.value.hp / activeTank.value.maxHp) * 100)))
    : 0,
)

const windBarStyle = computed(() => {
  const w = props.state.wind
  if (w === 0) return { width: '0%' }
  const percent = Math.min(50, Math.abs(w) * 3.5)
  return w > 0 ? { left: '50%', width: `${percent}%` } : { right: '50%', width: `${percent}%` }
})

/** 風速顯示文字：箭頭數代表風力等級 */
const windLabel = computed(() => {
  const w = props.state.wind
  const arrows = Math.min(3, Math.ceil(Math.abs(w) / 4))
  if (w === 0) return '無風'
  return w > 0 ? `${w} ${'▶'.repeat(arrows)}` : `${'◀'.repeat(arrows)} ${-w}`
})

/** 仰角儀表盤（半圓：0° 在右、180° 在左） */
const DIAL_CX = 60
const DIAL_CY = 60
const DIAL_R = 46
function dialPoint(deg: number, r: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  return { x: DIAL_CX + Math.cos(rad) * r, y: DIAL_CY - Math.sin(rad) * r }
}
const dialArcPath = `M ${DIAL_CX - DIAL_R} ${DIAL_CY} A ${DIAL_R} ${DIAL_R} 0 0 1 ${DIAL_CX + DIAL_R} ${DIAL_CY}`
const dialNeedle = computed(() => dialPoint(activeTank.value?.angle ?? 45, DIAL_R - 6))
const dialTicks = [15, 45, 75, 105, 135, 165].map((deg) => ({ deg, a: dialPoint(deg, DIAL_R - 2), b: dialPoint(deg, DIAL_R + 3) }))
const POWER_SEGMENTS = 20

import { useBattleInput } from './composables/useBattleInput'

// --- 街機刻度式 POWER 蓄力槽點擊設定、鍵盤操作與空白鍵長按震盪蓄力 ---
const {
  powerBarRef,
  lastFiredPowerByPlayer,
  isCharging,
  facingLeft,
  elevation,
  adjustAngle,
  handleMove: onMove,
  onClickPowerGauge,
  onPointerDownCharge,
} = useBattleInput({
  activeTank,
  controlsDisabled,
  activeShots,
  onMove: (deltaX) => emit('move', deltaX),
  onUpdateAim: (angle, power) => emit('update-aim', angle, power),
  onChangeBullet: (bullet) => emit('change-bullet', bullet),
  onFire: () => emit('fire'),
})

// 每位玩家各自的「上一發力道」游標（熱座輪流時互不干擾）
const lastFiredPower = computed(() => lastFiredPowerByPlayer[props.state.activePlayer] ?? null)
</script>

<template>
  <!-- 全螢幕無捲軸覆蓋層 (pointer-events-none 讓中間戰場可直接滑鼠拖曳鏡頭)；風格：明亮玻璃面板 + 粗白邊 + 暖色重點 -->
  <div class="pointer-events-none absolute inset-0 flex flex-col justify-between p-2.5 sm:p-3.5 select-none text-teal-950">
    <!-- 頂部：雙隊伍血條 + 回合 / 倒數 / 風向 + 音效與離開 -->
    <div class="flex items-start justify-between gap-2">
      <div class="hidden xl:block w-56" />

      <div class="pointer-events-auto mt-11 flex max-w-[calc(100%-170px)] flex-wrap items-center gap-2 rounded-3xl border-[3px] border-white bg-white/85 px-3 py-2 shadow-[0_8px_24px_rgba(8,60,80,0.35)] backdrop-blur-md lg:mx-auto lg:mt-0 lg:max-w-none lg:flex-nowrap lg:gap-3 lg:px-4 xl:gap-4 xl:px-5">
        <!-- 琥珀隊 -->
        <div class="flex items-center gap-2">
          <span class="whitespace-nowrap rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-black text-slate-950 shadow-sm">
            琥珀 {{ teamATanks.filter((t) => t.hp > 0).length }}/{{ teamATanks.length }}
          </span>
          <div class="h-4 w-16 overflow-hidden rounded-full border-2 border-amber-500/60 bg-amber-100 lg:w-20 xl:w-28">
            <div class="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-300 transition-all duration-300" :style="{ width: `${teamAHpPercent}%` }" />
          </div>
        </div>

        <!-- 中央：回合 / 倒數 / 風 -->
        <div class="flex flex-col items-center gap-1 border-x-2 border-teal-600/20 px-3">
          <div class="flex items-center gap-1.5">
            <span class="rounded-full bg-teal-600 px-2 py-0.5 font-mono text-[11px] font-black text-white">TURN {{ state.turnId }}</span>
            <span
              v-if="turnSecondsLeft != null && state.phase === 'AIMING'"
              class="rounded-full border-2 px-2 py-0.5 font-mono text-[11px] font-black"
              :class="turnSecondsLeft <= 5 ? 'animate-pulse border-rose-500 bg-rose-500 text-white' : 'border-emerald-500/60 bg-emerald-100 text-emerald-800'"
            >
              ⏱ {{ String(turnSecondsLeft).padStart(2, '0') }}
            </span>
            <span v-if="activeTank" class="text-xs font-extrabold" :class="activeTank.team === 'A' ? 'text-amber-700' : 'text-sky-700'">
              {{ state.phase === 'FIRING' ? '🚀 砲彈飛行中...' : isBotTurn ? `${activeTank.name} 瞄準中...` : `${activeTank.name} 行動` }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-black text-teal-800">風</span>
            <div class="relative h-2.5 w-20 overflow-hidden xl:w-28 rounded-full border-2 border-sky-500/50 bg-sky-100">
              <div class="absolute bottom-0 left-1/2 top-0 z-10 w-0.5 -translate-x-1/2 bg-teal-900/60" />
              <div class="absolute bottom-0 top-0 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 transition-all duration-500" :style="windBarStyle" />
            </div>
            <span class="min-w-[4.5rem] font-mono text-xs font-black text-sky-700">{{ windLabel }}</span>
          </div>
        </div>

        <!-- 皇家藍隊 -->
        <div class="flex items-center gap-2">
          <div class="h-4 w-16 overflow-hidden rounded-full border-2 border-sky-500/60 bg-sky-100 lg:w-20 xl:w-28">
            <div class="h-full rounded-full bg-gradient-to-l from-blue-600 to-sky-300 transition-all duration-300" :style="{ width: `${teamBHpPercent}%` }" />
          </div>
          <span class="whitespace-nowrap rounded-full bg-sky-400 px-2.5 py-0.5 text-xs font-black text-slate-950 shadow-sm">
            皇家藍 {{ teamBTanks.filter((t) => t.hp > 0).length }}/{{ teamBTanks.length }}
          </span>
        </div>

        <div class="flex items-center gap-1.5 self-center border-l-2 border-teal-600/20 pl-3">
          <button
            type="button"
            class="whitespace-nowrap rounded-full border-2 border-teal-600/40 bg-white px-2.5 py-1 text-xs font-bold hover:bg-teal-50 cursor-pointer"
            @click="emit('toggle-mute')"
          >
            {{ isMuted ? '🔇' : '🔊' }}
          </button>
          <button
            type="button"
            class="whitespace-nowrap rounded-full border-2 border-white bg-gradient-to-b from-rose-400 to-rose-600 px-3 py-1 text-xs font-extrabold text-white shadow hover:brightness-110 cursor-pointer"
            @click="emit('leave-game')"
          >
            退出
          </button>
        </div>
      </div>

      <div class="hidden xl:block w-56" />
    </div>

    <!-- 勝負結算 -->
    <div
      v-if="state.phase === 'GAME_OVER'"
      class="pointer-events-auto mx-auto my-auto rounded-[2rem] border-[5px] border-white bg-gradient-to-b from-white to-emerald-100 px-10 py-7 text-center shadow-[0_16px_48px_rgba(8,60,80,0.45)]"
    >
      <div class="text-3xl font-black text-orange-600 drop-shadow-sm">
        🏆
        <span v-if="state.winner === 'draw'">平手！</span>
        <span v-else-if="state.winner === 'A'">琥珀隊獲勝！</span>
        <span v-else-if="state.winner === 'B'">皇家藍隊獲勝！</span>
      </div>
      <div class="mt-5 flex items-center justify-center gap-3">
        <button
          type="button"
          class="rounded-2xl border-2 border-white bg-gradient-to-b from-amber-300 to-orange-500 px-6 py-2.5 text-sm font-black text-slate-950 shadow-lg hover:brightness-110 cursor-pointer"
          @click="emit('reset-match')"
        >
          🔄 再戰一局
        </button>
        <button
          type="button"
          class="rounded-2xl border-2 border-teal-600/40 bg-white px-6 py-2.5 text-sm font-bold text-teal-900 shadow hover:bg-teal-50 cursor-pointer"
          @click="emit('leave-game')"
        >
          返回戰車大廳
        </button>
      </div>
    </div>

    <!-- 底部駕駛艙 -->
    <div class="pointer-events-auto mx-auto w-full max-w-5xl rounded-3xl border-[3px] border-white bg-white/90 px-4 py-3 shadow-[0_-4px_28px_rgba(8,60,80,0.35)] backdrop-blur-md">
      <div class="grid grid-cols-12 items-center gap-x-4 gap-y-2">
        <!-- 1. 戰車 / HP / MOVE -->
        <div class="col-span-12 flex items-center gap-3 sm:col-span-5 lg:col-span-4">
          <div
            class="relative flex h-16 w-[4.5rem] shrink-0 items-center justify-center rounded-2xl border-[3px] bg-gradient-to-b from-white to-teal-100 p-1 shadow-inner"
            :class="activeTank?.team === 'B' ? 'border-sky-400' : 'border-amber-400'"
          >
            <img :src="activeSpriteUrl" alt="" class="h-full w-full object-contain drop-shadow" />
          </div>
          <div class="min-w-0 flex-1 space-y-1.5">
            <div class="flex items-baseline justify-between gap-2">
              <span class="truncate text-sm font-black">{{ activeTank?.name }}</span>
              <span class="shrink-0 text-[11px] font-bold text-teal-700">{{ activeTankSpec.name }}</span>
            </div>
            <div class="flex items-center gap-2 text-[11px]">
              <span class="w-9 font-black text-emerald-700">HP</span>
              <div class="h-3 flex-1 overflow-hidden rounded-full border-2 border-emerald-500/50 bg-emerald-100">
                <div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-300 transition-all" :style="{ width: `${activeHpPercent}%` }" />
              </div>
              <span class="w-8 text-right font-mono font-black">{{ activeTank?.hp }}</span>
            </div>
            <div class="flex items-center gap-2 text-[11px]">
              <span class="w-9 font-black text-amber-700">MOVE</span>
              <div class="h-3 flex-1 overflow-hidden rounded-full border-2 border-amber-500/50 bg-amber-100">
                <div class="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all" :style="{ width: `${fuelPercent}%` }" />
              </div>
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  :disabled="controlsDisabled || !activeTank || activeTank.moveFuel <= 0"
                  class="rounded-lg bg-gradient-to-b from-cyan-300 to-sky-500 px-2 py-0.5 font-black text-slate-950 shadow-sm hover:brightness-110 disabled:opacity-35 cursor-pointer"
                  @click="onMove(-6)"
                >◀</button>
                <button
                  type="button"
                  :disabled="controlsDisabled || !activeTank || activeTank.moveFuel <= 0"
                  class="rounded-lg bg-gradient-to-b from-cyan-300 to-sky-500 px-2 py-0.5 font-black text-slate-950 shadow-sm hover:brightness-110 disabled:opacity-35 cursor-pointer"
                  @click="onMove(6)"
                >▶</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. 仰角儀表盤 -->
        <div class="col-span-5 flex flex-col items-center sm:col-span-3 lg:col-span-2">
          <svg viewBox="0 0 120 70" class="h-[4.5rem] w-32">
            <path :d="dialArcPath" fill="none" stroke="#99f6e4" stroke-width="9" stroke-linecap="round" />
            <path :d="dialArcPath" fill="none" stroke="#0d9488" stroke-width="2" stroke-dasharray="1 5" stroke-linecap="round" />
            <line v-for="t in dialTicks" :key="t.deg" :x1="t.a.x" :y1="t.a.y" :x2="t.b.x" :y2="t.b.y" stroke="#0f766e" stroke-width="2" stroke-linecap="round" />
            <line :x1="DIAL_CX" :y1="DIAL_CY" :x2="dialNeedle.x" :y2="dialNeedle.y" stroke="#ea580c" stroke-width="5" stroke-linecap="round" />
            <circle :cx="DIAL_CX" :cy="DIAL_CY" r="7" fill="#fbbf24" stroke="#fff" stroke-width="3" />
          </svg>
          <div class="-mt-1 flex items-center gap-1 font-mono text-lg font-black leading-none text-orange-600">
            <span class="text-xs text-teal-700">{{ facingLeft ? '◀' : '' }}</span>{{ elevation }}°<span class="text-xs text-teal-700">{{ facingLeft ? '' : '▶' }}</span>
          </div>
          <div class="mt-1.5 flex items-center gap-1">
            <button type="button" :disabled="controlsDisabled" class="rounded-lg border-2 border-teal-600/30 bg-white px-1.5 py-0.5 text-[11px] font-black hover:bg-teal-100 disabled:opacity-35 cursor-pointer" @click="adjustAngle(-5)">-5</button>
            <button type="button" :disabled="controlsDisabled" class="rounded-lg border-2 border-teal-600/30 bg-white px-1.5 py-0.5 text-[11px] font-black hover:bg-teal-100 disabled:opacity-35 cursor-pointer" @click="adjustAngle(-1)">▼</button>
            <button type="button" :disabled="controlsDisabled" class="rounded-lg border-2 border-teal-600/30 bg-white px-1.5 py-0.5 text-[11px] font-black hover:bg-teal-100 disabled:opacity-35 cursor-pointer" @click="adjustAngle(1)">▲</button>
            <button type="button" :disabled="controlsDisabled" class="rounded-lg border-2 border-teal-600/30 bg-white px-1.5 py-0.5 text-[11px] font-black hover:bg-teal-100 disabled:opacity-35 cursor-pointer" @click="adjustAngle(5)">+5</button>
          </div>
        </div>

        <!-- 3. 彈種 + POWER 蓄力槽 -->
        <div class="col-span-7 space-y-2 sm:col-span-4 lg:col-span-4">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <span v-if="!activeShots" class="rounded-xl border-2 border-dashed border-teal-600/30 px-2.5 py-1 text-[11px] font-extrabold text-teal-700" title="對手的彈藥在開火前不會揭露">
                ？ ？
              </span>
              <button
                v-for="(proj, shotIdx) in activeShots ?? []"
                :key="proj.id"
                type="button"
                :disabled="controlsDisabled"
                :title="`${proj.name}: ${proj.description}`"
                class="rounded-xl border-2 px-2.5 py-1 text-[11px] font-extrabold transition cursor-pointer"
                :class="bulletType === proj.id ? 'border-amber-500 bg-amber-300 text-slate-950 shadow' : 'border-teal-600/30 bg-white text-teal-800 hover:border-teal-700'"
                @click="emit('change-bullet', proj.id)"
              >
                {{ shotIdx + 1 }}. {{ proj.name.split(' ')[0] }}
              </button>
            </div>
            <span class="font-mono text-sm font-black text-orange-600">{{ (activeTank?.power ?? 65).toFixed(2) }}<span class="text-[10px]">%</span></span>
          </div>

          <div
            ref="powerBarRef"
            class="relative flex h-7 w-full cursor-pointer gap-[3px] rounded-xl border-[3px] border-white bg-teal-900/15 p-[3px] shadow-inner"
            title="點擊任意位置設定力道，或按住空白鍵 / FIRE 鈕蓄力，放開開火"
            @click="onClickPowerGauge"
          >
            <div
              v-for="n in POWER_SEGMENTS"
              :key="n"
              class="h-full flex-1 rounded-[3px]"
              :class="(activeTank?.power ?? 65) >= n * (100 / POWER_SEGMENTS) - 2 ? (n <= 8 ? 'bg-lime-400' : n <= 15 ? 'bg-amber-400' : 'bg-rose-500') : 'bg-white/70'"
            />
            <div
              v-if="lastFiredPower !== null"
              class="pointer-events-none absolute -bottom-1 -top-1 z-20 w-1 rounded bg-teal-900 shadow"
              :style="{ left: `calc(${lastFiredPower}% - 2px)` }"
              title="上一發射擊力道標記"
            />
          </div>
        </div>

        <!-- 4. FIRE -->
        <div class="col-span-12 flex items-center lg:col-span-2">
          <button
            type="button"
            :disabled="controlsDisabled"
            :class="[
              'w-full cursor-pointer touch-none select-none rounded-2xl border-[3px] border-white px-3 py-2.5 text-center font-black tracking-wider shadow-[0_6px_0_rgba(194,65,12,0.55),0_10px_20px_rgba(8,60,80,0.3)] transition active:translate-y-1 active:shadow-[0_2px_0_rgba(194,65,12,0.55)]',
              isCharging ? 'scale-95 animate-pulse bg-gradient-to-b from-rose-400 to-orange-600 text-white' : 'bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 text-slate-950 hover:brightness-110',
              controlsDisabled && 'cursor-not-allowed opacity-40',
            ]"
            @pointerdown="onPointerDownCharge"
          >
            <div class="text-base leading-tight">{{ isCharging ? `⚡ ${(activeTank?.power ?? 0).toFixed(2)}%` : '🔥 FIRE' }}</div>
            <div class="text-[10px] font-bold opacity-75">{{ isCharging ? '放開開火' : '按住蓄力 · Space' }}</div>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
