import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { initTankCoreWasm } from './shared/wasm'
import { registerSW } from 'virtual:pwa-register'

// 背景預載入 Rust Wasm 物理核心（未完成或失敗時自動使用 TS 確定性核心）
void initTankCoreWasm()

createApp(App).mount('#app')

// 開啟畫面：字型與第一個畫面就緒後淡出
const splash = document.getElementById('boot-splash')
if (splash) {
  void document.fonts.ready.then(() => {
    splash.classList.add('is-done')
    setTimeout(() => splash.remove(), 400)
  })
}

// PWA：有新版就自動更新（registerType: 'autoUpdate'）
registerSW({ immediate: true })

// 安裝成 App（全螢幕）時鎖定橫向；瀏覽器分頁裡不支援就略過，改由直拿提示（index.html #rotate-hint）處理
const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
if (window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) {
  orientation.lock?.('landscape').catch(() => {})
}

