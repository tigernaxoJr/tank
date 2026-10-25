<script setup lang="ts">
/**
 * 單機練習房：同機輪流或讓電腦接手任一隊。版面與連線房間共用 RoomShell / SeatRing / TankStand / MapTicket。
 * 狀態與邏輯仍在 LobbyPanel（useLocalSkirmish），這裡只負責畫面與轉發事件。
 */
import { ref } from 'vue'
import { GameButton, IconGlyph } from '@/shared/ui'
import type { BotLevel, BulletType, MapPresetId, TankArchetypeId, TeamId } from '@/shared/kernel/types'
import type { PracticeSeat, SeatControl } from './composables/useLocalSkirmish'
import MapTicket from './room/MapTicket.vue'
import RoomShell from './room/RoomShell.vue'
import SeatMenu from './room/SeatMenu.vue'
import SeatRing from './room/SeatRing.vue'
import TankStand from './room/TankStand.vue'
import type { TankChoice } from './tankChoice'

const props = defineProps<{
  seats: Record<TeamId, PracticeSeat[]>
  teamCount: Record<TeamId, number>
  /** 這一席的車身圖與名稱（隨機時 url 為 null） */
  slotTank: (team: TeamId, index: number) => { url: string | null; name: string }
  canEmpty: (team: TeamId, index: number) => boolean
  startLabel: string
  selectedTankId: TankArchetypeId
  randomTank: boolean
  loadoutPicks: readonly BulletType[]
  mapId: MapPresetId
}>()

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'start'): void
  (e: 'set-control', team: TeamId, index: number, control: SeatControl): void
  (e: 'step-level', team: TeamId, index: number, step: 1 | -1): void
  (e: 'pick-seat-tank', team: TeamId, index: number): void
  (e: 'select-tank', choice: TankChoice): void
  (e: 'change-loadout', picks: BulletType[]): void
  (e: 'select-map', mapId: MapPresetId): void
  (e: 'open-gallery'): void
}>()

const TEAMS = [
  { id: 'A' as TeamId, label: '橘隊', color: 'var(--color-team-a)' },
  { id: 'B' as TeamId, label: '藍隊', color: 'var(--color-team-b)' },
]
const open = ref<{ team: TeamId; index: number } | null>(null)

/** 目前選單對應的席位（座位資料會被外部改動，所以每次從 props 取） */
const menuSeat = () => (open.value ? props.seats[open.value.team][open.value.index] : null)
</script>

<template>
  <RoomShell title="單機練習" subtitle="同一台電腦輪流操作，或讓電腦接手任一隊" @back="emit('back')">
    <template #stand>
      <TankStand
        :selected-tank-id="selectedTankId"
        :random="randomTank"
        :loadout-picks="loadoutPicks"
        @select-tank="(c) => emit('select-tank', c)"
        @change-loadout="(p) => emit('change-loadout', p)"
      />
    </template>

    <template #seats>
      <div class="teams flex h-full flex-col justify-center gap-3 phone:gap-1.5">
        <div v-for="(team, ti) in TEAMS" :key="team.id" class="team">
          <div class="mb-1 flex items-center gap-2">
            <span class="pill text-sm text-white" :style="{ background: team.color }">{{ team.label }}</span>
            <span class="font-num text-sm font-extrabold">{{ teamCount[team.id] }} 台</span>
            <span v-if="ti === 0" class="vs font-num ml-auto">VS</span>
          </div>
          <ul class="flex justify-between gap-1">
            <li v-for="(seat, i) in seats[team.id]" :key="`${team.id}-${i}`">
              <SeatRing
                :state="seat.control === 'empty' ? 'empty' : 'occupied'"
                :team="team.id"
                :color="team.color"
                :hull-url="slotTank(team.id, i).url"
                :mystery="seat.control !== 'empty' && slotTank(team.id, i).url === null"
                :mirror="team.id === 'B'"
                :bot="seat.control === 'bot'"
                :name="seat.control === 'empty' ? '空位' : slotTank(team.id, i).name"
                :mine="team.id === 'A' && i === 0"
                @click="open = { team: team.id, index: i }"
              />
            </li>
          </ul>
        </div>
      </div>
    </template>

    <template #side>
      <div class="side flex min-h-full flex-col gap-2">
        <MapTicket :map-id="mapId" editable @select="(id) => emit('select-map', id)" @open-gallery="emit('open-gallery')" />
        <div class="mt-auto flex flex-col gap-1">
          <GameButton variant="gold" class="cta w-full text-2xl" @click="emit('start')"><IconGlyph name="shell" :size="28" /> 開打！</GameButton>
          <p class="text-center text-xs text-ink/70">{{ startLabel }}</p>
        </div>
      </div>
    </template>
  </RoomShell>

  <SeatMenu
    v-if="open && menuSeat()"
    :team="open.team"
    :index="open.index"
    :control="menuSeat()!.control"
    :level="menuSeat()!.level as BotLevel"
    :tank-name="slotTank(open.team, open.index).name"
    :can-empty="canEmpty(open.team, open.index)"
    @set-control="(c) => emit('set-control', open!.team, open!.index, c)"
    @step-level="(s) => emit('step-level', open!.team, open!.index, s)"
    @pick-tank="emit('pick-seat-tank', open!.team, open!.index); open = null"
    @close="open = null"
  />
</template>

<style scoped>
.team {
  padding: 6px 8px 4px;
  border-radius: 18px;
  background: rgb(255 255 255 / 0.55);
  box-shadow: inset 0 0 0 2px rgb(29 35 64 / 0.3);
  --seat: 58px;
}
@media (max-height: 540px) and (orientation: landscape) { .team { --seat: 46px; padding: 3px 6px 2px; } }
@media (min-width: 1100px), (orientation: portrait) { .team { --seat: 70px; } }
.pill { padding: 0 12px; border-radius: 999px; box-shadow: inset 0 0 0 2px var(--color-ink); text-shadow: 0 2px 0 rgb(29 35 64 / 0.35); }
.vs { font-weight: 800; padding: 0 10px; border-radius: 999px; background: var(--color-sun); box-shadow: inset 0 0 0 2px var(--color-ink); }
.cta { min-height: 58px; }
</style>
