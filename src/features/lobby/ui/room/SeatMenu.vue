<script setup lang="ts">
import { BOT_LEVEL_SPECS } from '@/features/battle'
import { GameButton, IconGlyph, UiPanel } from '@/shared/ui'
import type { BotLevel, TeamId } from '@/shared/kernel/types'
import type { SeatControl } from '../composables/useLocalSkirmish'

/** 單機練習的座位選單：選車、玩家 / 電腦 / 空位、電腦難度。點座位環開啟 */
defineProps<{
  team: TeamId
  index: number
  control: SeatControl
  level: BotLevel
  tankName: string
  canEmpty: boolean
}>()
const emit = defineEmits<{
  (e: 'set-control', control: SeatControl): void
  (e: 'step-level', step: 1 | -1): void
  (e: 'pick-tank'): void
  (e: 'close'): void
}>()
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 font-toon text-ink" @click.self="emit('close')">
      <UiPanel class="w-full max-w-xs">
        <div class="mb-2 flex items-center gap-2">
          <span class="font-num text-lg font-extrabold">{{ team }}{{ index + 1 }} 席</span>
          <GameButton variant="white" round class="ml-auto" aria-label="關閉" @click="emit('close')"><IconGlyph name="close" :size="20" /></GameButton>
        </div>

        <template v-if="control === 'empty'">
          <p class="mb-3 text-sm text-ink/70">這一席目前是空位</p>
          <div class="flex gap-2">
            <GameButton variant="gold" class="flex-1" @click="emit('set-control', 'player')"><IconGlyph name="person" :size="20" /> 玩家</GameButton>
            <GameButton variant="sky" class="flex-1" @click="emit('set-control', 'bot')"><IconGlyph name="robot" :size="20" /> 電腦</GameButton>
          </div>
        </template>

        <template v-else>
          <GameButton variant="white" class="mb-3 w-full justify-between" @click="emit('pick-tank')">
            <span class="truncate">{{ tankName }}</span><span class="text-sm text-ink/60">換車 ›</span>
          </GameButton>
          <div class="mb-3 grid grid-cols-3 gap-2">
            <GameButton :variant="control === 'player' ? 'gold' : 'white'" @click="emit('set-control', 'player')">玩家</GameButton>
            <GameButton :variant="control === 'bot' ? 'gold' : 'white'" @click="emit('set-control', 'bot')">電腦</GameButton>
            <GameButton variant="white" :disabled="!canEmpty" @click="emit('set-control', 'empty')">空位</GameButton>
          </div>
          <div v-if="control === 'bot'" class="flex items-center gap-2">
            <span class="text-sm">難度</span>
            <GameButton variant="white" round aria-label="降低難度" @click="emit('step-level', -1)"><IconGlyph name="chevron_left" :size="18" /></GameButton>
            <span class="flex-1 text-center text-base">{{ BOT_LEVEL_SPECS[level].label }}</span>
            <GameButton variant="white" round aria-label="提高難度" @click="emit('step-level', 1)"><IconGlyph name="chevron_left" :size="18" class="-scale-x-100" /></GameButton>
          </div>
        </template>
      </UiPanel>
    </div>
  </Teleport>
</template>
