import { soundController, type SoundEffect } from '@/features/audio'

export type BattleSoundEvent = SoundEffect

type BattleSoundListener = (event: BattleSoundEvent) => void
const soundListeners = new Set<BattleSoundListener>()

/**
 * 監聽戰鬥音效領域事件
 */
export function onBattleSound(listener: BattleSoundListener): () => void {
  soundListeners.add(listener)
  return () => soundListeners.delete(listener)
}

/**
 * 發布戰鬥音效事件，解除 UI / 引擎與音效控制器的直接依賴
 */
export function emitBattleSound(event: BattleSoundEvent): void {
  for (const listener of soundListeners) {
    listener(event)
  }
}

/**
 * 建立音效控制器轉接橋（在戰場生命週期啟動時呼叫一次）
 */
export function setupBattleSoundBridge(): () => void {
  return onBattleSound((event) => {
    soundController.play(event)
  })
}
