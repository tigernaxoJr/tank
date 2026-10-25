<script setup lang="ts">
/**
 * LoadoutPicker：從這台坦克的砲彈池選主彈與副彈（對戰中只能在這兩種之間切換）。
 * 點的砲彈已在另一格時兩格對調，所以任何操作都保持「兩格各一種、不重複」。
 */
import { computed } from 'vue'
import { PROJECTILE_REGISTRY, getTankSpec } from '@/features/battle'
import { GameButton } from '@/shared/ui'
import type { BulletType, TankArchetypeId } from '@/shared/kernel/types'
import { splitDisplayName } from './displayNames'

const props = defineProps<{
  tankId: TankArchetypeId
  picks: readonly BulletType[]
  disabled?: boolean
}>()
const emit = defineEmits<{ (e: 'change', picks: BulletType[]): void }>()

const pool = computed(() => getTankSpec(props.tankId).shots.map((id) => PROJECTILE_REGISTRY[id]))
const slots = ['主彈', '副彈'] as const

function choose(slot: number, bullet: BulletType): void {
  if (props.disabled || props.picks[slot] === bullet) return
  const next = [...props.picks]
  const other = 1 - slot
  if (next[other] === bullet) next[other] = next[slot]
  next[slot] = bullet
  emit('change', next)
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-sm text-ink/70">開戰後不可更換；對手要等你開火才看得到。</p>
    <div v-for="(label, slot) in slots" :key="label" class="space-y-1">
      <div class="text-base">{{ label }}</div>
      <div class="flex flex-wrap gap-2">
        <GameButton
          v-for="proj in pool"
          :key="proj.id"
          :variant="picks[slot] === proj.id ? 'gold' : 'white'"
          :disabled="disabled"
          :title="proj.description"
          class="text-sm"
          @click="choose(slot, proj.id)"
        >
          {{ splitDisplayName(proj.name).zh }}
        </GameButton>
      </div>
    </div>
  </div>
</template>
