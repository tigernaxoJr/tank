<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  buildTankCard,
  getTankSpec,
  PROJECTILE_REGISTRY,
  type TankBlueprint,
} from '@/features/battle'
import { soundController } from '@/features/audio'
import LoadoutPicker from './LoadoutPicker.vue'
import TankPickerModal from './TankPickerModal.vue'
import { RANDOM_TANK, type TankChoice } from './tankChoice'
import { splitDisplayName } from './displayNames'
import turfUrl from '@/assets/ui/stage_turf.svg'
import type { BulletType, TankArchetypeId, TeamId } from '@/shared/kernel/types'

const props = defineProps<{
  selectedTankId: TankArchetypeId
  loadoutPicks: readonly BulletType[]
  locked?: boolean
  /** 選了「隨機」：selectedTankId 是暫定的機種，展示台蓋成問號，開打時才揭曉 */
  random?: boolean
}>()

const emit = defineEmits<{
  (e: 'select-tank', choice: TankChoice): void
  (e: 'change-loadout', picks: BulletType[]): void
}>()

const paint = ref<TeamId>('A')
const showLoadoutModal = ref(false)
const showTankModal = ref(false)

const spec = computed<TankBlueprint>(() => getTankSpec(props.selectedTankId))
const card = computed(() => buildTankCard(props.selectedTankId))
const label = computed(() => (props.random ? { zh: '隨機戰車', en: 'RANDOM' } : splitDisplayName(spec.value.name)))
const sprites = computed(() => spec.value.getSprites(paint.value))

const shots = computed(() =>
  [0, 1].map((slot) => PROJECTILE_REGISTRY[props.loadoutPicks[slot] ?? spec.value.shots[slot]]),
)

const stats = computed(() => [
  { label: '耐久', ratio: card.value.hpRatio, value: `${card.value.maxHp}`, unit: 'HP', color: 'var(--color-grass)' },
  { label: '火力', ratio: card.value.firepowerRatio, value: `${card.value.firepower}`, unit: '傷害', color: 'var(--color-coral)' },
  { label: '機動', ratio: card.value.mobilityRatio, value: `${card.value.moveFuel}`, unit: '燃料', color: 'var(--color-sky)' },
])

/**
 * 展示台照遊戲內的 rig 組合車身與砲管：精靈圖以 2.5 倍繪製（PNG 原尺寸），錨點 × 2.5 就是原尺寸座標，
 * 整組再縮放顯示。砲管轉軸在圖寬 8%、垂直置中（同 BattleScene）。
 */
const ART_ZOOM = 2.5
const HULL_BASE_Y = 14
const RIG_SCALE = 0.6
const barrelStyle = computed(() => ({
  left: `${spec.value.sprite.pivotX * ART_ZOOM}px`,
  top: `${spec.value.sprite.pivotY * ART_ZOOM}px`,
}))
const hullStyle = computed(() => ({ top: `${HULL_BASE_Y * ART_ZOOM}px` }))

function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`
}

function shotSprite(key: string | undefined): string | null {
  return key ? `/assets/units/projectiles/${key}.png` : null
}

const currentChoice = computed<TankChoice>(() => (props.random ? RANDOM_TANK : props.selectedTankId))

function pickTank(choice: TankChoice): void {
  if (choice !== currentChoice.value) emit('select-tank', choice)
}

function openTankModal(): void {
  if (props.locked) return
  soundController.play('ui_click')
  showTankModal.value = true
}

function setPaint(team: TeamId): void {
  soundController.play('ui_click')
  paint.value = team
}
</script>

<template>
  <div class="toon-panel relative flex flex-col gap-3 p-3 pt-6">
    <span class="toon-ribbon absolute -top-4 left-4" style="background: var(--color-sun); color: var(--color-ink); text-shadow: none">我的戰車</span>

    <!-- 展示台 -->
    <div class="stage relative h-40 overflow-hidden rounded-2xl border-[3px] border-ink">
      <div class="absolute right-2 top-2 flex gap-1.5" title="塗裝預覽">
        <button
          v-for="t in (['A', 'B'] as const)"
          :key="t"
          type="button"
          class="h-6 w-6 rounded-full border-[3px] border-ink transition cursor-pointer"
          :class="paint === t ? 'scale-110 ring-2 ring-white' : 'opacity-70'"
          :style="{ background: t === 'A' ? 'var(--color-team-a)' : 'var(--color-team-b)' }"
          @click="setPaint(t)"
        />
      </div>
      <img :src="turfUrl" alt="" class="absolute bottom-2 left-1/2 h-10 w-52 max-w-none -translate-x-1/2" />
      <div v-if="!random" class="tank-bob absolute bottom-[38px] left-1/2 h-0 w-0">
        <!-- rig 原點：車身底線上方 HULL_BASE_Y；整組以 RIG_SCALE 縮放 -->
        <div class="absolute left-0 top-0 h-0 w-0" :style="{ transform: `scale(${RIG_SCALE})`, transformOrigin: '0 0', marginTop: `${-HULL_BASE_Y * ART_ZOOM * RIG_SCALE}px` }">
          <img :src="sprites.barrelUrl" alt="" class="rig-barrel absolute max-w-none" :style="barrelStyle" />
          <img :src="sprites.hullUrl" :alt="spec.name" class="rig-hull absolute max-w-none" :style="hullStyle" />
        </div>
      </div>
      <span v-else class="toon-mystery tank-bob absolute bottom-[30px] left-1/2 h-20 text-5xl" aria-label="隨機戰車">?</span>
    </div>

    <div class="flex items-center gap-2 px-1">
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <span class="truncate text-2xl leading-none">{{ label.zh }}</span>
          <span class="font-num shrink-0 text-sm font-extrabold text-ink-soft">{{ label.en }}</span>
        </div>
        <div class="mt-1 truncate text-sm text-ink-soft">{{ random ? '開打時從所有戰車抽一台' : spec.subtitle }}</div>
      </div>
      <button
        type="button"
        :disabled="locked"
        class="toon-btn toon-btn--sun shrink-0 rounded-xl px-3 py-1.5 text-base"
        @click="openTankModal"
      >
        換車
      </button>
    </div>

    <!-- 數值（隨機時不透露） -->
    <div v-if="random" class="flex h-[74px] items-center justify-center rounded-xl border-[3px] border-dashed border-ink/25 px-2 text-center text-sm text-ink-soft">
      耐久、火力、機動與彈藥都等開打揭曉
    </div>
    <div v-else class="space-y-1.5 px-1">
      <div v-for="s in stats" :key="s.label" class="flex items-center gap-2">
        <span class="w-9 shrink-0 text-sm">{{ s.label }}</span>
        <div class="h-3.5 flex-1 overflow-hidden rounded-full border-[2.5px] border-ink bg-paper">
          <div
            class="h-full rounded-full border-r-[2.5px] border-ink transition-all duration-300"
            :style="{ width: `${Math.max(8, Math.round(s.ratio * 100))}%`, background: s.color }"
          />
        </div>
        <span class="font-num w-16 shrink-0 text-right text-sm font-extrabold">
          {{ s.value }}<span class="ml-0.5 font-toon text-xs font-normal text-ink-soft">{{ s.unit }}</span>
        </span>
      </div>
    </div>

    <!-- 彈藥 -->
    <div v-if="!random" class="flex items-center gap-2">
      <div
        v-for="(shot, i) in shots"
        :key="i"
        class="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border-[3px] border-ink bg-paper px-1.5 py-1"
        :title="shot?.description"
      >
        <span
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink"
          :style="{ background: shot ? hexColor(shot.visual.glowColor) : '#ccc' }"
        >
          <img v-if="shotSprite(shot?.visual.sprite?.key)" :src="shotSprite(shot?.visual.sprite?.key)!" alt="" class="h-5 w-5 object-contain" />
        </span>
        <span class="min-w-0 leading-tight">
          <span class="block text-[11px] text-ink-soft">{{ i === 0 ? '主彈' : '副彈' }}</span>
          <span class="block truncate text-sm">{{ shot ? splitDisplayName(shot.name).zh : '—' }}</span>
        </span>
      </div>
      <button
        type="button"
        :disabled="locked"
        class="toon-btn toon-btn--sky shrink-0 rounded-xl px-2.5 py-1.5 text-sm"
        @click="showLoadoutModal = true; soundController.play('ui_click')"
      >
        換彈
      </button>
    </div>

    <TankPickerModal
      :open="showTankModal"
      title="選擇戰車"
      :selected="currentChoice"
      :team="paint"
      @pick="pickTank"
      @close="showTankModal = false"
    />

    <Teleport to="body">
      <div
        v-if="showLoadoutModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 font-toon"
        @click.self="showLoadoutModal = false"
      >
        <div class="toon-panel relative w-full max-w-md space-y-4 p-5 pt-7">
          <span class="toon-ribbon absolute -top-4 left-5">{{ label.zh }} · 彈藥配置</span>
          <LoadoutPicker
            :tank-id="selectedTankId"
            :picks="loadoutPicks"
            :disabled="locked"
            @change="(picks) => emit('change-loadout', picks)"
          />
          <button
            type="button"
            class="toon-btn toon-btn--sun w-full py-2 text-lg"
            @click="showLoadoutModal = false; soundController.play('ui_click')"
          >
            完成
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.stage {
  background: url('@/assets/ui/stage_sky.svg') center bottom / cover no-repeat, #bfe4ff;
}
.tank-bob {
  animation: bob 2.8s ease-in-out infinite;
}
.rig-barrel {
  transform-origin: 8% 50%;
  transform: translate(-8%, -50%) rotate(-14deg);
}
.rig-hull {
  left: 0;
  transform: translate(-50%, -100%);
}
@keyframes bob {
  0%, 100% { transform: translate(-50%, 0); }
  50% { transform: translate(-50%, -4px); }
}
</style>
