<script setup lang="ts">
import { computed } from 'vue'
import { soundController } from '@/features/audio'
import { uiUrl } from './uiAssets'

type Variant = 'gold' | 'white' | 'coral' | 'sky'

const props = withDefaults(defineProps<{ variant?: Variant; disabled?: boolean; round?: boolean }>(), { variant: 'gold' })
const emit = defineEmits<{ (e: 'click', ev: MouseEvent): void }>()

const style = computed(() => {
  // 只有金 / 白有專屬停用圖，其餘借用金色停用圖
  const off = props.variant === 'white' ? 'btn_white_disabled' : 'btn_gold_disabled'
  return {
    '--gb-img': `url(${uiUrl('ui_kit', `btn_${props.variant}`)})`,
    '--gb-img-down': `url(${uiUrl('ui_kit', `btn_${props.variant}_pressed`)})`,
    '--gb-img-off': `url(${uiUrl('ui_kit', off)})`,
  }
})

function onClick(ev: MouseEvent): void {
  if (props.disabled) return
  // 先送出事件再播音效：音效初始化失敗（瀏覽器尚未允許音訊）不能吃掉第一下點擊
  emit('click', ev)
  try {
    soundController.play('ui_click')
  } catch {
    // 沒有聲音不影響操作
  }
}
</script>

<template>
  <button
    type="button"
    class="game-btn font-toon"
    :class="[`game-btn--${variant}`, round ? 'game-btn--round' : '']"
    :style="style"
    :disabled="disabled"
    @click="onClick"
  >
    <slot />
  </button>
</template>

<style scoped>
/* 9-slice：來源圖角半徑約 36px，縮成 14px 邊框（border-box，含邊框最小高 48px 才好點） */
.game-btn {
  --gb-edge: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 48px;
  min-width: 48px;
  padding: 0 2px;
  white-space: nowrap;
  border: var(--gb-edge) solid transparent;
  border-image: var(--gb-img) 38 fill / var(--gb-edge) stretch;
  background: none;
  color: var(--color-ink);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  filter: drop-shadow(0 3px 0 rgb(29 35 64 / 0.55));
  transition: transform 0.07s ease, filter 0.07s ease;
  box-sizing: border-box;
}
.game-btn--coral, .game-btn--sky { color: #fff; text-shadow: 0 2px 0 rgb(29 35 64 / 0.45); }
.game-btn:hover:not(:disabled) { transform: translateY(-1px); }
.game-btn:active:not(:disabled) {
  border-image-source: var(--gb-img-down);
  transform: translateY(3px);
  filter: drop-shadow(0 0 0 transparent);
}
.game-btn:disabled {
  border-image-source: var(--gb-img-off);
  color: #6f7a96;
  text-shadow: none;
  cursor: not-allowed;
}
/* 圓形：只留圖示，寬高相等 */
.game-btn--round {
  --gb-edge: min(14px, calc(var(--gb-size, 48px) * 0.28));
  box-sizing: border-box;
  padding: 0;
  width: var(--gb-size, 48px);
  height: var(--gb-size, 48px);
  min-width: 0;
  min-height: 0;
}
</style>
