/**
 * 風速變化規則：風像天氣一樣緩慢漂移，不是每回合重骰。
 * - 一個「風期」持續 max(WIND_MIN_HOLD_TURNS, 場上玩家數) 個回合，期間風速不變，讓玩家能依風修正並連續微調。
 * - 風期交界才變動：新風速 = 舊風速 + 隨機增量，增量限制在 ±ceil(maxWind / 4)，再夾回 ±maxWind。
 *   因此風向翻轉必須經過小風，不會從強順風瞬間變強逆風。
 * - 隨機增量只由 (對局 seed, 新回合編號) 決定，P2P 兩端各自計算會得到相同結果。
 * - 開局一律無風（initialWind = 0），之後漸漸起風。
 */
export const WIND_MIN_HOLD_TURNS = 3

function hash32(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39)
  h ^= h >>> 15
  return h >>> 0
}

/** 每個風期的回合數 */
export function windHoldTurns(playerCount: number): number {
  return Math.max(WIND_MIN_HOLD_TURNS, playerCount)
}

/** 回傳進入 nextTurnId 回合時的風速（沒到風期交界就維持原值） */
export function nextWindSpeed(params: {
  seed: number
  nextTurnId: number
  currentWind: number
  maxWind: number
  playerCount: number
}): number {
  const { seed, nextTurnId, currentWind, maxWind, playerCount } = params
  if ((nextTurnId - 1) % windHoldTurns(playerCount) !== 0) return currentWind
  const maxStep = Math.max(1, Math.ceil(maxWind / 4))
  const delta = (hash32(seed, nextTurnId) % (maxStep * 2 + 1)) - maxStep
  return Math.max(-maxWind, Math.min(maxWind, currentWind + delta))
}
