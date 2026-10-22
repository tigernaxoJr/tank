/**
 * TS 確定性核心 ↔ Rust 核心（crates/tank-core）一致性黃金檔。
 * 以所有地圖 × 數個 seed 產生地形雜湊、地表取樣、挖坑後雜湊與彈道結果，寫入
 * crates/tank-core/tests/fixtures/golden.json；Rust 的 tests/parity.rs 讀同一份檔案逐項比對。
 * 改了 TS 核心的行為後執行 `UPDATE_GOLDEN=1 npm test` 重新產生，並跑 `npm run test:rust` 確認 Rust 跟上。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MAP_REGISTRY, terrainOptionsFor } from '@/features/battle/domain/mapRegistry'
import { DeterministicTankCore } from '@/shared/wasm'

const FIXTURE = fileURLToPath(new URL('../../crates/tank-core/tests/fixtures/golden.json', import.meta.url))
const SEEDS = [1024, 7, 31337]
const CARVES: [number, number, number][] = [[400, 300, 40], [900, 500, 25], [1200, 200, 60], [1500, 600, 90]]
const SHOTS = [
  { startX: 300, startY: 300, vxMilli: 9000, vyMilli: -8000, windMilli: 12, gravityMilli: 180 },
  { startX: 2000, startY: 250, vxMilli: -7000, vyMilli: -5000, windMilli: -25, gravityMilli: 145 },
  { startX: 600, startY: 400, vxMilli: 3000, vyMilli: -11000, windMilli: 0, gravityMilli: 150 },
]

function build() {
  const cases = []
  for (const [mapId, map] of Object.entries(MAP_REGISTRY)) {
    for (const seed of SEEDS) {
      const options = JSON.parse(JSON.stringify(terrainOptionsFor(map)))
      const core = new DeterministicTankCore()
      core.resetTerrain(seed, options)
      const xs = Array.from({ length: Math.ceil(core.width / 97) }, (_, i) => i * 97)
      const sample = (c: DeterministicTankCore) => ({
        hash: c.getStateHash(),
        surfaceY: xs.map((x) => c.surfaceY(x)),
        groundBelow: xs.map((x) => c.groundBelow(x, 300)),
        slope: xs.map((x) => c.surfaceSlopeDeg(x, 6)),
        slopeFrom: xs.map((x) => c.surfaceSlopeDeg(x, 6, 300)),
        material: xs.map((x) => c.materialAt(x, Math.min(core.height - 1, c.surfaceY(x) + 3))),
      })
      const fresh = sample(core)
      const carves = CARVES.map(([x, y, r]) => ({ x, y, r, rect: core.carveCircle(x, y, r) }))
      const carved = sample(core)
      const shots = SHOTS.map((s) => {
        const { path: _path, ...hit } = core.simulateShot({ ...s, maxSteps: 1200 })
        return { ...s, hit }
      })
      cases.push({ mapId, seed, width: core.width, height: core.height, options, fresh, carves, carved, shots })
    }
  }
  return { cases }
}

describe('TS ↔ Rust 黃金檔', () => {
  it('黃金檔與目前 TS 核心輸出一致（改了核心請 UPDATE_GOLDEN=1 重新產生）', () => {
    const golden = build()
    if (process.env.UPDATE_GOLDEN) {
      writeFileSync(FIXTURE, JSON.stringify(golden))
      return
    }
    expect(JSON.parse(readFileSync(FIXTURE, 'utf-8'))).toEqual(JSON.parse(JSON.stringify(golden)))
  })
})
