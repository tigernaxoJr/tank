<script setup lang="ts">
defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
      @click.self="emit('close')"
    >
      <div
        class="relative w-full max-w-xl rounded-3xl border-2 border-amber-400/50 bg-slate-900/95 p-6 shadow-2xl text-slate-100 space-y-4"
      >
        <div class="flex items-center justify-between border-b border-slate-700/80 pb-3">
          <div class="flex items-center gap-2">
            <span class="text-xl">🎮</span>
            <h3 class="text-base font-black text-white">砲擊空戰作戰手冊 (FIELD MANUAL)</h3>
          </div>
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
            @click="emit('close')"
          >
            ✕
          </button>
        </div>

        <div class="space-y-3.5 text-xs text-slate-300">
          <div class="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3.5 space-y-2">
            <h4 class="font-black text-amber-300">⚡ 30 秒核心對戰指引</h4>
            <div class="grid grid-cols-2 gap-2 text-[11px]">
              <div class="flex items-center gap-2">
                <kbd class="rounded bg-amber-400 px-2 py-0.5 font-mono font-black text-slate-950">← / →</kbd>
                <span>水平行駛坦克（消耗燃油）</span>
              </div>
              <div class="flex items-center gap-2">
                <kbd class="rounded bg-amber-400 px-2 py-0.5 font-mono font-black text-slate-950">↑ / ↓</kbd>
                <span>微調砲管仰角發射角度</span>
              </div>
              <div class="flex items-center gap-2">
                <kbd class="rounded bg-amber-400 px-2 py-0.5 font-mono font-black text-slate-950">SPACE</kbd>
                <span>按住蓄力、放開開火</span>
              </div>
              <div class="flex items-center gap-2">
                <kbd class="rounded bg-amber-400 px-2 py-0.5 font-mono font-black text-slate-950">1 / 2</kbd>
                <span>即時切換主副彈藥</span>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-sky-400/30 bg-sky-500/10 p-3.5 space-y-2">
            <h4 class="font-black text-sky-300">🌪️ 風向與物理環境法則</h4>
            <ul class="list-disc list-inside space-y-1 text-[11px] text-slate-300 leading-relaxed">
              <li>上方 HUD 會顯示即時風速風向，順風將拉長射程、逆風會大幅縮減射程。</li>
              <li>不同砲彈與坦克的風敏感係數不同，高敏感重彈在強風圖需仰賴高仰角修正。</li>
              <li>部分懸空地圖下方為無底深淵（Abyss），將對手轟落深淵可造成致命陣亡。</li>
            </ul>
          </div>

          <div class="rounded-2xl border border-slate-700 bg-slate-800/60 p-3 text-[11px] space-y-1">
            <span class="font-black text-slate-200">🌐 多人對抗 (P2P 連線)</span>
            <p class="text-slate-400">
              支援 1v1 ~ 5v5 WebRTC 點對點連線。建立房間後可點擊「複製房號」或「邀請連結」發給好友，全員「準備完畢」後房主即可啟動出擊！
            </p>
          </div>
        </div>

        <button
          type="button"
          class="w-full rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 py-2.5 text-xs font-black text-slate-950 hover:from-amber-300 hover:to-orange-400 transition cursor-pointer"
          @click="emit('close')"
        >
          我已瞭解，準備開戰！
        </button>
      </div>
    </div>
  </Teleport>
</template>
