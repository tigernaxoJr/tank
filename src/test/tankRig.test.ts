import { describe, expect, it } from 'vitest'
import type { TankPart } from '@/features/battle/domain/tankBlueprint'
import { TANK_LIST } from '@/features/battle/domain/tankRegistry'
import { HULL_BASE_Y, partMotion, partPlacement, rigPivot, texToRig } from '@/features/battle/domain/tankRig'

const hull = { w: 280, h: 250 }

describe('貼圖座標換算', () => {
  it('車身底邊中央 = rig (0, HULL_BASE_Y)', () => {
    expect(texToRig(0.4, hull, 140, 250)).toEqual({ x: 0, y: HULL_BASE_Y })
  })

  it('依 scale 換算：左上角在 (-w/2, base - h) × scale', () => {
    const p = texToRig(0.4, hull, 0, 0)
    expect(p.x).toBeCloseTo(-56)
    expect(p.y).toBeCloseTo(HULL_BASE_Y - 100)
  })

  it('pivotTex 優先於 pivotX / pivotY；兩者都沒有就丟錯', () => {
    const base = { scale: 0.4, face: TANK_LIST[0].sprite.face }
    expect(rigPivot({ ...base, pivotX: 3, pivotY: -5 }, hull)).toEqual({ x: 3, y: -5 })
    const p = rigPivot({ ...base, pivotX: 3, pivotY: -5, pivotTex: [207, 103] }, hull)
    expect(p.x).toBeCloseTo(26.8)
    expect(p.y).toBeCloseTo(-44.8)
    expect(() => rigPivot(base, hull)).toThrow()
  })

  it('零件 origin 預設置中', () => {
    const part: TankPart = { id: 'flag', z: 'overHull', at: [55, 6] }
    const r = partPlacement({ scale: 0.4, face: TANK_LIST[0].sprite.face }, hull, part)
    expect(r.ox).toBe(0.5)
    expect(r.oy).toBe(0.5)
    expect(r.x).toBeCloseTo(-34)
  })
})

describe('零件動作', () => {
  const sway: TankPart = { id: 'flag', z: 'overHull', at: [0, 0], motion: { kind: 'sway', ampDeg: 6, periodMs: 1000 } }
  const pop: TankPart = { id: 'lid', z: 'overHull', at: [0, 0], motion: { kind: 'pop', on: 'fire', dy: 8, rotDeg: 20, ms: 200 } }

  it('sway 依時間擺動、週期歸零', () => {
    expect(partMotion(sway, 250, -1).rotDeg).toBeCloseTo(6)
    expect(partMotion(sway, 1000, -1).rotDeg).toBeCloseTo(0)
  })

  it('pop 只在開火後 ms 內有位移，峰值在一半', () => {
    expect(partMotion(pop, 5000, -1)).toEqual({ dy: 0, rotDeg: 0 })
    expect(partMotion(pop, 100, 0).dy).toBeCloseTo(-8)
    expect(partMotion(pop, 100, 0).rotDeg).toBeCloseTo(20)
    expect(partMotion(pop, 500, 0)).toEqual({ dy: 0, rotDeg: 0 })
  })

  it('沒有 motion 的零件不動', () => {
    expect(partMotion({ id: 'x', z: 'overHull', at: [0, 0] }, 123, 0)).toEqual({ dy: 0, rotDeg: 0 })
  })
})

describe('藍圖一致性', () => {
  it('每台坦克都能換算出轉軸', () => {
    for (const t of TANK_LIST) expect(() => rigPivot(t.sprite, hull), t.id).not.toThrow()
  })

  it('零件 id 不重複，且 getSprites 給得出對應網址', () => {
    for (const t of TANK_LIST) {
      const ids = (t.sprite.parts ?? []).map((p) => p.id)
      expect(new Set(ids).size, t.id).toBe(ids.length)
      const s = t.getSprites('A')
      for (const id of ids) expect(s.partUrls[id], `${t.id} ${id}`).toBe(`./assets/units/tanks/${t.id}_a_${id}.png`)
      expect(s.iconUrl).toBe(ids.length > 0 ? `./assets/units/tanks/${t.id}_a_icon.png` : s.hullUrl)
    }
  })
})
