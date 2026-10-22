/**
 * 待機表情的靜態 SVG 版（大廳展示台、選車視窗用）。幾何與 tankFace.ts 的 draw() 待機姿勢一致：
 * 面向右、眼睛往前瞄、眼皮依 rest / lidTilt 下垂，座標為 rig 區域座標。改 tankFace.ts 的眼睛、眉毛、
 * 嘴巴畫法時要一併改這裡，否則大廳和遊戲裡的臉會不一樣。
 */
import type { FaceSpec } from '../domain/tankBlueprint'

const INK = '#1e1b2e'
const HALO = '#ffffff'
/** 待機時眼睛往車頭方向瞄（同 tankFace 的「往前看」張望） */
const LOOK_X = 0.6

const n = (v: number) => Math.round(v * 100) / 100
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`

/** 同 Phaser.Display.Color 的 darken / lighten：HSL 明度加減 amount% */
function shiftLightness(color: number, amount: number): string {
  const r = ((color >> 16) & 255) / 255
  const g = ((color >> 8) & 255) / 255
  const b = (color & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  let l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  l = Math.min(1, Math.max(0, l + amount / 100))
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const ch = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (u < 1 / 6) return p + (q - p) * 6 * u
    if (u < 1 / 2) return q
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6
    return p
  }
  const to = (v: number) => Math.round(v * 255)
  return hex(s === 0 ? (to(l) << 16) | (to(l) << 8) | to(l) : (to(ch(h + 1 / 3)) << 16) | (to(ch(h)) << 8) | to(ch(h - 1 / 3)))
}

const ellipse = (x: number, y: number, rx: number, ry: number, fill: string, op = 1) =>
  `<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${op < 1 ? ` opacity="${op}"` : ''}/>`
const circle = (x: number, y: number, r: number, fill: string, op = 1) =>
  `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${fill}"${op < 1 ? ` opacity="${op}"` : ''}/>`

/** 先半透明白邊再墨線（同 tankFace 的 ink()） */
const inked = (d: string, w: number) =>
  `<path d="${d}" fill="none" stroke="${HALO}" stroke-opacity="0.4" stroke-width="${n(w + 2.2)}"/><path d="${d}" fill="none" stroke="${INK}" stroke-width="${n(w)}"/>`

export function restFaceSvg(spec: FaceSpec): string {
  const { eyeGap, eyeSize } = spec
  const far = spec.farScale ?? 1
  const rest = spec.rest ?? 1
  const tilt = spec.lidTilt ?? 0
  const lw = Math.max(2, eyeSize * 0.32)
  const irisDark = shiftLightness(spec.iris, -30)
  const irisLight = shiftLightness(spec.iris, 25)
  const cx = spec.x
  const cy = spec.y
  let s = ''

  if (spec.blush) s += ellipse(cx + eyeGap / 2 + eyeSize * 0.2, cy + eyeSize * 1.2, eyeSize * 0.75, eyeSize * 0.325, '#ff7fb0', 0.45)

  for (const side of [-1, 1]) {
    const ry = eyeSize * (side === 1 ? far : 1)
    const rx = ry * 0.9
    const ex = cx + (side * eyeGap) / 2
    const ey = cy
    const rim = Math.max(1.1, ry * 0.2)
    s += ellipse(ex, ey, rx + rim, ry + rim, INK)
    s += ellipse(ex, ey, rx, ry, '#ffffff')
    s += ellipse(ex, ey + ry * 0.45, rx * 0.8, ry * 0.45, '#dfe3f5')

    const ir = rx * 0.64
    const ix = ex + LOOK_X * (rx - ir) * 0.85
    const iy = ey + ry * 0.05
    s += circle(ix, iy, ir, irisDark)
    s += circle(ix, iy + ir * 0.08, ir * 0.82, hex(spec.iris))
    s += circle(ix, iy + ir * 0.38, ir * 0.45, irisLight, 0.75)
    s += circle(ix, iy, ir * 0.48, INK)
    s += circle(ix - ir * 0.36, iy - ir * 0.36, Math.max(0.9, ir * 0.3), '#ffffff')
    s += circle(ix + ir * 0.36, iy + ir * 0.34, Math.max(0.5, ir * 0.13), '#ffffff', 0.85)

    // 眼皮：眼白橢圓 ∩ 眼皮線以上（同 tankFace.drawLid）
    if (rest < 0.97 || tilt !== 0) {
      const lidY = (x: number) => ey - ry + (1 - rest) * ry * 1.85 + tilt * ((x - ex) / rx) * ry * 0.35
      const pts: string[] = []
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2
        const x = ex + Math.cos(a) * (rx + 0.4)
        const y = ey + Math.sin(a) * (ry + 0.4)
        pts.push(`${n(x)},${n(Math.min(y, lidY(x)))}`)
      }
      s += `<polygon points="${pts.join(' ')}" fill="${hex(spec.lid)}"/>`
      const line: string[] = []
      for (let i = 0; i <= 14; i++) {
        const x = ex - rx + (i / 14) * rx * 2
        const half = ry * Math.sqrt(Math.max(0, 1 - ((x - ex) / rx) ** 2))
        const y = lidY(x)
        if (y > ey - half && y < ey + half) line.push(`${n(x)},${n(y)}`)
      }
      if (line.length > 1) s += `<polyline points="${line.join(' ')}" fill="none" stroke="${INK}" stroke-width="${n(lw * 0.9)}"/>`
    }

    const inner = ex - side * rx * 0.95
    const outer = ex + side * rx * 0.95
    if (spec.brow === 'block') {
      const by = ey - ry - lw * 1.1
      const t = lw * 0.9
      const o = outer + side * rx * 0.15
      s += `<polygon points="${n(inner)},${n(by - t * 1.2)} ${n(o)},${n(by - t * 0.5)} ${n(o)},${n(by + t * 0.4)} ${n(inner)},${n(by + t)}" fill="${hex(spec.lid)}" stroke="${INK}" stroke-width="${n(Math.max(1.2, lw * 0.55))}" stroke-linejoin="round"/>`
    } else {
      const by = ey - ry - lw * 1.6
      s += inked(`M${n(inner)},${n(by)}L${n(outer)},${n(by)}`, lw * 1.15)
    }
  }

  const w = Math.max(eyeGap * 0.36, eyeSize * 0.75)
  const mx = cx + 1.5
  const my = cy + (spec.mouthDy ?? eyeSize + 4.5)
  switch (spec.restMouth ?? 'smile') {
    case 'smile': {
      const oy = my - w * 0.55
      const p = (a: number) => `${n(mx + Math.cos(a) * w)},${n(oy + Math.sin(a) * w)}`
      s += inked(`M${p(Math.PI * 0.25)}A${n(w)},${n(w)} 0 0 1 ${p(Math.PI * 0.75)}`, lw)
      break
    }
    case 'flat':
      s += inked(`M${n(mx - w * 0.5)},${n(my)}L${n(mx + w * 0.5)},${n(my)}`, lw)
      break
    case 'smirk':
      s += inked(`M${n(mx - w * 0.6)},${n(my + 0.5)}L${n(mx + w * 0.2)},${n(my + 0.5)}L${n(mx + w * 0.7)},${n(my - 2.5)}`, lw)
      break
  }
  return s
}
