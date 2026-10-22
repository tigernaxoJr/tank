import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { initTankCoreWasm } from './shared/wasm'

// 背景預載入 Rust Wasm 物理核心（未完成或失敗時自動使用 TS 確定性核心）
void initTankCoreWasm()

createApp(App).mount('#app')

