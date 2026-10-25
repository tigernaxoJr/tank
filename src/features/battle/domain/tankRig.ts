/**
 * 坦克 rig 的座標換算：戰鬥場景（Phaser）與大廳立繪（SVG）共用，兩邊才會把零件放在同一個位置。
 * rig 座標 = 貼圖像素 × sprite.scale；車身貼圖的 origin 在底邊中央，底線落在 rig y = HULL_BASE_Y。
 */
import type { TankBlueprint, TankPart } from './tankBlueprint'

/** 坦克車身底部相對容器原點的位移（容器原點 = 地表上方 TANK_GROUND_OFFSET） */
export const HULL_BASE_Y = 14

type SpriteSpec = TankBlueprint['sprite']
export interface TexSize {
  readonly w: number
  readonly h: number
}
export interface RigPoint {
  readonly x: number
  readonly y: number
}

/** 車身貼圖像素（左上為原點）-> rig 座標（面向右） */
export function texToRig(scale: number, hull: TexSize, tx: number, ty: number): RigPoint {
  return { x: (tx - hull.w / 2) * scale, y: HULL_BASE_Y - (hull.h - ty) * scale }
}

/** 砲塔轉軸（rig 座標）：有 pivotTex 以它為準，否則用 pivotX / pivotY */
export function rigPivot(sprite: SpriteSpec, hull: TexSize): RigPoint {
  if (sprite.pivotTex) return texToRig(sprite.scale, hull, sprite.pivotTex[0], sprite.pivotTex[1])
  if (sprite.pivotX === undefined || sprite.pivotY === undefined) throw new Error('sprite 需要 pivotTex 或 pivotX / pivotY')
  return { x: sprite.pivotX, y: sprite.pivotY }
}

/** 零件的 rig 座標與圖片錨點（origin 預設置中） */
export function partPlacement(sprite: SpriteSpec, hull: TexSize, part: TankPart): RigPoint & { ox: number; oy: number } {
  const p = texToRig(sprite.scale, hull, part.at[0], part.at[1])
  return { ...p, ox: part.origin?.[0] ?? 0.5, oy: part.origin?.[1] ?? 0.5 }
}

/**
 * 零件在 t 毫秒時的動作偏移（面向右；面向左時 y 不變、旋轉與 x 由呼叫端鏡像）。
 * sway 持續擺動；pop 從 firedAt 起 ms 毫秒內彈一下（沒開過火或已結束為 0）。
 */
export function partMotion(part: TankPart, time: number, firedAt: number): { dy: number; rotDeg: number } {
  const m = part.motion
  if (!m) return { dy: 0, rotDeg: 0 }
  if (m.kind === 'sway') return { dy: 0, rotDeg: m.ampDeg * Math.sin((time / m.periodMs) * Math.PI * 2) }
  const t = time - firedAt
  if (firedAt < 0 || t < 0 || t > m.ms) return { dy: 0, rotDeg: 0 }
  const k = Math.sin((t / m.ms) * Math.PI)
  return { dy: -m.dy * k, rotDeg: m.rotDeg * k }
}
