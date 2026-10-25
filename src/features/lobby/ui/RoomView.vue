<script setup lang="ts">
import { computed } from 'vue'
import { getTankSpec } from '@/features/battle'
import { soundController } from '@/features/audio'
import { GameButton, IconGlyph } from '@/shared/ui'
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
import MapTicket from './room/MapTicket.vue'
import RoomShell from './room/RoomShell.vue'
import SeatRing from './room/SeatRing.vue'
import TankStand from './room/TankStand.vue'
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
  return getTankSpec(slot.tankId).getSprites(slot.team).iconUrl
}

function tankLabel(slot: RosterSlot): string {
  if (slot.randomTank) return '隨機'
  return splitDisplayName(getTankSpec(slot.tankId).name).zh
}

function stateOf(seat: RosterSlot): 'host' | 'ready' | 'occupied' {
  return seat.isHost ? 'host' : seat.ready ? 'ready' : 'occupied'
}

function sitAt(team: TeamId): void {
  if (props.locked || localTeam.value === team) return
  emit('switch-team', team)
}

const hint = computed(() => {
  if (!props.isHost) return props.localReady ? '等房主開打…' : '選好戰車後按「準備」'
  if (props.canStart) return `${countOf('A')} 對 ${countOf('B')}，可以開打了！`
  return props.allGuestsReady ? '兩隊都至少要有 1 人' : '等所有人按下準備'
})
</script>

<template>
  <RoomShell :title="roomTitle" @back="emit('leave')">
    <template #header-right>
      <span class="status hidden items-center gap-1 text-xs sm:flex phone:flex">
        <i class="h-2.5 w-2.5 rounded-full" :class="locked ? 'bg-coral' : 'bg-grass'" />
        {{ locked ? '對戰中' : '等待中' }} · <b class="font-num">{{ roster.length }}/{{ MAX_PLAYERS_PER_TEAM * 2 }}</b>
      </span>
      <div class="code flex items-center gap-1.5">
        <span class="font-num text-lg font-extrabold tracking-[0.15em] phone:text-base">{{ roomCode }}</span>
        <GameButton variant="white" round :style="{ '--gb-size': '36px' }" :aria-label="copied ? '已複製房號' : '複製房號'" title="複製房號" @click="emit('copy-code')">
          <IconGlyph :name="copied ? 'check' : 'copy'" :size="18" />
        </GameButton>
        <GameButton variant="sky" round :style="{ '--gb-size': '36px' }" :aria-label="copiedLink ? '已複製邀請連結' : '複製邀請連結'" title="複製邀請連結" @click="emit('copy-link')">
          <IconGlyph :name="copiedLink ? 'check' : 'link'" :size="18" />
        </GameButton>
      </div>
    </template>

    <template #stand>
      <TankStand
        :selected-tank-id="selectedTankId"
        :random="randomTank"
        :loadout-picks="loadoutPicks"
        :locked="locked"
        @select-tank="(c) => emit('select-tank', c)"
        @change-loadout="(p) => emit('change-loadout', p)"
      />
    </template>

    <template #seats>
      <div class="teams flex h-full flex-col justify-center gap-3 phone:gap-1.5">
        <div v-for="(team, ti) in TEAMS" :key="team.id" class="team">
          <div class="mb-1 flex items-center gap-2">
            <span class="pill text-sm text-white" :style="{ background: team.color }">{{ team.label }}</span>
            <span class="font-num text-sm font-extrabold">{{ countOf(team.id) }}/{{ MAX_PLAYERS_PER_TEAM }}</span>
            <span v-if="ti === 0" class="vs font-num ml-auto">VS</span>
          </div>
          <ul class="flex justify-between gap-1">
            <li v-for="(seat, i) in seatsOf(team.id)" :key="`${team.id}-${i}`">
              <SeatRing
                v-if="seat"
                :state="stateOf(seat)"
                :team="team.id"
                :color="team.color"
                :hull-url="seat.randomTank ? null : hullUrl(seat)"
                :mystery="seat.randomTank"
                :mirror="team.id === 'B'"
                :name="seat.name"
                :mine="seat.id === localPlayerId"
                :title="tankLabel(seat)"
                disabled
              />
              <SeatRing
                v-else
                state="empty"
                :team="team.id"
                :color="team.color"
                :name="localTeam === team.id ? '空位' : '換到這'"
                :disabled="locked || localTeam === team.id"
                @click="sitAt(team.id)"
              />
            </li>
          </ul>
        </div>
      </div>
    </template>

    <template #side>
      <div class="side flex min-h-full flex-col gap-2">
        <MapTicket :map-id="selectedMapId" :editable="canEditRoom" @select="(id) => emit('select-map', id)" @open-gallery="emit('open-gallery')" />

        <div class="flex items-center gap-2 text-xs">
          <span class="shrink-0">有人斷線時</span>
          <GameButton :variant="disconnectPolicy === 'forfeit' ? 'gold' : 'white'" :disabled="!canEditRoom" class="flex-1 text-sm" @click="emit('select-policy', 'forfeit')">算陣亡</GameButton>
          <GameButton :variant="disconnectPolicy === 'bot' ? 'gold' : 'white'" :disabled="!canEditRoom" class="flex-1 text-sm" @click="emit('select-policy', 'bot')">電腦接手</GameButton>
        </div>

        <div class="mt-auto flex flex-col gap-1">
          <GameButton v-if="isHost" variant="gold" :disabled="!canStart" class="cta w-full text-2xl" @click="emit('start')">
            <IconGlyph name="shell" :size="28" /> 開打！
          </GameButton>
          <GameButton v-else :variant="localReady ? 'sky' : 'gold'" class="cta w-full text-2xl" @click="emit('toggle-ready')">
            <IconGlyph v-if="localReady" name="check" :size="26" />{{ localReady ? '準備好了' : '準備' }}
          </GameButton>
          <p class="text-center text-xs text-ink/70">{{ hint }}</p>
        </div>

        <div v-if="errorMessage" class="error flex items-center justify-between gap-2 text-sm text-white">
          <span>{{ errorMessage }}</span>
          <button type="button" class="shrink-0 underline" @click="soundController.play('ui_click'); emit('dismiss-error')">關閉</button>
        </div>
      </div>
    </template>
  </RoomShell>
</template>

<style scoped>
.status, .code {
  padding: 2px 10px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.88);
  box-shadow: 0 3px 0 rgb(29 35 64 / 0.4), inset 0 0 0 2px var(--color-ink);
}
.code { padding: 2px 4px 2px 12px; }
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
.error { padding: 6px 12px; border-radius: 12px; background: var(--color-coral); box-shadow: inset 0 0 0 2px var(--color-ink); }
</style>
