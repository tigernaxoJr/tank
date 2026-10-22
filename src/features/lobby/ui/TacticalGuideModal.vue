<script setup lang="ts">
/**
 * 作戰手冊：大廳「?」鈕打開的玩法說明。卡通粗描邊風格，與大廳其他彈窗一致；
 * 內容要跟著實際操作同步（docs/06 的蓄力、回合、爬坡規則）。
 */
defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const CONTROLS = [
  { keys: ['←', '→'], text: '移動戰車（耗燃料，按住連續走）' },
  { keys: ['↑', '↓'], text: '抬高 / 壓低砲管' },
  { keys: ['Space'], text: '按住蓄力、放開發射；蓄到 100 就停住' },
  { keys: ['Esc'], text: '蓄力中取消，不開火' },
  { keys: ['1', '2'], text: '切換主彈 / 副彈' },
  { keys: ['P'], text: '跳過這一回合' },
]
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 font-toon text-ink"
      @click.self="emit('close')"
    >
      <div class="toon-panel pop relative flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col p-5 pt-8">
        <span class="toon-ribbon absolute -top-5 left-1/2 -translate-x-1/2 px-6 text-xl">作戰手冊</span>
        <button
          type="button"
          aria-label="關閉"
          class="toon-btn absolute right-3 top-3 h-9 w-9 rounded-full p-0"
          @click="emit('close')"
        >
          <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <p class="font-num text-center text-sm tracking-[0.25em] text-ink-soft">FIELD MANUAL</p>

        <div class="mt-3 grid min-h-0 grid-cols-1 gap-3 overflow-y-auto pb-1 sm:grid-cols-2">
          <!-- 操作 -->
          <section class="manual-card sm:col-span-2" style="--accent: var(--color-sun)">
            <h4 class="manual-head">
              <span class="manual-dot">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="7" width="18" height="11" rx="3" /><path d="M7 12h3M8.5 10.5v3M15 11h.01M17 13h.01" />
                </svg>
              </span>
              操作
            </h4>
            <ul class="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              <li v-for="c in CONTROLS" :key="c.text" class="flex items-center gap-2 text-sm">
                <span class="flex shrink-0 gap-1">
                  <kbd v-for="k in c.keys" :key="k">{{ k }}</kbd>
                </span>
                <span>{{ c.text }}</span>
              </li>
            </ul>
            <p class="mt-2.5 text-sm text-ink-soft">畫面上的按鈕也能操作：移動、仰角鈕可按住不放；力道條可以直接點擊或拖曳。</p>
          </section>

          <!-- 回合 -->
          <section class="manual-card" style="--accent: var(--color-coral)">
            <h4 class="manual-head">
              <span class="manual-dot">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 3h5" />
                </svg>
              </span>
              回合
            </h4>
            <ul class="manual-list">
              <li>每回合 <b class="font-num">15</b> 秒，時間到自動跳過。</li>
              <li>駕駛艙預設顯示「我的坦克」，可切換成「回合坦克」看正在出手的人。</li>
              <li>上一發的力道會在力道條上留一根標記，方便微調。</li>
            </ul>
          </section>

          <!-- 風與地形 -->
          <section class="manual-card" style="--accent: var(--color-sky)">
            <h4 class="manual-head">
              <span class="manual-dot">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7" />
                </svg>
              </span>
              風與地形
            </h4>
            <ul class="manual-list">
              <li>頂部風向牌：箭頭越多風越強，順風打得遠、逆風打得近。</li>
              <li>小土丘、彈坑邊可以直接爬過去；大片陡坡和高牆會擋路。</li>
              <li>從高處摔下會扣血；浮空地圖下方是深淵，掉下去直接陣亡。</li>
            </ul>
          </section>

          <!-- 連線 -->
          <section class="manual-card sm:col-span-2" style="--accent: var(--color-grass)">
            <h4 class="manual-head">
              <span class="manual-dot">
                <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="m8.2 10.9 7.6-3.8M8.2 13.1l7.6 3.8" />
                </svg>
              </span>
              找朋友連線
            </h4>
            <p class="text-sm leading-relaxed">
              支援 1 對 1 到 5 對 5。開新戰局後把<b>房號</b>或<b>邀請連結</b>傳給朋友，大家按下「準備」，房主就能開打。
            </p>
          </section>
        </div>

        <button type="button" class="toon-btn toon-btn--sun mt-4 w-full py-2.5 text-xl" @click="emit('close')">
          知道了，開打！
        </button>
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

.manual-card {
  border: 3px solid var(--color-ink);
  border-radius: 18px;
  background: var(--color-paper);
  padding: 0.75rem 0.9rem 0.85rem;
  box-shadow: inset 0 5px 0 var(--accent);
}
.manual-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.15rem 0 0.6rem;
  font-size: 1.05rem;
}
.manual-dot {
  display: inline-flex;
  height: 1.75rem;
  width: 1.75rem;
  align-items: center;
  justify-content: center;
  border: 2.5px solid var(--color-ink);
  border-radius: 999px;
  background: var(--accent);
}
.manual-list {
  display: grid;
  gap: 0.4rem;
  font-size: 0.875rem;
  line-height: 1.5;
}
.manual-list li {
  position: relative;
  padding-left: 0.9rem;
}
.manual-list li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.55em;
  height: 0.4rem;
  width: 0.4rem;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 0 1.5px var(--color-ink);
}

kbd {
  display: inline-flex;
  min-width: 1.6rem;
  justify-content: center;
  padding: 0 0.35rem;
  border: 2px solid var(--color-ink);
  border-radius: 7px;
  background: var(--color-cream);
  box-shadow: 0 2px 0 var(--color-ink);
  font-family: var(--font-num);
  font-size: 0.8rem;
  line-height: 1.4;
}
</style>
