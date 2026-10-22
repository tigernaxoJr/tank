<script setup lang="ts">
import type { DisconnectPolicy, MapPresetId } from '@/shared/kernel/types'
import MapPickerCard from './MapPickerCard.vue'

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
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 p-4 font-toon"
      @click.self="emit('cancel')"
    >
      <div class="toon-panel pop relative grid w-full max-w-3xl grid-cols-1 gap-5 p-5 pt-8 md:grid-cols-[1fr_1.1fr]">
        <span class="toon-ribbon absolute -top-5 left-1/2 -translate-x-1/2 px-6 text-xl" style="background: var(--color-sun); color: var(--color-ink); text-shadow: none">
          開新戰局
        </span>

        <div class="flex flex-col gap-4">
          <label class="block space-y-1.5">
            <span class="text-base">房間名稱</span>
            <input
              v-model="roomName"
              type="text"
              maxlength="24"
              :placeholder="`${captain} 的戰局`"
              class="toon-input w-full text-lg"
              @keyup.enter="emit('confirm')"
            />
          </label>

          <div class="space-y-1.5">
            <span class="text-base">有人斷線時</span>
            <div class="toon-segment text-sm">
              <button type="button" :aria-pressed="disconnectPolicy === 'forfeit'" @click="emit('select-policy', 'forfeit')">算他陣亡</button>
              <button type="button" :aria-pressed="disconnectPolicy === 'bot'" @click="emit('select-policy', 'bot')">電腦接手</button>
            </div>
          </div>

          <div class="flex items-center gap-2 rounded-xl bg-mist px-3 py-2 text-sm text-ink-soft">
            <span class="font-num text-lg font-extrabold text-ink">5v5</span>
            每隊最多 5 人；開房後把 6 碼房號傳給朋友。
          </div>

          <div class="mt-auto flex gap-3">
            <button type="button" class="toon-btn flex-1 py-2 text-lg" @click="emit('cancel')">取消</button>
            <button type="button" class="toon-btn toon-btn--sun flex-[2] py-2 text-xl" @click="emit('confirm')">開房！</button>
          </div>
        </div>

        <div class="space-y-1.5">
          <span class="text-base">戰場</span>
          <MapPickerCard
            :map-id="mapId"
            editable
            @select="(id) => emit('select-map', id)"
            @open-gallery="emit('open-gallery')"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pop {
  animation: pop 0.18s cubic-bezier(0.2, 1.4, 0.4, 1);
}
@keyframes pop {
  from { transform: scale(0.9); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
</style>
