/**
 * 風速變化規則：風像天氣一樣緩慢漂移，並由「隱藏天氣」決定這一陣子風好不好變。
 * - 每 WIND_ERA_TURNS 個回合為一個天氣期，由 (seed, 期編號) 抽出一種天氣與趨勢（偏增強或偏減弱）。天氣不顯示給玩家，只能從風的變化自己體會。
 * - 每個回合的風速增量從該天氣的 10 格機率表抽出（單位：順著趨勢為正）：
 *     calm（無風穩定，權重 3）：八成不變，偶爾 ±1。
 *     breezy（微風，權重 4）：五成不變，最多 ±1，偏順趨勢。
 *     gusty（陣風，權重 2）：三成不變，偶爾一次 ±2。
 * - 風速夾在 ±maxWind；開局一律無風（initialWind = 0）。
 * - 隨機只由 (對局 seed, 回合編號) 決定，P2P 兩端各自計算會得到相同結果。
 */
export const WIND_ERA_TURNS = 10

type Weather = 'calm' | 'breezy' | 'gusty'

const WEATHER_BAG: readonly Weather[] = ['calm', 'calm', 'calm', 'breezy', 'breezy', 'breezy', 'breezy', 'gusty', 'gusty']

/** 每種天氣的 10 格增量表（順著趨勢為正） */
const WEATHER_DELTAS: Record<Weather, readonly number[]> = {
  calm: [0, 0, 0, 0, 0, 0, 0, 0, 1, -1],
  breezy: [0, 0, 0, 0, 0, 1, 1, 1, -1, -1],
  gusty: [0, 0, 0, 1, 1, 1, 2, -1, -1, -2],
}

function hash32(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  h = Math.imul(h, 0x297a2d39)
  h ^= h >>> 15
  return h >>> 0
}

/** 這個回合所屬天氣期的隱藏天氣與趨勢方向 */
function weatherOf(seed: number, turnId: number): { weather: Weather; trend: 1 | -1 } {
  const era = Math.floor((turnId - 1) / WIND_ERA_TURNS)
  const h = hash32(seed, era + 0x51ed)
  return { weather: WEATHER_BAG[h % WEATHER_BAG.length], trend: (h >>> 8) % 2 === 0 ? 1 : -1 }
}

/** 回傳進入 nextTurnId 回合時的風速 */
export function nextWindSpeed(params: {
  seed: number
  nextTurnId: number
  currentWind: number
  maxWind: number
}): number {
  const { seed, nextTurnId, currentWind, maxWind } = params
  const { weather, trend } = weatherOf(seed, nextTurnId)
  const delta = WEATHER_DELTAS[weather][hash32(seed, nextTurnId) % 10] * trend
  return Math.max(-maxWind, Math.min(maxWind, currentWind + delta))
}
