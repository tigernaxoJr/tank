<script setup lang="ts">
import { computed } from 'vue'
import { uiUrl, type UiIconName } from './uiAssets'

const props = withDefaults(defineProps<{ name: UiIconName; size?: number }>(), { size: 24 })
const src = computed(() => uiUrl('icons', props.name))
</script>

<template>
  <img :src="src" alt="" draggable="false" class="inline-block shrink-0 select-none object-contain" :style="{ width: `${size}px`, height: `${size}px` }" />
</template>
