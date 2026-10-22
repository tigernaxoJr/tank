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

const previewTeam = ref<TeamId>('A')
const showLoadoutModal = ref(false)

const spec = computed<TankBlueprint>(() => getTankSpec(props.selectedTankId))
const card = computed(() => buildTankCard(props.selectedTankId))

const sprites = computed(() => spec.value.getSprites(previewTeam.value))

const primaryShot = computed(() => {
  const bulletId = props.loadoutPicks[0] ?? spec.value.shots[0]
  return PROJECTILE_REGISTRY[bulletId]
})

const secondaryShot = computed(() => {
  const bulletId = props.loadoutPicks[1] ?? spec.value.shots[1]
  return PROJECTILE_REGISTRY[bulletId]
})

function onSwitchTank(tankId: TankArchetypeId): void {
  soundController.play('ui_select')
  emit('select-tank', tankId)
}

function toggleTeamPreview(): void {
  soundController.play('ui_click')
  previewTeam.value = previewTeam.value === 'A' ? 'B' : 'A'
}

function pct(ratio: number): string {
  return `${Math.max(6, Math.round(ratio * 100))}%`
}
</script>

<template>
  <div class="relative flex flex-col justify-between rounded-3xl border-2 border-amber-400/30 bg-slate-900/90 p-4 shadow-2xl backdrop-blur-md space-y-3">
    <!-- 頂部列：戰車格納庫標題 + 塗裝切換 -->
    <div class="flex items-center justify-between border-b border-slate-700/60 pb-2.5">
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-amber-500/20 px-2.5 py-0.5 text-xs font-black text-amber-300">
          🛡️ 空降戰車格納庫
        </span>
        <span class="text-[11px] text-amber-200/70">出戰機體展示</span>
      </div>

      <!-- 陣營塗裝預覽切換 -->
      <button
        type="button"
        title="切換預覽琥珀橘 / 皇家藍隊塗裝"
        class="flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-extrabold transition cursor-pointer"
        :class="
          previewTeam === 'A'
            ? 'border-amber-400 bg-amber-400/20 text-amber-300'
            : 'border-sky-400 bg-sky-400/20 text-sky-300'
        "
        @click="toggleTeamPreview"
      >
        <span>塗裝:</span>
        <span class="font-black">{{ previewTeam === 'A' ? '🟠 琥珀橘' : '🔵 皇家藍' }}</span>
      </button>
    </div>

    <!-- 機體 2.5D 懸浮展示座 (Hangar Podium) -->
    <div class="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-amber-400/40 bg-gradient-to-b from-slate-900/85 via-slate-800/85 to-slate-900/90 py-5 shadow-lg">
      <!-- 格納庫背景六角形網格與光束 -->
      <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.18)_0%,transparent_70%)]" />
      <div class="pointer-events-none absolute -bottom-6 h-20 w-48 rounded-full bg-amber-400/25 blur-xl" />

      <!-- 戰車實體渲染 (含砲管與車身、懸浮動態與投影) -->
      <div class="tank-float relative flex h-28 w-44 items-center justify-center">
        <!-- 底盤地面陰影 -->
        <div class="absolute bottom-2 h-4 w-32 rounded-full bg-slate-950/60 blur-[3px]" />

        <!-- 砲管 (層級在車身後或依註冊表設定) -->
        <img
          :src="sprites.barrelUrl"
          :alt="spec.name"
          class="pointer-events-none absolute h-6 w-auto object-contain drop-shadow"
          :style="{
            top: '32px',
            left: '70px',
            transformOrigin: '12% 50%',
            transform: 'rotate(-12deg)',
          }"
        />

        <!-- 車身主體 -->
        <img
          :src="sprites.hullUrl"
          :alt="spec.name"
          class="relative z-10 h-20 w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.4)]"
        />
      </div>

      <!-- 機體名稱與型號副標 -->
      <div class="mt-1 text-center">
        <h3 class="text-sm font-black tracking-wide text-white drop-shadow">
          {{ spec.name }}
        </h3>
        <p class="text-[11px] font-semibold text-amber-300">
          {{ spec.subtitle }}
        </p>
      </div>

      <!-- 戰車選擇切換標籤 (3 選 1) -->
      <div class="mt-3 flex w-full max-w-xs items-center justify-center gap-1.5 px-3">
        <button
          v-for="t in TANK_LIST"
          :key="t.id"
          type="button"
          class="flex-1 rounded-xl border-2 py-1.5 px-2 text-center text-xs font-black transition cursor-pointer"
          :class="
            selectedTankId === t.id
              ? 'border-amber-400 bg-amber-400 text-slate-950 shadow-[0_0_15px_rgba(251,191,36,0.5)] scale-105'
              : 'border-slate-700/80 bg-slate-800/90 text-slate-300 hover:border-amber-400/50 hover:bg-slate-700'
          "
          @click="onSwitchTank(t.id)"
        >
          {{ t.name.split(' ')[0] }}
        </button>
      </div>
    </div>

    <!-- 戰術數值長條圖 (HP / 火力 / 機動) -->
    <div class="space-y-1.5 rounded-2xl border-2 border-slate-700/70 bg-slate-800/80 p-3 text-xs shadow-md">
      <!-- HP -->
      <div class="flex items-center gap-2 text-[11px]">
        <span class="w-10 shrink-0 font-black text-slate-200">💚 耐久</span>
        <div class="h-2 flex-1 overflow-hidden rounded-full border border-slate-700 bg-slate-950">
          <div class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-green-300 transition-all duration-300" :style="{ width: pct(card.hpRatio) }" />
        </div>
        <span class="w-12 shrink-0 text-right font-mono font-black text-emerald-300">{{ card.maxHp }} HP</span>
      </div>

      <!-- 火力 -->
      <div class="flex items-center gap-2 text-[11px]">
        <span class="w-10 shrink-0 font-black text-slate-200">⚔️ 火力</span>
        <div class="h-2 flex-1 overflow-hidden rounded-full border border-slate-700 bg-slate-950">
          <div class="h-full rounded-full bg-gradient-to-r from-rose-500 to-amber-300 transition-all duration-300" :style="{ width: pct(card.outputRatio) }" />
        </div>
        <span class="w-12 shrink-0 text-right font-mono font-black text-amber-300">×{{ card.damageMultiplier.toFixed(2) }}</span>
      </div>

      <!-- 機動 -->
      <div class="flex items-center gap-2 text-[11px]">
        <span class="w-10 shrink-0 font-black text-slate-200">🚀 機動</span>
        <div class="h-2 flex-1 overflow-hidden rounded-full border border-slate-700 bg-slate-950">
          <div class="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-400 transition-all duration-300" :style="{ width: pct(card.mobilityRatio) }" />
        </div>
        <span class="w-12 shrink-0 text-right font-mono font-black text-sky-300">{{ card.moveFuel }} 燃油</span>
      </div>
    </div>

    <!-- 彈藥配置快速卡 -->
    <div class="flex items-center justify-between gap-2 rounded-2xl border-2 border-slate-700/70 bg-slate-800/80 p-2.5 shadow-md">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-xs font-black text-slate-300 shrink-0">💣 攜帶彈藥:</span>
        <div class="flex items-center gap-1.5 truncate">
          <span class="rounded-lg bg-amber-400/20 px-2 py-0.5 text-[10px] font-black text-amber-300 border border-amber-400/30 truncate">
            1. {{ primaryShot?.name.split(' ')[0] ?? '主彈' }}
          </span>
          <span class="rounded-lg bg-sky-400/20 px-2 py-0.5 text-[10px] font-black text-sky-300 border border-sky-400/30 truncate">
            2. {{ secondaryShot?.name.split(' ')[0] ?? '副彈' }}
          </span>
        </div>
      </div>

      <button
        type="button"
        :disabled="locked"
        class="shrink-0 rounded-xl border border-slate-700 bg-slate-800 px-2.5 py-1 text-[11px] font-black text-slate-200 hover:border-amber-400 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        @click="showLoadoutModal = true; soundController.play('ui_click')"
      >
        調配 ⚙️
      </button>
    </div>

    <!-- 彈藥配置彈窗 -->
    <Teleport to="body">
      <div
        v-if="showLoadoutModal"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
        @click.self="showLoadoutModal = false"
      >
        <div class="w-full max-w-md rounded-3xl border-2 border-amber-400/50 bg-slate-900 p-5 shadow-2xl space-y-4">
          <div class="flex items-center justify-between border-b border-slate-700 pb-3">
            <h3 class="text-sm font-black text-white">⚙️ 調整 {{ spec.name }} 的主副彈配置</h3>
            <button
              type="button"
              class="h-7 w-7 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
              @click="showLoadoutModal = false"
            >
              ✕
            </button>
          </div>

          <LoadoutPicker
            :tank-id="selectedTankId"
            :picks="loadoutPicks"
            :disabled="locked"
            @change="(picks) => emit('change-loadout', picks)"
          />

          <button
            type="button"
            class="w-full rounded-xl bg-amber-400 py-2.5 text-xs font-black text-slate-950 hover:bg-amber-300 transition cursor-pointer"
            @click="showLoadoutModal = false; soundController.play('ui_click')"
          >
            確認配置完畢
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tank-float {
  animation: tankFloatAnim 3.2s ease-in-out infinite;
}

@keyframes tankFloatAnim {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}
</style>
