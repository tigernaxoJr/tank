import { describe, expect, it } from 'vitest'
import type { FireActionCommand } from '@/shared/kernel/types'
import { prepareFireTrajectory, takeOverWithBot } from '@/features/battle/application/useBattleTurn'
import {
  availableShots,
  createLoadoutSecret,
  defaultLoadout,
  loadoutRoot,
  revealFor,
  sanitizeLoadout,
  verifyReveal,
} from '@/features/battle/domain/loadout'
import { TANK_REGISTRY } from '@/features/battle/domain/tankRegistry'
import { ROSTER_1V1, setupBattle } from './helpers'

const tankId = 'zephyr'
const [main, sub] = TANK_REGISTRY[tankId].shots
const fire = (over: Partial<FireActionCommand> = {}): FireActionCommand => ({
  type: 'ACTION_FIRE', turnId: 1, playerId: 'p1', angle: 45, power: 70, wind: 0, bulletType: main, ...over,
})

describe('彈藥配置', () => {
  it('預設取砲彈池前兩種；不合法的選擇退回預設', () => {
    expect(defaultLoadout(tankId)).toEqual([main, sub])
    expect(sanitizeLoadout(tankId, [main, main])).toEqual([main, sub])
    expect(sanitizeLoadout(tankId, ['NOPE', main])).toEqual([main, sub])
    expect(sanitizeLoadout(tankId, [sub, main])).toEqual([sub, main])
    expect(sanitizeLoadout(tankId, null)).toEqual([main, sub])
  })
  it('availableShots：有明牌用明牌，否則是整個砲彈池', () => {
    expect(availableShots({ tankId, loadout: [sub] })).toEqual([sub])
    expect(availableShots({ tankId })).toEqual(TANK_REGISTRY[tankId].shots)
  })
})

describe('彈藥承諾與揭露', () => {
  const secret = createLoadoutSecret(tankId, [main, sub])
  const root = loadoutRoot(tankId, secret)

  it('兩格的鹽各自獨立，同一配置每次承諾都不同', () => {
    expect(secret.salts[0]).not.toBe(secret.salts[1])
    expect(loadoutRoot(tankId, createLoadoutSecret(tankId, [main, sub]))).not.toBe(root)
  })
  it('主彈與副彈的揭露都能通過驗證', () => {
    for (const b of [main, sub]) expect(verifyReveal(tankId, root, b, revealFor(tankId, secret, b)!)).toBe(true)
  })
  it('揭露不含另一格的砲彈或鹽，只有葉子雜湊', () => {
    const r = revealFor(tankId, secret, main)!
    expect(JSON.stringify(r)).not.toContain(sub)
    expect(Object.keys(r).sort()).toEqual(['salt', 'sibling', 'slot'])
    expect(r.salt).not.toBe(secret.salts[1])
  })
  it('偷換砲彈、冒用另一格、缺少揭露都驗證失敗', () => {
    const r = revealFor(tankId, secret, main)!
    expect(verifyReveal(tankId, root, sub, r)).toBe(false)
    expect(verifyReveal(tankId, root, main, { ...r, slot: 1 })).toBe(false)
    expect(verifyReveal(tankId, root, main, undefined)).toBe(false)
    expect(verifyReveal('scorpion', root, main, r)).toBe(false)
    expect(revealFor(tankId, secret, 'NOPE')).toBeNull()
  })
})

describe('開火時驗證彈藥', () => {
  const secret = createLoadoutSecret(tankId, [main, sub])
  const withRoot = () => {
    const roster = ROSTER_1V1.map((r) => (r.id === 'p1' ? { ...r, tankId, loadoutRoot: loadoutRoot(tankId, secret) } : r))
    return setupBattle(1024, 'harvest_plains', roster)
  }

  it('附上正確揭露就用該砲彈', () => {
    const { state, core } = withRoot()
    const plan = prepareFireTrajectory(state, fire({ bulletType: sub, reveal: revealFor(tankId, secret, sub)! }), core)
    expect(plan?.bulletType).toBe(sub)
  })
  it('沒有揭露、或偷換成沒承諾的砲彈：拒絕開火且狀態不變', () => {
    const { state, core } = withRoot()
    expect(prepareFireTrajectory(state, fire(), core)).toBeNull()
    const forged = fire({ bulletType: sub, reveal: revealFor(tankId, secret, main)! })
    expect(prepareFireTrajectory(state, forged, core)).toBeNull()
    expect(state.phase).toBe('AIMING')
  })
  it('明牌配置：配置外的砲彈退回主彈', () => {
    const roster = ROSTER_1V1.map((r) => (r.id === 'p1' ? { ...r, tankId, loadout: [sub, main] } : r))
    const { state, core } = setupBattle(1024, 'harvest_plains', roster)
    expect(state.tanks.p1.loadout).toEqual([sub, main])
    expect(prepareFireTrajectory(state, fire({ bulletType: 'SCORPION_ACID' }), core)?.bulletType).toBe(sub)
  })
  it('電腦接手斷線玩家：清掉承諾、改用預設明牌', () => {
    const { state } = withRoot()
    expect(takeOverWithBot(state, 'p1')).toBe(true)
    expect(state.tanks.p1.loadoutRoot).toBeUndefined()
    expect(state.tanks.p1.loadout).toEqual(defaultLoadout(tankId))
  })
  it('房間快照（JSON）裡只有承諾根，沒有砲彈原文', () => {
    const { state } = withRoot()
    const json = JSON.stringify(state)
    expect(json).toContain(state.tanks.p1.loadoutRoot!)
    expect(json).not.toContain(main)
    expect(json).not.toContain(sub)
  })
})
