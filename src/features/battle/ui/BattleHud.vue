<script setup lang="ts">
/**
 * BattleHud（戰鬥中疊加在全畫面 Phaser 畫布上的操作介面）
 *
 * 設計規範：
 * - 與大廳同一套「卡通粗描邊」系統（src/style.css 的 token 與 .toon-* 類別），不用 emoji 當圖示。
 * - 嚴禁傳統 HTML 表單滑桿 (<input type="range">) 與網頁捲軸；容器 pointer-events-none，只有面板可點，
 *   中間戰場保留給滑鼠拖曳鏡頭。
 * - 頂部中央：兩隊血量記分板 + 回合倒數圓章，下掛「誰的回合」與風向牌。
 * - 底部中央：精簡駕駛艙（戰車、移動、仰角、彈種、發射 / 跳過，第二列為整排力道條）；移動與仰角按住可連續作用，力道條可拖曳。
 * - 駕駛艙可切換顯示「我的坦克」（預設）或「回合坦克」。
 * - 手機 / 觸控（pointer: coarse）或寬度 < 768px：底部改成手把式版面——左手方向鍵（左右移動、上下仰角），
 *   右手彈種與大顆發射鈕，中間是戰車狀態與力道條；直立時狀態列獨佔一列。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import type { BattleState } from '../domain/battleState'
import { PROJECTILE_REGISTRY } from '../domain/projectileRegistry'
import { visibleStatuses } from '../domain/statusEffects'
import { TANK_LIST, getTankSpec } from '../domain/tankRegistry'
import type { BulletType, PlayerId, TeamId } from '@/shared/kernel/types'
import { useBattleInput } from './composables/useBattleInput'

interface Props {
  state: BattleState
  /** 駕駛艙顯示的坦克（該回合出手者，或切到「自己」時的本機坦克） */
  panelPlayerId: PlayerId
  panelMode: 'active' | 'own'
  /** 是否有「自己」的坦克可切換（全電腦觀戰時沒有） */
  hasOwnTank: boolean
  /** 駕駛艙坦克選用的彈種 */
  bulletType: BulletType
  /** 駕駛艙坦克的主彈、副彈；連線對戰中對手尚未揭露時為 null（顯示「？」） */
  shots: readonly BulletType[] | null
  canControl: boolean
  isBotTurn?: boolean
  isMuted: boolean
  syncStatus?: 'ok' | 'mismatch' | null
  roomLabel?: string
  /** 回合剩餘秒數；電腦回合為 null（不顯示） */
  turnSecondsLeft?: number | null
  /** 每回合總秒數（倒數條比例用） */
  turnTotalSeconds?: number
}

const props = defineProps<Props>()

// 具名 tuple 寫法：呼叫簽章寫法超過 8 個 overload 時 vue-tsc 會把事件型別推成 any
const emit = defineEmits<{
  move: [deltaX: number]
  'update-aim': [angle: number, power: number]
  'change-bullet': [bullet: BulletType]
  fire: []
  pass: []
  'reset-match': []
  'toggle-mute': []
  'leave-game': []
  'set-panel-mode': [mode: 'active' | 'own']
}>()

const TEAM_META: Record<TeamId, { label: string; color: string }> = {
  A: { label: '橘隊', color: 'var(--color-team-a)' },
  B: { label: '藍隊', color: 'var(--color-team-b)' },
}

/** 名稱裡的電腦標記（🤖）改以「電腦」標籤呈現，HUD 不顯示 emoji */
const stripBotMark = (name: string | undefined) => (name ?? '').replace(/^🤖\s*/u, '')

// 該回合出手的坦克：記分板狀態、出擊橫幅用
const activeTank = computed(() => props.state.tanks[props.state.activePlayer])
const activeTeam = computed<TeamId>(() => activeTank.value?.team ?? 'A')
const activeName = computed(() => stripBotMark(activeTank.value?.name))

// 駕駛艙顯示的坦克：可能是出手者，也可能是切到「自己」時的本機坦克
const panelTank = computed(() => props.state.tanks[props.panelPlayerId])
const panelTeam = computed<TeamId>(() => panelTank.value?.team ?? 'A')
const panelTankSpec = computed(() => (panelTank.value ? getTankSpec(panelTank.value.tankId) : TANK_LIST[0]))
const panelSpriteUrl = computed(() => panelTankSpec.value.getSprites(panelTeam.value).hullUrl)
const panelTankType = computed(() => panelTankSpec.value.name.split(' ')[0])
const panelName = computed(() => stripBotMark(panelTank.value?.name))
/** 駕駛艙坦克身上的狀態（中毒、冰凍、破甲、紮根、偵察）與剩餘回合 */
const panelStatuses = computed(() => (panelTank.value ? visibleStatuses(panelTank.value) : []))
/** 沒有自己的坦克（全電腦觀戰）時只能跟著回合坦克 */
const shownMode = computed(() => (props.hasOwnTank ? props.panelMode : 'active'))
/** 駕駛艙顯示的不是出手者（切到「自己」、但現在輪到別人） */
const panelIsWaiting = computed(() => props.panelPlayerId !== props.state.activePlayer)

/** 駕駛艙坦克可用的砲彈（主彈、副彈）；未揭露時為 null */
const activeShots = computed(() => props.shots?.map((id) => PROJECTILE_REGISTRY[id]) ?? null)

const isAiming = computed(() => props.state.phase === 'AIMING')
const controlsDisabled = computed(
  () => !props.canControl || !isAiming.value || !panelTank.value || panelIsWaiting.value,
)

function teamSummary(team: TeamId) {
  const list = Object.values(props.state.tanks).filter((t) => t.team === team)
  const hp = list.length === 0 ? 0 : list.reduce((acc, t) => acc + t.hp / t.maxHp, 0) / list.length
  return { alive: list.filter((t) => t.hp > 0).length, total: list.length, hpPercent: Math.round(hp * 100) }
}
const teams = computed(() => ({ A: teamSummary('A'), B: teamSummary('B') }))

const clampPercent = (v: number) => Math.max(0, Math.min(100, v))
const hpPercent = computed(() =>
  panelTank.value ? clampPercent((panelTank.value.hp / panelTank.value.maxHp) * 100) : 0,
)
const fuelPercent = computed(() =>
  panelTank.value ? clampPercent((panelTank.value.moveFuel / panelTank.value.maxMoveFuel) * 100) : 0,
)
const power = computed(() => panelTank.value?.power ?? 65)

// --- 回合倒數圓章 ---
const RING_R = 25
const RING_C = 2 * Math.PI * RING_R
const showTimer = computed(() => props.turnSecondsLeft != null && isAiming.value)
const timerRatio = computed(() =>
  showTimer.value ? Math.min(1, (props.turnSecondsLeft ?? 0) / (props.turnTotalSeconds ?? 15)) : 1,
)
const timerColor = computed(() => {
  const s = props.turnSecondsLeft ?? 99
  return s <= 3 ? 'var(--color-coral)' : s <= 7 ? 'var(--color-sun)' : 'var(--color-grass)'
})

const statusText = computed(() => {
  const name = activeName.value
  if (props.state.phase === 'FIRING') return '砲彈飛行中'
  if (props.isBotTurn) return `${name} 瞄準中`
  return `${name} 的回合`
})

// --- 風向牌：箭頭數代表風力等級 ---
const windArrows = computed(() => Math.min(3, Math.ceil(Math.abs(props.state.wind) / 4)))

// --- 仰角儀表（半圓：右側 0°、上方 90°） ---
const DIAL_CX = 50
const DIAL_CY = 50
const DIAL_R = 38
function dialPoint(deg: number, r: number) {
  const rad = (deg * Math.PI) / 180
  return { x: DIAL_CX + Math.cos(rad) * r, y: DIAL_CY - Math.sin(rad) * r }
}
const dialTrack = `M ${DIAL_CX - DIAL_R} ${DIAL_CY} A ${DIAL_R} ${DIAL_R} 0 0 1 ${DIAL_CX + DIAL_R} ${DIAL_CY}`
const dialTicks = [0, 30, 60, 90, 120, 150, 180].map((deg) => ({ deg, a: dialPoint(deg, DIAL_R - 6), b: dialPoint(deg, DIAL_R - 1) }))

const {
  powerBarRef,
  lastFiredPowerByPlayer,
  isCharging,
  facingLeft,
  elevation,
  holdMove,
  holdAngle,
  onPointerDownPowerGauge,
  onPointerDownCharge,
} = useBattleInput({
  activeTank: panelTank,
  controlsDisabled,
  activeShots,
  onMove: (deltaX) => emit('move', deltaX),
  onUpdateAim: (angle, power) => emit('update-aim', angle, power),
  onChangeBullet: (bullet) => emit('change-bullet', bullet),
  onFire: () => emit('fire'),
  onPass: () => emit('pass'),
})

// 儀表盤依砲口實際朝向畫：朝左時指針在左半邊
const dialAngle = computed(() => (facingLeft.value ? 180 - elevation.value : elevation.value))
const dialNeedle = computed(() => dialPoint(dialAngle.value, DIAL_R - 10))
const dialSweep = computed(() => {
  const end = dialPoint(dialAngle.value, DIAL_R)
  const startX = facingLeft.value ? DIAL_CX - DIAL_R : DIAL_CX + DIAL_R
  const sweepFlag = facingLeft.value ? 1 : 0
  return `M ${startX} ${DIAL_CY} A ${DIAL_R} ${DIAL_R} 0 0 ${sweepFlag} ${end.x} ${end.y}`
})

// 每位玩家各自的「上一發力道」游標（熱座輪流時互不干擾）
const lastFiredPower = computed(() => lastFiredPowerByPlayer[props.panelPlayerId] ?? null)

function shotSprite(key: string | undefined): string | null {
  return key ? `/assets/units/projectiles/${key}.png` : null
}
const hexColor = (n: number) => `#${n.toString(16).padStart(6, '0')}`

// --- 觸控 / 窄螢幕改用手把式版面 ---
const touchQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(pointer: coarse), (max-width: 767px)') : null
const touchLayout = ref(touchQuery?.matches ?? false)
const onTouchQuery = (e: MediaQueryListEvent) => (touchLayout.value = e.matches)
touchQuery?.addEventListener('change', onTouchQuery)
onUnmounted(() => touchQuery?.removeEventListener('change', onTouchQuery))

// --- 換人時的出擊橫幅 ---
const banner = ref<{ key: number; text: string; team: TeamId } | null>(null)
let bannerTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => [props.state.turnId, props.state.phase] as const,
  ([turnId, phase], prev) => {
    if (phase !== 'AIMING' || !activeTank.value || prev?.[0] === turnId) return
    banner.value = { key: turnId, text: `${activeName.value} 出擊！`, team: activeTank.value.team }
    if (bannerTimer) clearTimeout(bannerTimer)
    bannerTimer = setTimeout(() => (banner.value = null), 1400)
  },
  { immediate: true },
)
onUnmounted(() => {
  if (bannerTimer) clearTimeout(bannerTimer)
})
</script>

<template>
  <div class="pointer-events-none absolute inset-0 select-none font-toon text-ink">
    <!-- 左上：離開 / 音效 -->
    <div class="pointer-events-auto absolute left-3 top-3 flex items-center gap-2">
      <button
        type="button"
        aria-label="退出戰鬥"
        title="退出戰鬥"
        class="toon-btn toon-btn--coral h-11 w-11 rounded-full p-0"
        @click="emit('leave-game')"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M15 5 8 12l7 7" />
        </svg>
      </button>
      <button
        type="button"
        :aria-label="isMuted ? '開啟音效' : '關閉音效'"
        :title="isMuted ? '開啟音效' : '關閉音效'"
        class="toon-btn h-11 w-11 rounded-full p-0"
        @click="emit('toggle-mute')"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
          <template v-if="isMuted"><path d="m17 9 5 6M22 9l-5 6" /></template>
          <template v-else><path d="M17 8.5a5 5 0 0 1 0 7M19.5 6a8.5 8.5 0 0 1 0 12" /></template>
        </svg>
      </button>
    </div>

    <!-- 頂部中央：記分板 + 回合圓章 -->
    <div class="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center max-sm:top-16">
      <div class="toon-panel flex items-center gap-2 rounded-full py-1.5 pl-2 pr-2 sm:gap-3">
        <template v-for="team in (['A', 'B'] as TeamId[])" :key="team">
          <div class="flex items-center gap-2" :class="team === 'B' ? 'order-3 flex-row-reverse' : 'order-1'">
            <span
              class="toon-pill px-2.5 text-sm text-white"
              :style="{ background: TEAM_META[team].color, textShadow: '0 2px 0 rgb(29 35 64 / .35)' }"
            >
              {{ TEAM_META[team].label }}
              <b class="font-num">{{ teams[team].alive }}/{{ teams[team].total }}</b>
            </span>
            <div class="hp-track h-4 w-14 md:w-20 lg:w-24 xl:w-40" :class="team === 'B' ? 'scale-x-[-1]' : ''">
              <div class="h-full rounded-full transition-all duration-500" :style="{ width: `${teams[team].hpPercent}%`, background: TEAM_META[team].color }" />
            </div>
          </div>
        </template>

        <div class="relative order-2 -my-4 h-16 w-16 shrink-0" :class="showTimer && (turnSecondsLeft ?? 99) <= 3 ? 'timer-hurry' : ''">
          <svg viewBox="0 0 64 64" class="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="32" cy="32" r="29.5" fill="var(--color-paper)" stroke="var(--color-ink)" stroke-width="3" />
            <circle cx="32" cy="32" :r="RING_R" fill="none" stroke="var(--color-mist)" stroke-width="6" />
            <circle
              cx="32"
              cy="32"
              :r="RING_R"
              fill="none"
              :stroke="timerColor"
              stroke-width="6"
              stroke-linecap="round"
              :stroke-dasharray="RING_C"
              :stroke-dashoffset="RING_C * (1 - timerRatio)"
              class="transition-[stroke-dashoffset] duration-300"
            />
          </svg>
          <div class="relative flex h-full flex-col items-center justify-center leading-none">
            <template v-if="showTimer">
              <span class="font-num text-2xl font-extrabold">{{ turnSecondsLeft }}</span>
              <span class="text-[11px] text-ink-soft">秒</span>
            </template>
            <template v-else>
              <span class="text-[11px] text-ink-soft">回合</span>
              <span class="font-num text-xl font-extrabold">{{ state.turnId }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- 下掛：誰的回合 + 風向 -->
      <div class="mt-2 flex items-center gap-2">
        <span
          v-if="activeTank && state.phase !== 'GAME_OVER'"
          class="toon-pill bg-paper px-3 text-sm shadow-[0_3px_0_var(--color-ink)]"
        >
          <span class="h-2.5 w-2.5 rounded-full border-2 border-ink" :style="{ background: TEAM_META[activeTeam].color }" />
          {{ statusText }}
          <span v-if="state.phase === 'FIRING' || isBotTurn" class="dots" aria-hidden="true"><i /><i /><i /></span>
        </span>
        <span class="toon-pill bg-mist px-3 text-sm shadow-[0_3px_0_var(--color-ink)]" title="風向與風力">
          <template v-if="state.wind === 0">無風</template>
          <template v-else>
            風
            <span class="flex items-center" :class="state.wind < 0 ? 'scale-x-[-1]' : ''">
              <svg v-for="n in windArrows" :key="n" viewBox="0 0 12 12" class="-mx-0.5 h-3.5 w-3.5 text-sky-deep">
                <path d="M2 2l6 4-6 4z" fill="currentColor" stroke="var(--color-ink)" stroke-width="1.5" stroke-linejoin="round" />
              </svg>
            </span>
            <b class="font-num">{{ Math.abs(state.wind) }}</b>
          </template>
        </span>
      </div>
    </div>

    <!-- 換人出擊橫幅 -->
    <Transition name="banner">
      <div v-if="banner && state.phase !== 'GAME_OVER'" :key="banner.key" class="absolute inset-x-0 top-[28%] flex justify-center">
        <span
          class="toon-title rounded-full border-4 border-ink px-8 pb-2 pt-1 text-4xl shadow-[0_6px_0_var(--color-ink)] sm:text-5xl"
          :style="{ background: TEAM_META[banner.team].color }"
        >
          {{ banner.text }}
        </span>
      </div>
    </Transition>

    <!-- 勝負結算 -->
    <div v-if="state.phase === 'GAME_OVER'" class="pointer-events-auto absolute inset-0 flex items-center justify-center bg-ink/35">
      <div class="result-pop toon-panel relative flex flex-col items-center px-10 pb-7 pt-9 text-center">
        <span class="toon-ribbon absolute -top-4 left-1/2 -translate-x-1/2">戰鬥結束</span>
        <div
          class="toon-title text-5xl"
          :style="{ color: state.winner === 'A' || state.winner === 'B' ? TEAM_META[state.winner].color : '#fff' }"
        >
          {{ state.winner === 'A' || state.winner === 'B' ? `${TEAM_META[state.winner].label}獲勝！` : '平手！' }}
        </div>
        <p class="mt-3 text-base text-ink-soft">
          橘隊存活 <b class="font-num text-ink">{{ teams.A.alive }}</b> · 藍隊存活 <b class="font-num text-ink">{{ teams.B.alive }}</b>
        </p>
        <div class="mt-6 flex items-center gap-3">
          <button type="button" class="toon-btn px-6 py-2.5 text-lg" @click="emit('leave-game')">回大廳</button>
          <button type="button" class="toon-btn toon-btn--sun px-7 py-2.5 text-lg" @click="emit('reset-match')">再戰一局</button>
        </div>
      </div>
    </div>

    <!-- 手機 / 觸控：手把式版面 -->
    <div
      v-if="state.phase !== 'GAME_OVER' && touchLayout"
      class="pad-root absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 px-3"
    >
      <!-- 左手：方向鍵（左右移動、上下仰角），中央顯示仰角 -->
      <div class="dpad pointer-events-auto order-1 grid shrink-0 grid-cols-3 grid-rows-3 gap-0.5">
        <button
          type="button"
          aria-label="抬高砲管"
          :disabled="controlsDisabled"
          class="toon-btn pad-key col-start-2 row-start-1 p-0"
          @pointerdown="holdAngle($event, 1)"
          @contextmenu.prevent
        >
          <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 15 7-7 7 7" /></svg>
        </button>
        <button
          v-for="dir in ([-1, 1] as const)"
          :key="dir"
          type="button"
          :aria-label="dir < 0 ? '往左移動' : '往右移動'"
          :disabled="controlsDisabled"
          class="toon-btn toon-btn--sky pad-key row-start-2 p-0"
          :class="dir < 0 ? 'col-start-1' : 'col-start-3'"
          @pointerdown="holdMove($event, dir)"
          @contextmenu.prevent
        >
          <svg viewBox="0 0 24 24" class="h-6 w-6" :class="dir > 0 ? 'scale-x-[-1]' : ''" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5 8 12l7 7" /></svg>
        </button>
        <div class="col-start-2 row-start-2 flex flex-col items-center justify-center rounded-full border-[3px] border-ink bg-paper leading-none">
          <b class="font-num text-base">{{ elevation }}°</b>
          <svg viewBox="0 0 12 12" class="h-3 w-3" :class="facingLeft ? 'scale-x-[-1]' : ''"><path d="M2 2l6 4-6 4z" fill="var(--color-ink)" /></svg>
        </div>
        <button
          type="button"
          aria-label="壓低砲管"
          :disabled="controlsDisabled"
          class="toon-btn pad-key col-start-2 row-start-3 p-0"
          @pointerdown="holdAngle($event, -1)"
          @contextmenu.prevent
        >
          <svg viewBox="0 0 24 24" class="h-6 w-6 rotate-180" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 15 7-7 7 7" /></svg>
        </button>
      </div>

      <!-- 中間：戰車狀態 + 力道條（直立時獨佔最上面一列） -->
      <div class="toon-panel pointer-events-auto order-2 mb-1 min-w-0 flex-1 rounded-2xl px-2.5 py-1.5 portrait:order-first portrait:basis-full">
        <div class="flex items-center gap-2 text-sm leading-tight">
          <span class="flex h-7 w-8 shrink-0 items-center justify-center rounded-lg border-[2.5px] border-ink" :style="{ background: TEAM_META[panelTeam].color }">
            <img :src="panelSpriteUrl" alt="" class="h-4 w-auto" :class="panelTeam === 'B' ? '-scale-x-100' : ''" />
          </span>
          <span class="min-w-0 truncate">{{ panelName }}</span>
          <span
            v-for="st in panelStatuses"
            :key="st.spec.id"
            class="toon-pill shrink-0 px-1 text-[11px] leading-tight text-white"
            :style="{ background: st.spec.color }"
            :title="st.spec.description"
          >{{ st.spec.icon }}<b class="font-num">{{ Math.max(1, st.turnsLeft) }}</b></span>
          <div class="hp-track ml-auto h-3 w-14 shrink-0" title="血量">
            <div class="h-full rounded-full bg-grass" :style="{ width: `${hpPercent}%` }" />
          </div>
          <div class="hp-track h-3 w-10 shrink-0" title="燃料">
            <div class="h-full rounded-full bg-sun" :style="{ width: `${fuelPercent}%` }" />
          </div>
          <button
            v-if="hasOwnTank"
            type="button"
            class="toon-pill shrink-0 bg-paper px-1.5 text-[11px]"
            :title="shownMode === 'own' ? '改成跟著回合坦克' : '改成顯示我的坦克'"
            @click="emit('set-panel-mode', shownMode === 'own' ? 'active' : 'own')"
          >
            {{ shownMode === 'own' ? '我的' : '回合' }}
          </button>
        </div>
        <div class="mt-1.5 flex items-center gap-2">
          <div
            ref="powerBarRef"
            class="power-track relative h-7 flex-1 touch-none"
            @pointerdown="onPointerDownPowerGauge"
          >
            <div class="power-fill absolute inset-y-0 left-0" :class="isCharging ? 'is-charging' : ''" :style="{ width: `${power}%`, backgroundSize: `${10000 / Math.max(1, power)}% 100%` }" />
            <div
              v-if="lastFiredPower !== null"
              class="pointer-events-none absolute -inset-y-1.5 z-10 w-[3px] -translate-x-1/2 rounded bg-ink"
              :style="{ left: `${lastFiredPower}%` }"
            />
          </div>
          <b class="font-num w-14 shrink-0 text-right text-lg leading-none" :class="isCharging ? 'text-coral' : ''">{{ power.toFixed(1) }}</b>
        </div>
        <div v-if="panelIsWaiting" class="mt-1 text-center text-xs text-ink-soft">等待 {{ activeName }}</div>
      </div>

      <!-- 右手：彈種、跳過與發射鈕 -->
      <div class="pointer-events-auto order-3 flex shrink-0 items-end gap-2">
        <div class="flex flex-col items-center gap-1.5">
          <button
            v-for="proj in activeShots ?? []"
            :key="proj.id"
            type="button"
            :disabled="controlsDisabled"
            :aria-pressed="bulletType === proj.id"
            :aria-label="proj.name"
            class="pad-shot"
            @click="emit('change-bullet', proj.id)"
          >
            <span class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink" :style="{ background: hexColor(proj.visual.glowColor) }">
              <img v-if="shotSprite(proj.visual.sprite?.key)" :src="shotSprite(proj.visual.sprite?.key)!" alt="" class="h-5 w-5 object-contain" />
            </span>
          </button>
          <button
            type="button"
            :disabled="controlsDisabled"
            class="toon-btn h-8 rounded-full px-2.5 text-xs"
            @click="emit('pass')"
          >
            跳過
          </button>
        </div>
        <button
          type="button"
          :disabled="controlsDisabled"
          class="toon-btn fire-btn pad-fire touch-none flex-col gap-0 rounded-full p-0 leading-none"
          :class="isCharging ? 'toon-btn--coral is-charging' : 'toon-btn--sun'"
          @pointerdown="onPointerDownCharge"
          @contextmenu.prevent
        >
          <span class="text-xl">{{ isCharging ? '放開！' : '發射' }}</span>
          <span class="mt-1 text-[11px]">{{ controlsDisabled ? '等待中' : isCharging ? '' : '按住蓄力' }}</span>
        </button>
      </div>
    </div>

    <!-- 底部駕駛艙 -->
    <div
      v-if="state.phase !== 'GAME_OVER' && !touchLayout"
      class="pointer-events-auto absolute bottom-3 left-1/2 w-[min(1180px,calc(100%-24px))] -translate-x-1/2"
    >
      <div class="toon-panel toon-panel--plate relative px-3 pb-2.5 pt-5 md:px-4">
        <!-- 面板切換：一律顯示自己的坦克，或跟著該回合出手的坦克 -->
        <div class="absolute -top-4 left-4 flex items-center gap-2">
          <div class="toon-segment panel-switch text-sm shadow-[0_3px_0_var(--color-ink)]" role="group" aria-label="駕駛艙顯示">
            <button
              type="button"
              :aria-pressed="shownMode === 'own'"
              :disabled="!hasOwnTank"
              :title="hasOwnTank ? '一律顯示自己的坦克' : '沒有自己的坦克'"
              @click="emit('set-panel-mode', 'own')"
            >
              我的坦克
            </button>
            <button type="button" :aria-pressed="shownMode === 'active'" title="跟著該回合出手的坦克" @click="emit('set-panel-mode', 'active')">回合坦克</button>
          </div>
          <span v-if="panelIsWaiting" class="toon-pill bg-mist px-2.5 text-sm shadow-[0_3px_0_var(--color-ink)]">
            等待 {{ activeName }}
          </span>
        </div>
        <div class="flex flex-wrap items-stretch gap-x-3 gap-y-3 md:flex-nowrap lg:gap-x-4">
          <!-- 戰車：頭像 + 血量 + 燃料 -->
          <div class="flex min-w-0 items-center gap-3 md:w-44 md:shrink-0 lg:w-52 xl:w-60">
            <div
              class="relative flex h-14 w-16 shrink-0 items-center justify-center rounded-2xl border-[3px] border-ink"
              :style="{ background: TEAM_META[panelTeam].color }"
            >
              <img :src="panelSpriteUrl" alt="" class="h-9 w-auto drop-shadow-[0_2px_0_rgb(29_35_64/.35)]" :class="panelTeam === 'B' ? '-scale-x-100' : ''" />
              <span v-if="panelTank?.isBot" class="toon-pill absolute -bottom-2.5 left-1/2 -translate-x-1/2 bg-paper px-1.5 text-[12px] leading-tight">電腦</span>
            </div>
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex items-baseline gap-2 leading-tight">
                <span class="truncate text-base">{{ panelName }}</span>
                <span class="hidden shrink-0 text-sm text-ink-soft xl:inline">{{ panelTankType }}</span>
              </div>
              <div v-if="panelStatuses.length > 0" class="flex flex-wrap gap-1">
                <span
                  v-for="s in panelStatuses"
                  :key="s.spec.id"
                  class="toon-pill px-1.5 text-[12px] leading-tight text-white"
                  :style="{ background: s.spec.color }"
                  :title="s.spec.description"
                >
                  {{ s.spec.icon }} {{ s.spec.name }}<b class="font-num">{{ Math.max(1, s.turnsLeft) }}</b>
                </span>
              </div>
              <div class="flex items-center gap-1.5 text-sm">
                <span class="w-8 shrink-0">血量</span>
                <div class="hp-track h-3.5 flex-1">
                  <div class="h-full rounded-full bg-grass transition-all duration-300" :style="{ width: `${hpPercent}%` }" />
                </div>
                <b class="font-num w-8 text-right">{{ panelTank?.hp }}</b>
              </div>
              <div class="flex items-center gap-1.5 text-sm">
                <span class="w-8 shrink-0">燃料</span>
                <div class="hp-track h-3.5 flex-1">
                  <div class="h-full rounded-full bg-sun transition-all duration-150" :style="{ width: `${fuelPercent}%` }" />
                </div>
                <b class="font-num w-8 text-right">{{ Math.round(fuelPercent) }}</b>
              </div>
            </div>
          </div>

          <!-- 移動（按住連續） -->
          <div class="cockpit-cell flex flex-col items-center justify-center gap-1">
            <div class="flex gap-1.5">
              <button
                v-for="dir in ([-1, 1] as const)"
                :key="dir"
                type="button"
                :aria-label="dir < 0 ? '往左移動' : '往右移動'"
                :disabled="controlsDisabled"
                class="toon-btn toon-btn--sky h-10 w-11 touch-none p-0"
                @pointerdown="holdMove($event, dir)"
              >
                <svg viewBox="0 0 24 24" class="h-5 w-5" :class="dir > 0 ? 'scale-x-[-1]' : ''" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M15 5 8 12l7 7" />
                </svg>
              </button>
            </div>
            <span class="text-sm text-ink-soft">移動 <kbd>←</kbd><kbd>→</kbd></span>
          </div>

          <!-- 仰角 -->
          <div class="cockpit-cell flex items-center gap-2">
            <div class="flex flex-col items-center">
              <svg viewBox="0 0 100 56" class="h-12 w-[5.5rem]">
                <path :d="dialTrack" fill="none" stroke="var(--color-ink)" stroke-width="13" stroke-linecap="round" />
                <path :d="dialTrack" fill="none" stroke="var(--color-paper)" stroke-width="8" stroke-linecap="round" />
                <path :d="dialSweep" fill="none" stroke="var(--color-sun)" stroke-width="8" stroke-linecap="round" />
                <line v-for="t in dialTicks" :key="t.deg" :x1="t.a.x" :y1="t.a.y" :x2="t.b.x" :y2="t.b.y" stroke="var(--color-ink)" stroke-width="2" stroke-linecap="round" opacity=".35" />
                <line :x1="DIAL_CX" :y1="DIAL_CY" :x2="dialNeedle.x" :y2="dialNeedle.y" stroke="var(--color-ink)" stroke-width="4.5" stroke-linecap="round" />
                <circle :cx="DIAL_CX" :cy="DIAL_CY" r="6" fill="var(--color-coral)" stroke="var(--color-ink)" stroke-width="3" />
              </svg>
              <span class="-mt-0.5 flex items-center gap-1 leading-none">
                <svg v-if="facingLeft" viewBox="0 0 12 12" class="h-3 w-3"><path d="M10 2 4 6l6 4z" fill="var(--color-ink)" /></svg>
                <b class="font-num text-xl">{{ elevation }}°</b>
                <svg v-if="!facingLeft" viewBox="0 0 12 12" class="h-3 w-3"><path d="M2 2l6 4-6 4z" fill="var(--color-ink)" /></svg>
              </span>
            </div>
            <div class="flex flex-col gap-1.5">
              <button
                v-for="d in ([1, -1] as const)"
                :key="d"
                type="button"
                :aria-label="d > 0 ? '抬高砲管' : '壓低砲管'"
                :disabled="controlsDisabled"
                class="toon-btn h-8 w-10 touch-none rounded-xl p-0"
                @pointerdown="holdAngle($event, d)"
              >
                <svg viewBox="0 0 24 24" class="h-4 w-4" :class="d < 0 ? 'rotate-180' : ''" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m5 15 7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>

          <!-- 彈種 -->
          <div class="cockpit-cell flex min-w-0 flex-1 flex-col justify-center">
            <div class="flex flex-wrap items-center gap-2">
              <span
                v-if="!activeShots"
                class="toon-pill border-dashed bg-paper px-3 py-1 text-sm text-ink-soft"
                title="對手的彈藥在開火前不會揭露"
              >
                彈藥未揭露
              </span>
              <button
                v-for="(proj, shotIdx) in activeShots ?? []"
                :key="proj.id"
                type="button"
                :disabled="controlsDisabled"
                :aria-pressed="bulletType === proj.id"
                :title="`${proj.name}：${proj.description}`"
                class="shot-chip"
                @click="emit('change-bullet', proj.id)"
              >
                <span class="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink" :style="{ background: hexColor(proj.visual.glowColor) }">
                  <img v-if="shotSprite(proj.visual.sprite?.key)" :src="shotSprite(proj.visual.sprite?.key)!" alt="" class="h-4 w-4 object-contain" />
                </span>
                <span class="hidden whitespace-nowrap lg:inline">{{ proj.name.split(' ')[0] }}</span>
                <kbd>{{ shotIdx + 1 }}</kbd>
              </button>
            </div>
          </div>

          <!-- 發射 / 跳過 -->
          <div class="cockpit-cell flex items-center gap-2">
            <button
              type="button"
              :disabled="controlsDisabled"
              class="toon-btn fire-btn h-16 w-[6.5rem] touch-none flex-col gap-0 rounded-[20px] leading-none"
              :class="isCharging ? 'toon-btn--coral is-charging' : 'toon-btn--sun'"
              title="按住蓄力，放開發射（或按住空白鍵）"
              @pointerdown="onPointerDownCharge"
            >
              <span class="text-2xl">{{ isCharging ? '放開！' : '發射' }}</span>
              <span v-if="controlsDisabled" class="mt-1 text-[13px]">等待中</span>
              <span v-else-if="!isCharging" class="mt-1 text-[13px]">按住 <kbd>Space</kbd></span>
              <span v-else class="mt-1 text-[13px]"><kbd>Esc</kbd> 取消</span>
            </button>
            <button
              type="button"
              :disabled="controlsDisabled"
              class="toon-btn h-16 w-14 flex-col gap-0.5 rounded-[20px] p-0 text-sm"
              title="跳過本回合（快捷鍵 P）"
              @click="emit('pass')"
            >
              <svg viewBox="0 0 24 24" class="h-5 w-5" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
                <path d="M4 5l8 7-8 7zM12 5l8 7-8 7z" />
              </svg>
              跳過
            </button>
          </div>
        </div>

        <!-- 力道：橫跨整個駕駛艙，長條才好點選與拖曳微調 -->
        <div class="power-row mt-2 flex items-center gap-3 pt-2">
          <span class="shrink-0 text-sm">力道</span>
          <div
            ref="powerBarRef"
            class="power-track relative h-9 flex-1 touch-none"
            :class="controlsDisabled ? 'cursor-default' : 'cursor-pointer'"
            title="點擊或拖曳設定力道；按住空白鍵 / 發射鈕蓄力，放開開火"
            @pointerdown="onPointerDownPowerGauge"
          >
            <div class="power-fill absolute inset-y-0 left-0" :class="isCharging ? 'is-charging' : ''" :style="{ width: `${power}%`, backgroundSize: `${10000 / Math.max(1, power)}% 100%` }" />
            <span
              v-for="n in 19"
              :key="n"
              class="absolute w-0.5 -translate-x-1/2 rounded"
              :class="n % 2 === 0 ? (n === 10 ? 'inset-y-1 bg-ink/40' : 'inset-y-1.5 bg-ink/25') : 'inset-y-2.5 bg-ink/15'"
              :style="{ left: `${n * 5}%` }"
            />
            <div
              v-if="lastFiredPower !== null"
              class="pointer-events-none absolute -inset-y-2 z-10 flex -translate-x-1/2 flex-col items-center"
              :style="{ left: `${lastFiredPower}%` }"
              title="上一發的力道"
            >
              <svg viewBox="0 0 12 8" class="h-2 w-3"><path d="M1 1h10L6 7z" fill="var(--color-coral)" stroke="var(--color-ink)" stroke-width="1.5" stroke-linejoin="round" /></svg>
              <span class="w-[3px] flex-1 rounded bg-ink" />
            </div>
          </div>
          <b class="font-num w-[4.5rem] shrink-0 text-right text-2xl leading-none" :class="isCharging ? 'text-coral' : ''">{{ power.toFixed(2) }}</b>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pad-root {
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  padding-left: max(0.75rem, env(safe-area-inset-left));
  padding-right: max(0.75rem, env(safe-area-inset-right));
}
.pad-root button {
  touch-action: none;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}
.dpad {
  width: 9rem;
  height: 9rem;
}
.pad-key {
  border-radius: 14px;
}
.pad-shot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  border: 3px solid var(--color-ink);
  border-radius: 999px;
  background: var(--color-paper);
  box-shadow: 0 3px 0 var(--color-ink);
}
.pad-shot[aria-pressed='true'] {
  background: var(--color-sun);
  box-shadow: 0 0 0 3px var(--color-paper), 0 3px 0 3px var(--color-ink);
}
.pad-shot:disabled:not([aria-pressed='true']) { opacity: 0.6; }
.pad-fire {
  width: 5.75rem;
  height: 5.75rem;
}
@media (max-height: 420px) {
  .dpad { width: 7.75rem; height: 7.75rem; }
  .pad-fire { width: 5rem; height: 5rem; }
  .pad-shot { width: 2.6rem; height: 2.6rem; }
}
.hp-track {
  border: 2.5px solid var(--color-ink);
  border-radius: 999px;
  background: var(--color-mist);
  overflow: hidden;
}
.power-row {
  border-top: 2.5px dashed rgb(29 35 64 / 0.18);
}
.panel-switch { background: var(--color-paper); }
.panel-switch > button { padding: 0.1rem 0.75rem; line-height: 1.35; }
.cockpit-cell {
  border-left: 2.5px dashed rgb(29 35 64 / 0.18);
  padding-left: 0.75rem;
}
@media (min-width: 1024px) {
  .cockpit-cell { padding-left: 1rem; }
}
@media (max-width: 767px) {
  .power-row {
  border-top: 2.5px dashed rgb(29 35 64 / 0.18);
}
.cockpit-cell { border-left: 0; padding-left: 0; }
}

kbd {
  display: inline-flex;
  min-width: 1.35rem;
  justify-content: center;
  margin: 0 0.1rem;
  padding: 0 0.3rem;
  border: 2px solid var(--color-ink);
  border-radius: 6px;
  background: var(--color-paper);
  color: var(--color-ink);
  box-shadow: 0 2px 0 var(--color-ink);
  font-family: var(--font-num);
  font-size: 12px;
  line-height: 1.25;
  text-shadow: none;
}

.shot-chip {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.4rem 0.2rem 0.25rem;
  border: 3px solid var(--color-ink);
  border-radius: 999px;
  background: var(--color-paper);
  font-size: 0.875rem;
  cursor: pointer;
  transition: transform 0.08s ease;
}
.shot-chip[aria-pressed='true'] {
  background: var(--color-sun);
  box-shadow: 0 3px 0 var(--color-ink);
  transform: translateY(-2px);
}
.shot-chip:disabled { cursor: default; }
.shot-chip:disabled:not([aria-pressed='true']) { color: var(--color-ink-soft); }

.power-track {
  border: 3px solid var(--color-ink);
  border-radius: 999px;
  background: var(--color-paper);
  box-shadow: inset 0 3px 0 rgb(29 35 64 / 0.1);
  overflow: visible;
}
.power-fill {
  border-radius: 999px;
  background: linear-gradient(90deg, var(--color-grass), var(--color-sun) 55%, var(--color-coral));
  box-shadow: inset 0 -4px 0 rgb(29 35 64 / 0.15), inset 0 3px 0 rgb(255 255 255 / 0.45);
  transition: width 0.12s ease-out;
}
.power-fill.is-charging { transition: none; }

.fire-btn.is-charging { animation: fire-throb 0.35s ease-in-out infinite alternate; }
@keyframes fire-throb {
  from { transform: translateY(2px) scale(0.97); }
  to { transform: translateY(2px) scale(1.02); }
}

.timer-hurry { animation: hurry 0.5s ease-in-out infinite alternate; }
@keyframes hurry {
  from { transform: scale(1); }
  to { transform: scale(1.1); }
}

.dots { display: inline-flex; gap: 2px; }
.dots i {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: var(--color-ink);
  animation: blink 1s infinite;
}
.dots i:nth-child(2) { animation-delay: 0.2s; }
.dots i:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink {
  0%, 100% { opacity: 0.2; }
  40% { opacity: 1; }
}

.banner-enter-active { animation: banner-in 0.45s cubic-bezier(0.2, 1.6, 0.4, 1); }
.banner-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.banner-leave-to { opacity: 0; transform: translateY(-12px); }
@keyframes banner-in {
  from { opacity: 0; transform: scale(0.6); }
  to { opacity: 1; transform: scale(1); }
}

.result-pop { animation: banner-in 0.45s cubic-bezier(0.2, 1.6, 0.4, 1); }
</style>
