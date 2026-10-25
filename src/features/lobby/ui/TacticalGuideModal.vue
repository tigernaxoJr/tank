<script setup lang="ts">
/**
 * 作戰手冊：標題畫面「?」鈕打開的玩法說明。內容要跟著實際操作同步（docs/06 的蓄力、回合、爬坡規則；
 * 戰鬥 HUD 見 docs/07：發射環、仰角盤、燃料環、風向羅盤）。
 */
import { GameButton, IconGlyph, ModalSheet, type UiIconName } from '@/shared/ui'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const CONTROLS = [
  { keys: ['←', '→'], text: '移動戰車（耗燃料，按住連續走）' },
  { keys: ['↑', '↓'], text: '抬高 / 壓低砲管' },
  { keys: ['Space'], text: '按住蓄力、放開發射；蓄到 100 就停住' },
  { keys: ['Esc'], text: '蓄力中取消，不開火' },
  { keys: ['1', '2'], text: '切換主彈 / 副彈' },
  { keys: ['P'], text: '跳過這一回合' },
]

const SECTIONS: { icon: UiIconName; title: string; accent: string; items: string[] }[] = [
  {
    icon: 'clock',
    title: '回合',
    accent: 'var(--color-coral)',
    items: [
      '每回合 15 秒，時間到自動跳過；最後 3 秒計時環會變紅。',
      '左上的小卡預設顯示「我的坦克」，可切換成「回合」看正在出手的人。',
      '發射環上的黑色刻度是上一發的力道，方便微調。',
    ],
  },
  {
    icon: 'wind',
    title: '風與地形',
    accent: 'var(--color-sky)',
    items: [
      '右上風向羅盤：箭頭指向風吹的方向，越長風越強；順風打得遠、逆風打得近。',
      '小土丘、彈坑邊可以直接爬過去；大片陡坡和高牆會擋路。',
      '從高處摔下會扣血；浮空地圖下方是深淵，掉下去直接陣亡。',
    ],
  },
]
</script>

<template>
  <ModalSheet :open="open" title="作戰手冊" size="lg" @close="emit('close')">
    <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 phone:grid-cols-2 phone:gap-2">
      <section class="card sm:col-span-2 phone:col-span-2" style="--accent: var(--color-sun)">
        <h3 class="head"><span class="dot"><IconGlyph name="target" :size="16" /></span>操作</h3>
        <ul class="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 phone:grid-cols-2">
          <li v-for="c in CONTROLS" :key="c.text" class="flex items-center gap-2 text-sm">
            <span class="flex shrink-0 gap-1"><kbd v-for="k in c.keys" :key="k">{{ k }}</kbd></span>
            <span>{{ c.text }}</span>
          </li>
        </ul>
        <p class="mt-2 text-xs text-ink/70">觸控：左下 ◀ ▶ 移動、發射環左邊 ▲▼ 調仰角（都可按住連續）；按住右下發射環蓄力，放開發射。</p>
      </section>

      <section v-for="s in SECTIONS" :key="s.title" class="card" :style="{ '--accent': s.accent }">
        <h3 class="head"><span class="dot"><IconGlyph :name="s.icon" :size="16" /></span>{{ s.title }}</h3>
        <ul class="list">
          <li v-for="t in s.items" :key="t">{{ t }}</li>
        </ul>
      </section>

      <section class="card sm:col-span-2 phone:col-span-2" style="--accent: var(--color-grass)">
        <h3 class="head"><span class="dot"><IconGlyph name="link" :size="16" /></span>找朋友連線</h3>
        <p class="text-sm leading-relaxed">支援 1 對 1 到 5 對 5。開新戰局後把<b>房號</b>或<b>邀請連結</b>傳給朋友，大家按下「準備」，房主就能開打。</p>
      </section>
    </div>

    <template #footer>
      <GameButton variant="gold" class="w-full text-lg" @click="emit('close')">知道了，開打！</GameButton>
    </template>
  </ModalSheet>
</template>

<style scoped>
.card {
  border-radius: 16px;
  background: #fff;
  padding: 0.55rem 0.8rem 0.7rem;
  box-shadow: inset 0 0 0 2.5px var(--color-ink), inset 0 5px 0 var(--accent);
}
.head { display: flex; align-items: center; gap: 0.5rem; margin: 0.2rem 0 0.45rem; font-size: 1rem; }
.dot {
  display: inline-flex;
  height: 1.6rem;
  width: 1.6rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: inset 0 0 0 2px var(--color-ink);
}
.list { display: grid; gap: 0.35rem; font-size: 0.85rem; line-height: 1.45; }
.list li { position: relative; padding-left: 0.9rem; }
.list li::before {
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
  border-radius: 7px;
  background: var(--color-cream);
  box-shadow: 0 2px 0 var(--color-ink), inset 0 0 0 2px var(--color-ink);
  font-family: var(--font-num);
  font-size: 0.8rem;
  line-height: 1.4;
}
</style>
