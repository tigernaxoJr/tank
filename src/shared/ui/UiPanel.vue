<script setup lang="ts">
import { uiUrl } from './uiAssets'
const bg = `url(${uiUrl('ui_kit', 'panel')})`
</script>

<template>
  <div class="ui-panel font-toon" :style="{ '--panel-img': bg }"><slot /></div>
</template>

<style scoped>
.ui-panel {
  border: var(--panel-edge, 20px) solid transparent;
  border-image: var(--panel-img) 40 fill / var(--panel-edge, 20px) stretch;
  color: var(--color-ink);
  filter: drop-shadow(0 4px 0 rgb(29 35 64 / 0.4));
  box-sizing: border-box;
}
</style>
