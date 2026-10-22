import { describe, expect, it, vi } from 'vitest'

// 切片入口會載入 Phaser（需要瀏覽器）；這裡只用得到註冊表與電腦難度，直接接到 domain 模組
vi.mock('@/features/battle', async () => ({
  ...(await import('@/features/battle/domain/botBrain')),
  ...(await import('@/features/battle/domain/tankRegistry')),
}))
import { useLocalSkirmish } from '@/features/lobby/ui/composables/useLocalSkirmish'
import { buildInterleavedTurnOrder } from '@/features/battle/domain/battleState'

const setup = () => useLocalSkirmish(() => [], () => {})

describe('單機練習席位', () => {
  it('預設 1v1：A1 玩家、B1 中等電腦，其餘空位不進名單', () => {
    const s = setup()
    const roster = s.buildHotseatRoster()
    expect(roster.map((r) => [r.id, r.isBot, r.botLevel])).toEqual([
      ['a1', false, undefined],
      ['b1', true, 'normal'],
    ])
  })

  it('兩隊人數可以不同（2v4），每台電腦各自的難度', () => {
    const s = setup()
    s.setSeatControl('A', 2, 'player')
    s.setSeatControl('B', 1, 'bot')
    s.setSeatLevel('B', 1, 'perfect')
    s.setSeatControl('B', 3, 'bot')
    s.setSeatLevel('B', 3, 'rookie')
    s.setSeatControl('B', 4, 'bot')
    const roster = s.buildHotseatRoster()
    expect(s.teamCount.value).toEqual({ A: 2, B: 4 })
    expect(roster.filter((r) => r.team === 'B').map((r) => [r.id, r.botLevel])).toEqual([
      ['b1', 'normal'],
      ['b2', 'perfect'],
      ['b4', 'rookie'],
      ['b5', 'normal'],
    ])
    expect(s.hotseatStartLabel.value).toContain('2v4')
    // 每台坦克每輪都輪到一次
    expect(buildInterleavedTurnOrder(roster)).toEqual(['a1', 'b1', 'a3', 'b2', 'b4', 'b5'])
  })

  it('A1 用大廳設定的名字，其餘玩家席用隊名', () => {
    const s = useLocalSkirmish(() => [], () => {}, () => '  小明 ')
    s.setSeatControl('B', 0, 'player')
    s.setSeatControl('A', 1, 'bot')
    expect(s.buildHotseatRoster().map((r) => r.name)).toEqual(['小明', '🤖 CPU A2', '藍隊 B1'])
    // 沒填名字就用隊名
    expect(setup().buildHotseatRoster()[0].name).toBe('橘隊 A1')
  })

  it('A1（我的戰車）與每隊最後一台不能改成空位', () => {
    const s = setup()
    s.setSeatControl('A', 0, 'empty')
    s.setSeatControl('B', 0, 'empty')
    expect(s.teamCount.value).toEqual({ A: 1, B: 1 })
    s.setSeatControl('B', 1, 'bot')
    s.setSeatControl('B', 0, 'empty')
    expect(s.buildHotseatRoster().map((r) => r.id)).toEqual(['a1', 'b2'])
  })
})
