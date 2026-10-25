<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { soundController } from '@/features/audio'
import GameButton from './GameButton.vue'
import IconGlyph from './IconGlyph.vue'
import UiPanel from './UiPanel.vue'

/**
 * 彈窗外殼：深色遮罩 + 面板 + 標題列（右上關閉鈕）+ 可捲動內容 + 選用的底部按鈕列。
 * 手機橫放（高度很矮）時面板邊框與間距自動縮小；Esc 或點遮罩關閉。
 */
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    size?: 'sm' | 'md' | 'lg'
    /** 疊在別的彈窗上時調高 */
    z?: number
  }>(),
  { size: 'md', z: 50 },
)
const emit = defineEmits<{ (e: 'close'): void }>()

function close(): void {
  try {
    soundController.play('ui_click')
  } catch {
    // 沒有聲音不影響關閉
  }
  emit('close')
}

function onKeydown(e: KeyboardEvent): void {
  if (props.open && e.key === 'Escape') close()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="modal fixed inset-0 flex items-center justify-center bg-ink/50 font-toon text-ink"
        :style="{ zIndex: z }"
        @click.self="close"
      >
        <UiPanel class="sheet flex flex-col" :class="`sheet--${size}`" role="dialog" :aria-label="title">
          <div class="head flex items-center gap-2">
            <h2 class="min-w-0 flex-1 truncate font-num text-xl font-extrabold">{{ title }}</h2>
            <GameButton variant="white" round aria-label="關閉" @click="close"><IconGlyph name="close" :size="20" /></GameButton>
          </div>
          <div class="body min-h-0 flex-1 overflow-y-auto"><slot /></div>
          <div v-if="$slots.footer" class="foot"><slot name="footer" /></div>
        </UiPanel>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal { padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); }
.sheet { width: 100%; max-height: 100%; --panel-edge: 18px; }
.sheet--sm { max-width: 380px; }
.sheet--md { max-width: 680px; }
.sheet--lg { max-width: 980px; }
.head { padding-bottom: 6px; }
.body { scrollbar-width: thin; padding: 2px; }
.foot { padding-top: 8px; }
/* 手機橫放：面板邊框與間距縮小，把高度留給內容 */
@media (max-height: 540px) and (orientation: landscape) {
  .modal { padding-top: 6px; padding-bottom: 6px; }
  .sheet { --panel-edge: 12px; }
  .head h2 { font-size: 1rem; }
}
.modal-enter-active, .modal-leave-active { transition: opacity 0.15s ease; }
.modal-enter-active .sheet { animation: pop 0.2s cubic-bezier(0.2, 1.4, 0.4, 1); }
.modal-enter-from, .modal-leave-to { opacity: 0; }
@keyframes pop { from { transform: scale(0.92); } to { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .modal-enter-active .sheet { animation: none; } }
</style>
