<script setup lang="ts">
import { computed, ref } from 'vue'
import { buildTankCard, getTankSpec, PROJECTILE_REGISTRY, type TankBlueprint } from '@/features/battle'
import { soundController } from '@/features/audio'
import { GameButton, IconGlyph, ModalSheet, uiUrl, type UiIconName } from '@/shared/ui'
import type { BulletType, TankArchetypeId, TeamId } from '@/shared/kernel/types'
import LoadoutPicker from '../LoadoutPicker.vue'
import TankPickerModal from '../TankPickerModal.vue'
import TankPortrait from '../TankPortrait.vue'
import { RANDOM_TANK, type TankChoice } from '../tankChoice'
import { splitDisplayName } from '../displayNames'

/**
 * 戰車展示台：站在平台上的立繪 + 三個環形數值（耐久 / 火力 / 機動）+ 兩個彈藥槽 + 換車 / 換彈。
 * 數值全由 buildTankCard 從 registry 推導；選了「隨機」時不透露任何數值。
 */
const props = defineProps<{
  selectedTankId: TankArchetypeId
  loadoutPicks: readonly BulletType[]
  locked?: boolean
  random?: boolean
}>()
const emit = defineEmits<{
  (e: 'select-tank', choice: TankChoice): void
  (e: 'change-loadout', picks: BulletType[]): void
}>()

const paint = ref<TeamId>('A')
const showTankModal = ref(false)
const showLoadoutModal = ref(false)

const spec = computed<TankBlueprint>(() => getTankSpec(props.selectedTankId))
const card = computed(() => buildTankCard(props.selectedTankId))
const label = computed(() => (props.random ? { zh: '隨機戰車', en: 'RANDOM' } : splitDisplayName(spec.value.name)))
const shots = computed(() => [0, 1].map((slot) => PROJECTILE_REGISTRY[props.loadoutPicks[slot] ?? spec.value.shots[slot]]))
const currentChoice = computed<TankChoice>(() => (props.random ? RANDOM_TANK : props.selectedTankId))

const R = 18
const C = 2 * Math.PI * R
const stats = computed<{ label: string; icon: UiIconName; ratio: number; value: string; color: string }[]>(() => [
  { label: '耐久', icon: 'heart', ratio: card.value.hpRatio, value: `${card.value.maxHp}`, color: 'var(--color-grass)' },
  { label: '火力', icon: 'shell', ratio: card.value.firepowerRatio, value: `${card.value.firepower}`, color: 'var(--color-coral)' },
  { label: '機動', icon: 'fuel', ratio: card.value.mobilityRatio, value: `${card.value.moveFuel}`, color: 'var(--color-sky)' },
])

const slotImg = `url(${uiUrl('ui_kit', 'slot')})`
const hexColor = (n: number) => `#${n.toString(16).padStart(6, '0')}`
const shotSprite = (key: string | undefined) => (key ? `${import.meta.env.BASE_URL}assets/units/projectiles/${key}.png` : null)

function openTank(): void {
  if (props.locked) return
  soundController.play('ui_click')
  showTankModal.value = true
}
function openLoadout(): void {
  soundController.play('ui_click')
  showLoadoutModal.value = true
}
function pickTank(choice: TankChoice): void {
  if (choice !== currentChoice.value) emit('select-tank', choice)
}
</script>

<template>
  <div class="stand flex flex-col items-center gap-2">
    <!-- 展示平台 -->
    <div class="platform relative w-full">
      <div class="paint absolute right-1 top-1 flex gap-1.5" title="塗裝預覽">
        <button
          v-for="t in (['A', 'B'] as const)"
          :key="t"
          type="button"
          class="dot"
          :class="paint === t ? 'on' : ''"
          :aria-label="t === 'A' ? '橘隊塗裝' : '藍隊塗裝'"
          :style="{ background: t === 'A' ? 'var(--color-team-a)' : 'var(--color-team-b)' }"
          @click="soundController.play('ui_click'); paint = t"
        />
      </div>
      <div class="zoom absolute inset-0">
        <span class="disc" />
        <TankPortrait v-if="!random" :tank-id="selectedTankId" :team="paint" :unit="1.15" :max-height="104" class="bob absolute bottom-[26px] left-1/2" />
        <span v-else class="mystery bob absolute bottom-[22px] left-1/2 font-num" aria-label="隨機戰車">?</span>
      </div>
    </div>

    <div class="flex w-full items-center gap-2 px-1">
      <div class="min-w-0 flex-1 leading-tight">
        <div class="truncate text-xl phone:text-base">{{ label.zh }}</div>
        <div class="truncate text-xs text-ink/70 phone:hidden">{{ random ? '開打時從所有戰車抽一台' : spec.subtitle }}</div>
      </div>
      <GameButton variant="gold" :disabled="locked" class="shrink-0 text-base phone:text-sm" @click="openTank">換車</GameButton>
    </div>

    <!-- 三個環形數值 -->
    <div v-if="random" class="hint w-full text-center text-xs">耐久、火力、機動與彈藥都等開打揭曉</div>
    <div v-else class="flex w-full justify-around">
      <div v-for="s in stats" :key="s.label" class="flex flex-col items-center leading-none" :title="s.label">
        <span class="statring relative">
          <svg viewBox="0 0 44 44" class="absolute inset-0 h-full w-full -rotate-90">
            <circle cx="22" cy="22" :r="R" fill="#fff" stroke="rgb(29 35 64 / .15)" stroke-width="5" />
            <circle cx="22" cy="22" :r="R" fill="none" :stroke="s.color" stroke-width="5" stroke-linecap="round" :stroke-dasharray="C" :stroke-dashoffset="C * (1 - Math.max(0.08, s.ratio))" />
          </svg>
          <span class="absolute inset-0 flex items-center justify-center"><IconGlyph :name="s.icon" :size="16" /></span>
        </span>
        <b class="font-num mt-0.5 text-xs">{{ s.value }}</b>
      </div>
    </div>

    <!-- 彈藥槽 -->
    <div v-if="!random" class="flex w-full items-center justify-center gap-2">
      <div v-for="(shot, i) in shots" :key="i" class="slot" :style="{ backgroundImage: slotImg }" :title="shot?.description">
        <span class="slot-dot" :style="{ background: shot ? hexColor(shot.visual.glowColor) : '#ccc' }">
          <img v-if="shotSprite(shot?.visual.sprite?.key)" :src="shotSprite(shot?.visual.sprite?.key)!" alt="" draggable="false" class="h-full w-full object-contain" />
        </span>
      </div>
      <GameButton variant="sky" :disabled="locked" class="text-sm" @click="openLoadout">換彈</GameButton>
    </div>

    <TankPickerModal :open="showTankModal" title="選擇戰車" :selected="currentChoice" :team="paint" @pick="pickTank" @close="showTankModal = false" />

    <ModalSheet :open="showLoadoutModal" :title="`${label.zh} · 彈藥配置`" size="sm" @close="showLoadoutModal = false">
      <LoadoutPicker :tank-id="selectedTankId" :picks="loadoutPicks" :disabled="locked" @change="(picks) => emit('change-loadout', picks)" />
      <template #footer>
        <GameButton variant="gold" class="w-full" @click="showLoadoutModal = false">完成</GameButton>
      </template>
    </ModalSheet>
  </div>
</template>

<style scoped>
.platform { height: 150px; }
.zoom { transform-origin: 50% 100%; }
@media (max-height: 540px) and (orientation: landscape) {
  .platform { height: 96px; }
  .zoom { transform: scale(0.62); }
}
.disc {
  position: absolute;
  bottom: 6px;
  left: 50%;
  width: min(220px, 96%);
  height: 44px;
  translate: -50% 0;
  border-radius: 50%;
  background: radial-gradient(ellipse at 50% 40%, #ffe9a6, var(--color-sun) 70%);
  box-shadow: 0 5px 0 rgb(29 35 64 / 0.5), inset 0 0 0 4px var(--color-ink);
}
.dot { width: 20px; height: 20px; border-radius: 999px; box-shadow: inset 0 0 0 3px var(--color-ink); opacity: 0.7; cursor: pointer; }
.dot.on { opacity: 1; outline: 3px solid #fff; }
.paint { z-index: 2; }
.mystery {
  width: 80px;
  height: 80px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-sky);
  color: #fff;
  font-size: 3rem;
  font-weight: 800;
  box-shadow: inset 0 0 0 4px var(--color-ink);
}
.bob { animation: bob 2.8s ease-in-out infinite; }
@keyframes bob { 0%, 100% { transform: translate(-50%, 0); } 50% { transform: translate(-50%, -4px); } }
.hint { padding: 6px; border-radius: 12px; background: rgb(255 255 255 / 0.7); box-shadow: inset 0 0 0 2px rgb(29 35 64 / 0.25); }
.statring { width: 40px; height: 40px; }
.slot {
  width: 44px;
  height: 44px;
  background-size: 100% 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 2px 0 rgb(29 35 64 / 0.4));
}
.slot-dot { width: 56%; aspect-ratio: 1; border-radius: 999px; padding: 2px; box-shadow: inset 0 0 0 2px var(--color-ink); display: flex; align-items: center; justify-content: center; }
@media (prefers-reduced-motion: reduce) { .bob { animation: none; } }
</style>
