/**
 * Paint the original (non-Kenney) map art themes as SVG, then rasterize them for the game.
 *
 *   node tools/assets/paint_map_themes.mjs          (or: npm run paint:maps)
 *
 * Everything here is drawn procedurally from code — no third-party images — so it is free of
 * copyright concerns and fully reproducible (seeded PRNG, same output every run).
 *
 * Output per theme:
 *   tools/assets/map-art/<theme>/*.svg      SVG sources (optimized with SVGO when it is on PATH)
 *   public/assets/maps/<theme>/*.png        rasterized with resvg, metadata stripped with ImageMagick
 *
 * Files:
 *   clouds_far / mountains / hills_far / hills_near   1024×400 parallax layers, seamless horizontally
 *   terrain_cap / terrain_fill / bedrock              128×128 seamless tiles (cap row 0 = ground surface)
 *   prop<N>                                           ground decorations (origin = bottom centre)
 *   hang<N>                                           decorations hanging under floating terrain (origin = top centre)
 * Kenney themes only get the generated bedrock + hang tiles; their backdrops come from bake_kenney_assets.py.
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SVG_OUT = join(ROOT, 'tools', 'assets', 'map-art')
const PNG_OUT = join(ROOT, 'public', 'assets', 'maps')
const W = 1024
const H = 400
const T = 128
const TAU = Math.PI * 2

// ───────────────────────── helpers ─────────────────────────

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const f1 = (n) => Math.round(n * 10) / 10

function svg(width, height, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs>${defs}</defs>${body}</svg>`
}

/** Periodic ridge: integer cycles over `period` guarantee the left and right edges match. */
function ridge(seed, base, waves, period = W, step = 8) {
  const r = rng(seed)
  const phases = waves.map(() => r() * TAU)
  const pts = []
  for (let x = 0; x <= period; x += step) {
    let y = base
    waves.forEach(([cycles, amp], i) => {
      y += Math.sin((cycles * TAU * x) / period + phases[i]) * amp
    })
    pts.push([x, y])
  }
  return pts
}

function ridgePath(pts, bottom = H) {
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)},${f1(y)}`).join('')
  return `${d}L${pts[pts.length - 1][0]},${bottom}L0,${bottom}Z`
}

/** Kenney-like flat silhouette: lighter rim along the top, base colour below. */
function rimmed(pts, base, rim, rimPx = 7, bottom = H) {
  const lowered = pts.map(([x, y]) => [x, y + rimPx])
  return `<path d="${ridgePath(pts, bottom)}" fill="${rim}"/><path d="${ridgePath(lowered, bottom)}" fill="${base}"/>`
}

/**
 * Draw something at x, plus a translated copy one period left/right when it crosses the seam.
 * The copy reuses the same markup, so random values drawn inside `draw` stay identical on both sides.
 */
function wrap(x, halfWidth, draw, period = W) {
  const shape = draw(x)
  let out = shape
  if (x - halfWidth < 0) out += `<g transform="translate(${period} 0)">${shape}</g>`
  if (x + halfWidth > period) out += `<g transform="translate(${-period} 0)">${shape}</g>`
  return out
}

function noiseFilter(id, size, freq, seed, octaves = 3) {
  // alpha = 2·R − 0.85 → sparse dark mottling; stitchTiles keeps the tile seamless
  return `<filter id="${id}" x="0" y="0" width="${size}" height="${size}" filterUnits="userSpaceOnUse"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 2 0 0 0 -0.85"/></filter>`
}

function noiseRect(id, size, opacity, color = '#000') {
  return `<g opacity="${opacity}"><rect width="${size}" height="${size}" fill="${color}" filter="url(#${id})"/></g>`
}

/** Seamless horizontal band: flat top at `top`, wavy lower edge (grass, snow, sand caps). */
function band(seed, top, depth, amp, cycles, color, period = T) {
  const pts = ridge(seed, top + depth, [[cycles, amp], [cycles * 2 + 1, amp * 0.45]], period, 2)
  const bottom = pts.map(([x, y]) => `${f1(x)},${f1(y)}`).reverse().join(' ')
  return `<polygon points="0,${top} ${period},${top} ${bottom}" fill="${color}"/>`
}

function bricks({ top, rows, rowH, widths, colors, mortar, seed, mortarPx = 2, bevel }) {
  const r = rng(seed)
  let out = ''
  for (let row = 0; row < rows; row++) {
    const y = top + row * rowH
    const w = widths[row % widths.length]
    const offset = row % 2 ? w / 2 : 0
    out += `<rect x="0" y="${y}" width="${T}" height="${rowH}" fill="${mortar}"/>`
    for (let x = -offset; x < T; x += w) {
      const c = colors[Math.floor(r() * colors.length)]
      const cell = (xx) =>
        `<rect x="${xx + mortarPx / 2}" y="${y + mortarPx / 2}" width="${w - mortarPx}" height="${rowH - mortarPx}" rx="2" fill="${c}"/>` +
        (bevel
          ? `<rect x="${xx + mortarPx / 2}" y="${y + mortarPx / 2}" width="${w - mortarPx}" height="3" fill="${bevel}" opacity="0.55"/>`
          : '')
      out += cell(x)
      if (x < 0) out += cell(x + T)
    }
  }
  return out
}

/** Pebbles / speckles scattered seamlessly across a tile area. */
function speckles(seed, count, area, colors, rMin, rMax, size = T) {
  const r = rng(seed)
  let out = ''
  for (let i = 0; i < count; i++) {
    const x = r() * size
    const y = area[0] + r() * (area[1] - area[0])
    const rx = rMin + r() * (rMax - rMin)
    const ry = rx * (0.6 + r() * 0.4)
    const c = colors[Math.floor(r() * colors.length)]
    out += wrap(x, rx, (xx) => `<ellipse cx="${f1(xx)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="${c}"/>`, size)
  }
  return out
}

/** Area from a wavy line down to the tile bottom. */
function bandDown(seed, y, amp, cycles, color, period = T) {
  const pts = ridge(seed, y, [[cycles, amp], [cycles * 2 + 1, amp * 0.45]], period, 2)
  return `<polygon points="${pts.map(([x, yy]) => `${f1(x)},${f1(yy)}`).join(' ')} ${period},${T} 0,${T}" fill="${color}"/>`
}

/**
 * Horizontal strata with wavy seams, seamless vertically too: the region above the first seam and
 * the region below the last seam share colors[0], so the tile wraps without a straight line.
 */
function strata(seed, colors, count) {
  const step = T / count
  let out = `<rect width="${T}" height="${T}" fill="${colors[0]}"/>`
  for (let i = 1; i < count; i++) {
    out += bandDown(seed + i, step * i - step / 2, 3 + (i % 3), 1 + (i % 2), colors[i % colors.length])
  }
  out += bandDown(seed + count, T - step / 2, 3, 2, colors[0])
  return out
}

// ───────────────────────── shared shapes ─────────────────────────

function pine(x, baseY, h, color, snow) {
  const w = h * 0.42
  let out = `<rect x="${f1(x - h * 0.03)}" y="${f1(baseY - h * 0.15)}" width="${f1(h * 0.06)}" height="${f1(h * 0.15)}" fill="${color}"/>`
  for (let i = 0; i < 3; i++) {
    const ty = baseY - h * 0.12 - i * h * 0.26
    const tw = w * (1 - i * 0.24)
    out += `<polygon points="${f1(x - tw / 2)},${f1(ty)} ${f1(x + tw / 2)},${f1(ty)} ${f1(x)},${f1(ty - h * 0.42)}" fill="${color}"/>`
    if (snow) {
      out += `<polygon points="${f1(x - tw * 0.18)},${f1(ty - h * 0.33)} ${f1(x + tw * 0.18)},${f1(ty - h * 0.33)} ${f1(x)},${f1(ty - h * 0.42)}" fill="${snow}"/>`
    }
  }
  return out
}

function roundTree(x, baseY, h, trunk, crown, crownLight) {
  const cr = h * 0.32
  return (
    `<rect x="${f1(x - h * 0.04)}" y="${f1(baseY - h * 0.45)}" width="${f1(h * 0.08)}" height="${f1(h * 0.45)}" fill="${trunk}"/>` +
    `<circle cx="${f1(x)}" cy="${f1(baseY - h + cr)}" r="${f1(cr)}" fill="${crown}"/>` +
    `<circle cx="${f1(x - cr * 0.55)}" cy="${f1(baseY - h + cr * 1.5)}" r="${f1(cr * 0.7)}" fill="${crown}"/>` +
    `<circle cx="${f1(x + cr * 0.6)}" cy="${f1(baseY - h + cr * 1.45)}" r="${f1(cr * 0.72)}" fill="${crown}"/>` +
    (crownLight ? `<circle cx="${f1(x - cr * 0.3)}" cy="${f1(baseY - h + cr * 0.75)}" r="${f1(cr * 0.38)}" fill="${crownLight}"/>` : '')
  )
}

function palm(x, baseY, h, color) {
  const top = [x + h * 0.12, baseY - h]
  let out = `<path d="M${f1(x - h * 0.03)},${f1(baseY)} Q${f1(x + h * 0.02)},${f1(baseY - h * 0.5)} ${f1(top[0] - 3)},${f1(top[1])} L${f1(top[0] + 3)},${f1(top[1])} Q${f1(x + h * 0.08)},${f1(baseY - h * 0.5)} ${f1(x + h * 0.03)},${f1(baseY)}Z" fill="${color}"/>`
  for (const [dx, dy] of [[-0.45, 0.12], [0.45, 0.14], [-0.3, -0.12], [0.32, -0.1], [0.05, -0.2]]) {
    const ex = top[0] + dx * h
    const ey = top[1] + dy * h + h * 0.08
    const cx = top[0] + dx * h * 0.5
    const cy = top[1] - h * 0.12
    out += `<path d="M${f1(top[0])},${f1(top[1])} Q${f1(cx)},${f1(cy)} ${f1(ex)},${f1(ey)} Q${f1(cx)},${f1(cy + h * 0.08)} ${f1(top[0])},${f1(top[1] + 4)}Z" fill="${color}"/>`
  }
  return out
}

function puffCloud(cx, cy, w, color, shade) {
  const r = rng(Math.round(cx * 7 + cy))
  let out = ''
  const n = 5
  for (let i = 0; i < n; i++) {
    const px = cx - w / 2 + (w * (i + 0.5)) / n
    const pr = (w / n) * (0.75 + r() * 0.5)
    out += `<circle cx="${f1(px)}" cy="${f1(cy - pr * 0.5 - (i === 2 ? pr * 0.4 : 0))}" r="${f1(pr)}" fill="${color}"/>`
  }
  out += `<rect x="${f1(cx - w / 2)}" y="${f1(cy - w * 0.08)}" width="${f1(w)}" height="${f1(w * 0.12)}" rx="${f1(w * 0.06)}" fill="${color}"/>`
  if (shade) out += `<ellipse cx="${f1(cx)}" cy="${f1(cy + w * 0.035)}" rx="${f1(w * 0.42)}" ry="${f1(w * 0.03)}" fill="${shade}"/>`
  return out
}

/** Floating island silhouette: grassy top, tapered rocky underside, optional waterfall. */
function floatingIsland(x, y, w, colors, opts = {}) {
  const { top, under, fall, tree } = colors
  const d = w * 0.55
  let out = `<path d="M${f1(x - w / 2)},${f1(y)} Q${f1(x - w * 0.3)},${f1(y + d * 0.55)} ${f1(x - w * 0.05)},${f1(y + d)} Q${f1(x + w * 0.1)},${f1(y + d * 0.7)} ${f1(x + w * 0.2)},${f1(y + d * 0.45)} Q${f1(x + w * 0.38)},${f1(y + d * 0.2)} ${f1(x + w / 2)},${f1(y)}Z" fill="${under}"/>`
  out += `<rect x="${f1(x - w / 2)}" y="${f1(y - w * 0.05)}" width="${f1(w)}" height="${f1(w * 0.08)}" rx="${f1(w * 0.04)}" fill="${top}"/>`
  if (fall) {
    out += `<rect x="${f1(x + w * 0.18)}" y="${f1(y)}" width="${f1(Math.max(3, w * 0.03))}" height="${f1(opts.fallLen ?? d * 1.6)}" fill="${fall}" opacity="0.8"/>`
  }
  if (tree) {
    out += roundTree(x - w * 0.2, y - w * 0.03, w * 0.32, tree, tree)
    out += roundTree(x + w * 0.05, y - w * 0.03, w * 0.22, tree, tree)
  }
  if (opts.castle) out += castle(x - w * 0.02, y - w * 0.03, w * 0.5, opts.castle)
  return out
}

function castle(x, baseY, h, color) {
  let out = `<rect x="${f1(x - h * 0.35)}" y="${f1(baseY - h * 0.45)}" width="${f1(h * 0.7)}" height="${f1(h * 0.45)}" fill="${color}"/>`
  for (const [dx, th, tw] of [[-0.35, 0.75, 0.16], [0.35, 0.7, 0.16], [0, 1, 0.2]]) {
    const tx = x + dx * h
    out += `<rect x="${f1(tx - (tw * h) / 2)}" y="${f1(baseY - th * h)}" width="${f1(tw * h)}" height="${f1(th * h)}" fill="${color}"/>`
    out += `<polygon points="${f1(tx - tw * h * 0.65)},${f1(baseY - th * h)} ${f1(tx + tw * h * 0.65)},${f1(baseY - th * h)} ${f1(tx)},${f1(baseY - th * h - h * 0.3)}" fill="${color}"/>`
  }
  return out
}

function column(x, baseY, h, w, color, light, broken = 0) {
  const top = baseY - h * (1 - broken)
  let out = `<rect x="${f1(x - w / 2)}" y="${f1(top)}" width="${f1(w)}" height="${f1(baseY - top)}" fill="${color}"/>`
  out += `<rect x="${f1(x - w / 2 + w * 0.15)}" y="${f1(top)}" width="${f1(w * 0.22)}" height="${f1(baseY - top)}" fill="${light}" opacity="0.6"/>`
  out += `<rect x="${f1(x - w * 0.75)}" y="${f1(baseY - w * 0.35)}" width="${f1(w * 1.5)}" height="${f1(w * 0.35)}" fill="${color}"/>`
  if (broken > 0) {
    out += `<polygon points="${f1(x - w / 2)},${f1(top)} ${f1(x - w * 0.1)},${f1(top - w * 0.5)} ${f1(x + w * 0.2)},${f1(top - w * 0.15)} ${f1(x + w / 2)},${f1(top - w * 0.4)} ${f1(x + w / 2)},${f1(top)}" fill="${color}"/>`
  } else {
    out += `<rect x="${f1(x - w * 0.75)}" y="${f1(top - w * 0.35)}" width="${f1(w * 1.5)}" height="${f1(w * 0.35)}" fill="${color}"/>`
  }
  return out
}

function windmill(x, baseY, h, wall, roof, sail) {
  const w = h * 0.3
  const hubY = baseY - h * 0.82
  let out = `<polygon points="${f1(x - w / 2)},${baseY} ${f1(x + w / 2)},${baseY} ${f1(x + w * 0.3)},${f1(hubY + h * 0.06)} ${f1(x - w * 0.3)},${f1(hubY + h * 0.06)}" fill="${wall}"/>`
  out += `<rect x="${f1(x - w * 0.12)}" y="${f1(baseY - h * 0.2)}" width="${f1(w * 0.24)}" height="${f1(h * 0.2)}" rx="${f1(w * 0.1)}" fill="${roof}"/>`
  out += `<polygon points="${f1(x - w * 0.42)},${f1(hubY + h * 0.08)} ${f1(x + w * 0.42)},${f1(hubY + h * 0.08)} ${f1(x)},${f1(hubY - h * 0.1)}" fill="${roof}"/>`
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.35
    const ex = x + Math.cos(a) * h * 0.55
    const ey = hubY + Math.sin(a) * h * 0.55
    const nx = -Math.sin(a) * h * 0.07
    const ny = Math.cos(a) * h * 0.07
    out += `<path d="M${f1(x)},${f1(hubY)} L${f1(ex)},${f1(ey)}" stroke="${roof}" stroke-width="${f1(h * 0.025)}"/>`
    out += `<polygon points="${f1(x + (ex - x) * 0.25)},${f1(hubY + (ey - hubY) * 0.25)} ${f1(ex)},${f1(ey)} ${f1(ex + nx)},${f1(ey + ny)} ${f1(x + (ex - x) * 0.25 + nx)},${f1(hubY + (ey - hubY) * 0.25 + ny)}" fill="${sail}"/>`
  }
  out += `<circle cx="${f1(x)}" cy="${f1(hubY)}" r="${f1(h * 0.04)}" fill="${roof}"/>`
  return out
}

function barn(x, baseY, s) {
  const w = 120 * s
  const h = 70 * s
  let out = ''
  // silos
  for (const [dx, sh] of [[0.62, 1.45], [0.82, 1.2]]) {
    const sx = x + dx * w
    out += `<rect x="${f1(sx - 12 * s)}" y="${f1(baseY - h * sh)}" width="${f1(24 * s)}" height="${f1(h * sh)}" fill="#d9d2c0"/><path d="M${f1(sx - 12 * s)},${f1(baseY - h * sh)} a${f1(12 * s)},${f1(12 * s)} 0 0 1 ${f1(24 * s)},0z" fill="#9aa4ad"/><rect x="${f1(sx - 12 * s)}" y="${f1(baseY - h * sh)}" width="${f1(6 * s)}" height="${f1(h * sh)}" fill="#ece6d6"/>`
  }
  out += `<polygon points="${f1(x - w / 2)},${baseY} ${f1(x + w / 2)},${baseY} ${f1(x + w / 2)},${f1(baseY - h * 0.62)} ${f1(x + w * 0.3)},${f1(baseY - h)} ${f1(x - w * 0.3)},${f1(baseY - h)} ${f1(x - w / 2)},${f1(baseY - h * 0.62)}" fill="#c4473a"/>`
  out += `<polyline points="${f1(x - w * 0.54)},${f1(baseY - h * 0.6)} ${f1(x - w * 0.3)},${f1(baseY - h * 1.03)} ${f1(x + w * 0.3)},${f1(baseY - h * 1.03)} ${f1(x + w * 0.54)},${f1(baseY - h * 0.6)}" fill="none" stroke="#f4ead2" stroke-width="${f1(5 * s)}"/>`
  const dw = w * 0.32
  const dh = h * 0.5
  out += `<rect x="${f1(x - dw / 2)}" y="${f1(baseY - dh)}" width="${f1(dw)}" height="${f1(dh)}" fill="#8e2f27" stroke="#f4ead2" stroke-width="${f1(3 * s)}"/>`
  out += `<path d="M${f1(x - dw / 2)},${f1(baseY - dh)} L${f1(x + dw / 2)},${baseY} M${f1(x + dw / 2)},${f1(baseY - dh)} L${f1(x - dw / 2)},${baseY}" stroke="#f4ead2" stroke-width="${f1(3 * s)}"/>`
  out += `<rect x="${f1(x - 9 * s)}" y="${f1(baseY - h * 0.82)}" width="${f1(18 * s)}" height="${f1(12 * s)}" fill="#f4ead2"/>`
  return out
}

// ───────────────────────── themes ─────────────────────────

const THEMES = {
  desert_temple: {
    kind: 'original',
    clouds_far() {
      let out = ''
      const r = rng(11)
      for (let i = 0; i < 9; i++) {
        const x = r() * W
        const y = 40 + r() * 170
        const w = 120 + r() * 220
        out += wrap(x, w / 2, (xx) => `<rect x="${f1(xx - w / 2)}" y="${f1(y)}" width="${f1(w)}" height="${f1(10 + r() * 14)}" rx="10" fill="#ffd2b3" opacity="${f1(0.55 + r() * 0.35)}"/>`)
      }
      return svg(W, H, out)
    },
    mountains() {
      let out = rimmed(ridge(21, 330, [[2, 10], [5, 6]]), '#b56f6a', '#d18d7d')
      for (const [x, bw, h] of [[170, 360, 250], [520, 220, 160], [820, 290, 205]]) {
        out += wrap(x, bw / 2, (xx) =>
          `<polygon points="${f1(xx - bw / 2)},340 ${f1(xx)},${340 - h} ${f1(xx)},340" fill="#d99a82"/>` +
          `<polygon points="${f1(xx)},${340 - h} ${f1(xx + bw / 2)},340 ${f1(xx)},340" fill="#9f5d5e"/>`,
        )
      }
      out += rimmed(ridge(22, 345, [[3, 6], [7, 3]]), '#a8625f', '#c27c70')
      return svg(W, H, out)
    },
    hills_far() {
      let out = rimmed(ridge(31, 300, [[2, 16], [4, 8]]), '#8f4636', '#ad5c44')
      // colonnade on a stylobate
      out += `<rect x="300" y="236" width="400" height="22" fill="#8f4636"/><rect x="300" y="236" width="400" height="5" fill="#b8664c"/>`
      const breaks = [0, 0, 0.45, 0, 0, 0.7, 0, 0.3, 0]
      for (let i = 0; i < 9; i++) {
        const x = 322 + i * 45
        out += column(x, 236, 112, 20, '#8f4636', '#b8664c', breaks[i])
      }
      out += `<rect x="304" y="114" width="150" height="16" fill="#8f4636"/><rect x="530" y="114" width="80" height="16" fill="#8f4636"/>`
      out += `<polygon points="296,114 384,80 462,114" fill="#8f4636"/>`
      // obelisk
      out += wrap(880, 20, (xx) => `<polygon points="${xx - 16},290 ${xx + 16},290 ${xx + 10},110 ${xx - 10},110" fill="#7d3b2e"/><polygon points="${xx - 10},110 ${xx + 10},110 ${xx},90" fill="#e2b84a"/><rect x="${xx - 6}" y="120" width="4" height="160" fill="#a3543d"/>`)
      return svg(W, H, out)
    },
    hills_near() {
      let out = rimmed(ridge(41, 150, [[2, 34], [3, 18], [7, 6]]), '#d0844c', '#eaa565', 9)
      const r = rng(42)
      for (const x of [90, 610, 680, 960]) {
        const h = 120 + r() * 60
        const y = 150 + Math.sin(x / 90) * 20
        out += wrap(x, h * 0.5, (xx) => palm(xx, y + 18, h, '#7a3b2a'))
      }
      out += rimmed(ridge(43, 190, [[1, 18], [4, 10]]), '#c27a45', '#d99156', 6)
      return svg(W, H, out)
    },
    terrain_cap() {
      const fill = this.fillBody()
      const defs = fill.defs + noiseFilter('n', T, 0.08, 5)
      let out = fill.out
      out += bricks({ top: 10, rows: 4, rowH: 22, widths: [64, 32, 64, 32], colors: ['#dba467', '#d29558', '#e0ad72'], mortar: '#a3683f', seed: 52, bevel: '#f3c98a' })
      out += band(53, 0, 9, 2.5, 2, '#f2c983')
      out += band(54, 0, 5, 1.5, 3, '#f9dca0')
      out += noiseRect('n', T, 0.22)
      return svg(T, T, out, defs)
    },
    fillBody() {
      const defs = noiseFilter('nf', T, 0.06, 7)
      let out = strata(61, ['#b06a39', '#a35f32', '#bb7543', '#9c5a30', '#b26d3c'], 5)
      out += speckles(62, 14, [4, 124], ['#8a4c28', '#c98a55', '#7a4225'], 2, 5)
      out += noiseRect('n', T, 0.25)
      return { defs, out: out.replaceAll("url(#n)", "url(#nf)") }
    },
    terrain_fill() {
      const { defs, out } = this.fillBody()
      return svg(T, T, out, defs)
    },
    bedrock: () => carvedBedrock({ base: ['#4a3f5c', '#544767', '#43395a'], mortar: '#2a2238', inlay: '#e2b84a', seed: 71 }),
    props: [
      // obelisk
      () => svg(60, 220, `<polygon points="8,220 52,220 44,40 16,40" fill="#c98a55"/><polygon points="16,40 44,40 30,8" fill="#e2b84a"/><rect x="22" y="56" width="6" height="150" fill="#e8b27a" opacity="0.7"/><rect x="34" y="70" width="6" height="18" fill="#8a4c28"/><circle cx="37" cy="110" r="5" fill="#8a4c28"/><rect x="0" y="206" width="60" height="14" fill="#a96535"/>`),
      // broken column
      () => svg(80, 160, column(40, 160, 150, 44, '#d9a066', '#f3c98a', 0.35)),
      // amphora
      () => svg(70, 110, `<path d="M25,10 h20 v12 q22,14 20,46 q-2,30 -30,40 q-28,-10 -30,-40 q-2,-32 20,-46z" fill="#c0612d"/><path d="M14,52 q21,8 42,0 v8 q-21,8 -42,0z" fill="#e2b84a"/><path d="M25,22 q-14,0 -12,14" stroke="#c0612d" stroke-width="5" fill="none"/><path d="M45,22 q14,0 12,14" stroke="#c0612d" stroke-width="5" fill="none"/><ellipse cx="26" cy="64" rx="5" ry="18" fill="#e0884d" opacity="0.6"/>`),
      // palm
      () => svg(200, 240, palm(90, 240, 220, '#4f8a3a') + `<path d="M84,240 Q92,130 116,22 L122,24 Q100,130 96,240Z" fill="#8a5a33"/>`),
      // desert shrub
      () => svg(110, 60, `<ellipse cx="55" cy="44" rx="50" ry="18" fill="#8a9a4a"/><ellipse cx="38" cy="36" rx="24" ry="16" fill="#9fb05a"/><ellipse cx="70" cy="34" rx="22" ry="14" fill="#7d8c42"/><circle cx="48" cy="26" r="4" fill="#f3c98a"/><circle cx="76" cy="28" r="3" fill="#e9785a"/>`),
    ],
    hangs: [() => roots(1, '#7a4a2c', '#5e3820'), () => roots(2, '#8a5a33', '#6a4024')],
  },

  harvest_farm: {
    kind: 'original',
    clouds_far() {
      let out = ''
      const r = rng(201)
      for (let i = 0; i < 6; i++) {
        const x = r() * W
        const y = 70 + r() * 120
        const w = 150 + r() * 150
        out += wrap(x, w * 0.6, (xx) => puffCloud(xx, y, w, '#fffdf4'))
      }
      return svg(W, H, out)
    },
    mountains() {
      // distant patchwork farmland: rolling hills cut into tilted field strips (strip widths sum to W → seamless)
      const pts = ridge(211, 255, [[2, 26], [3, 14], [7, 5]])
      const d = ridgePath(pts)
      const fields = ['#c9d79a', '#e6d7a0', '#b7cf96', '#ead39a', '#c3d6a6', '#dccb93']
      const r = rng(212)
      const widths = Array.from({ length: 12 }, () => 70 + r() * 90)
      const sum = widths.reduce((s, w) => s + w, 0)
      let strips = ''
      for (const k of [-1, 0, 1]) {
        let x = k * W
        widths.forEach((w0, i) => {
          const w = (w0 / sum) * W
          // resvg panics on shapes entirely outside the canvas, so skip strips that never touch it
          if (x + w + 160 > 0 && x < W) {
            strips += `<polygon points="${f1(x)},${H} ${f1(x + w)},${H} ${f1(x + w + 160)},200 ${f1(x + 160)},200" fill="${fields[i % fields.length]}"/>`
          }
          x += w
        })
      }
      let hedges = ''
      for (let i = 0; i < 12; i++) {
        const x = (i / 12) * W
        hedges += wrap(x, 150, (xx) => `<path d="M${f1(xx)},${H} L${f1(xx + 140)},230" stroke="#a9bf86" stroke-width="3" opacity="0.8"/>`)
      }
      let out = `<clipPath id="hill"><path d="${d}"/></clipPath>`
      out += `<g clip-path="url(#hill)"><rect width="${W}" height="${H}" fill="#c9d79a"/>${strips}${hedges}</g>`
      out += `<path d="${pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${f1(y)}`).join('')}" fill="none" stroke="#e2ebbd" stroke-width="5"/>`
      for (let i = 0; i < 22; i++) {
        const x = r() * W
        const yy = pts[Math.min(pts.length - 1, Math.round(x / 8))][1]
        const rr = 6 + r() * 6
        out += wrap(x, rr, (xx) => `<circle cx="${f1(xx)}" cy="${f1(yy - rr * 0.4)}" r="${f1(rr)}" fill="#9fbf84"/>`)
      }
      return svg(W, H, out)
    },
    hills_far() {
      let out = rimmed(ridge(221, 215, [[2, 18], [5, 7]]), '#86b865', '#a3cf7c', 6)
      // windmills
      for (const [x, s] of [[170, 1], [790, 0.8]]) out += wrap(x, 70 * s, (xx) => windmill(xx, 212, 150 * s, '#f4ead2', '#b65a3f', '#e8dcbc'))
      // barn + silos
      out += wrap(470, 90, (xx) => barn(xx, 214, 1))
      // round trees
      const r = rng(222)
      for (const x of [330, 380, 640, 960]) {
        const h = 50 + r() * 30
        out += wrap(x, h * 0.4, (xx) => roundTree(xx, 214 + Math.sin(xx / 80) * 4, h, '#6d5638', '#5f9d4f', '#7ab463'))
      }
      out += rimmed(ridge(223, 238, [[3, 8], [6, 4]]), '#78ab59', '#8fbf68', 5)
      return svg(W, H, out)
    },
    hills_near() {
      // golden wheat field with a fence line
      const pts = ridge(231, 150, [[2, 22], [3, 10], [7, 4]])
      let out = rimmed(pts, '#e2ad45', '#f3cd6a', 10)
      const r = rng(232)
      for (let i = 0; i < 260; i++) {
        const x = r() * W
        const y = (pts[Math.round(x / 8)]?.[1] ?? 150) + 4 + r() * 70
        const h = 10 + r() * 10
        out += wrap(x, 4, (xx) => `<path d="M${f1(xx)},${f1(y)} l${f1(1 + r() * 2)},${f1(-h)}" stroke="${i % 3 ? '#c99033' : '#f6d77c'}" stroke-width="2" stroke-linecap="round"/>`)
      }
      // fence along the near edge
      const fy = (x) => (pts[Math.round(x / 8)]?.[1] ?? 150) + 34
      let fence = ''
      for (let x = 0; x < W; x += 40) fence += `<rect x="${x}" y="${f1(fy(x) - 26)}" width="5" height="30" rx="1" fill="#9a6a3c"/>`
      fence += `<path d="${pts.map(([x], i) => `${i ? 'L' : 'M'}${x},${f1(fy(x) - 20)}`).join('')}" stroke="#b07a46" stroke-width="4" fill="none"/>`
      fence += `<path d="${pts.map(([x], i) => `${i ? 'L' : 'M'}${x},${f1(fy(x) - 9)}`).join('')}" stroke="#b07a46" stroke-width="4" fill="none"/>`
      out += fence
      out += rimmed(ridge(233, 205, [[1, 12], [4, 6]]), '#d39b3a', '#e6b552', 6)
      return svg(W, H, out)
    },
    terrain_cap() {
      const fill = this.fillBody()
      const defs = fill.defs + noiseFilter('n', T, 0.08, 13)
      let out = fill.out
      // straw-gold topsoil with wheat stubble, then a thin green under-layer
      out += band(241, 0, 18, 3, 2, '#7da447')
      out += band(242, 0, 13, 2.5, 3, '#e3b04b')
      out += band(243, 0, 6, 1.5, 4, '#f6d675')
      const r = rng(244)
      for (let i = 0; i < 22; i++) {
        const x = r() * T
        const y = 3 + r() * 9
        out += wrap(x, 3, (xx) => `<path d="M${f1(xx)},${f1(y + 4)} l${f1(r() * 2 - 1)},-4" stroke="${i % 2 ? '#c48d2e' : '#fff0b3'}" stroke-width="1.6" stroke-linecap="round"/>`, T)
      }
      out += noiseRect('n', T, 0.15)
      return svg(T, T, out, defs)
    },
    fillBody() {
      const defs = noiseFilter('nf', T, 0.06, 15)
      let out = strata(251, ['#6e4428', '#61391f', '#784b2c', '#5a341d', '#704529'], 5)
      out += speckles(252, 16, [6, 124], ['#9b8571', '#b39d86', '#4a2c18', '#86705c'], 2, 5)
      out += roots(253, '#4f2f1a', '#3f2412', true)
      out += noiseRect('n', T, 0.25)
      return { defs, out: out.replaceAll('url(#n)', 'url(#nf)') }
    },
    terrain_fill() {
      const { defs, out } = this.fillBody()
      return svg(T, T, out, defs)
    },
    bedrock: () => carvedBedrock({ base: ['#7b756b', '#857e72', '#6f695f'], mortar: '#47423b', moss: '#7da447', seed: 261 }),
    props: [
      // round hay bale
      () => svg(110, 80, `<ellipse cx="55" cy="76" rx="50" ry="5" fill="#000" opacity="0.15"/><rect x="8" y="10" width="94" height="66" rx="33" fill="#e2ad45"/><circle cx="76" cy="43" r="30" fill="#f0c766"/><circle cx="76" cy="43" r="20" fill="none" stroke="#c99033" stroke-width="3"/><circle cx="76" cy="43" r="10" fill="none" stroke="#c99033" stroke-width="3"/><rect x="30" y="10" width="5" height="66" fill="#b0402f"/>`),
      // stacked square bales
      () => svg(120, 100, `<rect x="6" y="50" width="54" height="46" rx="4" fill="#e2ad45"/><rect x="60" y="50" width="54" height="46" rx="4" fill="#d9a23d"/><rect x="32" y="6" width="56" height="44" rx="4" fill="#ecbf5a"/>${[[6, 50, 54], [60, 50, 54], [32, 6, 56]].map(([x, y, w]) => `<rect x="${x}" y="${y + 14}" width="${w}" height="4" fill="#b0402f"/><rect x="${x}" y="${y + 30}" width="${w}" height="4" fill="#b0402f"/><path d="M${x + 6},${y + 6} h${w - 12}" stroke="#f9e19a" stroke-width="3"/>`).join('')}`),
      // sunflowers
      () => svg(90, 160, [[25, 130], [55, 160], [72, 110]].map(([x, h]) => `<path d="M${x},160 q-4,-${h / 2} 0,-${h - 14}" stroke="#5f9d4f" stroke-width="5" fill="none"/><ellipse cx="${x - 9}" cy="${160 - h * 0.45}" rx="10" ry="5" fill="#6fae58" transform="rotate(-25 ${x - 9} ${160 - h * 0.45})"/>${Array.from({ length: 12 }, (_, i) => `<ellipse cx="${f1(x + Math.cos((i / 12) * TAU) * 11)}" cy="${f1(160 - h + 14 + Math.sin((i / 12) * TAU) * 11)}" rx="7" ry="3.6" fill="${i % 2 ? '#f7c531' : '#ffd84d'}" transform="rotate(${(i / 12) * 360} ${f1(x + Math.cos((i / 12) * TAU) * 11)} ${f1(160 - h + 14 + Math.sin((i / 12) * TAU) * 11)})"/>`).join('')}<circle cx="${x}" cy="${160 - h + 14}" r="8" fill="#7a4a24"/>`).join('')),
      // scarecrow
      () => svg(100, 170, `<rect x="47" y="40" width="6" height="130" fill="#8a5a33"/><rect x="10" y="62" width="80" height="6" fill="#8a5a33"/><path d="M28,60 h44 l6,52 h-56z" fill="#4f7fc4"/><rect x="34" y="70" width="10" height="10" fill="#e2ad45"/><path d="M14,64 l-8,10 M86,64 l8,10" stroke="#e2ad45" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="40" r="16" fill="#f1dcae"/><path d="M28,30 h44 l-8,-8 h-28z" fill="#b65a3f"/><rect x="36" y="12" width="28" height="12" rx="3" fill="#b65a3f"/><circle cx="44" cy="40" r="2.5" fill="#3a2a1a"/><circle cx="56" cy="40" r="2.5" fill="#3a2a1a"/><path d="M43,48 q7,5 14,0" stroke="#3a2a1a" stroke-width="2" fill="none"/>`),
      // wooden fence segment
      () => svg(130, 70, `<rect x="8" y="10" width="9" height="60" rx="2" fill="#9a6a3c"/><rect x="60" y="10" width="9" height="60" rx="2" fill="#9a6a3c"/><rect x="112" y="10" width="9" height="60" rx="2" fill="#9a6a3c"/><rect x="2" y="22" width="126" height="8" rx="2" fill="#b07a46"/><rect x="2" y="44" width="126" height="8" rx="2" fill="#b07a46"/><rect x="2" y="22" width="126" height="2" fill="#d19a63"/><rect x="2" y="44" width="126" height="2" fill="#d19a63"/>`),
    ],
    hangs: [() => roots(5, '#5a361f', '#3f2412'), () => roots(6, '#6e4428', '#4f2f1a')],
  },

  volcano_rift: {
    kind: 'original',
    clouds_far() {
      // drifting ash clouds + glowing embers
      let out = ''
      const r = rng(301)
      for (let i = 0; i < 7; i++) {
        const x = r() * W
        const y = 60 + r() * 130
        const w = 160 + r() * 200
        out += wrap(x, w * 0.6, (xx) => `<g opacity="${f1(0.55 + r() * 0.3)}">${puffCloud(xx, y, w, '#4a2b36')}</g>`)
      }
      for (let i = 0; i < 70; i++) {
        const x = r() * W
        const y = r() * 330
        const rr = 1 + r() * 2.2
        out += wrap(x, rr, (xx) => `<circle cx="${f1(xx)}" cy="${f1(y)}" r="${f1(rr)}" fill="${r() < 0.5 ? '#ffb15c' : '#ff7a3a'}" opacity="${f1(0.5 + r() * 0.5)}"/>`)
      }
      return svg(W, H, out)
    },
    mountains() {
      let out = rimmed(ridge(311, 300, [[2, 14], [5, 6]]), '#4a1f2c', '#5e2a36')
      // the volcano: wide cone, notched crater, lava streams, smoke column
      const vx = 560
      const cone = (xx) =>
        `<polygon points="${xx - 330},360 ${xx - 70},92 ${xx - 40},100 ${xx - 15},86 ${xx + 20},98 ${xx + 55},90 ${xx + 330},360" fill="#3d1824"/>` +
        `<polygon points="${xx - 330},360 ${xx - 70},92 ${xx - 40},100 ${xx - 30},360" fill="#57283a"/>` +
        `<path d="M${xx - 12},96 q-10,60 -40,110 q-20,40 -70,100 l10,4 q50,-55 72,-96 q28,-50 38,-116z" fill="#ff7a2a"/>` +
        `<path d="M${xx + 22},98 q14,70 50,120 q30,40 40,90 l-9,2 q-12,-46 -40,-86 q-40,-58 -50,-124z" fill="#ff8f3a"/>` +
        `<path d="M${xx - 10},98 q-6,40 -26,78" stroke="#ffd36a" stroke-width="4" fill="none"/>` +
        `<ellipse cx="${xx}" cy="94" rx="58" ry="10" fill="#ff9a3a"/><ellipse cx="${xx}" cy="92" rx="40" ry="5" fill="#ffd86a"/>`
      out += wrap(vx, 330, cone)
      const r = rng(312)
      let smoke = ''
      // rising smoke column: puffs widen and drift slightly with height, lit orange from the crater below
      for (let i = 0; i < 7; i++) {
        const t = i / 6
        const sy = 84 - t * 50
        const sr = 12 + t * 18
        for (const dx of [-0.7, 0, 0.7]) {
          const sx = vx + t * 26 + dx * sr * (0.8 + r() * 0.3)
          smoke += `<circle cx="${f1(sx)}" cy="${f1(sy + Math.abs(dx) * 6)}" r="${f1(sr * (dx ? 0.75 : 1))}" fill="${i < 2 ? '#7a3a34' : i % 2 ? '#4a3038' : '#55383f'}"/>`
        }
      }
      out += `<g opacity="0.92">${smoke}</g>`
      out += rimmed(ridge(313, 330, [[3, 8], [7, 4]]), '#3a1622', '#4c2030')
      return svg(W, H, out)
    },
    hills_far() {
      // basalt column cliffs with glowing lava falls between them
      let out = rimmed(ridge(321, 230, [[2, 12], [5, 5]]), '#2a1a22', '#3a2630', 6)
      const r = rng(322)
      for (const [cx, n] of [[130, 7], [470, 5], [820, 8]]) {
        out += wrap(cx, n * 16, (xx) => {
          let g = ''
          for (let i = 0; i < n; i++) {
            const x = xx - (n * 16) / 2 + i * 16
            const top = 120 + Math.abs(i - n / 2) * 14 + r() * 18
            g += `<rect x="${f1(x)}" y="${f1(top)}" width="15" height="${f1(240 - top)}" fill="${i % 2 ? '#2e1f28' : '#352430'}"/>`
            g += `<polygon points="${f1(x)},${f1(top)} ${f1(x + 7.5)},${f1(top - 5)} ${f1(x + 15)},${f1(top)}" fill="#4d3540"/>`
          }
          return g
        })
      }
      for (const x of [300, 650, 960]) {
        out += wrap(x, 20, (xx) =>
          `<rect x="${xx - 14}" y="130" width="28" height="110" fill="#ff7a2a" opacity="0.25"/>` +
          `<path d="M${xx - 6},132 q-3,50 2,108 h10 q4,-58 2,-108z" fill="#ff8f3a"/>` +
          `<path d="M${xx - 1},134 q-1,50 1,104" stroke="#ffd86a" stroke-width="3" fill="none"/>` +
          `<ellipse cx="${xx}" cy="238" rx="26" ry="7" fill="#ffb64a"/>`,
        )
      }
      out += rimmed(ridge(323, 250, [[3, 6], [6, 3]]), '#24161d', '#3d2028', 4)
      return svg(W, H, out)
    },
    hills_near() {
      // ash hills lit from below by a lava river
      const pts = ridge(331, 160, [[2, 26], [3, 12], [7, 5]])
      let out = rimmed(pts, '#22141a', '#ff8a3a', 4)
      out += `<path d="${ridgePath(pts.map(([x, y]) => [x, y + 4]))}" fill="#2a181f"/>`
      out += `<rect x="0" y="230" width="${W}" height="${H - 230}" fill="#ff6a1a" opacity="0.18"/>`
      out += rimmed(ridge(332, 220, [[1, 10], [4, 6]]), '#1c1015', '#5a2a2a', 5)
      // glowing cracks in the ash
      const r = rng(333)
      for (let i = 0; i < 12; i++) {
        const x = r() * W
        const y = 250 + r() * 100
        const len = 30 + r() * 50
        out += wrap(x, len, (xx) => `<path d="M${f1(xx)},${f1(y)} l${f1(len * 0.4)},${f1(-6 + r() * 12)} l${f1(len * 0.3)},${f1(-6 + r() * 12)} l${f1(len * 0.3)},${f1(-4 + r() * 8)}" stroke="#ff8a3a" stroke-width="2" fill="none" opacity="0.8"/>`)
      }
      return svg(W, H, out)
    },
    terrain_cap() {
      const fill = this.fillBody()
      const defs = fill.defs + noiseFilter('n', T, 0.09, 17)
      let out = fill.out
      // black cooled-lava crust with glowing seams
      out += band(341, 0, 16, 3, 2, '#1e171b')
      out += band(342, 0, 11, 2, 3, '#2b2226')
      out += band(343, 0, 4, 1, 4, '#4a3a40')
      const r = rng(344)
      for (let i = 0; i < 5; i++) {
        const x = r() * T
        out += wrap(x, 14, (xx) => `<path d="M${f1(xx)},${f1(3 + r() * 4)} l${f1(4 + r() * 4)},${f1(4 + r() * 4)} l${f1(-2 + r() * 6)},${f1(3 + r() * 4)}" stroke="#ff7a2a" stroke-width="1.6" fill="none" stroke-linecap="round"/>`, T)
      }
      out += noiseRect('n', T, 0.18)
      return svg(T, T, out, defs)
    },
    fillBody() {
      const defs = noiseFilter('nf', T, 0.07, 19)
      let out = strata(351, ['#4a2a26', '#3f2320', '#55302a', '#3a201e', '#4d2c27'], 5)
      out += speckles(352, 12, [6, 124], ['#2a1816', '#6a3f34', '#1e1210'], 2, 5)
      out += speckles(353, 5, [10, 120], ['#ff8a3a', '#ffb64a'], 1, 2)
      out += noiseRect('n', T, 0.28)
      return { defs, out: out.replaceAll('url(#n)', 'url(#nf)') }
    },
    terrain_fill() {
      const { defs, out } = this.fillBody()
      return svg(T, T, out, defs)
    },
    bedrock: () => carvedBedrock({ base: ['#2a2233', '#30283a', '#251e2e'], mortar: '#120d18', inlay: '#ff7a2a', seed: 361 }),
    props: [
      // basalt pillar cluster
      () => svg(90, 150, [[10, 70, '#352430'], [30, 30, '#2e1f28'], [50, 50, '#3a2834'], [68, 90, '#2e1f28']].map(([x, top, c]) => `<rect x="${x}" y="${top}" width="20" height="${150 - top}" fill="${c}"/><polygon points="${x},${top} ${x + 10},${top - 6} ${x + 20},${top}" fill="#5a4050"/><rect x="${x + 3}" y="${top + 4}" width="4" height="${142 - top}" fill="#4d3540" opacity="0.7"/>`).join('')),
      // charred dead tree
      () => svg(110, 170, `<path d="M50,170 L54,90 L30,52 L36,48 L57,80 L60,40 L48,14 L54,12 L66,38 L70,70 L90,46 L95,50 L72,92 L68,170Z" fill="#241a1e"/><path d="M58,160 L60,100" stroke="#ff7a2a" stroke-width="2" opacity="0.7"/>`),
      // glowing ore rock
      () => svg(110, 80, `<path d="M8,80 L18,40 L44,22 L76,26 L100,50 L104,80Z" fill="#2e2228"/><path d="M18,40 L44,22 L52,40 L30,56Z" fill="#40323a"/><polygon points="50,46 60,26 70,48" fill="#ff9a3a"/><polygon points="58,46 64,34 70,48" fill="#ffd86a"/><polygon points="30,70 38,52 46,72" fill="#ff7a2a"/><polygon points="76,72 84,56 92,74" fill="#ffb64a"/>`),
      // fumarole vent with steam
      () => svg(100, 150, `<circle cx="46" cy="40" r="20" fill="#d9c9c9" opacity="0.35"/><circle cx="58" cy="20" r="16" fill="#d9c9c9" opacity="0.25"/><circle cx="50" cy="66" r="16" fill="#d9c9c9" opacity="0.45"/><path d="M14,150 Q30,96 50,90 Q70,96 86,150Z" fill="#3a2a30"/><ellipse cx="50" cy="94" rx="14" ry="5" fill="#ff8a3a"/><ellipse cx="50" cy="93" rx="8" ry="2.5" fill="#ffd86a"/><path d="M30,140 Q38,110 46,100" stroke="#55303a" stroke-width="4" fill="none"/>`),
      // lava rock boulder with ember cracks
      () => svg(90, 60, `<ellipse cx="45" cy="34" rx="42" ry="26" fill="#2b2226"/><ellipse cx="34" cy="24" rx="20" ry="9" fill="#40323a"/><path d="M20,40 l14,-6 l10,8 l16,-10 l12,6" stroke="#ff7a2a" stroke-width="2.4" fill="none" stroke-linecap="round"/>`),
    ],
    hangs: [
      // dripping stalactites with glowing tips
      () => svg(60, 90, `<polygon points="4,0 22,0 14,70" fill="#2b2226"/><circle cx="14" cy="72" r="3" fill="#ff8a3a"/><polygon points="26,0 46,0 37,48" fill="#352a30"/><circle cx="37" cy="50" r="2.5" fill="#ffb64a"/><polygon points="44,0 58,0 52,32" fill="#2b2226"/>`),
      () => roots(7, '#2a1c1c', '#1a1012'),
    ],
  },

  sky_meadow: {
    kind: 'original',
    clouds_far() {
      let out = ''
      const r = rng(111)
      for (let i = 0; i < 7; i++) {
        const x = r() * W
        const y = 90 + r() * 140
        const w = 140 + r() * 160
        out += wrap(x, w * 0.6, (xx) => puffCloud(xx, y, w, '#ffffff', '#dbeeff'))
      }
      return svg(W, H, out)
    },
    mountains() {
      const c = { top: '#b8d6ef', under: '#9cbcdc', fall: '#e4f2ff' }
      let out = ''
      for (const [x, y, w, opt] of [[140, 210, 200, {}], [480, 150, 150, { castle: '#a9c7e6' }], [760, 240, 230, {}], [960, 170, 90, {}]]) {
        out += wrap(x, w / 2, (xx) => floatingIsland(xx, y, w, c, opt))
      }
      return svg(W, H, out)
    },
    hills_far() {
      const c = { top: '#7cc08a', under: '#6f8fa8', fall: '#d9efff', tree: '#5a9f6c' }
      let out = ''
      for (const [x, y, w] of [[260, 120, 260], [690, 150, 200], [1000, 95, 160]]) {
        out += wrap(x, w / 2, (xx) => floatingIsland(xx, y, w, c, { fallLen: 220 }))
      }
      return svg(W, H, out)
    },
    hills_near() {
      // sea of clouds: the abyss under the sky maps reads as clouds, not as solid ground
      let out = ''
      const r = rng(141)
      for (let i = 0; i < 16; i++) {
        const x = (i / 16) * W + r() * 30
        const y = 150 + r() * 50
        const rad = 50 + r() * 45
        out += wrap(x, rad, (xx) => `<circle cx="${f1(xx)}" cy="${f1(y)}" r="${f1(rad)}" fill="#f4f9ff"/>`)
      }
      out += `<rect x="0" y="190" width="${W}" height="${H - 190}" fill="#f4f9ff"/>`
      for (let i = 0; i < 14; i++) {
        const x = r() * W
        const y = 225 + r() * 40
        const rad = 40 + r() * 30
        out += wrap(x, rad, (xx) => `<circle cx="${f1(xx)}" cy="${f1(y)}" r="${f1(rad)}" fill="#e2eefb"/>`)
      }
      out += `<rect x="0" y="260" width="${W}" height="${H - 260}" fill="#e2eefb"/>`
      return svg(W, H, out)
    },
    terrain_cap() {
      const fill = this.fillBody()
      const defs = fill.defs + noiseFilter('n', T, 0.07, 9)
      let out = fill.out
      out += speckles(152, 8, [30, 124], ['#a89a8a', '#6b4a32'], 2, 5)
      out += band(153, 0, 16, 3, 3, '#4f9a3a')
      out += band(154, 0, 11, 2.5, 5, '#6cc04a')
      out += band(155, 0, 5, 1.5, 7, '#8fd866')
      out += speckles(156, 7, [3, 10], ['#ff8fb1', '#ffe066', '#ffffff'], 1.5, 2.4)
      out += roots(157, '#5e3c26', '#4a2e1c', true)
      out += noiseRect('n', T, 0.2)
      return svg(T, T, out, defs)
    },
    fillBody() {
      const defs = noiseFilter('nf', T, 0.06, 11)
      let out = strata(161, ['#7a4e33', '#70472e', '#835538', '#6b432b'], 4)
      out += speckles(162, 12, [4, 124], ['#9a8a7a', '#5e3c26', '#b5a593'], 2, 6)
      out += noiseRect('n', T, 0.22)
      return { defs, out: out.replaceAll("url(#n)", "url(#nf)") }
    },
    terrain_fill() {
      const { defs, out } = this.fillBody()
      return svg(T, T, out, defs)
    },
    bedrock: () => carvedBedrock({ base: ['#6b7a83', '#74848c', '#62717a'], mortar: '#3f4a52', moss: '#5f9e4a', seed: 171 }),
    props: [
      () => svg(140, 200, roundTree(70, 200, 195, '#7a5232', '#4f9a3a', '#7cc35a')),
      () => svg(110, 210, pine(55, 210, 205, '#3f7a4a')),
      () => svg(120, 60, `<ellipse cx="60" cy="44" rx="56" ry="18" fill="#4f9a3a"/><ellipse cx="40" cy="34" rx="26" ry="18" fill="#62b04a"/><ellipse cx="80" cy="34" rx="24" ry="16" fill="#58a644"/>` + speckles(181, 9, [22, 46], ['#ff8fb1', '#ffe066', '#ffffff', '#b38cff'], 3, 4.5, 120)),
      () => svg(70, 80, `<rect x="28" y="40" width="14" height="40" rx="6" fill="#f4ead8"/><ellipse cx="35" cy="40" rx="34" ry="22" fill="#e04a3a"/><circle cx="22" cy="34" r="5" fill="#fff"/><circle cx="42" cy="28" r="4" fill="#fff"/><circle cx="50" cy="42" r="3.5" fill="#fff"/>`),
      () => svg(90, 70, `<ellipse cx="45" cy="52" rx="44" ry="18" fill="#8d9aa3"/><ellipse cx="38" cy="44" rx="30" ry="20" fill="#a3afb7"/><ellipse cx="34" cy="30" rx="16" ry="6" fill="#62b04a"/>`),
    ],
    hangs: [() => roots(3, '#5e3c26', '#4a2e1c'), () => vines(4, '#4f9a3a', '#7cc35a'), () => vines(5, '#3f8a3a', '#62b04a')],
  },

  aurora_night: {
    kind: 'original',
    clouds_far() {
      const defs = `<linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5eead4" stop-opacity="0"/><stop offset="0.55" stop-color="#5eead4" stop-opacity="0.75"/><stop offset="1" stop-color="#a78bfa" stop-opacity="0"/></linearGradient>`
      let out = ''
      for (const [seed, base, amp, thick] of [[201, 120, 40, 90], [202, 190, 30, 70]]) {
        const top = ridge(seed, base, [[2, amp], [3, amp * 0.5]], W, 8)
        const d = top.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${f1(y)}`).join('')
        const bottom = top.map(([x, y]) => `L${x},${f1(y + thick)}`).reverse().join('')
        out += `<path d="${d}${bottom}Z" fill="url(#a)"/>`
      }
      return svg(W, H, out, defs)
    },
    mountains() {
      let out = speckles(211, 60, [6, 200], ['#ffffff', '#cfe3ff', '#fff7c2'], 0.8, 1.8, W)
      const peaks = []
      const r = rng(212)
      for (let x = 0; x <= W; x += 64) peaks.push([x, x % 128 ? 300 - r() * 30 : 190 + r() * 70])
      peaks[peaks.length - 1][1] = peaks[0][1]
      out += rimmed(peaks, '#1f3a63', '#5d84b8', 6)
      return svg(W, H, out)
    },
    hills_far() {
      let out = rimmed(ridge(221, 215, [[2, 14], [5, 6]]), '#163052', '#2c4f7c')
      const r = rng(222)
      for (let i = 0; i < 26; i++) {
        const x = r() * W
        const h = 60 + r() * 70
        const y = 215 + Math.sin((2 * TAU * x) / W) * 10
        out += wrap(x, h * 0.25, (xx) => pine(xx, y + 10, h, '#163052', '#c7dcf5'))
      }
      return svg(W, H, out)
    },
    hills_near() {
      let out = ''
      const r = rng(231)
      for (let i = 0; i < 18; i++) {
        const x = (i / 18) * W + r() * 25
        const rad = 45 + r() * 40
        out += wrap(x, rad, (xx) => `<circle cx="${f1(xx)}" cy="${f1(175 + r() * 40)}" r="${f1(rad)}" fill="#3d6696"/>`)
      }
      out += `<rect x="0" y="200" width="${W}" height="${H - 200}" fill="#3d6696"/>`
      for (let i = 0; i < 14; i++) {
        const x = r() * W
        const rad = 40 + r() * 30
        out += wrap(x, rad, (xx) => `<circle cx="${f1(xx)}" cy="${f1(245 + r() * 30)}" r="${f1(rad)}" fill="#2a4d78"/>`)
      }
      out += `<rect x="0" y="270" width="${W}" height="${H - 270}" fill="#2a4d78"/>`
      return svg(W, H, out)
    },
    terrain_cap() {
      const fill = this.fillBody()
      const defs = fill.defs + noiseFilter('n', T, 0.05, 13)
      let out = fill.out
      out += bricks({ top: 14, rows: 4, rowH: 26, widths: [64, 42.6667, 64, 32], colors: ['#9fd0f0', '#8fc3ea', '#a9d8f5'], mortar: '#6a9fcd', seed: 242, bevel: '#e4f4ff' })
      for (let i = 0; i < 6; i++) {
        const r = rng(243 + i)
        const x = r() * T
        const seg = `,${f1(20 + r() * 80)} l${f1(r() * 10 - 5)},${f1(8 + r() * 10)} l${f1(r() * 10 - 5)},${f1(8 + r() * 10)}`
        out += wrap(x, 12, (xx) => `<path d="M${f1(xx)}${seg}" stroke="#e4f4ff" stroke-width="1.3" fill="none" opacity="0.8"/>`, T)
      }
      out += band(244, 0, 14, 3, 2, '#c8dcf2')
      out += band(245, 0, 10, 2, 3, '#f2f8ff')
      out += noiseRect('n', T, 0.14)
      return svg(T, T, out, defs)
    },
    fillBody() {
      const defs = noiseFilter('nf', T, 0.05, 15)
      let out = strata(251, ['#4c7fb3', '#4577aa', '#5588bc', '#3f6fa0'], 4)
      for (let i = 0; i < 7; i++) {
        const r = rng(252 + i)
        const x = r() * T
        const y = r() * T
        const seg = ` l${f1(r() * 14 - 7)},${f1(10 + r() * 8)} l${f1(r() * 14 - 7)},${f1(6 + r() * 8)}`
        out += wrap(x, 14, (xx) => `<path d="M${f1(xx)},${f1(y)}${seg}" stroke="#a9d1f2" stroke-width="1.2" fill="none" opacity="0.7"/>`, T)
      }
      out += speckles(259, 10, [4, 124], ['#cfe6fa', '#33608f'], 1.5, 3.5)
      out += noiseRect('n', T, 0.16)
      return { defs, out: out.replaceAll("url(#n)", "url(#nf)") }
    },
    terrain_fill() {
      const { defs, out } = this.fillBody()
      return svg(T, T, out, defs)
    },
    bedrock: () => crystalBedrock(),
    props: [
      () => svg(120, 220, pine(60, 220, 215, '#1f4a5e', '#f2f8ff')),
      () => svg(90, 120, `<polygon points="45,4 60,60 45,118 30,60" fill="#8fd3ff"/><polygon points="45,4 60,60 45,118" fill="#5fb3ea"/><polygon points="20,40 30,80 20,118 10,80" fill="#a9e0ff"/><polygon points="72,50 82,84 72,118 62,84" fill="#7fc6f5"/><polygon points="45,4 52,40 45,60" fill="#ffffff" opacity="0.7"/>`),
      () => svg(50, 160, `<rect x="21" y="40" width="8" height="120" fill="#2c3e57"/><rect x="12" y="150" width="26" height="10" fill="#2c3e57"/><circle cx="25" cy="30" r="22" fill="#ffd27a" opacity="0.35"/><rect x="14" y="16" width="22" height="26" rx="4" fill="#2c3e57"/><rect x="18" y="20" width="14" height="18" rx="2" fill="#ffe7a3"/><polygon points="10,16 40,16 25,4" fill="#2c3e57"/>`),
      () => svg(100, 70, `<ellipse cx="50" cy="54" rx="48" ry="16" fill="#6f8fb0"/><ellipse cx="44" cy="44" rx="32" ry="22" fill="#86a5c4"/><ellipse cx="44" cy="28" rx="28" ry="9" fill="#f2f8ff"/>`),
    ],
    hangs: [() => icicles(6), () => icicles(7), () => icicles(8)],
  },

  moon_ruins: {
    kind: 'original',
    clouds_far() {
      let out = ''
      const r = rng(301)
      for (let i = 0; i < 10; i++) {
        const x = r() * W
        const y = 30 + r() * 190
        const w = 160 + r() * 260
        out += wrap(x, w / 2, (xx) => `<rect x="${f1(xx - w / 2)}" y="${f1(y)}" width="${f1(w)}" height="${f1(8 + r() * 12)}" rx="9" fill="#d6a8e0" opacity="${f1(0.35 + r() * 0.35)}"/>`)
      }
      return svg(W, H, out)
    },
    mountains() {
      let out = rimmed(ridge(311, 320, [[2, 22], [5, 10]]), '#4f3570', '#6d4f8f')
      // distant temple on a floating rock, with a clock tower
      out += wrap(620, 140, (xx) =>
        `<path d="M${xx - 130},150 Q${xx - 90},230 ${xx - 10},270 Q${xx + 60},220 ${xx + 130},150Z" fill="#4b2f66"/>` +
        `<rect x="${xx - 110}" y="110" width="220" height="42" fill="#4b2f66"/><polygon points="${xx - 120},110 ${xx},70 ${xx + 120},110" fill="#4b2f66"/>` +
        `<rect x="${xx - 18}" y="10" width="36" height="110" fill="#4b2f66"/><polygon points="${xx - 24},12 ${xx + 24},12 ${xx},-24" fill="#4b2f66"/>` +
        `<circle cx="${xx}" cy="40" r="11" fill="#f5d48a" opacity="0.85"/>` +
        [-80, -50, 50, 80].map((dx) => `<rect x="${xx + dx - 5}" y="118" width="10" height="30" fill="#6d4f8f" opacity="0.7"/>`).join(''),
      )
      return svg(W, H, out)
    },
    hills_far() {
      let out = rimmed(ridge(321, 225, [[2, 12], [6, 5]]), '#3c2552', '#5a3b78')
      // ruined aqueduct arches
      const arches = (x0, n, h, broken) => {
        let a = `<rect x="${x0}" y="${225 - h}" width="${n * 60}" height="18" fill="#3c2552"/>`
        for (let i = 0; i <= n; i++) a += `<rect x="${x0 + i * 60 - 9}" y="${225 - h}" width="18" height="${h}" fill="#3c2552"/>`
        for (let i = 0; i < n; i++) a += `<path d="M${x0 + i * 60 + 9},${225 - h + 18} h42 v12 a21,21 0 0 0 -42,0z" fill="#3c2552"/>`
        if (broken) a += `<polygon points="${x0 + n * 60 - 30},${225 - h} ${x0 + n * 60 + 9},${225 - h} ${x0 + n * 60 + 9},${215 - h + 50}" fill="#5a3b78"/>`
        return a
      }
      out += arches(120, 5, 120, true) + arches(640, 3, 90, false)
      out += wrap(560, 20, (xx) => column(xx, 225, 150, 22, '#3c2552', '#5a3b78', 0.4))
      return svg(W, H, out)
    },
    hills_near() {
      // purple fog over the abyss
      let out = ''
      const r = rng(331)
      for (let i = 0; i < 16; i++) {
        const x = (i / 16) * W + r() * 30
        const rad = 50 + r() * 40
        out += wrap(x, rad, (xx) => `<ellipse cx="${f1(xx)}" cy="${f1(185 + r() * 35)}" rx="${f1(rad * 1.6)}" ry="${f1(rad * 0.7)}" fill="#5a3a78"/>`)
      }
      out += `<rect x="0" y="200" width="${W}" height="${H - 200}" fill="#5a3a78"/>`
      for (let i = 0; i < 12; i++) {
        const x = r() * W
        const rad = 50 + r() * 30
        out += wrap(x, rad * 1.6, (xx) => `<ellipse cx="${f1(xx)}" cy="${f1(250 + r() * 25)}" rx="${f1(rad * 1.6)}" ry="${f1(rad * 0.6)}" fill="#46295f"/>`)
      }
      out += `<rect x="0" y="262" width="${W}" height="${H - 262}" fill="#46295f"/>`
      return svg(W, H, out)
    },
    terrain_cap() {
      const fill = this.fillBody()
      const defs = fill.defs + noiseFilter('n', T, 0.07, 17)
      let out = fill.out
      out += speckles(342, 8, [30, 124], ['#6a5a68', '#33252f'], 3, 6)
      out += bricks({ top: 0, rows: 1, rowH: 20, widths: [42.6667], colors: ['#a597b0', '#9688a3', '#b0a3ba'], mortar: '#4a3744', seed: 343, mortarPx: 3, bevel: '#d6cce0' })
      out += speckles(344, 6, [0, 6], ['#6d8f4e', '#7fa35a'], 3, 6)
      out += noiseRect('n', T, 0.2)
      return svg(T, T, out, defs)
    },
    fillBody() {
      const defs = noiseFilter('nf', T, 0.06, 19)
      let out = strata(351, ['#3a2b36', '#352731', '#40303c', '#31242d'], 4)
      out += speckles(352, 10, [4, 124], ['#5a4a58', '#6a5a68', '#2a1e27'], 3, 7)
      out += noiseRect('n', T, 0.2)
      return { defs, out: out.replaceAll("url(#n)", "url(#nf)") }
    },
    terrain_fill() {
      const { defs, out } = this.fillBody()
      return svg(T, T, out, defs)
    },
    bedrock: () => carvedBedrock({ base: ['#6a5f78', '#736882', '#61566f'], mortar: '#3a3045', inlay: '#d6b25e', seed: 361 }),
    props: [
      () => svg(80, 170, column(40, 170, 165, 40, '#8a7d96', '#b5a8c2', 0.4)),
      () => svg(70, 120, `<rect x="27" y="40" width="16" height="80" fill="#4a3f55"/><rect x="18" y="108" width="34" height="12" fill="#4a3f55"/><path d="M8,40 h54 l-8,14 h-38z" fill="#5a4a66"/><ellipse cx="35" cy="30" rx="16" ry="18" fill="#ff9a3c"/><ellipse cx="35" cy="34" rx="9" ry="11" fill="#ffd27a"/><circle cx="35" cy="22" r="14" fill="#ff9a3c" opacity="0.25"/>`),
      () => svg(70, 100, `<path d="M8,100 V30 a27,27 0 0 1 54,0 V100z" fill="#8a7d96"/><path d="M14,100 V32 a21,21 0 0 1 42,0 V100z" fill="#9d90a9"/><rect x="24" y="40" width="22" height="3" fill="#d6b25e"/><rect x="24" y="52" width="22" height="3" fill="#d6b25e"/><circle cx="35" cy="70" r="6" fill="none" stroke="#d6b25e" stroke-width="3"/><ellipse cx="35" cy="98" rx="34" ry="5" fill="#6d8f4e"/>`),
      () => svg(140, 200, roundTree(70, 200, 190, '#3a2b36', '#4b3a5a', '#5f4a72')),
      () => svg(100, 60, `<ellipse cx="50" cy="46" rx="48" ry="15" fill="#6d8f4e"/><rect x="18" y="26" width="34" height="22" fill="#8a7d96"/><rect x="48" y="34" width="30" height="14" fill="#9d90a9"/><rect x="18" y="26" width="34" height="4" fill="#b5a8c2"/>`),
    ],
    hangs: [() => chain(9), () => vines(10, '#4b3a5a', '#6d8f4e'), () => roots(11, '#3a2b36', '#2a1e27')],
  },

  // Kenney themes: only the generated bedrock + hanging decorations
  emerald_valley: {
    kind: 'kenney',
    bedrock: () => carvedBedrock({ base: ['#6f7d86', '#788790', '#66747d'], mortar: '#3f4a52', moss: '#80be1f', seed: 401 }),
    hangs: [() => roots(12, '#8a5a33', '#6a4024'), () => vines(13, '#5a9f2c', '#80be1f')],
  },
  sunset_canyon: {
    kind: 'kenney',
    bedrock: () => carvedBedrock({ base: ['#5c4a52', '#66525b', '#54434b'], mortar: '#33272d', inlay: '#e2b84a', seed: 411 }),
    hangs: [() => roots(14, '#8a4524', '#6a3218'), () => roots(15, '#9a5530', '#7a3c1e')],
  },
  polar_glacier: {
    kind: 'kenney',
    bedrock: () => crystalBedrock(),
    hangs: [() => icicles(16), () => icicles(17)],
  },
}

// ───────────────────────── tiles & hanging pieces ─────────────────────────

function carvedBedrock({ base, mortar, inlay, moss, seed }) {
  let out = `<rect width="${T}" height="${T}" fill="${mortar}"/>`
  out += bricks({ top: 0, rows: 4, rowH: 32, widths: [64, 64, 64, 64], colors: base, mortar, seed, mortarPx: 4, bevel: '#ffffff' })
  const r = rng(seed + 1)
  for (let row = 0; row < 4; row++) {
    const y = row * 32
    const offset = row % 2 ? 32 : 0
    for (let x = -offset; x < T; x += 64) {
      const glyph = (xx) => {
        let g = `<rect x="${xx + 4}" y="${y + 28}" width="56" height="2" fill="#000" opacity="0.25"/>`
        if (inlay) {
          g += `<rect x="${xx + 10}" y="${y + 9}" width="44" height="2" fill="${inlay}" opacity="0.85"/>`
          const k = Math.floor(r() * 3)
          if (k === 0) g += `<circle cx="${xx + 32}" cy="${y + 19}" r="5" fill="none" stroke="${inlay}" stroke-width="2" opacity="0.85"/>`
          if (k === 1) g += `<path d="M${xx + 24},${y + 24} l8,-10 l8,10" fill="none" stroke="${inlay}" stroke-width="2" opacity="0.85"/>`
          if (k === 2) g += `<rect x="${xx + 29}" y="${y + 14}" width="6" height="10" fill="${inlay}" opacity="0.85"/>`
        }
        if (moss && r() < 0.6) g += `<ellipse cx="${xx + 14 + r() * 36}" cy="${y + 4}" rx="${10 + r() * 8}" ry="4" fill="${moss}" opacity="0.9"/>`
        return g
      }
      out += glyph(x)
      if (x < 0) out += glyph(x + T)
    }
  }
  return svg(T, T, out)
}

function crystalBedrock() {
  let out = `<rect width="${T}" height="${T}" fill="#241d47"/>`
  const facets = [
    [[0, 0], [64, 0], [40, 46], [0, 30]],
    [[64, 0], [128, 0], [128, 36], [88, 52], [40, 46]],
    [[0, 30], [40, 46], [30, 96], [0, 90]],
    [[40, 46], [88, 52], [100, 100], [30, 96]],
    [[88, 52], [128, 36], [128, 90], [100, 100]],
    [[0, 90], [30, 96], [64, 128], [0, 128]],
    [[30, 96], [100, 100], [64, 128]],
    [[100, 100], [128, 90], [128, 128], [64, 128]],
  ]
  const fills = ['#3b2f78', '#4a3c92', '#2f2766', '#5646a8', '#3a2f7a', '#463a8c', '#5c4cb2', '#352b70']
  facets.forEach((poly, i) => {
    out += `<polygon points="${poly.map((p) => p.join(',')).join(' ')}" fill="${fills[i]}" stroke="#8b7cf0" stroke-width="1.2" stroke-opacity="0.55"/>`
  })
  out += `<polygon points="44,50 60,52 52,70" fill="#c4b8ff" opacity="0.5"/><polygon points="96,10 110,8 104,26" fill="#c4b8ff" opacity="0.4"/>`
  return svg(T, T, out)
}

function roots(seed, color, dark, inTile = false) {
  const r = rng(seed * 97)
  const w = inTile ? T : 60
  const h = inTile ? T : 90
  let out = ''
  const n = inTile ? 3 : 4
  for (let i = 0; i < n; i++) {
    const x0 = inTile ? r() * T : 10 + r() * 40
    const y0 = inTile ? 18 + r() * 20 : 0
    const len = inTile ? 20 + r() * 30 : 40 + r() * 48
    const sway = (r() - 0.5) * 18
    const sw = inTile ? 1.6 : 2.5 + r() * 2
    const path = (xx) => `<path d="M${f1(xx)},${f1(y0)} q${f1(sway)},${f1(len * 0.5)} ${f1(sway * 0.4)},${f1(len)}" stroke="${i % 2 ? dark : color}" stroke-width="${f1(sw)}" fill="none" stroke-linecap="round"${inTile ? ' opacity="0.45"' : ''}/>`
    out += inTile ? wrap(x0, 12, path, T) : path(x0)
  }
  return inTile ? out : svg(w, h, out)
}

function vines(seed, color, leaf) {
  const r = rng(seed * 131)
  let out = ''
  for (let i = 0; i < 3; i++) {
    const x0 = 10 + i * 20 + r() * 8
    const len = 50 + r() * 60
    out += `<path d="M${f1(x0)},0 q${f1((r() - 0.5) * 14)},${f1(len / 2)} ${f1((r() - 0.5) * 8)},${f1(len)}" stroke="${color}" stroke-width="2.5" fill="none"/>`
    for (let y = 12; y < len; y += 14 + r() * 8) {
      const side = r() < 0.5 ? -1 : 1
      out += `<ellipse cx="${f1(x0 + side * 5)}" cy="${f1(y)}" rx="5" ry="3" fill="${leaf}" transform="rotate(${side * 30} ${f1(x0 + side * 5)} ${f1(y)})"/>`
    }
  }
  return svg(70, 120, out)
}

function icicles(seed) {
  const r = rng(seed * 59)
  let out = ''
  let x = 2
  while (x < 66) {
    const w = 6 + r() * 8
    const len = 14 + r() * 50
    out += `<polygon points="${f1(x)},0 ${f1(x + w)},0 ${f1(x + w * 0.5)},${f1(len)}" fill="#cfeaff"/><polygon points="${f1(x + w * 0.5)},0 ${f1(x + w)},0 ${f1(x + w * 0.5)},${f1(len)}" fill="#9fd0f0"/>`
    x += w + r() * 4
  }
  return svg(70, 70, out)
}

function chain(seed) {
  const r = rng(seed)
  const len = 6 + Math.floor(r() * 4)
  let out = ''
  for (let i = 0; i < len; i++) {
    out += i % 2
      ? `<rect x="17" y="${i * 10}" width="6" height="13" rx="3" fill="none" stroke="#8a8296" stroke-width="2.5"/>`
      : `<ellipse cx="20" cy="${i * 10 + 6}" rx="6" ry="7" fill="none" stroke="#a69eb2" stroke-width="2.5"/>`
  }
  out += `<circle cx="20" cy="${len * 10 + 12}" r="9" fill="#ff9a3c" opacity="0.3"/><rect x="13" y="${len * 10}" width="14" height="16" rx="3" fill="#4a3f55"/><rect x="16" y="${len * 10 + 3}" width="8" height="10" fill="#ffd27a"/>`
  return svg(40, len * 10 + 20, out)
}

function moon() {
  return svg(
    180,
    180,
    `<circle cx="90" cy="90" r="88" fill="#fff6d5" opacity="0.18"/><circle cx="90" cy="90" r="62" fill="#fff3c4"/><circle cx="70" cy="74" r="11" fill="#eadfae"/><circle cx="108" cy="104" r="15" fill="#eadfae"/><circle cx="102" cy="64" r="6" fill="#eadfae"/><circle cx="72" cy="112" r="5" fill="#eadfae"/>`,
  )
}

// ───────────────────────── output ─────────────────────────

function emit(theme, name, svgText) {
  const svgDir = join(SVG_OUT, theme)
  const pngDir = join(PNG_OUT, theme)
  mkdirSync(svgDir, { recursive: true })
  mkdirSync(pngDir, { recursive: true })
  writeFileSync(join(svgDir, `${name}.svg`), svgText)
  const png = new Resvg(svgText, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } }).render().asPng()
  writeFileSync(join(pngDir, `${name}.png`), png)
}

const manifest = {}
for (const [theme, spec] of Object.entries(THEMES)) {
  const files = ['clouds_far', 'mountains', 'hills_far', 'hills_near', 'terrain_cap', 'terrain_fill']
  if (spec.kind === 'original') {
    for (const f of files) emit(theme, f, spec[f]())
    spec.props.forEach((p, i) => emit(theme, `prop${i}`, p()))
  }
  emit(theme, 'bedrock', spec.bedrock())
  spec.hangs.forEach((h, i) => emit(theme, `hang${i}`, h()))
  manifest[theme] = { props: spec.props?.length ?? 0, hangs: spec.hangs.length }
}
emit('_common', 'moon', moon())

// Optimize SVG sources with SVGO and strip PNG metadata with ImageMagick when they are installed.
function tryRun(command) {
  try {
    execSync(command, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
const svgoOk = tryRun(`svgo -q -r -f "${SVG_OUT}"`)
const magick = ['magick', '"C:/Program Files/ImageMagick-7.1.2-Q16-HDRI/magick.exe"'].find((m) =>
  m.startsWith('"') ? existsSync(m.slice(1, -1)) : tryRun(`${m} -version`),
)
let stripped = 0
if (magick) {
  for (const dir of readdirSync(PNG_OUT)) {
    const pngs = readdirSync(join(PNG_OUT, dir)).filter((f) => f.endsWith('.png'))
    if (pngs.length && tryRun(`${magick} mogrify -strip ${pngs.map((f) => `"${join(PNG_OUT, dir, f)}"`).join(' ')}`)) {
      stripped += pngs.length
    }
  }
}
console.log(JSON.stringify(manifest))
console.log(`svgo: ${svgoOk ? 'optimized' : 'skipped (not on PATH)'} · imagemagick: ${stripped} PNGs stripped`)
