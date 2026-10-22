<script setup lang="ts">
import { TANK_LIST, buildTankCard } from '@/features/battle'
import { soundController } from '@/features/audio'
import type { TeamId } from '@/shared/kernel/types'
import { splitDisplayName } from './displayNames'
import { RANDOM_TANK, type TankChoice } from './tankChoice'

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

function close(): void {
  soundController.play('ui_click')
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 font-toon text-ink"
      @click.self="close"
    >
      <div class="toon-panel relative flex max-h-full w-full max-w-2xl flex-col gap-4 p-5 pt-7">
        <span class="toon-ribbon absolute -top-4 left-5">{{ title }}</span>
        <button
          type="button"
          aria-label="關閉"
          class="toon-btn absolute -right-3 -top-3 h-10 w-10 rounded-full p-0 text-xl"
          @click="close"
        >
          ✕
        </button>

        <div class="grid min-h-0 grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-4">
          <button
            v-for="t in tiles"
            :key="t.spec.id"
            type="button"
            class="toon-btn flex-col items-stretch gap-1 rounded-2xl p-2 text-left"
            :class="selected === t.spec.id ? 'toon-btn--sun' : ''"
            @click="pick(t.spec.id)"
          >
            <span class="flex h-14 items-center justify-center">
              <img :src="t.spec.getSprites(team).hullUrl" alt="" class="max-h-12 w-auto" :class="team === 'B' ? '-scale-x-100' : ''" />
            </span>
            <span class="truncate text-lg leading-none">{{ t.label.zh }}</span>
            <span class="truncate text-xs text-ink-soft">{{ t.spec.subtitle }}</span>
            <span class="mt-1 flex flex-col gap-1">
              <span
                v-for="bar in [
                  { r: t.card.hpRatio, c: 'var(--color-grass)' },
                  { r: t.card.firepowerRatio, c: 'var(--color-coral)' },
                  { r: t.card.mobilityRatio, c: 'var(--color-sky)' },
                ]"
                :key="bar.c"
                class="h-2.5 overflow-hidden rounded-full border-2 border-ink bg-paper"
              >
                <span class="block h-full" :style="{ width: `${Math.max(8, Math.round(bar.r * 100))}%`, background: bar.c }" />
              </span>
            </span>
          </button>

          <button
            type="button"
            class="toon-btn flex-col items-stretch gap-1 rounded-2xl p-2 text-left"
            :class="selected === RANDOM_TANK ? 'toon-btn--sun' : ''"
            @click="pick(RANDOM_TANK)"
          >
            <span class="flex h-14 items-center justify-center">
              <span class="toon-mystery h-12 text-3xl">?</span>
            </span>
            <span class="truncate text-lg leading-none">隨機</span>
            <span class="truncate text-xs text-ink-soft">開打時才揭曉</span>
            <span class="mt-1 text-xs leading-snug text-ink-soft">從所有戰車中抽一台，帶它存好的彈藥上場</span>
          </button>
        </div>

        <div class="flex justify-center gap-4 text-xs text-ink-soft">
          <span class="flex items-center gap-1"><i class="h-2 w-4 rounded-full border-2 border-ink bg-grass" />耐久</span>
          <span class="flex items-center gap-1"><i class="h-2 w-4 rounded-full border-2 border-ink bg-coral" />火力</span>
          <span class="flex items-center gap-1"><i class="h-2 w-4 rounded-full border-2 border-ink bg-sky" />機動</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
