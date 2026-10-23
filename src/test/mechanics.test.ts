import { describe, expect, it } from 'vitest'
import type { BulletType, FireActionCommand, RosterSlot } from '@/shared/kernel/types'
import type { TrajectoryHit } from '@/shared/wasm'
import {
  commitFireImpact,
  detonateDueCharges,
  executeFireAction,
  finalizeTurnAfterHold,
  moveActiveTank,
  prepareFireTrajectory,
  type PreparedShotPlan,
} from '@/features/battle/application/useBattleTurn'
import { battleStateHash, chargesOf, TANK_GROUND_OFFSET, type BattleState, type TankEntity } from '@/features/battle/domain/battleState'
import { planBotMove } from '@/features/battle/domain/botBrain'
import { PROJECTILE_REGISTRY } from '@/features/battle/domain/projectileRegistry'
import { traceShell } from '@/features/battle/domain/shellFlight'
import { hasStatusFlag } from '@/features/battle/domain/statusEffects'
import { TANK_REGISTRY } from '@/features/battle/domain/tankRegistry'
import { setupBattle } from './helpers'

const duel = (a: string, b: string): RosterSlot[] => [
  { id: 'p1', name: 'A', team: 'A', tankId: a, isHost: true },
  { id: 'p2', name: 'B', team: 'B', tankId: b, isHost: false },
]

const fire = (bulletType: BulletType, over: Partial<FireActionCommand> = {}): FireActionCommand => ({
  type: 'ACTION_FIRE', turnId: 1, playerId: 'p1', angle: 45, power: 70, wind: 0, bulletType, ...over,
})

/** 直接打在某台坦克身上的一發（手工組合的 plan，略過瞄準） */
function directPlan(state: BattleState, target: TankEntity, bulletType: BulletType, count = 1): PreparedShotPlan {
  const proj = PROJECTILE_REGISTRY[bulletType]
  const hit: TrajectoryHit = { hitX: target.x, hitY: target.y - 10, impactedTerrain: false, hitTank: true, stepsTaken: 1, path: [] }
  return {
    cmd: fire(bulletType, { turnId: state.turnId, playerId: state.activePlayer }),
    shots: Array.from({ length: count }, () => ({ hit, maxDamage: proj.maxDamage })),
    damageRadius: proj.damageRadius,
    terrainRadius: proj.terrainRadius,
    directHitMultiplier: proj.directHitMultiplier,
    bulletType,
  }
}

/** 一發打在指定地面點的 plan */
function groundPlan(state: BattleState, x: number, y: number, bulletType: BulletType): PreparedShotPlan {
  const proj = PROJECTILE_REGISTRY[bulletType]
  return {
    ...directPlan(state, state.tanks.p2, bulletType),
    shots: [{ hit: { hitX: x, hitY: y, impactedTerrain: true, hitTank: false, stepsTaken: 1, path: [] }, maxDamage: proj.maxDamage }],
  }
}

/** 結束目前回合（不開火） */
const endTurn = (state: BattleState) => finalizeTurnAfterHold(state)

describe('狀態效果', () => {
  it('毒霧彈：受害者自己的回合開始時扣血，共 3 次，之後狀態消失', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('scorpion', 'hawkeye'))
    const victim = state.tanks.p2
    commitFireImpact(state, directPlan(state, victim, 'SCORPION_TOXIN'), core)
    const afterHit = victim.hp
    const power = PROJECTILE_REGISTRY.SCORPION_TOXIN.onHit!.power
    const hpAtTurnStart: number[] = []
    for (let i = 0; i < 4; i++) {
      endTurn(state) // → p2
      expect(state.activePlayer).toBe('p2')
      hpAtTurnStart.push(victim.hp)
      endTurn(state) // → p1
    }
    expect(hpAtTurnStart).toEqual([afterHit - power, afterHit - 2 * power, afterHit - 3 * power, afterHit - 3 * power])
    expect(victim.statuses).toHaveLength(0)
  })
  it('毒蠍抗毒：中毒不扣血', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('scorpion', 'scorpion'))
    const victim = state.tanks.p2
    commitFireImpact(state, directPlan(state, victim, 'SCORPION_TOXIN'), core)
    const hp = victim.hp
    endTurn(state)
    expect(victim.hp).toBe(hp)
  })
  it('持續傷害打倒坦克時跳過它的回合並分出勝負', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('scorpion', 'hawkeye'))
    const victim = state.tanks.p2
    commitFireImpact(state, directPlan(state, victim, 'SCORPION_TOXIN'), core)
    victim.hp = 3
    endTurn(state)
    expect(victim.hp).toBe(0)
    expect(state.phase).toBe('GAME_OVER')
    expect(state.winner).toBe('A')
  })
  it('凍結彈：接下來 2 回合燃料上限 −60%，仍能行動；結束後 1 回合免疫', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('frostback', 'zephyr'))
    const victim = state.tanks.p2
    commitFireImpact(state, directPlan(state, victim, 'FROST_FREEZE'), core)
    const full = victim.maxMoveFuel
    const fuels: number[] = []
    for (let i = 0; i < 3; i++) {
      endTurn(state)
      fuels.push(victim.moveFuel)
      expect(state.phase).toBe('AIMING')
      expect(state.activePlayer).toBe('p2')
      endTurn(state)
    }
    expect(fuels).toEqual([Math.floor(full * 0.4), Math.floor(full * 0.4), full])
    // 第 3 回合結束前仍在免疫期：再次命中不會掛上冰凍
    const s2 = setupBattle(1024, 'harvest_plains', duel('frostback', 'zephyr'))
    const v2 = s2.state.tanks.p2
    commitFireImpact(s2.state, directPlan(s2.state, v2, 'FROST_FREEZE'), s2.core)
    for (let i = 0; i < 4; i++) endTurn(s2.state) // p2 第二個凍結回合結束 → 免疫
    commitFireImpact(s2.state, directPlan(s2.state, v2, 'FROST_FREEZE'), s2.core)
    expect(v2.statuses.some((s) => s.id === 'freeze')).toBe(false)
  })
  it('酸蝕彈：破甲期間裝甲與護盾都失效', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('scorpion', 'frostback'))
    const victim = state.tanks.p2
    expect(victim.shield).toBe(TANK_REGISTRY.frostback.shield)
    commitFireImpact(state, directPlan(state, victim, 'SCORPION_ACID'), core)
    const shield = victim.shield
    const hp = victim.hp
    expect(hasStatusFlag(victim, 'ignoresArmor')).toBe(true)
    commitFireImpact(state, directPlan(state, victim, 'SCORPION_ACID'), core)
    expect(victim.shield).toBe(shield) // 護盾沒吸收
    expect(victim.hp).toBe(hp - PROJECTILE_REGISTRY.SCORPION_ACID.maxDamage)
  })
  it('鐵壁堡壘紮根：整回合沒移動，下一次爆炸傷害打折且用掉；移動過就沒有', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('bastion', 'hawkeye'))
    const bastion = state.tanks.p1
    endTurn(state) // 堡壘沒動 → 紮根
    expect(bastion.statuses.some((s) => s.id === 'rooted')).toBe(true)
    const hp = bastion.hp
    commitFireImpact(state, directPlan(state, bastion, 'HAWK_RAIL'), core)
    const raw = PROJECTILE_REGISTRY.HAWK_RAIL.maxDamage - TANK_REGISTRY.bastion.armor
    expect(hp - bastion.hp).toBe(Math.round((raw * (100 - TANK_REGISTRY.bastion.idleStatus!.power)) / 100))
    expect(bastion.statuses.some((s) => s.id === 'rooted')).toBe(false)

    const s2 = setupBattle(1024, 'harvest_plains', duel('bastion', 'hawkeye'))
    moveActiveTank(s2.state, 10, s2.core)
    endTurn(s2.state)
    expect(s2.state.tanks.p1.statuses.some((s) => s.id === 'rooted')).toBe(false)
  })
  it('偵察照明彈：射手接下來 2 個自己的回合都有完整彈道預覽', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('hawkeye', 'bastion'))
    executeFireAction(state, fire('HAWK_FLARE'), core)
    const hawk = state.tanks.p1
    const seen: boolean[] = []
    for (let i = 0; i < 3; i++) {
      endTurn(state) // → p1
      seen.push(hasStatusFlag(hawk, 'fullAimPreview'))
      endTurn(state)
    }
    expect(seen).toEqual([true, true, false])
  })
  it('狀態納入同步雜湊', () => {
    const { state } = setupBattle()
    const h = battleStateHash(state, 0)
    state.tanks.p2.statuses.push({ id: 'poison', turnsLeft: 3, power: 8 })
    expect(battleStateHash(state, 0)).not.toBe(h)
  })
})

describe('射擊樣式與飛行行為', () => {
  it('散彈砲一次 5 顆彈丸，同一發對同一台坦克有傷害上限', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('zephyr', 'hawkeye'))
    const plan = prepareFireTrajectory(state, fire('ZEPHYR_SCATTER'), core)!
    expect(plan.shots).toHaveLength(5)
    const s2 = setupBattle(1024, 'harvest_plains', duel('zephyr', 'hawkeye'))
    const victim = s2.state.tanks.p2
    const { damageByPlayer } = commitFireImpact(s2.state, directPlan(s2.state, victim, 'ZEPHYR_SCATTER', 5), s2.core)
    expect(damageByPlayer.p2).toBe(PROJECTILE_REGISTRY.ZEPHYR_SCATTER.damageCapPerTank)
  })
  it('冰錐彈落地碎成 3 片，各自往前飛', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('frostback', 'hawkeye'))
    const plan = prepareFireTrajectory(state, fire('FROST_ICICLE', { power: 40 }), core)!
    expect(plan.shots).toHaveLength(3)
    const ends = plan.shots.map((s) => s.hit.hitX)
    expect(new Set(ends).size).toBeGreaterThan(1)
  })
  it('跳彈：第一次碰地後反彈，彈道比一般拋物線長', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('zephyr', 'hawkeye'))
    const launch = { startX: state.tanks.p1.x, startY: state.tanks.p1.y - 12, vxMilli: 6000, vyMilli: -6000, windMilli: 0, gravityMilli: 175, maxSteps: 1200 }
    const plain = traceShell(core, launch)[0].hit
    const skip = traceShell(core, launch, PROJECTILE_REGISTRY.ZEPHYR_SKIP.flight)[0].hit
    expect(skip.stepsTaken).toBeGreaterThan(plain.stepsTaken)
    expect(skip.path.length).toBeGreaterThan(plain.path.length)
  })
  it('高拋迫擊彈：上升段穿過面前的土牆，一般彈會撞牆', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('bastion', 'hawkeye'))
    const t = state.tanks.p1
    core.fillCircle(t.x + 14, t.y - 30, 26) // 砲口前緊貼一座土丘（像從自己堆的掩體後面開火）
    const launch = { startX: t.x, startY: t.y - 12, vxMilli: 4000, vyMilli: -12000, windMilli: 0, gravityMilli: 280, maxSteps: 1200 }
    const plain = traceShell(core, launch)[0].hit
    const lob = traceShell(core, launch, { kind: 'lob' })[0].hit
    expect(plain.hitX).toBeLessThan(t.x + 70)
    expect(lob.hitX).toBeGreaterThan(t.x + 70)
  })
})

describe('地形效果', () => {
  it('築壘彈堆出土丘、不造成傷害，堆在坦克身上時把坦克抬上去', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('bastion', 'hawkeye'))
    const victim = state.tanks.p2
    const ground = victim.y + TANK_GROUND_OFFSET
    const before = victim.hp
    const { carves, damageByPlayer } = commitFireImpact(state, groundPlan(state, victim.x, ground, 'BASTION_RAMPART'), core)
    expect(carves[0].op).toBe('fill')
    expect(damageByPlayer.p2 ?? 0).toBe(0)
    expect(victim.hp).toBe(before)
    expect(core.isSolid(victim.x, ground - 20)).toBe(true)
    expect(victim.y + TANK_GROUND_OFFSET).toBeLessThan(ground - 20) // 被抬到土丘上
  })
  it('鑽地彈在地面下方爆炸（挖坑中心往下鑽）', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('burrower', 'hawkeye'))
    const x = state.tanks.p1.x + 300
    const y = core.surfaceY(x)
    const { carves, blasts } = commitFireImpact(state, groundPlan(state, x, y, 'BURROW_DRILL'), core)
    expect(blasts[0]!.y).toBe(y + PROJECTILE_REGISTRY.BURROW_DRILL.terrainDepth!)
    expect(carves[0].y).toBe(blasts[0]!.y)
  })
  it('震波彈不挖坑，把範圍內的坦克推離爆心', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('burrower', 'hawkeye'))
    const victim = state.tanks.p2
    const x0 = victim.x
    const hash = core.getStateHash()
    const { carves } = commitFireImpact(state, groundPlan(state, x0 - 20, victim.y + TANK_GROUND_OFFSET, 'BURROW_QUAKE'), core)
    expect(carves).toHaveLength(0)
    expect(core.getStateHash()).toBe(hash)
    expect(victim.x).toBeGreaterThan(x0)
  })
})

describe('定時彈（fuse）', () => {
  const sticky = 'SNAILER_STICKY'

  it('定時黏殼彈落地不爆炸、不挖坑、不扣血，只在落點登記一顆定時彈', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('snailer', 'hawkeye'))
    const victim = state.tanks.p2
    const x = victim.x - 10
    const y = victim.y + TANK_GROUND_OFFSET
    const hash = core.getStateHash()
    const hp = victim.hp
    const { carves, damageByPlayer, placed } = commitFireImpact(state, groundPlan(state, x, y, sticky), core)
    expect(carves).toHaveLength(0)
    expect(core.getStateHash()).toBe(hash)
    expect(damageByPlayer).toEqual({})
    expect(victim.hp).toBe(hp)
    expect(placed).toHaveLength(1)
    expect(chargesOf(state)).toEqual([expect.objectContaining({ x, y, owner: 'p1', bulletType: sticky, turnsLeft: 2 })])
  })

  it('放置當回合結束倒數 1，對手回合結束再倒數到 0 才引爆：挖坑、扣血、移除定時彈', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('snailer', 'hawkeye'))
    const victim = state.tanks.p2
    commitFireImpact(state, groundPlan(state, victim.x, victim.y + TANK_GROUND_OFFSET, sticky), core)

    // 放置者的回合結束：還沒到期
    const first = detonateDueCharges(state, core)
    expect(first.bursts).toHaveLength(0)
    expect(chargesOf(state)[0].turnsLeft).toBe(1)
    endTurn(state)
    expect(state.activePlayer).toBe('p2')

    // 對手的回合結束：到期引爆
    const hp = victim.hp
    const hash = core.getStateHash()
    const second = detonateDueCharges(state, core)
    expect(second.bursts).toHaveLength(1)
    expect(second.carves).toHaveLength(1)
    expect(core.getStateHash()).not.toBe(hash)
    expect(victim.hp).toBeLessThan(hp)
    expect(second.damageByPlayer.p2).toBeGreaterThan(0)
    expect(chargesOf(state)).toHaveLength(0)
  })

  it('對手離開爆炸範圍就毫髮無傷；放置者自己站在範圍內一樣會被炸', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('snailer', 'hawkeye'))
    const owner = state.tanks.p1
    const victim = state.tanks.p2
    const radius = PROJECTILE_REGISTRY[sticky].damageRadius
    // 放在放置者自己腳邊；對手離得遠
    commitFireImpact(state, groundPlan(state, owner.x + 5, owner.y + TANK_GROUND_OFFSET, sticky), core)
    expect(Math.abs(victim.x - owner.x)).toBeGreaterThan(radius)
    const hp = { p1: owner.hp, p2: victim.hp }
    detonateDueCharges(state, core)
    endTurn(state)
    detonateDueCharges(state, core)
    expect(victim.hp).toBe(hp.p2)
    expect(owner.hp).toBeLessThan(hp.p1)
  })

  it('定時彈納入同步雜湊；沒有 charges 欄位的舊快照也能運作', () => {
    const a = setupBattle(1024, 'harvest_plains', duel('snailer', 'hawkeye'))
    const b = setupBattle(1024, 'harvest_plains', duel('snailer', 'hawkeye'))
    const base = battleStateHash(a.state, a.core.getStateHash())
    commitFireImpact(a.state, groundPlan(a.state, a.state.tanks.p2.x, a.state.tanks.p2.y + TANK_GROUND_OFFSET, sticky), a.core)
    expect(battleStateHash(a.state, a.core.getStateHash())).not.toBe(base)
    delete (b.state as { charges?: unknown }).charges
    expect(() => detonateDueCharges(b.state, b.core)).not.toThrow()
    expect(battleStateHash(b.state, b.core.getStateHash())).toBe(base)
  })

  it('電腦站在定時彈的爆炸範圍內會走出範圍；範圍外不受影響', () => {
    const { state, core } = setupBattle(1024, 'harvest_plains', duel('snailer', 'zephyr'))
    const bot = state.tanks.p2
    bot.isBot = true
    bot.botLevel = 'hard'
    const radius = PROJECTILE_REGISTRY[sticky].damageRadius
    commitFireImpact(state, groundPlan(state, bot.x, bot.y + TANK_GROUND_OFFSET, sticky), core)
    const charge = chargesOf(state)[0]
    const dx = planBotMove(state, core, 'p2')
    expect(dx).not.toBe(0)
    expect(Math.abs(bot.x + dx - charge.x)).toBeGreaterThanOrEqual(radius)

    // 離得夠遠就沿用一般走位（這裡只確認不會因為定時彈而被推著走：結果與沒有定時彈時相同）
    state.charges = []
    const normal = planBotMove(state, core, 'p2')
    chargesOf(state).push({ ...charge, x: bot.x + radius + 200 })
    expect(planBotMove(state, core, 'p2')).toBe(normal)
  })

  it('兩端以相同指令模擬：放置、倒數、引爆後狀態雜湊一致', () => {
    const run = () => {
      const b = setupBattle(77, 'harvest_plains', duel('snailer', 'bastion'))
      executeFireAction(b.state, fire(sticky, { angle: 55, power: 62 }), b.core)
      detonateDueCharges(b.state, b.core)
      return battleStateHash(b.state, b.core.getStateHash())
    }
    expect(run()).toBe(run())
  })
})

describe('確定性', () => {
  it('每種砲彈：兩端以相同指令模擬得到相同狀態雜湊', () => {
    for (const tank of Object.values(TANK_REGISTRY)) {
      for (const bullet of tank.shots) {
        const run = () => {
          const b = setupBattle(77, 'harvest_plains', duel(tank.id, 'bastion'))
          executeFireAction(b.state, fire(bullet, { angle: 50, power: 62 }), b.core)
          return battleStateHash(b.state, b.core.getStateHash())
        }
        expect(run()).toBe(run())
      }
    }
  })
})
