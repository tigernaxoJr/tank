import { describe, expect, it } from 'vitest'
import type { FireActionCommand, RosterSlot } from '@/shared/kernel/types'
import {
  commitFireImpact,
  executeFireAction,
  finalizeTurnAfterHold,
  forfeitPlayer,
  moveActiveTank,
  prepareFireTrajectory,
  takeOverWithBot,
} from '@/features/battle/application/useBattleTurn'
import {
  advanceTurn,
  applyDamageAndCheckWinner,
  battleStateHash,
  buildInterleavedTurnOrder,
} from '@/features/battle/domain/battleState'
import { isForgedAction } from '@/features/lobby/infra/messageGuards'
import { planBotShot } from '@/features/battle/domain/botBrain'
import { PROJECTILE_REGISTRY } from '@/features/battle/domain/projectileRegistry'
import { TANK_REGISTRY } from '@/features/battle/domain/tankRegistry'
import { ROSTER_1V1, setupBattle } from './helpers'

const fire = (over: Partial<FireActionCommand> = {}): FireActionCommand => ({
  type: 'ACTION_FIRE', turnId: 1, playerId: 'p1', angle: 45, power: 70, wind: 0, bulletType: 'MISSILE_STANDARD', ...over,
})

describe('回合與傷害結算', () => {
  it('交錯出手順序：A1 B1 A2 B2', () => {
    const roster: RosterSlot[] = [
      { id: 'a1', name: '', team: 'A', tankId: 'aegis', isHost: true },
      { id: 'a2', name: '', team: 'A', tankId: 'aegis', isHost: false },
      { id: 'b1', name: '', team: 'B', tankId: 'aegis', isHost: false },
      { id: 'b2', name: '', team: 'B', tankId: 'aegis', isHost: false },
    ]
    expect(buildInterleavedTurnOrder(roster)).toEqual(['a1', 'b1', 'a2', 'b2'])
  })
  it('護盾先吸收傷害，血量歸零判對手獲勝', () => {
    const { state } = setupBattle()
    state.tanks.p2.shield = 10
    applyDamageAndCheckWinner(state, { p2: 15 })
    expect(state.tanks.p2.shield).toBe(0)
    expect(state.tanks.p2.hp).toBe(state.tanks.p2.maxHp - 5)
    expect(state.winner).toBeNull()
    applyDamageAndCheckWinner(state, { p2: 9999 })
    expect(state.phase).toBe('GAME_OVER')
    expect(state.winner).toBe('A')
  })
  it('雙方同時陣亡為平手', () => {
    const { state } = setupBattle()
    applyDamageAndCheckWinner(state, { p1: 9999, p2: 9999 })
    expect(state.winner).toBe('draw')
  })
  it('advanceTurn 跳過陣亡坦克並補滿燃料', () => {
    const roster: RosterSlot[] = [
      { id: 'a1', name: '', team: 'A', tankId: 'aegis', isHost: true },
      { id: 'b1', name: '', team: 'B', tankId: 'aegis', isHost: false },
      { id: 'a2', name: '', team: 'A', tankId: 'aegis', isHost: false },
    ]
    const { state } = setupBattle(1024, 'harvest_plains', roster)
    state.tanks.b1.hp = 0
    state.tanks.a2.moveFuel = 0
    advanceTurn(state, 3)
    expect(state.activePlayer).toBe('a2')
    expect(state.tanks.a2.moveFuel).toBe(state.tanks.a2.maxMoveFuel)
    expect(state.wind).toBe(3)
    expect(state.turnId).toBe(2)
  })
})

describe('開火流程', () => {
  it('拒絕錯誤回合、錯誤玩家、遊戲結束後的開火', () => {
    const { state, core } = setupBattle()
    expect(prepareFireTrajectory(state, fire({ turnId: 9 }), core)).toBeNull()
    expect(prepareFireTrajectory(state, fire({ playerId: 'p2' }), core)).toBeNull()
    expect(state.phase).toBe('AIMING')
    state.phase = 'GAME_OVER'
    expect(prepareFireTrajectory(state, fire(), core)).toBeNull()
  })
  it('非專屬砲彈退回預設彈', () => {
    const { state, core } = setupBattle()
    const plan = prepareFireTrajectory(state, fire({ bulletType: 'MISSILE_RAILGUN' }), core)!
    expect(plan.bulletType).toBe(TANK_REGISTRY.aegis.shots[0])
    expect(state.phase).toBe('FIRING')
  })
  it('兩端以相同指令模擬得到相同彈道、地形與狀態雜湊', () => {
    const a = setupBattle(77)
    const b = setupBattle(77)
    executeFireAction(a.state, fire(), a.core)
    executeFireAction(b.state, fire(), b.core)
    expect(a.state.lastShotPath).toEqual(b.state.lastShotPath)
    expect(battleStateHash(a.state, a.core.getStateHash())).toBe(battleStateHash(b.state, b.core.getStateHash()))
    expect(a.state.activePlayer).toBe('p2')
    expect(a.state.turnId).toBe(2)
  })
  it('狀態有差異時雜湊不同', () => {
    const a = setupBattle(77)
    const h = battleStateHash(a.state, a.core.getStateHash())
    a.state.tanks.p2.hp -= 1
    expect(battleStateHash(a.state, a.core.getStateHash())).not.toBe(h)
  })
  it('直擊吃滿傷害（回歸：不被車身中心偏移衰減）', () => {
    const { state, core } = setupBattle()
    const spec = TANK_REGISTRY.goliath
    const proj = PROJECTILE_REGISTRY.MISSILE_STANDARD
    const expected = Math.max(1, Math.round(proj.maxDamage * TANK_REGISTRY.aegis.damageMultiplier) - spec.armor)
    let found = false
    outer: for (let power = 30; power <= 100; power++) {
      for (let angle = 20; angle <= 80; angle++) {
        const s = structuredClone(state)
        const plan = prepareFireTrajectory(s, fire({ angle, power }), core)
        if (plan?.shots[0].hit.hitTank) {
          expect(commitFireImpact(s, plan, core).damageByPlayer.p2).toBe(expected)
          found = true
          break outer
        }
      }
    }
    expect(found).toBe(true)
  })
  it('預設樣式為單發，單發傷害 = 砲彈傷害 × 機種倍率', () => {
    const { state, core } = setupBattle()
    const plan = prepareFireTrajectory(state, fire(), core)!
    expect(plan.shots).toHaveLength(1)
    expect(plan.shots[0].maxDamage).toBe(Math.round(PROJECTILE_REGISTRY.MISSILE_STANDARD.maxDamage * TANK_REGISTRY.aegis.damageMultiplier))
  })
  it('多顆彈丸依序結算：各自挖坑、各自經過裝甲後加總傷害', () => {
    const { state, core } = setupBattle()
    const t = state.tanks.p2
    const shot = { hit: { hitX: t.x, hitY: t.y - 10, impactedTerrain: false, hitTank: true, stepsTaken: 1, path: [] }, maxDamage: 20 }
    const plan = { cmd: fire(), shots: [shot, shot], damageRadius: 40, terrainRadius: 10, directHitMultiplier: 1, bulletType: 'MISSILE_STANDARD' as const }
    const perShot = Math.max(1, 20 - TANK_REGISTRY.goliath.armor)
    const { carves, damageByPlayer } = commitFireImpact(state, plan, core)
    expect(carves).toHaveLength(2)
    expect(damageByPlayer.p2).toBe(perShot * 2)
  })
  it('地形被挖後坦克下墜貼地，摔出地圖直接陣亡', () => {
    const { state, core } = setupBattle()
    const t = state.tanks.p2
    core.carveCircle(t.x, t.y + 30, 140)
    const miss = { hit: { hitX: 0, hitY: 0, impactedTerrain: false, hitTank: false, stepsTaken: 1, path: [] }, maxDamage: 0 }
    const plan = { cmd: fire(), shots: [miss], damageRadius: 0, terrainRadius: 0, directHitMultiplier: 1, bulletType: 'MISSILE_STANDARD' as const }
    const before = t.y
    commitFireImpact(state, plan, core)
    expect(t.y).toBeGreaterThan(before)
  })
  it('finalizeTurnAfterHold 推進回合並回到 AIMING', () => {
    const { state } = setupBattle()
    state.phase = 'FIRING'
    finalizeTurnAfterHold(state)
    expect(state.phase).toBe('AIMING')
    expect(state.turnId).toBe(2)
    expect(state.activePlayer).toBe('p2')
  })
})

describe('移動', () => {
  it('消耗燃料，燃料用盡不能再動；非瞄準階段不能動', () => {
    const { state, core } = setupBattle()
    const t = state.tanks.p1
    const x0 = t.x
    expect(moveActiveTank(state, 20, core)).toBe(true)
    expect(t.x).toBeGreaterThan(x0)
    expect(t.moveFuel).toBeLessThan(t.maxMoveFuel)
    t.moveFuel = 0
    expect(moveActiveTank(state, 20, core)).toBe(false)
    t.moveFuel = 100
    state.phase = 'FIRING'
    expect(moveActiveTank(state, 20, core)).toBe(false)
  })
})

describe('走下高處', () => {
  /** 左半是高台（y=0.4）、右半是低地（y=0.4+drop），中間為垂直懸崖；p1 站在懸崖邊 */
  function cliffBattle(dropRatio: number | null) {
    const { state, core } = setupBattle()
    const features: object[] = [{ kind: 'rect', x: 0, y: 0.4, w: 0.3, h: 0.6, op: 'add' }]
    if (dropRatio !== null) features.push({ kind: 'rect', x: 0.3, y: 0.4 + dropRatio, w: 0.7, h: 1, op: 'add' })
    core.resetTerrain(1, { width: core.width, height: core.height, baseMode: 'none', features: features as never })
    const t = state.tanks.p1
    t.x = Math.round(core.width * 0.3) - 6
    syncAllTanksToTerrainForTest(state, core)
    return { state, core, tank: t }
  }
  const syncAllTanksToTerrainForTest = (state: ReturnType<typeof setupBattle>['state'], core: ReturnType<typeof setupBattle>['core']) => {
    for (const tank of Object.values(state.tanks)) {
      const g = core.surfaceY(tank.x)
      tank.y = g - 12
    }
  }

  it('落在下層地面：依落差扣摔落傷害，不會直接陣亡', () => {
    const { state, core, tank } = cliffBattle(0.2) // 落差約 220px
    const hp = tank.hp
    expect(moveActiveTank(state, 20, core)).toBe(true)
    expect(tank.hp).toBeLessThan(hp)
    expect(tank.hp).toBeGreaterThan(0)
    expect(hp - tank.hp).toBeLessThanOrEqual(30)
    expect(state.activePlayer).toBe('p1') // 沒死，仍是自己的回合
    expect(tank.y).toBe(core.groundBelow(tank.x, 0) - 12)
  })
  it('下方是深淵：直接陣亡並換回合', () => {
    const { state, core, tank } = cliffBattle(null)
    moveActiveTank(state, 20, core)
    expect(tank.hp).toBe(0)
    expect(state.winner).toBe('B')
  })
  it('小落差（不超過安全高度）不受傷', () => {
    const { state, core, tank } = cliffBattle(0.02) // 落差約 22px
    const hp = tank.hp
    moveActiveTank(state, 20, core)
    expect(tank.hp).toBe(hp)
  })
  it('Goliath 摔落抗性 40% 比 Aegis 少受傷', () => {
    const a = cliffBattle(0.2)
    const g = cliffBattle(0.2)
    g.state.tanks.p1.tankId = 'goliath'
    moveActiveTank(a.state, 20, a.core)
    moveActiveTank(g.state, 20, g.core)
    const lossA = a.tank.maxHp - a.tank.hp
    const lossG = g.tank.maxHp - g.tank.hp
    expect(lossG).toBeLessThan(lossA)
  })
})

describe('電腦 AI', () => {
  it('perfect 等級能找到擊中敵方的射擊參數', () => {
    const roster: RosterSlot[] = ROSTER_1V1.map((r) => (r.id === 'p1' ? { ...r, isBot: true, botLevel: 'perfect' as const } : r))
    const { state, core } = setupBattle(1024, 'harvest_plains', roster)
    const plan = planBotShot(state, core, 'p1', () => 0.5)
    expect(plan).not.toBeNull()
    expect(plan!.targetId).toBe('p2')
    expect(plan!.score).toBeLessThan(30)
  })
})

describe('註冊表一致性', () => {
  it('每台坦克的專屬砲彈都存在於砲彈註冊表', () => {
    for (const tank of Object.values(TANK_REGISTRY)) {
      for (const s of tank.shots) expect(PROJECTILE_REGISTRY[s]).toBeDefined()
    }
  })
  it('疾風的血量×輸出不超過其他機種太多（平衡預算粗檢）', () => {
    const budget = (id: keyof typeof TANK_REGISTRY) => TANK_REGISTRY[id].maxHp * TANK_REGISTRY[id].damageMultiplier
    const vals = (['aegis', 'goliath', 'zephyr'] as const).map(budget)
    expect(Math.max(...vals) / Math.min(...vals)).toBeLessThan(1.3)
  })
})

describe('玩家斷線 (forfeitPlayer)', () => {
  const trio: RosterSlot[] = [
    { id: 'a1', name: '', team: 'A', tankId: 'aegis', isHost: true },
    { id: 'b1', name: '', team: 'B', tankId: 'aegis', isHost: false },
    { id: 'b2', name: '', team: 'B', tankId: 'aegis', isHost: false },
  ]
  it('輪到離線者時直接換下一位，坦克陣亡', () => {
    const { state } = setupBattle(1024, 'harvest_plains', trio)
    advanceTurn(state, 0) // 輪到 b1
    expect(state.activePlayer).toBe('b1')
    expect(forfeitPlayer(state, 'b1')).toBe(true)
    expect(state.tanks.b1.hp).toBe(0)
    expect(state.activePlayer).toBe('b2')
    expect(state.phase).toBe('AIMING')
    expect(state.winner).toBeNull()
  })
  it('非當前玩家離線：不影響回合，之後會被跳過', () => {
    const { state } = setupBattle(1024, 'harvest_plains', trio)
    expect(forfeitPlayer(state, 'b2')).toBe(true)
    expect(state.activePlayer).toBe('a1')
    advanceTurn(state, 0)
    advanceTurn(state, 0)
    expect(state.activePlayer).toBe('a1')
    expect(state.turnId).toBe(3)
  })
  it('砲彈飛行中離線：不提前換回合，結算後才跳過', () => {
    const { state } = setupBattle(1024, 'harvest_plains', trio)
    state.phase = 'FIRING'
    forfeitPlayer(state, 'a1')
    expect(state.activePlayer).toBe('a1')
    expect(state.winner).toBe('B')
  })
  it('整隊離線判對手獲勝；已陣亡或已結束不重複處理', () => {
    const { state } = setupBattle()
    expect(forfeitPlayer(state, 'p2')).toBe(true)
    expect(state.phase).toBe('GAME_OVER')
    expect(state.winner).toBe('A')
    expect(forfeitPlayer(state, 'p1')).toBe(false)
    expect(forfeitPlayer(state, 'nobody')).toBe(false)
  })
})

describe('玩家斷線 · 電腦接手 (takeOverWithBot)', () => {
  it('坦克改由電腦操控、保留血量與位置，不會陣亡或換回合', () => {
    const { state } = setupBattle()
    const t = state.tanks.p1
    const { x, hp } = t
    expect(takeOverWithBot(state, 'p1')).toBe(true)
    expect(t.isBot).toBe(true)
    expect(t.botLevel).toBe('normal')
    expect(t.name.startsWith('🤖')).toBe(true)
    expect([t.x, t.hp, state.activePlayer, state.phase]).toEqual([x, hp, 'p1', 'AIMING'])
  })
  it('重複接手 / 已陣亡 / 對局結束 / 不存在都不處理', () => {
    const { state } = setupBattle()
    expect(takeOverWithBot(state, 'p1')).toBe(true)
    expect(takeOverWithBot(state, 'p1')).toBe(false)
    state.tanks.p2.hp = 0
    expect(takeOverWithBot(state, 'p2')).toBe(false)
    expect(takeOverWithBot(state, 'nobody')).toBe(false)
  })
  it('接手後電腦算得出射擊計畫', () => {
    const { state, core } = setupBattle()
    takeOverWithBot(state, 'p1')
    expect(planBotShot(state, core, 'p1', () => 0.5)).not.toBeNull()
  })
})

describe('遠端動作來源驗證', () => {
  const fireMsg = (playerId: string) => ({ type: 'ACTION_FIRE', turnId: 1, playerId, angle: 45, power: 60, wind: 0, bulletType: 'MISSILE_STANDARD' }) as const
  it('自稱別人的開火 / 移動視為偽造', () => {
    expect(isForgedAction(fireMsg('p1'), 'p2')).toBe(true)
    expect(isForgedAction({ type: 'ACTION_MOVE', turnId: 1, playerId: 'p1', targetX: 10 }, 'p2')).toBe(true)
  })
  it('本人的動作與非動作訊息放行', () => {
    expect(isForgedAction(fireMsg('p2'), 'p2')).toBe(false)
    expect(isForgedAction({ type: 'SYNC_HASH', turnId: 1, stateHash: 1 }, 'p2')).toBe(false)
  })
})
