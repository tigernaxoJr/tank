import { describe, expect, it } from 'vitest'
import { DeterministicRng, DeterministicTankCore } from '@/shared/wasm'

describe('DeterministicRng', () => {
  it('同 seed 產生相同序列，不同 seed 不同', () => {
    const a = new DeterministicRng(42)
    const b = new DeterministicRng(42)
    const seqA = Array.from({ length: 20 }, () => a.nextU32())
    expect(seqA).toEqual(Array.from({ length: 20 }, () => b.nextU32()))
    expect(seqA).not.toEqual(Array.from({ length: 20 }, ((r) => () => r.nextU32())(new DeterministicRng(43))))
  })
  it('nextRange 落在區間內', () => {
    const r = new DeterministicRng(7)
    for (let i = 0; i < 500; i++) {
      const v = r.nextRange(-5, 5)
      expect(v).toBeGreaterThanOrEqual(-5)
      expect(v).toBeLessThanOrEqual(5)
    }
  })
})

describe('DeterministicTankCore', () => {
  it('同 seed 地形雜湊相同', () => {
    expect(new DeterministicTankCore(800, 500, 9).getStateHash()).toBe(new DeterministicTankCore(800, 500, 9).getStateHash())
  })
  it('carveCircle 挖空地形並改變雜湊，重建 + 重放得到同一雜湊', () => {
    const a = new DeterministicTankCore(800, 500, 9)
    const b = new DeterministicTankCore(800, 500, 9)
    const x = 400
    const y = a.surfaceY(x) + 5
    const before = a.getStateHash()
    expect(a.isSolid(x, y)).toBe(true)
    a.carveCircle(x, y, 30)
    expect(a.isSolid(x, y)).toBe(false)
    expect(a.getStateHash()).not.toBe(before)
    b.carveCircle(x, y, 30)
    expect(b.getStateHash()).toBe(a.getStateHash())
    // 重送快照的做法：重設地形後重放挖坑紀錄
    a.resetTerrain(9)
    expect(a.getStateHash()).toBe(before)
    a.carveCircle(x, y, 30)
    expect(a.getStateHash()).toBe(b.getStateHash())
  })
  it('computeExplosionDamage：中心全額、線性衰減、半徑外為 0', () => {
    const c = new DeterministicTankCore(200, 200, 1)
    expect(c.computeExplosionDamage(50, 50, 50, 50, 40, 34)).toBe(34)
    expect(c.computeExplosionDamage(50, 50, 70, 50, 40, 40)).toBe(20)
    expect(c.computeExplosionDamage(50, 50, 90, 50, 40, 34)).toBe(0)
    expect(c.computeExplosionDamage(50, 50, 50, 50, 0, 34)).toBe(0)
  })
  it('simulateShot：同輸入彈道相同；無風時向右發射會前進並落地', () => {
    const c = new DeterministicTankCore(2400, 1100, 3)
    const p = { startX: 100, startY: 100, vxMilli: 6000, vyMilli: -6000, windMilli: 0 }
    const a = c.simulateShot(p)
    expect(c.simulateShot(p)).toEqual(a)
    expect(a.hitX).toBeGreaterThan(100)
    expect(a.impactedTerrain || a.hitY >= c.height || a.hitX >= c.width).toBe(true)
  })
  it('simulateShot：目標半徑內判定命中坦克', () => {
    const c = new DeterministicTankCore(2400, 1100, 3)
    const r = c.simulateShot({ startX: 100, startY: 100, vxMilli: 5000, vyMilli: 0, windMilli: 0, gravityMilli: 0, targetX: 300, targetY: 100, targetRadius: 10 })
    expect(r.hitTank).toBe(true)
  })
})
