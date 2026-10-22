import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOADOUT_SIZE } from '@/features/battle/domain/loadout'
import { PROJECTILE_LIST, PROJECTILE_REGISTRY } from '@/features/battle/domain/projectileRegistry'
import { TANK_LIST, TANK_REGISTRY } from '@/features/battle/domain/tankRegistry'

// id 不再是編譯期字面值型別，改由這裡守住註冊表的一致性
describe('註冊表一致性', () => {
  it('id 不重複、排序值不重複', () => {
    expect(new Set(TANK_LIST.map((t) => t.id)).size).toBe(TANK_LIST.length)
    expect(new Set(TANK_LIST.map((t) => t.sortOrder)).size).toBe(TANK_LIST.length)
    expect(new Set(PROJECTILE_LIST.map((p) => p.id)).size).toBe(PROJECTILE_LIST.length)
    expect(new Set(PROJECTILE_LIST.map((p) => p.sortOrder)).size).toBe(PROJECTILE_LIST.length)
  })

  it('每台坦克的砲彈池足夠組成主副彈、不重複，且都已註冊', () => {
    for (const t of TANK_LIST) expect(t.shots.length, t.id).toBeGreaterThanOrEqual(LOADOUT_SIZE)
    for (const t of TANK_LIST) expect(new Set(t.shots).size, t.id).toBe(t.shots.length)
    for (const t of TANK_LIST) for (const s of t.shots) expect(PROJECTILE_REGISTRY[s], `${t.id} → ${s}`).toBeDefined()
  })

  it('坦克美術檔與彈體精靈都存在', () => {
    for (const t of TANK_LIST) {
      for (const team of ['A', 'B'] as const) {
        const { hullUrl, barrelUrl } = t.getSprites(team)
        for (const url of [hullUrl, barrelUrl]) expect(existsSync(`public/${url.slice(2)}`), url).toBe(true)
      }
    }
    for (const p of PROJECTILE_LIST) {
      const key = p.visual.sprite?.key
      if (key) expect(existsSync(`public/assets/units/projectiles/${key}.png`), key).toBe(true)
    }
  })

  it('TANK_REGISTRY 以 id 索引', () => {
    for (const t of TANK_LIST) expect(TANK_REGISTRY[t.id]).toBe(t)
  })
})
