import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTankCore,
  DeterministicTankCore,
  initTankCoreWasm,
  isWasmCoreReady,
  WasmTankCore,
} from '@/shared/wasm'

describe('WasmTankCore parity with DeterministicTankCore', () => {
  beforeAll(async () => {
    const ok = await initTankCoreWasm()
    expect(ok).toBe(true)
  })

  it('Wasm 核心初始化成功且 isWasmCoreReady 為 true', () => {
    expect(isWasmCoreReady()).toBe(true)
  })

  it('地形生成與 stateHash 與 TS 核心完全一致', () => {
    const seed = 2048
    const tsCore = new DeterministicTankCore(800, 500, seed)
    const wasmCore = new WasmTankCore(800, 500, seed)

    expect(wasmCore.getStateHash()).toBe(tsCore.getStateHash())
    expect(wasmCore.stateHash()).toBe(tsCore.stateHash())

    for (let x = 0; x < 800; x += 32) {
      expect(wasmCore.surfaceY(x)).toBe(tsCore.surfaceY(x))
      expect(wasmCore.groundBelow(x, 100)).toBe(tsCore.groundBelow(x, 100))
      expect(wasmCore.surfaceSlopeDeg(x, 5)).toBe(tsCore.surfaceSlopeDeg(x, 5))
    }
  })

  it('彈坑破壞 (carveCircle) 與破壞後雜湊一致', () => {
    const tsCore = new DeterministicTankCore(800, 500, 999)
    const wasmCore = new WasmTankCore(800, 500, 999)

    const tsRect = tsCore.carveCircle(400, 300, 45)
    const wasmRect = wasmCore.carveCircle(400, 300, 45)

    expect(wasmRect).toEqual(tsRect)
    expect(wasmCore.getStateHash()).toBe(tsCore.getStateHash())
  })

  it('千分位定點數模擬彈道 (simulateShot) 命中結果完全一致', () => {
    const tsCore = new DeterministicTankCore(800, 500, 777)
    const wasmCore = new WasmTankCore(800, 500, 777)

    const startX = 100
    const startY = tsCore.surfaceY(100) - 15
    const vx = 45000
    const vy = -38000
    const wind = 500
    const gravity = 980

    const shotParams = { startX, startY, vxMilli: vx, vyMilli: vy, windMilli: wind, gravityMilli: gravity }
    const tsHit = tsCore.simulateShot(shotParams)
    const wasmHit = wasmCore.simulateShot(shotParams)

    expect(wasmHit.hitX).toBe(tsHit.hitX)
    expect(wasmHit.hitY).toBe(tsHit.hitY)
    expect(wasmHit.impactedTerrain).toBe(tsHit.impactedTerrain)
    expect(wasmHit.hitTank).toBe(tsHit.hitTank)
    expect(wasmHit.stepsTaken).toBe(tsHit.stepsTaken)
    expect(wasmHit.path).toEqual(tsHit.path)
  })

  it('爆炸傷害計算 (computeExplosionDamage) 一致', () => {
    const tsCore = new DeterministicTankCore(800, 500, 100)
    const wasmCore = new WasmTankCore(800, 500, 100)

    const points = [
      { ex: 100, ey: 100, tx: 100, ty: 100, r: 50, dmg: 100 },
      { ex: 100, ey: 100, tx: 120, ty: 110, r: 50, dmg: 100 },
      { ex: 100, ey: 100, tx: 200, ty: 200, r: 50, dmg: 100 },
    ]

    for (const p of points) {
      expect(wasmCore.computeExplosionDamage(p.ex, p.ey, p.tx, p.ty, p.r, p.dmg)).toBe(
        tsCore.computeExplosionDamage(p.ex, p.ey, p.tx, p.ty, p.r, p.dmg),
      )
    }
  })

  it('工廠函式 createTankCore 回傳 Wasm 核心實例', () => {
    const core = createTankCore(400, 300, 123)
    expect(core).toBeInstanceOf(WasmTankCore)
  })
})
