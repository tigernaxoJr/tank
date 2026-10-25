<script setup lang="ts">
import { GameButton, IconGlyph, ModalSheet } from '@/shared/ui'
import type { DisconnectPolicy, MapPresetId } from '@/shared/kernel/types'
import MapTicket from './room/MapTicket.vue'

defineProps<{
  open: boolean
  mapId: MapPresetId
  disconnectPolicy: DisconnectPolicy
  captain: string
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
  (e: 'select-map', mapId: MapPresetId): void
  (e: 'select-policy', policy: DisconnectPolicy): void
  (e: 'open-gallery'): void
}>()

const roomName = defineModel<string>('roomName', { required: true })
</script>

<template>
  <ModalSheet :open="open" title="開新戰局" size="md" :z="40" @close="emit('cancel')">
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.1fr] phone:grid-cols-[1fr_1.1fr]">
      <div class="flex flex-col gap-2.5">
        <label class="block space-y-1">
          <span class="text-sm">房間名稱</span>
          <input
            v-model="roomName"
            type="text"
            maxlength="24"
            :placeholder="`${captain} 的戰局`"
            class="name-input w-full text-base"
            @keyup.enter="emit('confirm')"
          />
        </label>

        <div class="space-y-1">
          <span class="text-sm">有人斷線時</span>
          <div class="flex gap-2">
            <GameButton :variant="disconnectPolicy === 'forfeit' ? 'gold' : 'white'" class="flex-1 text-sm" @click="emit('select-policy', 'forfeit')">算他陣亡</GameButton>
            <GameButton :variant="disconnectPolicy === 'bot' ? 'gold' : 'white'" class="flex-1 text-sm" @click="emit('select-policy', 'bot')">電腦接手</GameButton>
          </div>
        </div>

        <p class="note text-xs text-ink/70"><b class="font-num text-base text-ink">5v5</b> 每隊最多 5 人；開房後把 6 碼房號傳給朋友。</p>
      </div>

      <div class="space-y-1">
        <span class="text-sm">戰場</span>
        <MapTicket :map-id="mapId" editable @select="(id) => emit('select-map', id)" @open-gallery="emit('open-gallery')" />
      </div>
    </div>

    <template #footer>
      <div class="flex gap-3">
        <GameButton variant="white" class="flex-1" @click="emit('cancel')">取消</GameButton>
        <GameButton variant="gold" class="flex-[2] text-xl" @click="emit('confirm')"><IconGlyph name="shell" :size="24" /> 開房！</GameButton>
      </div>
    </template>
  </ModalSheet>
</template>

<style scoped>
.name-input {
  padding: 0.35rem 0.75rem;
  border-radius: 12px;
  border: 3px solid var(--color-ink);
  background: #fff;
  outline: none;
}
.name-input:focus { border-color: var(--color-sky-deep); }
.note { padding: 6px 10px; border-radius: 12px; background: rgb(232 243 255 / 0.9); }
</style>
