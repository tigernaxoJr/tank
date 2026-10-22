<script setup lang="ts">
import { computed } from 'vue'
import { getTankSpec } from '@/features/battle'
import { soundController } from '@/features/audio'
import type {
  BulletType,
  DisconnectPolicy,
  MapPresetId,
  PlayerId,
  RosterSlot,
  TankArchetypeId,
  TeamId,
} from '@/shared/kernel/types'
import { MAX_PLAYERS_PER_TEAM } from '../domain/roomSession'
import TankHangarPodium from './TankHangarPodium.vue'
import MapPickerCard from './MapPickerCard.vue'
import { splitDisplayName } from './displayNames'
import type { TankChoice } from './tankChoice'

const props = defineProps<{
  roomCode: string
  roomTitle: string
  roster: readonly RosterSlot[]
  localPlayerId: PlayerId
  isHost: boolean
  locked: boolean
  canStart: boolean
  allGuestsReady: boolean
  localReady: boolean
  selectedMapId: MapPresetId
  disconnectPolicy: DisconnectPolicy
  selectedTankId: TankArchetypeId
  randomTank: boolean
  loadoutPicks: readonly BulletType[]
  copied: boolean
  copiedLink: boolean
  errorMessage?: string
}>()

const emit = defineEmits<{
  (e: 'switch-team', team: TeamId): void
  (e: 'toggle-ready'): void
  (e: 'start'): void
  (e: 'leave'): void
  (e: 'copy-code'): void
  (e: 'copy-link'): void
  (e: 'select-map', mapId: MapPresetId): void
  (e: 'open-gallery'): void
  (e: 'select-policy', policy: DisconnectPolicy): void
  (e: 'select-tank', choice: TankChoice): void
  (e: 'change-loadout', picks: BulletType[]): void
  (e: 'dismiss-error'): void
}>()

const TEAMS = [
  { id: 'A' as TeamId, label: '橘隊', color: 'var(--color-team-a)' },
  { id: 'B' as TeamId, label: '藍隊', color: 'var(--color-team-b)' },
]

/** 每隊固定 5 席，空席以 null 補齊 */
function seatsOf(team: TeamId): (RosterSlot | null)[] {
  const members: (RosterSlot | null)[] = props.roster.filter((r) => r.team === team)
  while (members.length < MAX_PLAYERS_PER_TEAM) members.push(null)
  return members
}

const localTeam = computed(() => props.roster.find((r) => r.id === props.localPlayerId)?.team)
const countOf = (team: TeamId) => props.roster.filter((r) => r.team === team).length
const canEditRoom = computed(() => props.isHost && !props.locked)

function hullUrl(slot: RosterSlot): string {
  return getTankSpec(slot.tankId).getSprites(slot.team).hullUrl
}

function tankLabel(slot: RosterSlot): string {
  if (slot.randomTank) return '隨機'
  return splitDisplayName(getTankSpec(slot.tankId).name).zh
}

function sitAt(team: TeamId): void {
  if (props.locked || localTeam.value === team) return
  emit('switch-team', team)
}

function setPolicy(policy: DisconnectPolicy): void {
  if (canEditRoom.value) emit('select-policy', policy)
}

const hint = computed(() => {
  if (!props.isHost) return props.localReady ? '等房主開打…' : '選好戰車後按「準備」'
  if (props.canStart) return `${countOf('A')} 對 ${countOf('B')}，可以開打了！`
  return props.allGuestsReady ? '兩隊都至少要有 1 人' : '等所有人按下準備'
})
</script>

<template>
  <div class="flex min-h-full flex-col gap-5 lg:h-full lg:min-h-0">
    <!-- 頂欄 -->
    <header class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        aria-label="離開房間"
        class="toon-btn h-11 w-11 rounded-full p-0 text-2xl"
        @click="soundController.play('ui_click'); emit('leave')"
      >
        ‹
      </button>
      <div class="mr-auto flex min-w-0 flex-col items-start gap-2.5">
        <h1 class="toon-title max-w-full truncate px-1 pb-1 text-[1.9rem] leading-tight">{{ roomTitle }}</h1>
        <span class="toon-pill bg-paper text-sm">
          <span class="h-2.5 w-2.5 rounded-full border-2 border-ink" :class="locked ? 'bg-coral' : 'bg-grass'" />
          {{ locked ? '對戰中' : '等待中' }} · <b class="font-num">{{ roster.length }}/{{ MAX_PLAYERS_PER_TEAM * 2 }}</b>
        </span>
      </div>
      <div class="toon-panel flex items-center gap-2 rounded-full py-1 pl-4 pr-1">
        <span class="text-sm text-ink-soft">房號</span>
        <span class="font-num text-2xl font-extrabold tracking-[0.15em]">{{ roomCode }}</span>
        <button type="button" class="toon-btn rounded-full px-3 py-0.5 text-sm" @click="emit('copy-code')">
          {{ copied ? '已複製' : '複製' }}
        </button>
        <button type="button" class="toon-btn toon-btn--sky rounded-full px-3 py-0.5 text-sm" @click="emit('copy-link')">
          {{ copiedLink ? '已複製' : '邀請連結' }}
        </button>
      </div>
    </header>

    <div class="grid grid-cols-1 gap-5 lg:min-h-0 lg:flex-1 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
      <aside class="min-h-0 pt-4 lg:overflow-y-auto lg:pb-2">
        <TankHangarPodium
          :selected-tank-id="selectedTankId"
          :random="randomTank"
          :loadout-picks="loadoutPicks"
          :locked="locked"
          @select-tank="(id) => emit('select-tank', id)"
          @change-loadout="(p) => emit('change-loadout', p)"
        />
      </aside>

      <!-- 席次：兩隊並排，中間 VS -->
      <section class="toon-panel relative mt-4 flex min-h-0 flex-col p-4 pt-6 lg:mb-2">
        <span class="toon-ribbon absolute -top-4 left-4">隊伍</span>
        <div class="relative grid min-h-0 flex-1 grid-cols-2 gap-6">
          <div v-for="team in TEAMS" :key="team.id" class="flex min-h-0 flex-col gap-2">
            <div class="flex items-center justify-between">
              <span class="toon-pill px-3 text-base text-white" :style="{ background: team.color, textShadow: '0 2px 0 rgb(29 35 64 / .35)' }">
                {{ team.label }}
              </span>
              <span class="font-num text-lg font-extrabold text-ink-soft">{{ countOf(team.id) }}/{{ MAX_PLAYERS_PER_TEAM }}</span>
            </div>
            <ul class="flex min-h-0 flex-1 flex-col gap-2">
              <li v-for="(seat, i) in seatsOf(team.id)" :key="`${team.id}-${i}`" class="flex-1">
                <div
                  v-if="seat"
                  class="flex h-full min-h-[60px] flex-col justify-center gap-1 rounded-2xl border-[3px] border-ink bg-paper px-2 py-1"
                  :class="seat.id === localPlayerId ? 'seat-me' : ''"
                >
                  <span class="flex items-center gap-1.5">
                    <span
                      class="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg border-[2.5px] border-ink"
                      :style="{ background: team.color }"
                      :title="tankLabel(seat)"
                    >
                      <span v-if="seat.randomTank" class="toon-mystery h-6 text-base">?</span>
                      <img v-else :src="hullUrl(seat)" alt="" class="h-5 w-auto" :class="team.id === 'B' ? '-scale-x-100' : ''" />
                    </span>
                    <span
                      class="toon-pill ml-auto shrink-0 px-1.5 text-[11px]"
                      :class="seat.isHost ? 'bg-sun' : seat.ready ? 'bg-grass' : 'bg-mist text-ink-soft'"
                    >
                      {{ seat.isHost ? '房主' : seat.ready ? '準備好' : '整備中' }}
                    </span>
                  </span>
                  <span class="truncate text-base leading-tight">{{ seat.name }}</span>
                </div>
                <button
                  v-else
                  type="button"
                  :disabled="locked || localTeam === team.id"
                  class="empty-seat flex h-full min-h-[52px] w-full items-center justify-center rounded-2xl border-[3px] border-dashed text-sm"
                  :style="{ '--team': team.color }"
                  @click="sitAt(team.id)"
                >
                  {{ localTeam === team.id ? '空位' : `＋ 換到${team.label}` }}
                </button>
              </li>
            </ul>
          </div>
          <span
            class="font-num pointer-events-none absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-ink bg-sun text-lg font-extrabold shadow-[0_3px_0_var(--color-ink)]"
          >
            VS
          </span>
        </div>
      </section>

      <!-- 戰場與開打 -->
      <section class="toon-panel relative mt-4 flex flex-col gap-3 p-4 pt-6 lg:mb-2">
        <span class="toon-ribbon absolute -top-4 left-4" style="background: var(--color-grass); color: var(--color-ink); text-shadow: none">戰場</span>
        <MapPickerCard
          :map-id="selectedMapId"
          :editable="canEditRoom"
          @select="(id) => emit('select-map', id)"
          @open-gallery="emit('open-gallery')"
        />
        <div class="space-y-1.5">
          <span class="text-sm">有人斷線時</span>
          <div class="toon-segment text-sm">
            <button type="button" :disabled="!canEditRoom" :aria-pressed="disconnectPolicy === 'forfeit'" @click="setPolicy('forfeit')">算他陣亡</button>
            <button type="button" :disabled="!canEditRoom" :aria-pressed="disconnectPolicy === 'bot'" @click="setPolicy('bot')">電腦接手</button>
          </div>
        </div>

        <div class="mt-auto space-y-2 pt-2">
          <button
            v-if="isHost"
            type="button"
            :disabled="!canStart"
            class="toon-btn toon-btn--sun w-full py-3 text-2xl"
            @click="emit('start')"
          >
            開打！
          </button>
          <button
            v-else
            type="button"
            class="toon-btn w-full py-3 text-2xl"
            :class="localReady ? 'toon-btn--grass' : 'toon-btn--sun'"
            @click="emit('toggle-ready')"
          >
            {{ localReady ? '✓ 準備好了' : '準備' }}
          </button>
          <p class="text-center text-sm text-ink-soft">{{ hint }}</p>
        </div>

        <div
          v-if="errorMessage"
          class="flex items-center justify-between gap-2 rounded-xl border-[3px] border-ink bg-coral px-3 py-1.5 text-sm text-white"
        >
          <span>{{ errorMessage }}</span>
          <button type="button" class="shrink-0 underline cursor-pointer" @click="emit('dismiss-error')">關閉</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.seat-me {
  background: #fffbe0;
  box-shadow: 0 0 0 3px var(--color-sun), 0 4px 0 3px var(--color-ink);
}
.empty-seat {
  border-color: rgb(29 35 64 / 0.25);
  color: rgb(29 35 64 / 0.4);
  background: rgb(255 255 255 / 0.4);
  cursor: pointer;
  transition: all 0.12s ease;
}
.empty-seat:hover:not(:disabled) {
  border-color: var(--team);
  color: var(--color-ink);
  background: #fff;
}
.empty-seat:disabled {
  cursor: default;
}
</style>
