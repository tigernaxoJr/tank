<script setup lang="ts">
/**
 * BattleHud（戰鬥中疊加在全畫面 Phaser 畫布上的操作介面）— 2026-10 重寫，規格見 docs/07-ui-redesign-spec.md §二之 3。
 *
 * 設計規範：
 * - 手機橫放優先：戰場中央完全空出，UI 只占四個角落與上緣；尺寸由 `--u`（依視窗高度分三級）統一縮放。
 * - 素材來自 public/assets/ui2/（gauges / icons / ui_kit），外框用圖、填色與指針由程式畫（hud/*.vue）。
 * - 容器 pointer-events-none，只有按鈕可點；移動與仰角按住連續作用；發射環按住蓄力、放開發射。
 * - 左上：離開 / 音效 / 駕駛艙坦克小卡；上中：兩隊血條 + 計時環 + 誰的回合；右上：風向羅盤（雷達鈕在 BattleCanvas）。
 * - 左下：燃料 + 移動；右下：彈種 / 跳過、仰角盤與 ▲▼、發射環。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import type { BattleState } from '../domain/battleState'
import { PROJECTILE_REGISTRY } from '../domain/projectileRegistry'
import { visibleStatuses } from '../domain/statusEffects'
import { TANK_LIST, getTankSpec } from '../domain/tankRegistry'
import type { BulletType, PlayerId, TeamId } from '@/shared/kernel/types'
import { GameButton, IconGlyph, UiPanel, uiUrl } from '@/shared/ui'
import { useBattleInput } from './composables/useBattleInput'
import AngleDial from './hud/AngleDial.vue'
import FireRing from './hud/FireRing.vue'
import FuelGauge from './hud/FuelGauge.vue'
import HpBar from './hud/HpBar.vue'
import TimerRing from './hud/TimerRing.vue'
import WindCompass from './hud/WindCompass.vue'

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
const panelSpriteUrl = computed(() => panelTankSpec.value.getSprites(panelTeam.value).iconUrl)
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

// --- 回合倒數 ---
const showTimer = computed(() => props.turnSecondsLeft != null && isAiming.value)
const timerRatio = computed(() =>
  showTimer.value ? Math.min(1, (props.turnSecondsLeft ?? 0) / (props.turnTotalSeconds ?? 15)) : 1,
)

const statusText = computed(() => {
  const name = activeName.value
  if (props.state.phase === 'FIRING') return '砲彈飛行中'
  if (props.isBotTurn) return `${name} 瞄準中`
  return `${name} 的回合`
})

// --- 仰角盤：不同機種打不出去的角度（灰段），標準方向 右 0°、上 90°、左 180° ---
const dialBlocked = computed<readonly (readonly [number, number])[]>(() => {
  const spec = getTankSpec(panelTank.value?.tankId)
  const arcs: [number, number][] = [
    [180, 180 - spec.aimMinDeg],
    [spec.aimMinDeg, 0],
  ]
  if (spec.aimMaxDeg < 90) arcs.push([180 - spec.aimMaxDeg, spec.aimMaxDeg])
  return arcs
})

const {
  lastFiredPowerByPlayer,
  isCharging,
  facingLeft,
  worldElevation,
  holdMove,
  holdAngle,
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

// 儀表盤顯示「相對地面」的實際仰角（水平線 = 0°）：朝左時指針在左半邊
const dialAngle = computed(() => (facingLeft.value ? 180 - worldElevation.value : worldElevation.value))
const tankSlope = computed(() => panelTank.value?.slopeDeg ?? 0)

// 每位玩家各自的「上一發力道」游標（熱座輪流時互不干擾）
const lastFiredPower = computed(() => lastFiredPowerByPlayer[props.panelPlayerId] ?? null)

function shotSprite(key: string | undefined): string | null {
  return key ? `${import.meta.env.BASE_URL}assets/units/projectiles/${key}.png` : null
}
const hexColor = (n: number) => `#${n.toString(16).padStart(6, '0')}`

const bannerPlate = `url(${uiUrl('ui_kit', 'banner')})`
const slotImg = `url(${uiUrl('ui_kit', 'slot')})`
const slotImgOn = `url(${uiUrl('ui_kit', 'slot_selected')})`
const moveImg = `url(${uiUrl('gauges', 'move_btn')})`

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
  <div class="hud pointer-events-none absolute inset-0 select-none font-toon text-ink">
    <!-- 左上：離開 / 音效 + 駕駛艙坦克小卡 -->
    <div class="hud-tl absolute flex flex-col items-start gap-2">
      <div class="pointer-events-auto flex gap-2">
        <GameButton variant="coral" round class="hud-round" aria-label="退出戰鬥" title="退出戰鬥" @click="emit('leave-game')">
          <IconGlyph name="chevron_left" :size="22" />
        </GameButton>
        <GameButton variant="white" round class="hud-round" :aria-label="isMuted ? '開啟音效' : '關閉音效'" :title="isMuted ? '開啟音效' : '關閉音效'" @click="emit('toggle-mute')">
          <IconGlyph :name="isMuted ? 'sound_off' : 'sound_on'" :size="22" />
        </GameButton>
      </div>

      <div class="own-card pointer-events-auto">
        <div class="flex items-center gap-1.5">
          <span class="own-dot flex shrink-0 items-center justify-center" :style="{ background: TEAM_META[panelTeam].color }">
            <img :src="panelSpriteUrl" alt="" draggable="false" class="h-3/5 w-auto" :class="panelTeam === 'B' ? '-scale-x-100' : ''" />
          </span>
          <span class="min-w-0 flex-1 truncate text-sm leading-none">{{ panelName }}</span>
          <span v-if="panelTank?.isBot" class="chip">電腦</span>
          <button
            v-if="hasOwnTank"
            type="button"
            class="chip chip-btn"
            :title="shownMode === 'own' ? '改成跟著回合坦克' : '改成顯示我的坦克'"
            @click="emit('set-panel-mode', shownMode === 'own' ? 'active' : 'own')"
          >
            {{ shownMode === 'own' ? '我的' : '回合' }}
          </button>
        </div>
        <div class="mt-1 flex items-center gap-1.5">
          <HpBar :percent="hpPercent" color="var(--color-grass)" class="hp-own" />
          <b class="font-num text-sm leading-none">{{ panelTank?.hp }}</b>
        </div>
        <div v-if="panelStatuses.length > 0" class="mt-1 flex flex-wrap gap-1">
          <span
            v-for="st in panelStatuses"
            :key="st.spec.id"
            class="chip text-white"
            :style="{ background: st.spec.color }"
            :title="`${st.spec.name}：${st.spec.description}`"
          >{{ st.spec.icon }}<b class="font-num">{{ Math.max(1, st.turnsLeft) }}</b></span>
        </div>
        <div v-if="panelIsWaiting" class="mt-1 text-xs text-ink-soft">等待 {{ activeName }}</div>
      </div>
    </div>

    <!-- 上中：兩隊血條 + 計時環 + 誰的回合 -->
    <div class="hud-top absolute left-1/2 flex -translate-x-1/2 flex-col items-center">
      <div class="flex items-center">
        <template v-for="team in (['A', 'B'] as TeamId[])" :key="team">
          <div class="score flex flex-col" :class="team === 'B' ? 'order-3 items-end' : 'order-1 items-start'">
            <HpBar :percent="teams[team].hpPercent" :color="TEAM_META[team].color" :mirror="team === 'B'" class="hp-team" />
            <span class="score-tag flex items-center gap-1 text-xs leading-none" :class="team === 'B' ? 'flex-row-reverse' : ''">
              <i class="h-2 w-2 rounded-full" :style="{ background: TEAM_META[team].color }" />
              {{ TEAM_META[team].label }} <b class="font-num">{{ teams[team].alive }}/{{ teams[team].total }}</b>
            </span>
          </div>
        </template>
        <TimerRing class="timer-ring order-2" :seconds="showTimer ? (turnSecondsLeft ?? null) : null" :ratio="timerRatio" :turn="state.turnId" />
      </div>
      <span v-if="activeTank && state.phase !== 'GAME_OVER'" class="turn-pill mt-1 flex items-center gap-1.5 text-sm leading-none">
        <i class="h-2.5 w-2.5 rounded-full" :style="{ background: TEAM_META[activeTeam].color }" />
        {{ statusText }}
        <span v-if="state.phase === 'FIRING' || isBotTurn" class="dots" aria-hidden="true"><i /><i /><i /></span>
      </span>
    </div>

    <!-- 右上：風向羅盤（雷達鈕在最右，由 BattleCanvas 提供） -->
    <div class="hud-compass absolute"><WindCompass :wind="state.wind" /></div>

    <!-- 換人出擊橫幅 -->
    <Transition name="banner">
      <div v-if="banner && state.phase !== 'GAME_OVER'" :key="banner.key" class="absolute inset-x-0 top-[26%] flex justify-center">
        <span class="banner-plate flex items-center justify-center" :style="{ backgroundImage: bannerPlate }">
          <span class="banner-text" :style="{ color: '#fff', WebkitTextStrokeColor: 'var(--color-ink)' }">
            <i class="banner-dot" :style="{ background: TEAM_META[banner.team].color }" />{{ banner.text }}
          </span>
        </span>
      </div>
    </Transition>

    <!-- 勝負結算 -->
    <div v-if="state.phase === 'GAME_OVER'" class="pointer-events-auto absolute inset-0 flex items-center justify-center bg-ink/40">
      <UiPanel class="result-pop flex flex-col items-center px-4 py-2 text-center">
        <div
          class="result-title font-num text-4xl font-extrabold"
          :style="{ color: state.winner === 'A' || state.winner === 'B' ? TEAM_META[state.winner].color : 'var(--color-ink)' }"
        >
          {{ state.winner === 'A' || state.winner === 'B' ? `${TEAM_META[state.winner].label}獲勝！` : '平手！' }}
        </div>
        <p class="mt-2 text-base text-ink-soft">
          橘隊存活 <b class="font-num text-ink">{{ teams.A.alive }}</b> · 藍隊存活 <b class="font-num text-ink">{{ teams.B.alive }}</b>
        </p>
        <div class="mt-4 flex items-center gap-3">
          <GameButton variant="white" @click="emit('leave-game')">回大廳</GameButton>
          <GameButton variant="gold" @click="emit('reset-match')">再戰一局</GameButton>
        </div>
      </UiPanel>
    </div>

    <template v-if="state.phase !== 'GAME_OVER'">
      <!-- 左下：燃料 + 移動（按住連續） -->
      <div class="hud-bl absolute flex flex-col items-start gap-1">
        <FuelGauge :percent="fuelPercent" class="fuel" />
        <div class="pointer-events-auto flex gap-2">
          <button
            v-for="dir in ([-1, 1] as const)"
            :key="dir"
            type="button"
            class="pad-btn move-btn"
            :aria-label="dir < 0 ? '往左移動' : '往右移動'"
            :disabled="controlsDisabled"
            :style="{ backgroundImage: moveImg }"
            @pointerdown="holdMove($event, dir)"
            @contextmenu.prevent
          >
            <IconGlyph name="arrow_left" :size="30" :class="dir > 0 ? '-scale-x-100' : ''" />
          </button>
        </div>
      </div>

      <!-- 右下：彈種 / 跳過、仰角盤、發射環 -->
      <div class="hud-br absolute flex flex-col items-end gap-2">
        <div class="pointer-events-auto flex items-center gap-2">
          <span v-if="!activeShots" class="chip" title="對手的彈藥在開火前不會揭露">彈藥未揭露</span>
          <button
            v-for="proj in activeShots ?? []"
            :key="proj.id"
            type="button"
            class="pad-btn slot"
            :disabled="controlsDisabled"
            :aria-pressed="bulletType === proj.id"
            :aria-label="proj.name"
            :title="`${proj.name}：${proj.description}`"
            :style="{ backgroundImage: bulletType === proj.id ? slotImgOn : slotImg }"
            @click="emit('change-bullet', proj.id)"
          >
            <span class="slot-dot" :style="{ background: hexColor(proj.visual.glowColor) }">
              <img v-if="shotSprite(proj.visual.sprite?.key)" :src="shotSprite(proj.visual.sprite?.key)!" alt="" draggable="false" class="h-full w-full object-contain" />
            </span>
          </button>
          <GameButton variant="white" round class="hud-round" :disabled="controlsDisabled" aria-label="跳過本回合" title="跳過本回合（P）" @click="emit('pass')">
            <IconGlyph name="skip" :size="22" />
          </GameButton>
        </div>

        <div class="flex items-end gap-2">
          <div class="pointer-events-auto flex items-end gap-1">
            <AngleDial
              class="dial"
              :needle-deg="dialAngle"
              :label="worldElevation"
              :facing-left="facingLeft"
              :blocked="dialBlocked"
              :slope-deg="tankSlope"
            />
            <div class="flex flex-col gap-1">
              <GameButton
                v-for="d in ([1, -1] as const)"
                :key="d"
                variant="sky"
                round
                class="hud-round touch-none"
                :aria-label="d > 0 ? '抬高砲管' : '壓低砲管'"
                :disabled="controlsDisabled"
                @pointerdown="holdAngle($event, d)"
              >
                <IconGlyph name="arrow_up" :size="22" :class="d < 0 ? 'rotate-180' : ''" />
              </GameButton>
            </div>
          </div>
          <FireRing
            class="pointer-events-auto fire-ring"
            :power="power"
            :charging="isCharging"
            :disabled="controlsDisabled"
            :last-fired="lastFiredPower"
            @pointerdown="onPointerDownCharge"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 尺寸單位：依視窗高度分三級（手機橫放 ≈ 390px 最小） */
.hud {
  --u: 1;
  --edge: 12px;
  --gb-size: calc(44px * var(--u));
}
@media (min-height: 541px) { .hud { --u: 1.2; } }
@media (min-height: 761px) { .hud { --u: 1.45; } }

.hud-tl { left: max(var(--edge), env(safe-area-inset-left)); top: max(var(--edge), env(safe-area-inset-top)); }
.hud-top { top: max(6px, env(safe-area-inset-top)); }
.hud-bl {
  left: max(var(--edge), env(safe-area-inset-left));
  bottom: max(var(--edge), env(safe-area-inset-bottom));
}
.hud-br {
  right: max(var(--edge), env(safe-area-inset-right));
  bottom: max(var(--edge), env(safe-area-inset-bottom));
}
.hud-compass {
  width: calc(54px * var(--u));
  top: max(var(--edge), env(safe-area-inset-top));
  right: calc(max(var(--edge), env(safe-area-inset-right)) + 56px * var(--u) + 6px);
  filter: drop-shadow(0 3px 0 rgb(29 35 64 / 0.4));
}

.hp-team { width: calc(150px * var(--u)); }
.timer-ring { width: calc(58px * var(--u)); margin: 0 calc(-4px * var(--u)); z-index: 1; }
.hp-own { width: calc(110px * var(--u)); }
.score { filter: drop-shadow(0 3px 0 rgb(29 35 64 / 0.35)); }
.score-tag {
  padding: 1px 8px;
  margin-top: -2px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.85);
  box-shadow: inset 0 0 0 2px var(--color-ink);
}
.turn-pill {
  padding: 3px 12px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.9);
  box-shadow: 0 3px 0 rgb(29 35 64 / 0.4), inset 0 0 0 2px var(--color-ink);
  white-space: nowrap;
}

.own-card {
  min-width: calc(150px * var(--u));
  max-width: calc(210px * var(--u));
  padding: 5px 8px 6px;
  border-radius: 14px;
  background: rgb(255 255 255 / 0.88);
  box-shadow: 0 3px 0 rgb(29 35 64 / 0.4), inset 0 0 0 2px var(--color-ink);
}
.own-dot {
  width: calc(22px * var(--u));
  height: calc(22px * var(--u));
  border-radius: 999px;
  box-shadow: inset 0 0 0 2px var(--color-ink);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.9);
  box-shadow: inset 0 0 0 2px var(--color-ink);
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
}
.chip-btn { cursor: pointer; pointer-events: auto; }

.fuel { width: calc(54px * var(--u)); filter: drop-shadow(0 3px 0 rgb(29 35 64 / 0.4)); }
.pad-btn, .hud :deep(.hud-round) { touch-action: none; -webkit-touch-callout: none; user-select: none; }
.move-btn {
  width: calc(60px * var(--u));
  aspect-ratio: 1;
  background-size: 100% 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 3px 0 rgb(29 35 64 / 0.5));
  -webkit-tap-highlight-color: transparent;
}
.move-btn:active:not(:disabled) { transform: translateY(3px); filter: none; }
.move-btn:disabled { filter: grayscale(0.9) opacity(0.7); }
.move-btn img { filter: drop-shadow(0 2px 0 rgb(29 35 64 / 0.45)); }

.slot {
  width: calc(46px * var(--u));
  aspect-ratio: 1;
  background-size: 100% 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 3px 0 rgb(29 35 64 / 0.4));
}
.slot:disabled:not([aria-pressed='true']) { opacity: 0.6; }
.slot-dot {
  width: 56%;
  aspect-ratio: 1;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  box-shadow: inset 0 0 0 2px var(--color-ink);
}

.dial { width: calc(150px * var(--u)); filter: drop-shadow(0 3px 0 rgb(29 35 64 / 0.4)); }
.fire-ring { width: calc(96px * var(--u)); font-size: calc(17px * var(--u)); }

.banner-plate {
  width: min(80vw, calc(250px * var(--u)));
  aspect-ratio: 290 / 90;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  filter: drop-shadow(0 4px 0 rgb(29 35 64 / 0.45));
}
.banner-text {
  display: inline-flex;
  align-items: center;
  gap: 0.4em;
  font-family: var(--font-num);
  font-size: calc(22px * var(--u));
  font-weight: 800;
  -webkit-text-stroke: 5px var(--color-ink);
  paint-order: stroke fill;
}
.banner-dot { width: 0.5em; height: 0.5em; border-radius: 999px; box-shadow: 0 0 0 3px var(--color-ink); }

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
.result-title { -webkit-text-stroke: 4px var(--color-ink); paint-order: stroke fill; }
@media (prefers-reduced-motion: reduce) {
  .banner-enter-active, .result-pop { animation: none; }
}
</style>
