<script setup lang="ts">
/**
 * TankStatPanel：選車詳情面板。數值全部由 battle slice 的 buildTankCard 從 registry 推導，
 * 長條圖以所有坦克 / 砲彈的最大值為 100%，方便比較「血量低 → 輸出高」的取捨。
 */
import { computed } from 'vue'
import { buildTankCard, getTankSpec } from '@/features/battle'
import type { TankArchetypeId } from '@/shared/kernel/types'

const props = defineProps<{ tankId: TankArchetypeId }>()

const spec = computed(() => getTankSpec(props.tankId))
const card = computed(() => buildTankCard(props.tankId))

const bars = computed(() => [
  { key: 'hp', label: '血量', value: `${card.value.maxHp}`, ratio: card.value.hpRatio, color: 'from-emerald-500 to-emerald-300' },
  {
    key: 'out',
    label: '輸出',
    value: `×${card.value.damageMultiplier.toFixed(2)}`,
    ratio: card.value.outputRatio,
    color: 'from-rose-500 to-orange-300',
  },
  { key: 'mob', label: '機動', value: `${card.value.moveFuel}`, ratio: card.value.mobilityRatio, color: 'from-sky-500 to-cyan-300' },
])

function pct(ratio: number): string {
  return `${Math.max(4, Math.round(ratio * 100))}%`
}
</script>

<template>
  <div class="rounded-xl border border-teal-600/40 bg-white/80 px-3.5 py-3 text-xs text-teal-900 space-y-2.5">
    <div>
      <div class="font-bold text-amber-700">{{ spec.name }} — {{ spec.subtitle }}</div>
      <p class="mt-0.5 text-[11px] text-teal-800/90">{{ spec.description }}</p>
    </div>

    <!-- 車體三項：血量 / 輸出 / 機動 -->
    <div class="space-y-1">
      <div v-for="bar in bars" :key="bar.key" class="flex items-center gap-2 text-[10px]">
        <span class="w-8 shrink-0 font-black text-teal-800">{{ bar.label }}</span>
        <div class="h-2 flex-1 overflow-hidden rounded-full border border-teal-600/40 bg-white">
          <div class="h-full rounded-full bg-gradient-to-r transition-all" :class="bar.color" :style="{ width: pct(bar.ratio) }" />
        </div>
        <span class="w-10 shrink-0 text-right font-mono font-bold text-teal-950">{{ bar.value }}</span>
      </div>
    </div>

    <!-- 防護與地形能力 -->
    <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] text-teal-800">
      <span>裝甲 <b class="font-mono text-teal-950">{{ card.armor }}</b></span>
      <span>護盾 <b class="font-mono text-teal-950">{{ card.shield }}</b></span>
      <span>爬坡 <b class="font-mono text-teal-950">{{ card.climbPerPx }}</b> px/px</span>
      <span>耐摔 <b class="font-mono text-teal-950">{{ card.fallSafePx }}</b> px<template v-if="card.resist.fall">（減傷 {{ Math.round(card.resist.fall * 100) }}%）</template></span>
      <span>風敏感 <b class="font-mono text-teal-950">×{{ card.windSensitivity }}</b></span>
      <span v-if="card.resist.explosion">爆炸抗性 <b class="font-mono text-teal-950">{{ Math.round(card.resist.explosion * 100) }}%</b></span>
    </div>

    <!-- 專屬砲彈 -->
    <div class="space-y-1.5 border-t border-teal-600/40 pt-2">
      <div
        v-for="(shot, idx) in card.shots"
        :key="shot.id"
        class="rounded-lg border border-teal-600/40 bg-white/80 px-2.5 py-1.5"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="truncate text-[11px] font-black text-teal-950">{{ idx + 1 }}. {{ shot.name.split(' ')[0] }}</span>
          <span class="shrink-0 text-[10px] font-semibold text-amber-700">{{ shot.badge }}</span>
        </div>
        <div class="mt-1 grid grid-cols-4 gap-x-2 text-[10px]">
          <div>
            <div class="flex justify-between"><span class="text-teal-800">威力</span><span class="font-mono font-bold text-teal-950">{{ shot.damage }}</span></div>
            <div class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-teal-100">
              <div class="h-full bg-rose-400" :style="{ width: pct(shot.damageRatio) }" />
            </div>
          </div>
          <div>
            <div class="flex justify-between"><span class="text-teal-800">傷害範圍</span><span class="font-mono font-bold text-teal-950">{{ shot.damageRadius }}</span></div>
            <div class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-teal-100">
              <div class="h-full bg-amber-400" :style="{ width: pct(shot.damageRadiusRatio) }" />
            </div>
          </div>
          <div>
            <div class="flex justify-between"><span class="text-teal-800">挖地</span><span class="font-mono font-bold text-teal-950">{{ shot.terrainRadius }}</span></div>
            <div class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-teal-100">
              <div class="h-full bg-orange-700" :style="{ width: pct(shot.terrainRadiusRatio) }" />
            </div>
          </div>
          <div>
            <div class="flex justify-between"><span class="text-teal-800">射程</span><span class="font-mono font-bold text-teal-950">{{ shot.maxRangePx }}</span></div>
            <div class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-teal-100">
              <div class="h-full bg-sky-400" :style="{ width: pct(shot.rangeRatio) }" />
            </div>
          </div>
        </div>
        <div class="mt-0.5 text-[10px] text-teal-700">受風影響 ×{{ shot.windMultiplier }}（含坦克風敏感度，越大越容易被吹偏）·
          <span class="font-bold">{{ shot.magnetRadius > 0 ? `吸附 ${shot.magnetRadius}px` : '不導引·純技術' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
