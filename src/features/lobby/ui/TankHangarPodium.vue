<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  TANK_LIST,
  buildTankCard,
  getTankSpec,
  PROJECTILE_REGISTRY,
  type TankBlueprint,
} from '@/features/battle'
import { soundController } from '@/features/audio'
import LoadoutPicker from './LoadoutPicker.vue'
import { splitDisplayName } from './displayNames'
import type { BulletType, TankArchetypeId, TeamId } from '@/shared/kernel/types'

const props = defineProps<{
  selectedTankId: TankArchetypeId
  loadoutPicks: readonly BulletType[]
  locked?: boolean
}>()

const emit = defineEmits<{
  (e: 'select-tank', tankId: TankArchetypeId): void
  (e: 'change-loadout', picks: BulletType[]): void
}>()

const paint = ref<TeamId>('A')
const showLoadoutModal = ref(false)

const spec = computed<TankBlueprint>(() => getTankSpec(props.selectedTankId))
const card = computed(() => buildTankCard(props.selectedTankId))
const label = computed(() => splitDisplayName(spec.value.name))
const sprites = computed(() => spec.value.getSprites(paint.value))

const shots = computed(() =>
  [0, 1].map((slot) => PROJECTILE_REGISTRY[props.loadoutPicks[slot] ?? spec.value.shots[slot]]),
)

const stats = computed(() => [
  { label: '耐久', ratio: card.value.hpRatio, value: `${card.value.maxHp}`, unit: 'HP', color: 'var(--color-grass)' },
  { label: '火力', ratio: card.value.outputRatio, value: `×${card.value.damageMultiplier.toFixed(2)}`, unit: '', color: 'var(--color-coral)' },
  { label: '機動', ratio: card.value.mobilityRatio, value: `${card.value.moveFuel}`, unit: '燃料', color: 'var(--color-sky)' },
])

function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`
}

function shotSprite(key: string | undefined): string | null {
  return key ? `/assets/units/projectiles/${key}.png` : null
}

function pickTank(tankId: TankArchetypeId): void {
  if (tankId === props.selectedTankId) return
  soundController.play('ui_select')
  emit('select-tank', tankId)
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
      <div class="absolute bottom-3 left-1/2 h-7 w-48 -translate-x-1/2 rounded-[50%] border-[3px] border-ink bg-grass" />
      <div class="tank-bob absolute bottom-5 left-1/2 flex h-28 w-44 items-end justify-center">
        <img
          :src="sprites.barrelUrl"
          alt=""
          class="absolute h-6 w-auto"
          style="top: 32px; left: 70px; transform-origin: 12% 50%; transform: rotate(-12deg)"
        />
        <img :src="sprites.hullUrl" :alt="spec.name" class="relative h-20 w-auto" />
      </div>
    </div>

    <div class="flex items-end justify-between gap-2 px-1">
      <div class="min-w-0">
        <div class="truncate text-2xl leading-none">{{ label.zh }}</div>
        <div class="mt-1 truncate text-sm text-ink-soft">{{ spec.subtitle }}</div>
      </div>
      <span class="font-num shrink-0 text-lg font-extrabold text-ink-soft">{{ label.en }}</span>
    </div>

    <!-- 選車 -->
    <div class="grid grid-cols-3 gap-2">
      <button
        v-for="t in TANK_LIST"
        :key="t.id"
        type="button"
        class="toon-btn flex-col gap-0 rounded-xl px-1 pb-1 pt-1.5 text-sm"
        :class="selectedTankId === t.id ? 'toon-btn--sun' : ''"
        @click="pickTank(t.id)"
      >
        <img :src="t.getSprites(paint).hullUrl" alt="" class="h-9 w-auto" />
        <span>{{ splitDisplayName(t.name).zh }}</span>
      </button>
    </div>

    <!-- 數值 -->
    <div class="space-y-1.5 px-1">
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
    <div class="flex items-center gap-2">
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
  background:
    radial-gradient(circle at 20% 25%, rgb(255 255 255 / 0.9) 0 18px, transparent 19px),
    radial-gradient(circle at 30% 22%, rgb(255 255 255 / 0.9) 0 24px, transparent 25px),
    linear-gradient(#9fd8ff, #e6f6ff 75%);
}
.tank-bob {
  animation: bob 2.8s ease-in-out infinite;
}
@keyframes bob {
  0%, 100% { transform: translate(-50%, 0); }
  50% { transform: translate(-50%, -4px); }
}
</style>
