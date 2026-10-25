<script setup lang="ts">
import { TANK_LIST, buildTankCard } from '@/features/battle'
import { soundController } from '@/features/audio'
import { ModalSheet } from '@/shared/ui'
import type { TeamId } from '@/shared/kernel/types'
import { splitDisplayName } from './displayNames'
import { RANDOM_TANK, type TankChoice } from './tankChoice'
import TankPortrait from './TankPortrait.vue'

const props = defineProps<{
  open: boolean
  title: string
  selected: TankChoice
  team: TeamId
}>()

const emit = defineEmits<{
  (e: 'pick', choice: TankChoice): void
  (e: 'close'): void
}>()

const tiles = TANK_LIST.map((t) => ({ spec: t, card: buildTankCard(t.id), label: splitDisplayName(t.name) }))

function pick(choice: TankChoice): void {
  soundController.play(choice === props.selected ? 'ui_click' : 'ui_select')
  emit('pick', choice)
  emit('close')
}
</script>

<template>
  <ModalSheet :open="open" :title="title" size="lg" @close="emit('close')">
    <div class="grid grid-cols-2 gap-2.5 p-1 sm:grid-cols-4 phone:grid-cols-4 phone:gap-2">
      <button
        v-for="t in tiles"
        :key="t.spec.id"
        type="button"
        class="tile flex flex-col gap-1 text-left"
        :class="selected === t.spec.id ? 'on' : ''"
        :aria-pressed="selected === t.spec.id"
        @click="pick(t.spec.id)"
      >
        <span class="flex h-14 items-center justify-center phone:h-12">
          <TankPortrait :tank-id="t.spec.id" :team="team" :facing-left="team === 'B'" class="h-full w-full" />
        </span>
        <span class="truncate text-base leading-none">{{ t.label.zh }}</span>
        <span class="truncate text-xs text-ink/60 phone:hidden">{{ t.spec.subtitle }}</span>
        <span class="mt-0.5 flex flex-col gap-1">
          <span
            v-for="bar in [
              { r: t.card.hpRatio, c: 'var(--color-grass)' },
              { r: t.card.firepowerRatio, c: 'var(--color-coral)' },
              { r: t.card.mobilityRatio, c: 'var(--color-sky)' },
            ]"
            :key="bar.c"
            class="bar"
          >
            <span class="block h-full rounded-full" :style="{ width: `${Math.max(8, Math.round(bar.r * 100))}%`, background: bar.c }" />
          </span>
        </span>
      </button>

      <button type="button" class="tile flex flex-col gap-1 text-left" :class="selected === RANDOM_TANK ? 'on' : ''" :aria-pressed="selected === RANDOM_TANK" @click="pick(RANDOM_TANK)">
        <span class="flex h-14 items-center justify-center phone:h-12">
          <span class="mystery font-num">?</span>
        </span>
        <span class="truncate text-base leading-none">隨機</span>
        <span class="text-xs leading-snug text-ink/60">開打時才揭曉；從所有戰車抽一台</span>
      </button>
    </div>

    <template #footer>
      <div class="flex justify-center gap-4 text-xs text-ink/70">
        <span class="flex items-center gap-1"><i class="legend bg-grass" />耐久</span>
        <span class="flex items-center gap-1"><i class="legend bg-coral" />火力</span>
        <span class="flex items-center gap-1"><i class="legend bg-sky" />機動</span>
      </div>
    </template>
  </ModalSheet>
</template>

<style scoped>
.tile {
  padding: 8px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 3px 0 rgb(29 35 64 / 0.4), inset 0 0 0 2.5px var(--color-ink);
  cursor: pointer;
  transition: transform 0.1s ease;
}
.tile:hover { transform: translateY(-2px); }
.tile.on { background: #fff4c4; box-shadow: 0 3px 0 rgb(29 35 64 / 0.4), inset 0 0 0 2.5px var(--color-ink), 0 0 0 3px var(--color-sun); }
.bar { height: 8px; border-radius: 999px; background: #e8f3ff; box-shadow: inset 0 0 0 1.5px rgb(29 35 64 / 0.7); overflow: hidden; }
.legend { width: 16px; height: 8px; border-radius: 999px; box-shadow: inset 0 0 0 1.5px var(--color-ink); }
.mystery {
  width: 48px;
  height: 48px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-sky);
  color: #fff;
  font-size: 1.9rem;
  font-weight: 800;
  box-shadow: inset 0 0 0 3px var(--color-ink);
}
</style>
