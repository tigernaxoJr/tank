import { describe, expect, it } from 'vitest'
import { nextWindSpeed, windHoldTurns } from '@/features/battle/domain/windRules'
import { effectiveWindMilli, mitigateDamage, TANK_REGISTRY } from '@/features/battle/domain/tankRegistry'
import { fallDamageFor, launchVelocity } from '@/features/battle/domain/battleState'

describe('windRules', () => {
  const base = { seed: 1024, currentWind: 0, maxWind: 8, playerCount: 2 }
  it('風期內維持原風速', () => {
    expect(windHoldTurns(2)).toBe(3)
    expect(nextWindSpeed({ ...base, nextTurnId: 2, currentWind: 5 })).toBe(5)
    expect(nextWindSpeed({ ...base, nextTurnId: 3, currentWind: 5 })).toBe(5)
  })
  it('只由 seed 與回合決定（兩端一致）且不超過上限與單步增量', () => {
    let wind = 0
    for (let turn = 2; turn < 200; turn++) {
      const a = nextWindSpeed({ ...base, nextTurnId: turn, currentWind: wind })
      expect(nextWindSpeed({ ...base, nextTurnId: turn, currentWind: wind })).toBe(a)
      expect(Math.abs(a)).toBeLessThanOrEqual(8)
      expect(Math.abs(a - wind)).toBeLessThanOrEqual(Math.ceil(8 / 4))
      wind = a
    }
  })
})

describe('tank damage rules', () => {
  it('mitigateDamage：裝甲固定減免、至少 1 點、抗性按比例', () => {
    const goliath = TANK_REGISTRY.goliath
    expect(mitigateDamage(goliath, 'explosion', 34)).toBe(32)
    expect(mitigateDamage(goliath, 'explosion', 2)).toBe(1)
    expect(mitigateDamage(goliath, 'explosion', 0)).toBe(0)
    expect(mitigateDamage(goliath, 'fall', 10)).toBe(6) // 抗性 0.4
    expect(mitigateDamage(TANK_REGISTRY.aegis, 'explosion', 34)).toBe(34)
  })
  it('effectiveWindMilli 乘上砲彈係數與坦克敏感度', () => {
    expect(effectiveWindMilli(4, 5, TANK_REGISTRY.aegis)).toBe(20)
    expect(effectiveWindMilli(4, 5, TANK_REGISTRY.zephyr)).toBe(25)
  })
  it('fallDamageFor：安全高度內不受傷，超過後每 6px 1 點，上限 30', () => {
    expect(fallDamageFor(30)).toBe(0)
    expect(fallDamageFor(42)).toBe(2)
    expect(fallDamageFor(9999)).toBe(30)
    expect(fallDamageFor(40, 40)).toBe(0)
  })
  it('launchVelocity：45° 時水平與垂直速度大小相同、向上為負', () => {
    const v = launchVelocity(45, 50)
    expect(v.vxMilli).toBe(-v.vyMilli)
    expect(v.vyMilli).toBeLessThan(0)
    expect(launchVelocity(135, 50).vxMilli).toBeLessThan(0)
    expect(Math.abs(launchVelocity(45, 50, 2).vxMilli - 2 * v.vxMilli)).toBeLessThanOrEqual(1)
  })
})
