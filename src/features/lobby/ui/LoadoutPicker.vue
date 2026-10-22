<script setup lang="ts">
/**
 * LoadoutPicker：從這台坦克的砲彈池選主彈與副彈（對戰中只能在這兩種之間切換）。
 * 點的砲彈已在另一格時兩格對調，所以任何操作都保持「兩格各一種、不重複」。
 */
import { computed } from 'vue'
import { PROJECTILE_REGISTRY, getTankSpec } from '@/features/battle'
import type { BulletType, TankArchetypeId } from '@/shared/kernel/types'

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
  <div class="space-y-1.5 rounded-xl border border-teal-600/40 bg-white/80 p-2.5">
    <div class="text-[11px] font-black text-teal-950">彈藥配置 <span class="font-semibold text-teal-700">（開戰後不可更換，對手開火前看不到）</span></div>
    <div v-for="(label, slot) in slots" :key="label" class="flex items-center gap-1.5">
      <span class="w-9 shrink-0 text-[10px] font-extrabold text-teal-800">{{ label }}</span>
      <div class="flex flex-wrap gap-1">
        <button
          v-for="proj in pool"
          :key="proj.id"
          type="button"
          :disabled="disabled"
          :title="`${proj.name}: ${proj.description}`"
          class="cursor-pointer rounded-lg border-2 px-2 py-0.5 text-[10px] font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60"
          :class="picks[slot] === proj.id ? 'border-amber-500 bg-amber-300 text-slate-950' : 'border-teal-600/30 bg-white text-teal-800 hover:border-teal-700'"
          @click="choose(slot, proj.id)"
        >
          {{ proj.name.split(' ')[0] }}
        </button>
      </div>
    </div>
  </div>
</template>
