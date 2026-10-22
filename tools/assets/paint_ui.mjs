/**
 * Paint the lobby / HUD surface textures as SVG (hand-designed per surface, seeded so output is reproducible).
 *
 *   node tools/assets/paint_ui.mjs          (or: pnpm run paint:ui)
 *
 * Output: src/assets/ui/*.svg — imported by CSS / Vue so Vite bundles and hashes them.
 *   paper.svg        cream panel paper: pulp fibres + flecks (transparent overlay, seamless 192 tile)
 *   card.svg         button / tile card stock: laid lines + pores (transparent overlay, seamless 96 tile)
 *   plate.svg        HUD instrument plate: brushed streaks (transparent overlay, seamless 128 tile)
 *   stage_sky.svg    "my tank" podium backdrop: halftone sky, sun glow, inked clouds, far hills
 *   stage_turf.svg   podium turf disc the tank stands on
 *   empty_sky.svg    room-list empty state: open sky, clouds, a paper-plane flight path
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'src', 'assets', 'ui')
const INK = '#1d2340'
const TAU = Math.PI * 2

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
const svg = (w, h, body, defs = '', extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"${extra}><defs>${defs}</defs>${body}</svg>`

/** Draw at (x, y) plus copies across every seam the mark crosses, so the tile repeats cleanly. */
function tiled(size, x, y, half, draw) {
  let out = ''
  for (const dx of [0, -size, size]) {
    for (const dy of [0, -size, size]) {
      const cx = x + dx
      const cy = y + dy
      if (cx + half < 0 || cx - half > size || cy + half < 0 || cy - half > size) continue
      out += draw(cx, cy)
    }
  }
  return out
}

// ───────────────────────── overlays ─────────────────────────

/** Panel paper: short curved pulp fibres (warm dark and bright white), a few flecks of bark. */
function paper() {
  const S = 192
  const r = rng(11)
  let out = ''
  for (let i = 0; i < 70; i++) {
    const x = r() * S
    const y = r() * S
    const len = 5 + r() * 11
    const a = r() * TAU
    const bend = (r() - 0.5) * 5
    const dark = r() < 0.55
    const ex = Math.cos(a) * len
    const ey = Math.sin(a) * len
    const op = dark ? 0.07 + r() * 0.06 : 0.35 + r() * 0.3
    out += tiled(S, x, y, len, (cx, cy) =>
      `<path d="M${f1(cx)},${f1(cy)} q${f1(ex / 2 - Math.sin(a) * bend)},${f1(ey / 2 + Math.cos(a) * bend)} ${f1(ex)},${f1(ey)}" stroke="${dark ? '#8a6a3a' : '#ffffff'}" stroke-opacity="${f1(op * 100) / 100}" stroke-width="${dark ? 0.8 : 1.1}" fill="none" stroke-linecap="round"/>`)
  }
  for (let i = 0; i < 26; i++) {
    const x = r() * S
    const y = r() * S
    const s = 0.5 + r() * 0.9
    out += tiled(S, x, y, 2, (cx, cy) => `<ellipse cx="${f1(cx)}" cy="${f1(cy)}" rx="${f1(s)}" ry="${f1(s * 0.6)}" fill="#6a4a24" fill-opacity="0.16"/>`)
  }
  return svg(S, S, out)
}

/** Card stock: faint horizontal laid lines with a slight wobble, chain lines every 24 px, tiny pores. */
function card() {
  const S = 96
  const r = rng(23)
  let out = ''
  for (let y = 2; y < S; y += 3) {
    const w = (r() - 0.5) * 0.6
    out += `<path d="M0,${f1(y + w)} Q${S / 2},${f1(y - w)} ${S},${f1(y + w)}" stroke="#1d2340" stroke-opacity="0.035" stroke-width="0.8" fill="none"/>`
  }
  for (let x = 12; x < S; x += 24) out += `<rect x="${x}" y="0" width="0.8" height="${S}" fill="#1d2340" fill-opacity="0.03"/>`
  for (let i = 0; i < 30; i++) {
    const x = r() * S
    const y = r() * S
    out += tiled(S, x, y, 1, (cx, cy) => `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="0.5" fill="#1d2340" fill-opacity="0.08"/><circle cx="${f1(cx - 0.4)}" cy="${f1(cy - 0.5)}" r="0.4" fill="#fff" fill-opacity="0.6"/>`)
  }
  return svg(S, S, out)
}

/** HUD plate: brushed-metal streaks (light and dark hairlines of varying length), a few micro scratches. */
function plate() {
  const S = 128
  const r = rng(37)
  let out = ''
  for (let i = 0; i < 90; i++) {
    const x = r() * S
    const y = r() * S
    const len = 10 + r() * 40
    const light = r() < 0.5
    out += tiled(S, x, y, len, (cx, cy) => `<rect x="${f1(cx)}" y="${f1(cy)}" width="${f1(len)}" height="0.7" fill="${light ? '#ffffff' : INK}" fill-opacity="${light ? 0.35 : 0.05}"/>`)
  }
  for (let i = 0; i < 8; i++) {
    const x = r() * S
    const y = r() * S
    const a = (r() - 0.5) * 1.2
    const len = 4 + r() * 6
    out += tiled(S, x, y, len, (cx, cy) => `<path d="M${f1(cx)},${f1(cy)} l${f1(Math.cos(a) * len)},${f1(Math.sin(a) * len)}" stroke="${INK}" stroke-opacity="0.12" stroke-width="0.6"/>`)
  }
  return svg(S, S, out)
}

// ───────────────────────── illustrations ─────────────────────────

/** Toon cumulus: puffs on a flat base, inked outline, blue-grey shade under the puffs, white rim highlight. */
function cloud(cx, cy, w, seed, ink = 2.4) {
  const r = rng(seed)
  const n = 4
  const puffs = []
  for (let i = 0; i < n; i++) {
    const px = cx - w / 2 + (w * (i + 0.5)) / n
    const pr = (w / n) * (0.62 + r() * 0.4) * (i === 1 || i === 2 ? 1.25 : 1)
    puffs.push([px, cy - pr * 0.45, pr])
  }
  const base = `<rect x="${f1(cx - w / 2)}" y="${f1(cy - w * 0.1)}" width="${f1(w)}" height="${f1(w * 0.16)}" rx="${f1(w * 0.08)}"/>`
  const shape = puffs.map(([x, y, pr]) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(pr)}"/>`).join('') + base
  // lit body: every puff shrunk and nudged toward the light (top-left), so the shade shows as crescents
  const lit =
    puffs.map(([x, y, pr]) => `<circle cx="${f1(x - pr * 0.1)}" cy="${f1(y - pr * 0.14)}" r="${f1(pr * 0.86)}"/>`).join('') +
    `<rect x="${f1(cx - w / 2 + 2)}" y="${f1(cy - w * 0.12)}" width="${f1(w - 6)}" height="${f1(w * 0.1)}" rx="${f1(w * 0.05)}"/>`
  return (
    `<g fill="${INK}" stroke="${INK}" stroke-width="${ink * 2}" stroke-linejoin="round">${shape}</g>` +
    `<g fill="#c4daf2">${shape}</g>` +
    `<g fill="#ffffff" clip-path="url(#c${seed})">${lit}</g>` +
    `<clipPath id="c${seed}">${shape}</clipPath>` +
    puffs.map(([x, y, pr]) => `<path d="M${f1(x - pr * 0.55)},${f1(y - pr * 0.45)} a${f1(pr * 0.7)},${f1(pr * 0.7)} 0 0 1 ${f1(pr * 0.7)},${f1(-pr * 0.25)}" stroke="#ffffff" stroke-width="2" fill="none" stroke-linecap="round"/>`).join('')
  )
}

/** Halftone dots that shrink from top to bottom (comic-print sky). */
function halftone(w, h, step, rMax, color, opacity, fade = 0.6) {
  let out = ''
  for (let y = step / 2, row = 0; y < h * fade; y += step, row++) {
    const rr = rMax * (1 - y / (h * fade))
    for (let x = (row % 2 ? step / 2 : 0); x < w + step; x += step) {
      out += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}"/>`
    }
  }
  return `<g fill="${color}" fill-opacity="${opacity}">${out}</g>`
}

function stageSky() {
  const W = 480
  const H = 200
  const defs =
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc8ff"/><stop offset="0.7" stop-color="#d9f0ff"/><stop offset="1" stop-color="#f2fbff"/></linearGradient>` +
    `<radialGradient id="sun" cx="0.86" cy="0.08" r="0.5"><stop offset="0" stop-color="#fffdf2" stop-opacity="0.95"/><stop offset="0.3" stop-color="#ffffff" stop-opacity="0.45"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`
  let out = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`
  out += halftone(W, H, 9, 2.2, '#4cb2ff', 0.35)
  out += `<rect width="${W}" height="${H}" fill="url(#sun)"/>`
  // sun rays: soft wedges from the top-right corner
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.55 + i * 0.13
    const x2 = 412 + Math.cos(a) * 320
    const y2 = 16 + Math.sin(a) * 320
    const x3 = 412 + Math.cos(a + 0.05) * 320
    const y3 = 16 + Math.sin(a + 0.05) * 320
    out += `<polygon points="412,16 ${f1(x2)},${f1(y2)} ${f1(x3)},${f1(y3)}" fill="#ffffff" fill-opacity="0.18"/>`
  }
  // far hills with tiny round trees, a lighter rim along the top
  const hill = (base, amp, k, ph, fill, rim) => {
    let d = `M0,${H}`
    for (let x = 0; x <= W; x += 8) d += ` L${x},${f1(base - Math.sin((x / W) * TAU * k + ph) * amp - Math.sin((x / W) * TAU * k * 2.7 + ph * 2) * amp * 0.3)}`
    d += ` L${W},${H}Z`
    return `<path d="${d}" fill="${rim}"/><path d="${d}" fill="${fill}" transform="translate(0 4)"/>`
  }
  out += hill(150, 10, 1.5, 0.4, '#b4dc96', '#d0eeb8')
  out += hill(168, 8, 2.2, 2.1, '#92cf6e', '#b6e696')
  const r = rng(51)
  for (let i = 0; i < 9; i++) {
    const x = 20 + r() * 440
    const y = 160 + Math.sin(x / 40) * 4
    const s = 4 + r() * 4
    out += `<rect x="${f1(x - 0.8)}" y="${f1(y - s * 0.4)}" width="1.6" height="${f1(s * 0.8)}" fill="#6a8c4a"/><circle cx="${f1(x)}" cy="${f1(y - s * 0.7)}" r="${f1(s * 0.6)}" fill="#78bc58"/>`
  }
  out += cloud(78, 44, 92, 61) + cloud(186, 30, 54, 62, 2) + cloud(330, 58, 70, 63)
  return svg(W, H, out, defs, ' preserveAspectRatio="xMidYMax slice"')
}

/** Turf disc: ink outline, grass top with blade fringe and a lit rim, earthy underside, three little flowers. */
function stageTurf() {
  const W = 200
  const H = 40
  const cx = 100
  let out = `<ellipse cx="${cx}" cy="20" rx="96" ry="15" fill="${INK}"/>`
  out += `<ellipse cx="${cx}" cy="21" rx="93" ry="12" fill="#8a5a34"/>`
  out += `<ellipse cx="${cx}" cy="17" rx="93" ry="11" fill="#5fb244"/>`
  out += `<ellipse cx="${cx - 6}" cy="15" rx="78" ry="7" fill="#74d34e"/>`
  out += `<path d="M${cx - 70},12 q70,-9 140,0" stroke="#b6f08e" stroke-width="2" fill="none" stroke-linecap="round"/>`
  const r = rng(71)
  // blades hanging over the front edge
  for (let i = 0; i < 46; i++) {
    const a = Math.PI * 0.08 + (i / 46) * Math.PI * 0.84
    const x = cx - Math.cos(a) * 92
    const y = 17 + Math.sin(a) * 10.5
    const len = 2.5 + r() * 3.5
    out += `<polygon points="${f1(x - 1.4)},${f1(y)} ${f1(x + 1.4)},${f1(y)} ${f1(x + (r() - 0.5) * 2)},${f1(y + len)}" fill="${i % 3 ? '#4f9a3a' : '#3f8a30'}"/>`
  }
  // dirt underside crumbs
  for (let i = 0; i < 16; i++) {
    const a = Math.PI * 0.15 + r() * Math.PI * 0.7
    out += `<circle cx="${f1(cx - Math.cos(a) * 80)}" cy="${f1(27 + Math.sin(a) * 4)}" r="${f1(0.7 + r() * 0.8)}" fill="#c08a5a"/>`
  }
  for (const [x, y, c] of [[38, 15, '#ffffff'], [154, 13, '#ffe066'], [168, 19, '#ff9fc0']]) {
    out += [0, 1, 2, 3, 4].map((k) => `<circle cx="${f1(x + Math.cos((k * TAU) / 5) * 2)}" cy="${f1(y + Math.sin((k * TAU) / 5) * 1.4)}" r="1.4" fill="${c}"/>`).join('') + `<circle cx="${x}" cy="${y}" r="1" fill="#f29a1f"/>`
  }
  return svg(W, H, out)
}

function emptySky() {
  const W = 256
  const H = 112
  const defs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd2ff"/><stop offset="1" stop-color="#eaf7ff"/></linearGradient>`
  let out = `<rect width="${W}" height="${H}" fill="url(#sky)"/>`
  out += halftone(W, H, 8, 1.8, '#4cb2ff', 0.3, 0.7)
  // a paper plane looping across the sky, dashed trail
  out += `<path d="M14,70 C50,30 80,86 118,52 S170,24 196,36" stroke="#ffffff" stroke-width="2" stroke-dasharray="5 5" fill="none" stroke-linecap="round"/>`
  out += `<g transform="translate(200 34) rotate(-12)"><polygon points="0,0 16,5 0,10 4,5" fill="${INK}" transform="translate(1 1.5)"/><polygon points="0,0 16,5 0,10 4,5" fill="#ffffff" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M4,5 L16,5" stroke="${INK}" stroke-width="1"/></g>`
  out += cloud(52, 40, 52, 81, 1.8) + cloud(208, 70, 40, 82, 1.6)
  // two tiny birds
  out += `<path d="M150,22 q3,-3 6,0 q3,-3 6,0 M168,30 q2,-2 4,0 q2,-2 4,0" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
  // grass lip at the bottom so the avatar has somewhere to stand
  let lip = `M0,${H}`
  for (let x = 0; x <= W; x += 8) lip += ` L${x},${f1(H - 14 - Math.sin(x / 26) * 2)}`
  lip += ` L${W},${H}Z`
  out += `<path d="${lip}" fill="#5fb244"/><path d="${lip}" fill="#74d34e" transform="translate(0 3)"/>`
  return svg(W, H, out, defs, ' preserveAspectRatio="xMidYMax slice"')
}

mkdirSync(OUT, { recursive: true })
const files = { paper, card, plate, stage_sky: stageSky, stage_turf: stageTurf, empty_sky: emptySky }
for (const [name, paint] of Object.entries(files)) writeFileSync(join(OUT, `${name}.svg`), paint())
let svgo = 'skipped (not on PATH)'
try {
  execSync(`svgo -q -r -f "${OUT}"`, { stdio: 'ignore' })
  svgo = 'optimized'
} catch {}
console.log(`ui textures: ${Object.keys(files).join(', ')} · svgo: ${svgo}`)
