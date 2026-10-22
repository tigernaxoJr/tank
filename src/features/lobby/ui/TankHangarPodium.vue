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
import TankPortrait from './TankPortrait.vue'
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

const shots = computed(() =>
  [0, 1].map((slot) => PROJECTILE_REGISTRY[props.loadoutPicks[slot] ?? spec.value.shots[slot]]),
)

const stats = computed(() => [
  { label: '耐久', ratio: card.value.hpRatio, value: `${card.value.maxHp}`, unit: 'HP', color: 'var(--color-grass)' },
  { label: '火力', ratio: card.value.firepowerRatio, value: `${card.value.firepower}`, unit: '傷害', color: 'var(--color-coral)' },
  { label: '機動', ratio: card.value.mobilityRatio, value: `${card.value.moveFuel}`, unit: '燃料', color: 'var(--color-sky)' },
])

/** 展示台立繪：每 rig 單位幾 px */
const PORTRAIT_UNIT = 1.3

function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`
}

function shotSprite(key: string | undefined): string | null {
  return key ? `${import.meta.env.BASE_URL}assets/units/projectiles/${key}.png` : null
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
  <div class="toon-panel relative flex flex-col gap-3 p-3 pt-6 phone:gap-1.5 phone:p-2.5 phone:pt-5">
    <span class="toon-ribbon absolute -top-4 left-4" style="background: var(--color-sun); color: var(--color-ink); text-shadow: none">我的戰車</span>

    <!-- 展示台 -->
    <div class="stage relative h-40 overflow-hidden rounded-2xl border-[3px] border-ink phone:h-[84px]">
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
      <!-- 手機橫放時展示台變矮，台座與戰車整組縮小 -->
      <div class="stage-zoom pointer-events-none absolute inset-0">
        <img :src="turfUrl" alt="" class="absolute bottom-2 left-1/2 h-10 w-52 max-w-none -translate-x-1/2" />
        <!-- 立繪：車身 + 砲管 + 待機表情，每 rig 單位 1.3 px，最高的鐵壁堡壘（含旗子）也不會頂到台框 -->
        <TankPortrait v-if="!random" :tank-id="selectedTankId" :team="paint" :unit="PORTRAIT_UNIT" class="tank-bob absolute bottom-[36px] left-1/2" />
        <span v-else class="toon-mystery tank-bob absolute bottom-[30px] left-1/2 h-20 text-5xl" aria-label="隨機戰車">?</span>
      </div>
    </div>

    <div class="flex items-center gap-2 px-1">
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <span class="truncate text-2xl leading-none phone:text-lg">{{ label.zh }}</span>
          <span class="font-num shrink-0 text-sm font-extrabold text-ink-soft phone:hidden">{{ label.en }}</span>
        </div>
        <div class="mt-1 truncate text-sm text-ink-soft phone:hidden">{{ random ? '開打時從所有戰車抽一台' : spec.subtitle }}</div>
      </div>
      <button
        type="button"
        :disabled="locked"
        class="toon-btn toon-btn--sun shrink-0 rounded-xl px-3 py-1.5 text-base phone:px-2.5 phone:py-0.5 phone:text-sm"
        @click="openTankModal"
      >
        換車
      </button>
    </div>

    <!-- 數值（隨機時不透露） -->
    <div v-if="random" class="flex h-[74px] phone:h-[54px] items-center justify-center rounded-xl border-[3px] border-dashed border-ink/25 px-2 text-center text-sm text-ink-soft">
      耐久、火力、機動與彈藥都等開打揭曉
    </div>
    <div v-else class="space-y-1.5 px-1 phone:space-y-1">
      <div v-for="s in stats" :key="s.label" class="flex items-center gap-2">
        <span class="w-9 shrink-0 text-sm">{{ s.label }}</span>
        <div class="h-3.5 flex-1 overflow-hidden rounded-full border-[2.5px] border-ink bg-paper">
          <div
            class="h-full rounded-full border-r-[2.5px] border-ink transition-all duration-300"
            :style="{ width: `${Math.max(8, Math.round(s.ratio * 100))}%`, background: s.color }"
          />
        </div>
        <span class="font-num w-16 shrink-0 text-right text-sm font-extrabold phone:w-14 phone:text-xs">
          {{ s.value }}<span class="ml-0.5 font-toon text-xs font-normal text-ink-soft">{{ s.unit }}</span>
        </span>
      </div>
    </div>

    <!-- 彈藥 -->
    <div v-if="!random" class="flex items-center gap-2">
      <div
        v-for="(shot, i) in shots"
        :key="i"
        class="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border-[3px] border-ink bg-paper px-1.5 py-1 phone:justify-center phone:py-0.5"
        :title="shot?.description"
      >
        <span
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-ink"
          :style="{ background: shot ? hexColor(shot.visual.glowColor) : '#ccc' }"
        >
          <img v-if="shotSprite(shot?.visual.sprite?.key)" :src="shotSprite(shot?.visual.sprite?.key)!" alt="" class="h-5 w-5 object-contain" />
        </span>
        <!-- 手機橫放欄位窄，只留彈種圖示（名稱在 title 與換彈視窗裡） -->
        <span class="min-w-0 leading-tight phone:hidden">
          <span class="block text-[11px] text-ink-soft">{{ i === 0 ? '主彈' : '副彈' }}</span>
          <span class="block truncate text-sm">{{ shot ? splitDisplayName(shot.name).zh : '—' }}</span>
        </span>
      </div>
      <button
        type="button"
        :disabled="locked"
        class="toon-btn toon-btn--sky shrink-0 rounded-xl px-2.5 py-1.5 text-sm phone:px-2 phone:py-1"
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
@media (orientation: landscape) and (max-height: 540px) {
  .stage-zoom {
    transform: scale(0.55);
    transform-origin: 50% 100%;
  }
}
.tank-bob {
  animation: bob 2.8s ease-in-out infinite;
}
@keyframes bob {
  0%, 100% { transform: translate(-50%, 0); }
  50% { transform: translate(-50%, -4px); }
}
</style>
