/**
 * Paint the original tank, projectile and effect sprites as SVG, then rasterize them for the game.
 *
 *   node tools/assets/paint_units.mjs          (or: npm run paint:units)
 *
 * Everything is drawn from code (no third-party images), in the same flat-vector style as the
 * map themes (paint_map_themes.mjs): ink outline, rim highlight on top edges, darker lower band.
 *
 * Coordinates are authored in on-screen game pixels and rendered at ZOOM× so the sprites stay
 * crisp on Retina screens; the game draws them at 1 / ZOOM (see `sprite.scale` in the registries).
 *
 * Output:
 *   tools/assets/unit-art/<group>/*.svg   SVG sources (optimized with SVGO when it is on PATH)
 *   public/assets/units/<group>/*.png     rasterized with resvg, metadata stripped with ImageMagick
 *
 *   tanks/<id>_<a|b>_hull.png     origin = bottom centre (track contact line), facing right
 *   tanks/<id>_<a|b>_barrel.png   pivot at 8% of the width, vertically centred, pointing right
 *   projectiles/<key>.png         centred, nose pointing right (rotated along the velocity)
 *   fx/<key>.png                  glow / spark particles (drawn with additive blending)
 */
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SVG_OUT = join(ROOT, 'tools', 'assets', 'unit-art')
const PNG_OUT = join(ROOT, 'public', 'assets', 'units')
/** tanks: drawn at 1 / 2.5 = 0.4 in game */
const TANK_ZOOM = 2.5
/** projectiles: drawn at 1 / 3 in game */
const SHOT_ZOOM = 3

const INK = '#241e33'
const SW = 1.9
const f1 = (n) => Math.round(n * 100) / 100

// Saturated toy-like team colours: light = rim / gloss side, dark = hard cel shadow.
const TEAMS = {
  a: { name: 'amber', light: '#ffe48e', base: '#ffad33', dark: '#e0731a', deep: '#9c4a14', trim: '#fff6d8' },
  b: { name: 'royal', light: '#b0d8ff', base: '#4b8fff', dark: '#2a5fd6', deep: '#1a3484', trim: '#e6f2ff' },
}
const STEEL = { light: '#d5dce8', base: '#8f99ab', dark: '#626b7e', deep: '#3b4252' }
const RUBBER = { light: '#646b7c', base: '#434958', dark: '#2b2f3a' }
const GOLD = { light: '#fff3b0', base: '#ffcf3f', dark: '#d1901a' }
const GLASS = { light: '#ffffff', base: '#9fe9ff', dark: '#4fb4e6' }

// ───────────────────────── helpers ─────────────────────────

function svgDoc([x0, y0, w, h], body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}"><defs>${defs}</defs>${body}</svg>`
}

const poly = (pts) => `M${pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join('L')}Z`

function vGrad(id, y0, y1, stops) {
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y0}" x2="0" y2="${y1}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join('')}</linearGradient>`
}

function rGrad(id, stops, cx = 0.5, cy = 0.5, r = 0.5) {
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join('')}</radialGradient>`
}

/**
 * Toon-shaded part: hard cel shadow along the bottom-right (the shape shifted up-left reveals it),
 * a thin light rim along the top-left, thick ink outline. Returns [defs, body].
 */
function toon(id, d, c, { shade = [2.2, 3.2], rim = 1.3, stroke = SW } = {}) {
  const [sx, sy] = shade
  const defs = `<clipPath id="${id}"><path d="${d}"/></clipPath>`
  const body =
    `<g clip-path="url(#${id})"><path d="${d}" fill="${c.dark}"/>` +
    `<path d="${d}" transform="translate(${-sx} ${-sy})" fill="${c.light}"/>` +
    `<path d="${d}" transform="translate(${-sx + rim * 0.6} ${-sy + rim})" fill="${c.base}"/></g>` +
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${stroke}" stroke-linejoin="round"/>`
  return [defs, body]
}

/** Glossy toy-plastic highlight: soft streak plus a sharp white dot. */
function gloss(x, y, rx, ry, rot = -12) {
  return (
    `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="#ffffff" opacity="0.5"/>` +
    `<circle cx="${f1(x - rx * 0.55)}" cy="${f1(y + ry * 0.1)}" r="${f1(Math.max(0.8, ry * 0.45))}" fill="#ffffff" opacity="0.9"/>`
  )
}

function rivet(x, y, r = 1.1, c = STEEL) {
  return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${c.dark}" stroke="${INK}" stroke-width="0.6"/><circle cx="${f1(x - r * 0.3)}" cy="${f1(y - r * 0.3)}" r="${f1(r * 0.4)}" fill="#ffffff" opacity="0.8"/>`
}

function line(x0, y0, x1, y1, color, w = 0.9, opacity = 1) {
  return `<path d="M${f1(x0)},${f1(y0)}L${f1(x1)},${f1(y1)}" stroke="${color}" stroke-width="${w}" stroke-linecap="round" opacity="${opacity}"/>`
}

/** Fat cartoon road wheel: dark tyre, light hub, three bolts, gloss. */
function wheel(x, y, r, hub = STEEL) {
  let bolts = ''
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2
    bolts += `<circle cx="${f1(x + Math.cos(a) * r * 0.36)}" cy="${f1(y + Math.sin(a) * r * 0.36)}" r="${f1(r * 0.11)}" fill="${hub.deep}"/>`
  }
  return (
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${RUBBER.dark}" stroke="${INK}" stroke-width="${SW * 0.8}"/>` +
    `<circle cx="${x}" cy="${y}" r="${f1(r * 0.66)}" fill="${hub.dark}"/>` +
    `<circle cx="${f1(x - r * 0.06)}" cy="${f1(y - r * 0.08)}" r="${f1(r * 0.58)}" fill="${hub.base}"/>` +
    bolts +
    `<path d="M${f1(x - r * 0.45)},${f1(y - r * 0.22)}A${f1(r * 0.5)},${f1(r * 0.5)} 0 0 1 ${f1(x + r * 0.1)},${f1(y - r * 0.5)}" stroke="${hub.light}" stroke-width="${f1(r * 0.16)}" fill="none" stroke-linecap="round"/>`
  )
}

/** Chunky capsule track with tread nubs, then the big wheels on top. */
function tracks(id, x0, x1, top, wheels) {
  const h = -top
  const r = h / 2
  const d = `M${x0 + r},${top}H${x1 - r}A${r},${r} 0 0 1 ${x1 - r},0H${x0 + r}A${r},${r} 0 0 1 ${x0 + r},${top}Z`
  let nubs = ''
  for (let x = x0 + r * 0.5; x < x1 - r * 0.3; x += 4.2) {
    nubs += `<rect x="${f1(x)}" y="-2.2" width="2.2" height="2.2" rx="0.5" fill="${RUBBER.dark}"/>`
    nubs += `<rect x="${f1(x)}" y="${f1(top + 0.3)}" width="2.2" height="1.6" rx="0.5" fill="${RUBBER.light}"/>`
  }
  return (
    `<clipPath id="${id}"><path d="${d}"/></clipPath>` +
    `<path d="${d}" fill="${RUBBER.base}"/>` +
    `<g clip-path="url(#${id})">${nubs}</g>` +
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${SW}"/>` +
    wheels.map(([x, wr, y = top / 2]) => wheel(x, f1(y), wr)).join('')
  )
}

/** Exhaust pipe at the rear. */
function exhaust(x, y, h = 6) {
  return (
    `<rect x="${x - 2}" y="${y - h}" width="4" height="${h + 2}" rx="1.2" fill="${STEEL.dark}" stroke="${INK}" stroke-width="${SW * 0.75}"/>` +
    `<rect x="${x - 2.8}" y="${y - h - 1.6}" width="5.6" height="2.6" rx="1.1" fill="${STEEL.base}" stroke="${INK}" stroke-width="${SW * 0.75}"/>`
  )
}

// ───────────────────────── barrels ─────────────────────────

const ICE = { light: '#ffffff', base: '#c9f1ff', dark: '#7cc8ec', deep: '#3d8fc2' }
const TOXIC = { light: '#e9ffb0', base: '#8be04e', dark: '#4f9e2a', deep: '#2f6418' }
const MUD = { light: '#c08a52', base: '#8a5a2b', dark: '#5e3a18' }
const SAND = { light: '#f6e2b0', base: '#dcb77a', dark: '#a9824a', deep: '#7a5a2c' }
const SCARF = { light: '#ff9a9a', base: '#e5484d', dark: '#a8262b' }

/**
 * Chunky barrel pointing right. The pivot (8% of width) sits inside the turret, so the breech is
 * hidden behind the hull. Each tank picks one silhouette:
 *   plain   straight tube + team band + flared muzzle (options: rings, spiral, drips)
 *   bell    blunderbuss that widens into a trumpet mouth (Zephyr's scatter gun)
 *   tail    three shrinking carapace segments ending in a glowing stinger (Scorpion)
 *   rails   twin rails, energy channel, team coils and a muzzle brake (Hawkeye)
 */
function barrelSvg(spec, team) {
  const { len, thick, muzzle, band, style = 'plain' } = spec
  const H = Math.max(thick, muzzle?.h ?? 0, spec.bell ?? 0, spec.brake ?? 0) + SW + 1 + (spec.drips ? 6 : 0)
  const box = [0, -H / 2, len, H]
  const t = thick / 2
  const c = TEAMS[team]
  let defs = vGrad('bt', -t, t, [
    [0, STEEL.light],
    [0.3, STEEL.base],
    [0.62, STEEL.base],
    [0.63, STEEL.dark],
    [1, STEEL.dark],
  ])
  let body = ''

  if (style === 'rails') {
    defs += vGrad('rl', -t, t, [
      [0, '#ffffff'],
      [0.5, '#bfe0ff'],
      [1, '#6aa8ff'],
    ])
    body += `<rect x="1.5" y="${-t * 0.5}" width="${len - 4}" height="${t}" rx="${f1(t * 0.5)}" fill="url(#rl)"/>`
    body += `<rect x="1" y="${f1(-t - 0.3)}" width="${len - 9}" height="${f1(thick * 0.36)}" rx="${f1(thick * 0.18)}" fill="${STEEL.base}" stroke="${INK}" stroke-width="${SW * 0.75}"/>`
    body += `<rect x="1" y="${f1(t - thick * 0.36 + 0.3)}" width="${len - 9}" height="${f1(thick * 0.36)}" rx="${f1(thick * 0.18)}" fill="${STEEL.dark}" stroke="${INK}" stroke-width="${SW * 0.75}"/>`
    for (let x = len * 0.3; x < len - 14; x += 7) {
      body += `<rect x="${f1(x)}" y="${f1(-t - 1)}" width="2.4" height="${f1(thick + 2)}" rx="1.1" fill="${c.base}" stroke="${INK}" stroke-width="${SW * 0.6}"/>`
    }
    // scope rail clamp
    body += `<rect x="${f1(len * 0.14)}" y="${f1(-t - 1.6)}" width="6" height="${f1(thick + 3.2)}" rx="1.5" fill="${STEEL.dark}" stroke="${INK}" stroke-width="${SW * 0.7}"/>`
    // muzzle brake: a fat block with two vents
    const b = spec.brake / 2
    body += `<rect x="${len - 9.5}" y="${-b}" width="9" height="${spec.brake}" rx="2" fill="${STEEL.base}" stroke="${INK}" stroke-width="${SW * 0.85}"/>`
    body += `<rect x="${len - 7.6}" y="${f1(-b + 1.4)}" width="1.6" height="${f1(spec.brake - 2.8)}" rx="0.6" fill="${INK}" opacity="0.8"/>`
    body += `<rect x="${len - 4.4}" y="${f1(-b + 1.4)}" width="1.6" height="${f1(spec.brake - 2.8)}" rx="0.6" fill="${INK}" opacity="0.8"/>`
    body += `<rect x="${len - 8.6}" y="${f1(-b + 0.8)}" width="7" height="1.1" rx="0.5" fill="#ffffff" opacity="0.7"/>`
    return svgDoc(box, body, defs)
  }

  if (style === 'tail') {
    // carapace segments, each a toon capsule slightly smaller than the last
    const segs = [
      [1, len * 0.42, thick],
      [len * 0.36, len * 0.68, thick * 0.84],
      [len * 0.63, len * 0.86, thick * 0.7],
    ]
    segs.forEach(([x0, x1, h], i) => {
      const hh = h / 2
      const d = `M${f1(x0 + hh)},${f1(-hh)}H${f1(x1 - hh)}A${f1(hh)},${f1(hh)} 0 0 1 ${f1(x1 - hh)},${f1(hh)}H${f1(x0 + hh)}A${f1(hh)},${f1(hh)} 0 0 1 ${f1(x0 + hh)},${f1(-hh)}Z`
      const [dd, bb] = toon(`sg${i}`, d, c, { shade: [1, 1.4], rim: 0.8 })
      defs += dd
      body += bb
      body += line(x0 + hh * 0.7, -hh * 0.45, x1 - hh * 1.2, -hh * 0.45, '#ffffff', 0.9, 0.6)
    })
    // stinger: glowing toxic barb
    const sx = len * 0.84
    body += `<path d="M${f1(sx)},${f1(-thick * 0.32)}C${f1(sx + 5)},${f1(-thick * 0.34)} ${f1(len - 3)},-1.6 ${f1(len - 0.6)},0C${f1(len - 3)},1.6 ${f1(sx + 5)},${f1(thick * 0.34)} ${f1(sx)},${f1(thick * 0.32)}Z" fill="${TOXIC.base}" stroke="${INK}" stroke-width="${SW * 0.85}" stroke-linejoin="round"/>`
    body += `<path d="M${f1(sx + 1.5)},${f1(-thick * 0.16)}C${f1(sx + 5)},${f1(-thick * 0.18)} ${f1(len - 5)},-0.9 ${f1(len - 2.6)},-0.3" stroke="${TOXIC.light}" stroke-width="1" fill="none" stroke-linecap="round"/>`
    body += `<circle cx="${f1(len - 1.6)}" cy="1.9" r="1.1" fill="${TOXIC.light}" stroke="${INK}" stroke-width="0.5"/>`
    return svgDoc(box, body, defs)
  }

  if (style === 'bell') {
    // blunderbuss: tube that opens into a trumpet mouth
    const x0 = len * 0.62
    const bh = spec.bell / 2
    body += `<rect x="1" y="${-t}" width="${f1(x0)}" height="${thick}" rx="${f1(t * 0.8)}" fill="url(#bt)" stroke="${INK}" stroke-width="${SW}"/>`
    body += line(3.5, -t + thick * 0.24, x0 - 2, -t + thick * 0.24, '#ffffff', thick * 0.14, 0.75)
    defs += vGrad('bl', -bh, bh, [
      [0, GOLD.light],
      [0.35, GOLD.base],
      [0.64, GOLD.base],
      [0.65, GOLD.dark],
      [1, GOLD.dark],
    ])
    body += `<path d="M${f1(x0 - 1)},${f1(-t)}C${f1(x0 + 6)},${f1(-t)} ${f1(len - 5)},${f1(-bh + 1)} ${f1(len - 1.2)},${f1(-bh)}Q${f1(len)},${f1(-bh)} ${f1(len)},${f1(-bh + 1.4)}V${f1(bh - 1.4)}Q${f1(len)},${f1(bh)} ${f1(len - 1.2)},${f1(bh)}C${f1(len - 5)},${f1(bh - 1)} ${f1(x0 + 6)},${f1(t)} ${f1(x0 - 1)},${f1(t)}Z" fill="url(#bl)" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`
    body += `<ellipse cx="${f1(len - 1.2)}" cy="0" rx="1.2" ry="${f1(bh - 1.6)}" fill="${INK}" opacity="0.85"/>`
    body += `<rect x="${f1(x0 - 4)}" y="${f1(-t - 0.8)}" width="3.6" height="${f1(thick + 1.6)}" rx="1.3" fill="${c.base}" stroke="${INK}" stroke-width="${SW * 0.8}"/>`
    return svgDoc(box, body, defs)
  }

  body += `<rect x="1" y="${-t}" width="${len - 2}" height="${thick}" rx="${f1(t * 0.8)}" fill="url(#bt)" stroke="${INK}" stroke-width="${SW}"/>`
  body += line(3.5, -t + thick * 0.24, len - 6, -t + thick * 0.24, '#ffffff', thick * 0.14, 0.75)
  if (spec.spiral) {
    defs += `<clipPath id="bc"><rect x="1" y="${-t}" width="${len - 2}" height="${thick}" rx="${f1(t * 0.8)}"/></clipPath>`
    let grooves = ''
    for (let x = len * 0.32; x < len - 6; x += 4.2) grooves += `<path d="M${f1(x)},${f1(t + 1)}L${f1(x + 3.4)},${f1(-t - 1)}" stroke="${STEEL.deep}" stroke-width="1.1" opacity="0.7"/>`
    body += `<g clip-path="url(#bc)">${grooves}</g>`
  }
  if (spec.rings) {
    for (const r of spec.rings) {
      const x = len * r
      body += `<rect x="${f1(x)}" y="${f1(-t - 1)}" width="3.4" height="${f1(thick + 2)}" rx="1.4" fill="${ICE.base}" stroke="${INK}" stroke-width="${SW * 0.75}"/>`
      body += `<rect x="${f1(x + 0.7)}" y="${f1(-t)}" width="1.6" height="${f1(thick * 0.3)}" rx="0.6" fill="#ffffff"/>`
    }
  }
  if (band) {
    body += `<rect x="${f1(len * band)}" y="${f1(-t - 0.8)}" width="4" height="${f1(thick + 1.6)}" rx="1.4" fill="${c.base}" stroke="${INK}" stroke-width="${SW * 0.8}"/>`
    body += `<rect x="${f1(len * band + 0.9)}" y="${f1(-t + 0.1)}" width="2" height="${f1(thick * 0.28)}" rx="0.6" fill="${c.light}"/>`
  }
  if (muzzle) {
    const mh = muzzle.h / 2
    const x = len - muzzle.w - 1
    body += `<path d="M${f1(x)},${f1(-t)}L${f1(x + 2)},${-mh}H${f1(len - 1.4)}Q${len - 0.4},${-mh} ${len - 0.4},${f1(-mh + 1.4)}V${f1(mh - 1.4)}Q${len - 0.4},${mh} ${f1(len - 1.4)},${mh}H${f1(x + 2)}L${f1(x)},${f1(t)}Z" fill="${muzzle.ice ? ICE.base : STEEL.base}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`
    body += `<rect x="${f1(x + 2.6)}" y="${f1(-mh + 1)}" width="${f1(muzzle.w - 4)}" height="${f1(muzzle.h * 0.2)}" rx="0.6" fill="#ffffff" opacity="0.75"/>`
    body += `<rect x="${f1(len - 2.6)}" y="${f1(-mh + 1.6)}" width="1.6" height="${f1(muzzle.h - 3.2)}" rx="0.6" fill="${INK}" opacity="0.85"/>`
    if (spec.drips) {
      // little icicles hanging under the muzzle
      for (const [dx, dl] of [[2.2, 4.6], [4.8, 3.2], [7, 5.4]]) {
        const ix = x + dx
        body += `<path d="M${f1(ix - 1.3)},${f1(mh - 0.4)}L${f1(ix)},${f1(mh + dl)}L${f1(ix + 1.3)},${f1(mh - 0.4)}Z" fill="${ICE.base}" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>`
      }
    }
  }
  return svgDoc(box, body, defs)
}

// ───────────────────────── tanks ─────────────────────────

/**
 * Chunky toy-like artillery tanks (original designs). Proportions are deliberately chibi:
 * big rounded body, oversized turret, short track with a few fat wheels, thick ink outline.
 * The face (tankFace.ts) is painted on the body front; keep that area free of decals.
 *
 * Each tank lists its rig-space anchors next to the art, so the tank module can be kept in sync:
 * rig y = HULL_BASE_Y (14) + svg y, rig x = svg x (facing right).
 */
function painter() {
  let defs = ''
  let body = ''
  return {
    add([d, b]) {
      defs += d
      body += b
    },
    raw(b) {
      body += b
    },
    def(d) {
      defs += d
    },
    doc(box) {
      return svgDoc(box, body, defs)
    },
  }
}

/** Plump sandbag: tan sack with a tied seam. */
function sandbag(id, x, y, w = 11, h = 6.4) {
  const d = `M${f1(x - w / 2 + 1.5)},${f1(y - h / 2)}C${f1(x - w / 4)},${f1(y - h / 2 - 1)} ${f1(x + w / 4)},${f1(y - h / 2 - 1)} ${f1(x + w / 2 - 1.5)},${f1(y - h / 2)}C${f1(x + w / 2 + 0.8)},${f1(y - h / 4)} ${f1(x + w / 2 + 0.8)},${f1(y + h / 4)} ${f1(x + w / 2 - 1.5)},${f1(y + h / 2)}C${f1(x + w / 4)},${f1(y + h / 2 + 1)} ${f1(x - w / 4)},${f1(y + h / 2 + 1)} ${f1(x - w / 2 + 1.5)},${f1(y + h / 2)}C${f1(x - w / 2 - 0.8)},${f1(y + h / 4)} ${f1(x - w / 2 - 0.8)},${f1(y - h / 4)} ${f1(x - w / 2 + 1.5)},${f1(y - h / 2)}Z`
  const [defs, b] = toon(id, d, SAND, { shade: [1, 1.3], rim: 0.7, stroke: SW * 0.75 })
  return [defs, b + line(x + w / 2 - 2.6, y - h / 2 + 0.6, x + w / 2 - 2.6, y + h / 2 - 0.6, SAND.deep, 0.8, 0.8)]
}

/** Six-sided ice crystal (glassy, white rim, cyan core). */
function crystal(id, x, y, h, w, tilt = 0) {
  const d = poly([
    [0, -h / 2],
    [w / 2, -h / 4],
    [w / 2, h / 3],
    [0, h / 2],
    [-w / 2, h / 3],
    [-w / 2, -h / 4],
  ])
  const [defs, b] = toon(id, d, ICE, { shade: [0.8, 1.1], rim: 0.6, stroke: SW * 0.7 })
  return [defs, `<g transform="translate(${x} ${y}) rotate(${tilt})">${b}${line(-w * 0.12, -h * 0.3, -w * 0.12, h * 0.25, '#ffffff', 0.9, 0.9)}</g>`]
}

/** Brown mud splat with a highlight bead. */
function mud(x, y, r) {
  const pts = []
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const rr = r * (i % 2 ? 0.72 : 1.08)
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8])
  }
  return `<path d="${poly(pts)}" fill="${MUD.base}" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/><circle cx="${f1(x - r * 0.3)}" cy="${f1(y - r * 0.3)}" r="${f1(r * 0.25)}" fill="${MUD.light}"/>`
}

const TANKS = {
  /**
   * 鐵壁堡壘：方塊城牆車身 + 雉堞（城垛）、短粗迫擊砲塔、後側沙包堆、陣營色小旗。
   * face (19,-13) pivot (3,-34)
   */
  bastion: {
    box: [-47, -68, 94, 69],
    barrel: { len: 28, thick: 12, band: 0.34, muzzle: { w: 8, h: 17 } },
    hull(team) {
      const c = TEAMS[team]
      const p = painter()
      // pennant on a pole (behind everything)
      p.raw(line(-27, -42, -27, -64, INK, 1.5))
      p.raw(`<path d="M-26.4,-64L-14,-60.2L-26.4,-56.2Z" fill="${c.base}" stroke="${INK}" stroke-width="${SW * 0.7}" stroke-linejoin="round"/>`)
      p.raw(`<path d="M-25.6,-62.2L-19,-60.2" stroke="${c.light}" stroke-width="1" stroke-linecap="round"/>`)
      p.raw(`<circle cx="-27" cy="-64.6" r="1.6" fill="${GOLD.base}" stroke="${INK}" stroke-width="0.8"/>`)
      // battlement merlons along the wall top (drawn first, the wall covers their bases)
      for (const [x0, x1] of [[-36, -29], [-22, -16], [21, 27], [30, 36]]) {
        p.add(toon(`m${x0}`, `M${x0},-38V-46Q${x0},-47.5 ${x0 + 1.5},-47.5H${x1 - 1.5}Q${x1},-47.5 ${x1},-46V-38Z`, c, { shade: [1.2, 1.6], rim: 0.8 }))
      }
      // squat mortar turret: dome + steel collar
      p.add(toon('tu', 'M-11,-41C-11,-52 -4.5,-56.5 3,-56.5C10.5,-56.5 17,-52 17,-41Z', c, { shade: [1.6, 2.4] }))
      p.raw(gloss(-1, -52, 5.4, 1.7))
      p.raw(rivet(9.5, -50.5, 1.1, c))
      p.add(toon('cl', 'M-13.5,-43.5H19.5V-39.6H-13.5Z', STEEL, { shade: [0.8, 1.2], rim: 0.6, stroke: SW * 0.85 }))
      for (const x of [-9, -2, 5, 12]) p.raw(rivet(x + 1.5, -41.5, 0.9))
      // track: four fat wheels
      p.raw(
        tracks('tr', -36, 36, -16, [
          [-25.5, 7],
          [-8.5, 7],
          [8.5, 7],
          [25.5, 7],
        ]),
      )
      // fortress wall body
      const bodyD = 'M-38,-14V-37Q-38,-41 -34,-41H34Q38,-41 38,-37V-14Z'
      p.add(toon('hu', bodyD, c, { shade: [2.6, 3.2] }))
      // brick courses on the rear half only (front half keeps the face clean)
      p.def(`<clipPath id="br"><rect x="-38" y="-41" width="40" height="27"/></clipPath>`)
      let bricks = `<path d="M-38,-32.5H2M-38,-23.5H2" stroke="${c.deep}" stroke-width="1" opacity="0.38"/>`
      for (const x of [-30, -18, -6]) bricks += `<path d="M${x},-41V-32.5M${x + 6},-32.5V-23.5M${x},-23.5V-14" stroke="${c.deep}" stroke-width="1" opacity="0.38"/>`
      p.raw(`<g clip-path="url(#br)">${bricks}</g>`)
      p.raw(gloss(6, -37.4, 12, 1.8, -2))
      // gate arch on the front lower edge (keeps the face area above it free)
      p.raw(`<path d="M28,-14V-19.5A4.5,4.5 0 0 1 37,-19.5V-14Z" fill="${c.deep}" stroke="${INK}" stroke-width="${SW * 0.7}"/>`)
      p.raw(line(32.5, -23.6, 32.5, -14.6, INK, 0.8, 0.6))
      // sandbag pile against the rear corner
      p.add(sandbag('sb1', -40.5, -18.4))
      p.add(sandbag('sb2', -31, -18.8))
      p.add(sandbag('sb3', -36, -25))
      return p.doc(this.box)
    },
  },

  /**
   * 疾風遊俠：低矮楔形水滴車身、遊俠頭盔砲塔 + 推到額頭的護目鏡、隨風飄揚的圍巾、雙排氣管噴火、喇叭口散彈砲。
   * face (17,-8) pivot (-6,-25)
   */
  zephyr: {
    box: [-54, -62, 102, 63],
    barrel: { len: 34, thick: 6.6, bell: 15, style: 'bell' },
    hull(team) {
      const c = TEAMS[team]
      const p = painter()
      // wind-swept red scarf: two wavy tails streaming back from the helmet neck
      p.add(toon('sf1', 'M-15,-38.6C-21,-41.6 -26,-42 -31,-40.4C-36,-38.8 -40,-41.6 -44,-45.6L-48.4,-44C-44.6,-39 -40,-34.6 -33.6,-35.6C-27,-36.6 -22,-36.4 -16,-34.2Z', SCARF, { shade: [0.9, 1.3], rim: 0.6, stroke: SW * 0.8 }))
      p.add(toon('sf2', 'M-16,-35.4C-21.6,-34.6 -25.4,-32.6 -29.6,-30.4C-33,-28.8 -36.6,-29.6 -40,-31.4L-42.6,-28.6C-38.6,-25.6 -34,-25.2 -29.4,-27C-25,-28.8 -21,-31 -16.4,-31.6Z', SCARF, { shade: [0.9, 1.3], rim: 0.6, stroke: SW * 0.8 }))
      for (const [x0, y0, x1, y1] of [[-30, -39.6, -32.6, -36.4], [-38, -40.6, -40.6, -37.4], [-28.4, -30.4, -30.6, -27.6]]) p.raw(line(x0, y0, x1, y1, SCARF.light, 1.1, 0.9))
      // twin rear boosters: short nozzles pointing backwards with little flames
      for (const [y, l] of [[-17.6, 7], [-23.4, 6]]) {
        p.raw(`<path d="M-41,${y - 2.2}C-${44 + l * 0.4},${y - 3.6} -${44 + l},${y - 1.4} -${45 + l},${y}C-${44 + l},${y + 1.4} -${44 + l * 0.4},${y + 3.6} -41,${y + 2.2}Z" fill="#ffb43a" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>`)
        p.raw(`<path d="M-41.4,${y - 1}C-43,${y - 1.4} -${43 + l * 0.5},${y - 0.6} -${43.6 + l * 0.6},${y}C-${43 + l * 0.5},${y + 0.6} -43,${y + 1.4} -41.4,${y + 1}Z" fill="#fff4b8"/>`)
        p.raw(`<rect x="-42" y="${y - 2.6}" width="6" height="5.2" rx="1.4" fill="${STEEL.base}" stroke="${INK}" stroke-width="${SW * 0.75}"/><rect x="-41" y="${y - 1.8}" width="4" height="1.1" rx="0.5" fill="#ffffff" opacity="0.7"/>`)
      }
      // ranger helmet turret + the scarf knot wrapped around its neck
      p.add(toon('tu', 'M-19,-33C-19,-43.5 -12.5,-48 -5,-48C2.5,-48 8,-43.5 8,-33Z', c, { shade: [1.6, 2.2] }))
      p.add(toon('kn', 'M-20,-38.4C-18,-35.4 -14,-34.6 -12,-36.4C-13,-38.6 -17,-40.6 -20,-38.4Z', SCARF, { shade: [0.6, 0.9], rim: 0.5, stroke: SW * 0.7 }))
      p.raw(`<path d="M-20.5,-34.6H10.4Q11.6,-34.6 11.6,-33.4V-32.6H-20.5Z" fill="${c.deep}" stroke="${INK}" stroke-width="1"/>`)
      p.raw(gloss(-10, -44.4, 4.6, 1.5))
      // goggles pushed up on the helmet
      p.raw(`<path d="M-17,-40.4C-10,-42.4 -1,-42.4 6.4,-40.6" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`)
      p.raw(`<path d="M-17,-40.4C-10,-42.4 -1,-42.4 6.4,-40.6" stroke="${c.deep}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`)
      for (const gx of [-7.4, -0.4]) {
        p.raw(`<circle cx="${gx}" cy="-42" r="3.3" fill="${STEEL.base}" stroke="${INK}" stroke-width="1.1"/>`)
        p.raw(`<circle cx="${gx}" cy="-42" r="2.1" fill="${GLASS.base}"/><circle cx="${gx - 0.8}" cy="-42.8" r="0.8" fill="#ffffff"/>`)
      }
      // compact track
      p.raw(
        tracks('tr', -31, 30, -12.5, [
          [-21.5, 5.8],
          [-4, 5.8],
          [13.5, 5.8],
          [24.6, 3.6],
        ]),
      )
      // wedge teardrop body: rounded rear, long low nose
      const bodyD = 'M-34,-11C-39.5,-11 -40,-20 -37,-26.5C-34,-32.5 -26,-35.5 -14,-35.5C3,-35.5 17,-30 29,-23.5C37,-19 44,-17 44,-13.6C44,-11.6 42.4,-11 40,-11Z'
      p.add(toon('hu', bodyD, c, { shade: [2.4, 3] }))
      p.raw(gloss(-17, -32.2, 10, 1.9, -3))
      // speed chevrons on the rear flank
      p.def(`<clipPath id="st"><path d="${bodyD}"/></clipPath>`)
      p.raw(`<g clip-path="url(#st)"><path d="M-42,-16.8H46V-14.2H-42Z" fill="${c.trim}"/></g>`)
      for (const x of [-30, -24.5, -19]) p.raw(`<path d="M${x},-29.5L${x + 3.6},-25L${x},-20.5" stroke="${GOLD.base}" stroke-width="2.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/><path d="M${x},-29.5L${x + 3.6},-25L${x},-20.5" stroke="${INK}" stroke-width="0.6" fill="none" stroke-linejoin="round"/>`)
      // nose intake
      p.raw(`<path d="M37,-17.2C40,-16.4 42,-15.4 42.6,-14H36.4Z" fill="${INK}" opacity="0.85"/>`)
      return p.doc(this.box)
    },
  },

  /**
   * 毒蠍：低底盤寬殼、甲殼分節、前保險桿上一對大螯、背上綠色毒液罐（氣泡）、側面毒斑，蠍尾式分節砲管。
   * face (21,-10) pivot (-2,-27)
   */
  scorpion: {
    box: [-48, -64, 102, 65],
    barrel: { len: 34, thick: 8.6, style: 'tail' },
    hull(team) {
      const c = TEAMS[team]
      const p = painter()
      // venom canister on the rear deck: glass tube, green fluid, bubbles, steel caps
      p.def(`<clipPath id="vc"><rect x="-33" y="-49" width="11" height="17" rx="3"/></clipPath>`)
      p.raw(`<rect x="-33" y="-49" width="11" height="17" rx="3" fill="${GLASS.light}" opacity="0.9"/>`)
      p.raw(`<g clip-path="url(#vc)"><rect x="-33" y="-43" width="11" height="12" fill="${TOXIC.base}"/><rect x="-33" y="-43" width="11" height="2" fill="${TOXIC.light}"/><rect x="-25.6" y="-43" width="3" height="12" fill="${TOXIC.dark}" opacity="0.6"/></g>`)
      for (const [bx, by, br] of [[-29.4, -37.4, 1.3], [-26.6, -40, 0.9], [-28.6, -46, 0.8]]) p.raw(`<circle cx="${bx}" cy="${by}" r="${br}" fill="#ffffff" opacity="0.85"/>`)
      p.raw(`<rect x="-33" y="-49" width="11" height="17" rx="3" fill="none" stroke="${INK}" stroke-width="${SW * 0.8}"/>`)
      p.raw(`<rect x="-34.4" y="-51.6" width="13.8" height="3.6" rx="1.4" fill="${STEEL.base}" stroke="${INK}" stroke-width="${SW * 0.7}"/>`)
      p.raw(line(-32, -46.6, -32, -36, '#ffffff', 1, 0.8))
      // small dome turret with a purple venom band
      p.add(toon('tu', 'M-15,-32C-15,-41.5 -9,-45.5 -2,-45.5C5,-45.5 11,-41.5 11,-32Z', c, { shade: [1.5, 2.1] }))
      p.raw(`<path d="M-14.6,-36.4H10.6V-33.6H-14.6Z" fill="#9b5de5" stroke="${INK}" stroke-width="0.9"/>`)
      p.raw(gloss(-6, -42, 4.6, 1.4))
      // track
      p.raw(
        tracks('tr', -34, 34, -14, [
          [-24, 6.2],
          [-8, 6.2],
          [8, 6.2],
          [24, 6.2],
        ]),
      )
      // big open pincer on the front bumper (behind the body so the shell overlaps its root)
      p.add(toon('cw0', 'M30,-22H38Q40,-22 40,-20V-15.6Q40,-13.6 38,-13.6H30Z', c, { shade: [0.8, 1.1], rim: 0.6 }))
      p.add(toon('cw1', 'M37,-21C40,-27 46,-29.6 51,-27.6C52.6,-27 52.4,-25.6 51,-25.4C47,-24.8 44,-23 42.4,-19.4Z', c, { shade: [1, 1.4], rim: 0.7 }))
      p.add(toon('cw2', 'M37.6,-14.6C41,-12.4 45.6,-12.6 49.4,-15.4C50.6,-16.2 50.4,-17.6 49,-17.6C46,-17.4 43.6,-17.4 41.6,-18.6Z', c, { shade: [1, 1.4], rim: 0.7 }))
      p.raw(`<circle cx="48" cy="-27.2" r="0.9" fill="#ffffff" opacity="0.85"/>`)
      p.raw(`<path d="M44.6,-25.2L46,-23.2M46.4,-16.8L47.6,-15" stroke="${c.deep}" stroke-width="0.9" stroke-linecap="round" opacity="0.7"/>`)
      // low carapace body
      const bodyD = 'M-38,-12C-42.5,-12 -42.5,-20 -39.5,-25C-35.5,-31 -26,-33.5 -14,-33.5H17C29,-33.5 37,-28.5 39.5,-21.5C41,-16.5 40,-12 36,-12Z'
      p.add(toon('hu', bodyD, c, { shade: [2.4, 3] }))
      p.def(`<clipPath id="cp"><path d="${bodyD}"/></clipPath>`)
      // carapace segment seams on the rear half
      let seams = ''
      for (const x of [-27, -17, -7]) seams += `<path d="M${x},-34C${x - 2.6},-27 ${x - 2.6},-19 ${x},-11" stroke="${c.deep}" stroke-width="1.2" fill="none" opacity="0.5"/>`
      // toxic spots
      for (const [sx, sy, sr] of [[-33, -20, 2.4], [-22, -26.6, 1.8], [-13, -18, 2.1], [-27.6, -14.6, 1.3]]) {
        seams += `<circle cx="${sx}" cy="${sy}" r="${sr}" fill="${TOXIC.base}" stroke="${INK}" stroke-width="0.6"/><circle cx="${sx - sr * 0.3}" cy="${sy - sr * 0.3}" r="${f1(sr * 0.35)}" fill="${TOXIC.light}"/>`
      }
      p.raw(`<g clip-path="url(#cp)">${seams}</g>`)
      p.raw(gloss(-16, -30.6, 10, 1.8, -3))
      return p.doc(this.box)
    },
  },

  /**
   * 霜鯨：圓滾滾的鯨魚車身（大圓頭、向上翹的尾鰭）、白色腹部與喉褶、背上冰晶噴口砲塔、掛冰柱的雪砲管。
   * face (22,-14) pivot (2,-32)
   */
  frostback: {
    box: [-50, -68, 98, 69],
    barrel: { len: 32, thick: 9, rings: [0.38, 0.56], muzzle: { w: 8, h: 13, ice: true }, drips: true },
    hull(team) {
      const c = TEAMS[team]
      const p = painter()
      // tail fluke rising behind the body
      p.add(toon('fl', 'M-30,-28C-36,-33 -38,-40 -40,-46C-44,-46 -48,-50 -49,-55C-44,-55 -40.5,-52 -38.4,-49.4C-38,-54 -35,-58.6 -30.6,-60C-31.4,-54 -33,-48 -31.4,-43C-30,-38.6 -27,-35 -24,-33Z', c, { shade: [1.2, 1.6] }))
      // ice-crystal spout turret: steel ring + three crystals spraying up
      p.add(crystal('cr1', -6, -54, 11, 5.6, -24))
      p.add(crystal('cr2', 9.6, -55, 10, 5, 22))
      p.add(crystal('cr3', 2, -59, 13.6, 6.4, 0))
      p.add(toon('tu', 'M-10,-43C-10,-49.5 -4,-52.6 2,-52.6C8,-52.6 14,-49.5 14,-43Z', STEEL, { shade: [1.2, 1.6] }))
      p.raw(`<ellipse cx="2" cy="-50.6" rx="5" ry="1.4" fill="${STEEL.deep}"/>`)
      // track
      p.raw(
        tracks('tr', -34, 34, -15, [
          [-23.5, 6.6],
          [-7.8, 6.6],
          [7.8, 6.6],
          [23.5, 6.6],
        ]),
      )
      // whale body: big round head at the front, tapering to the tail
      const bodyD = 'M-30,-13C-36,-13 -38.5,-19 -38.5,-25C-38.5,-31 -34,-37 -25,-40C-10,-45.5 13,-46.5 27,-40.5C37.5,-36 41.5,-27 40.6,-20.5C40,-15.6 36.6,-13 32,-13Z'
      p.add(toon('hu', bodyD, c, { shade: [2.6, 3.4] }))
      // white belly with throat pleats
      p.def(`<clipPath id="bl"><path d="${bodyD}"/></clipPath>`)
      p.raw(
        `<g clip-path="url(#bl)"><path d="M-40,-17C-20,-21 10,-24.5 44,-21.5V-10H-40Z" fill="#f4fbff"/>` +
          `<path d="M-40,-17C-20,-21 10,-24.5 44,-21.5" stroke="${INK}" stroke-width="1.1" fill="none"/>` +
          `<path d="M-6,-18.6C8,-20.6 22,-21 36,-19.6M-2,-15.6C10,-17.2 22,-17.6 34,-16.6" stroke="${ICE.dark}" stroke-width="1" fill="none" stroke-linecap="round"/></g>`,
      )
      p.raw(gloss(-6, -41, 12, 2.2, -6))
      // frost freckles on the back (rear half)
      for (const [x, y, r] of [[-26, -33, 1.5], [-20, -36.6, 1.1], [-14.6, -32, 1.3]]) p.raw(`<circle cx="${x}" cy="${y}" r="${r}" fill="${c.light}" opacity="0.9"/>`)
      // flipper
      p.add(toon('fp', 'M-8,-24C-4,-22 2,-18.6 2.6,-14.6C-2,-15 -7,-17.6 -10,-21.6Z', c, { shade: [0.8, 1.1], rim: 0.6, stroke: SW * 0.8 }))
      return p.doc(this.box)
    },
  },

  /**
   * 地鼠工兵：高圓車身、車頭下方的巨型鑽頭、黃色礦工頭盔砲塔 + 頭燈光束、沾滿泥巴的履帶。
   * face (17,-18) pivot (-9,-36)
   */
  burrower: {
    box: [-48, -68, 98, 69],
    barrel: { len: 30, thick: 9, band: 0.3, spiral: true, muzzle: { w: 7, h: 12 } },
    hull(team) {
      const c = TEAMS[team]
      const p = painter()
      // headlamp beam (behind everything, faint)
      p.raw(`<path d="M4,-52.6L44,-60L44,-42Z" fill="#fff6b0" opacity="0.32"/>`)
      // miner helmet turret (yellow hard hat with brim) + lamp
      p.add(toon('tu', 'M-21,-44C-21,-55 -14,-60 -7,-60C1,-60 6,-55 6,-44Z', GOLD, { shade: [1.6, 2.2] }))
      p.raw(`<path d="M-7,-60V-45" stroke="${GOLD.dark}" stroke-width="2.2"/><path d="M-7,-60V-45" stroke="${INK}" stroke-width="0.6" opacity="0.6"/>`)
      p.add(toon('br', 'M-24,-45.6H9.4Q11,-45.6 11,-44V-42.6H-24Z', GOLD, { shade: [0.6, 1], rim: 0.5, stroke: SW * 0.85 }))
      p.raw(gloss(-14, -55.6, 4.6, 1.6))
      p.raw(`<rect x="0" y="-55.6" width="5.6" height="6" rx="1.6" fill="${STEEL.base}" stroke="${INK}" stroke-width="1"/>`)
      p.raw(`<circle cx="4.6" cy="-52.6" r="2.7" fill="#fff6b0" stroke="${INK}" stroke-width="1"/><circle cx="4" cy="-53.4" r="0.9" fill="#ffffff"/>`)
      // track (with mud)
      p.raw(
        tracks('tr', -34, 31, -16, [
          [-23.6, 7],
          [-6.6, 7],
          [10.4, 7],
          [24.4, 5],
        ]),
      )
      for (const [x, y, r] of [[-30, -3, 2.6], [-15, -14.4, 2], [2, -2.6, 2.4], [17.6, -14.8, 1.8], [28, -5, 2.2]]) p.raw(mud(x, y, r))
      // drill on the lower nose: collar + spiral cone
      p.add(toon('dc', 'M28,-27.6H34V-12.4H28Z', STEEL, { shade: [0.8, 1.2], rim: 0.6 }))
      const drillD = 'M33.6,-26.4L47.6,-19.6Q48.6,-19 47.6,-18.4L33.6,-12.6Z'
      p.add(toon('dr', drillD, { light: '#fff3c4', base: '#e3b341', dark: '#a8751c' }, { shade: [0.8, 1.4], rim: 0.6 }))
      p.def(`<clipPath id="dk"><path d="${drillD}"/></clipPath>`)
      let grooves = ''
      for (const x of [35.5, 39, 42.5]) grooves += `<path d="M${x},-28L${x + 3.4},-10" stroke="#8a5a14" stroke-width="1.2"/>`
      p.raw(`<g clip-path="url(#dk)">${grooves}</g>`)
      // tall rounded body
      const bodyD = 'M-34,-13C-39,-13 -40,-21 -38.5,-29C-36.6,-38 -28,-43.6 -16,-43.6H8C20,-43.6 29.6,-37 31.6,-28L32.6,-13Z'
      p.add(toon('hu', bodyD, c, { shade: [2.6, 3.4] }))
      p.raw(gloss(-17, -39.6, 10, 2, -4))
      // shovel badge on the rear
      p.raw(`<path d="M-31,-34L-24,-27" stroke="${STEEL.dark}" stroke-width="2.2" stroke-linecap="round"/><path d="M-31,-34L-24,-27" stroke="${INK}" stroke-width="0.6" opacity="0.5"/>`)
      p.raw(`<path d="M-25.4,-28.6L-21,-24.2C-20.4,-21.4 -22.6,-19.2 -25.4,-19.8L-29.8,-24.2Z" fill="${STEEL.light}" stroke="${INK}" stroke-width="${SW * 0.65}" stroke-linejoin="round"/>`)
      // mud splashes on the lower body
      p.def(`<clipPath id="mb"><path d="${bodyD}"/></clipPath>`)
      p.raw(`<g clip-path="url(#mb)">${mud(-30, -14, 3)}${mud(-18, -13, 2.2)}${mud(6, -13.6, 2.6)}</g>`)
      return p.doc(this.box)
    },
  },

  /**
   * 鷹眼：細長低矮車身（鳥喙形車鼻）、側面白色羽翼徽、帶瞄準鏡與旋轉雷達盤的砲塔、約車身兩倍長的磁軌狙擊砲。
   * face (25,-6) pivot (-3,-23)
   */
  hawkeye: {
    box: [-50, -66, 100, 67],
    barrel: { len: 66, thick: 6, style: 'rails', brake: 10 },
    hull(team) {
      const c = TEAMS[team]
      const p = painter()
      // radar mast + tilted dish
      p.raw(line(-15, -40, -17, -54, INK, 1.6))
      p.raw(line(-15, -40, -17, -54, STEEL.base, 0.7))
      p.add(toon('rd', 'M-26,-55C-24,-61 -14,-63.6 -8.4,-60C-12,-58.4 -18.4,-55.6 -26,-55Z', STEEL, { shade: [0.8, 1.2], rim: 0.6, stroke: SW * 0.85 }))
      p.raw(`<circle cx="-17.2" cy="-56.6" r="1.4" fill="${c.base}" stroke="${INK}" stroke-width="0.7"/>`)
      p.raw(line(-17.2, -56.6, -14, -61, INK, 0.8))
      // angular turret with a scope on top
      p.add(toon('tu', 'M-20,-31L-17,-41.4Q-16.4,-43 -14.6,-43H6Q8,-43 8.6,-41.4L11,-31Z', c, { shade: [1.4, 2] }))
      p.raw(gloss(-8, -40, 5, 1.3))
      p.add(toon('sc', 'M-12,-48.6H6Q8,-48.6 8,-46.6V-45.4Q8,-43.4 6,-43.4H-12Q-14,-43.4 -14,-45.4V-46.6Q-14,-48.6 -12,-48.6Z', STEEL, { shade: [0.6, 1], rim: 0.5, stroke: SW * 0.8 }))
      p.raw(`<circle cx="8" cy="-46" r="2.6" fill="${GLASS.base}" stroke="${INK}" stroke-width="1"/><circle cx="7.4" cy="-46.8" r="0.9" fill="#ffffff"/>`)
      // track: long and low
      p.raw(
        tracks('tr', -38, 37, -12.5, [
          [-28.6, 5.8],
          [-11, 5.8],
          [6.6, 5.8],
          [24.2, 5.8],
          [32.6, 3.4],
        ]),
      )
      // long sleek body with a beak-like nose
      const bodyD = 'M-41,-11C-46,-11 -46.4,-18.6 -43.6,-23.4C-40.6,-28.6 -32,-31 -22,-31H14C28,-31 40,-25.6 46.6,-18.4C48.2,-16.6 48,-14.2 46.2,-13.2L42,-11Z'
      p.add(toon('hu', bodyD, c, { shade: [2.2, 2.8] }))
      p.def(`<clipPath id="nk"><path d="${bodyD}"/></clipPath>`)
      p.raw(`<g clip-path="url(#nk)"><path d="M41,-30L50,-30V-10L40,-10C42.6,-14 43,-20 41,-30Z" fill="${GOLD.base}"/><path d="M41,-30C43,-20 42.6,-14 40,-10" stroke="${INK}" stroke-width="1" fill="none"/></g>`)
      p.raw(gloss(-14, -27.6, 11, 1.7, -2))
      // white wing emblem on the rear flank
      p.raw(`<path d="M-38,-20C-32,-27.6 -22,-28.4 -12.6,-26C-17,-24.6 -20,-23.6 -22,-22C-25,-20.4 -30,-19.4 -38,-20Z" fill="${c.trim}" stroke="${INK}" stroke-width="${SW * 0.6}" stroke-linejoin="round"/>`)
      for (const [x0, x1] of [[-33, -27.4], [-28, -23], [-23, -18.6]]) p.raw(line(x0, -21, x1, -24.8, c.dark, 0.8, 0.8))
      return p.doc(this.box)
    },
  },
}

// ───────────────────────── projectiles ─────────────────────────

const SHOTS = {
  /** 高拋迫擊彈：胖圓炸彈、琥珀褐色、十字束帶、四片尾翼 */
  shell_mortar: () => {
    const defs = vGrad('bd', -6.4, 6.4, [
      [0, '#ffe2a3'],
      [0.35, '#d9922f'],
      [1, '#7a4310'],
    ])
    const body =
      `<path d="M-13.6,-6.4L-8,-3V3L-13.6,6.4Z" fill="#5b6273" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>` +
      `<rect x="-14.4" y="-1.4" width="7" height="2.8" rx="1" fill="#3b4252" stroke="${INK}" stroke-width="0.7"/>` +
      `<ellipse cx="0.6" cy="0" rx="10.4" ry="6.6" fill="url(#bd)" stroke="${INK}" stroke-width="1"/>` +
      `<path d="M-1.6,-6.5C-0.4,-2 -0.4,2 -1.6,6.5" stroke="${INK}" stroke-width="2.6" fill="none"/><path d="M-1.6,-6.5C-0.4,-2 -0.4,2 -1.6,6.5" stroke="#f5c84a" stroke-width="1.4" fill="none"/>` +
      `<path d="M-6,-4.4C-1,-6 4,-6 7.6,-4" stroke="#fff3cf" stroke-width="1.1" fill="none" stroke-linecap="round"/>` +
      `<circle cx="10.2" cy="0" r="1.5" fill="#3b4252" stroke="${INK}" stroke-width="0.6"/>`
    return svgDoc([-15.5, -8, 28, 16], body, defs)
  },

  /** 築壘彈：圓滾滾的土球，頂端冒出草芽、嵌著小石子，一看就知道是「土」 */
  shell_rampart: () => {
    const defs = rGrad(
      'sk',
      [
        [0, '#d9a066'],
        [0.55, '#9a6332'],
        [1, '#5e3a18'],
      ],
      0.38,
      0.34,
      0.66,
    )
    const body =
      `<path d="M-9.4,-1.4C-12.6,-2.6 -13.6,0 -12.4,1.4C-11,2.6 -9.6,1.6 -9,0.6Z" fill="${MUD.base}" stroke="${INK}" stroke-width="0.7"/>` +
      `<path d="M-8.4,-3.4C-6.6,-7.4 0,-8.4 5,-6.6C9.6,-5 11.2,-1.6 10.6,1.6C10,5.6 5.6,8 0,7.8C-5.6,7.6 -9.6,4.6 -9.6,0.6C-9.6,-1.2 -9.2,-2.4 -8.4,-3.4Z" fill="url(#sk)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
      `<path d="M-2.4,-6.4C-3.6,-9.6 -6.2,-11 -8,-10.6C-6.6,-9.4 -5.2,-8 -4.6,-6.4Z" fill="#6cc04a" stroke="${INK}" stroke-width="0.7" stroke-linejoin="round"/>` +
      `<path d="M-1,-6.6C0,-10.6 3,-12 5.4,-11.6C3.6,-10.4 2,-8.6 1.2,-6.4Z" fill="#8be04e" stroke="${INK}" stroke-width="0.7" stroke-linejoin="round"/>` +
      `<circle cx="3.6" cy="2.6" r="1.6" fill="#b8bfcc" stroke="${INK}" stroke-width="0.6"/>` +
      `<circle cx="-3.6" cy="3.8" r="1.1" fill="#9aa3b3" stroke="${INK}" stroke-width="0.5"/>` +
      `<circle cx="6.6" cy="-2" r="0.9" fill="${MUD.dark}"/><circle cx="-4.8" cy="-1" r="0.8" fill="${MUD.dark}"/>` +
      `<path d="M-5.4,-4.6C-3,-6.2 0.6,-6.6 3.6,-5.8" stroke="#f0c48a" stroke-width="1.1" fill="none" stroke-linecap="round"/>`
    return svgDoc([-13.5, -12.5, 25, 21.5], body, defs)
  },

  /** 散彈：亮藍白小鋼珠（一次五顆，所以小而閃亮） */
  shell_scatter: () => {
    const defs = rGrad(
      'pl',
      [
        [0, '#ffffff'],
        [0.45, '#bfe6ff'],
        [1, '#3d7fe0'],
      ],
      0.38,
      0.36,
      0.62,
    )
    const body =
      `<path d="M-8.4,0L-3,-2.6V2.6Z" fill="#9fd2ff" opacity="0.7"/>` +
      `<circle r="4.4" fill="url(#pl)" stroke="${INK}" stroke-width="0.9"/>` +
      `<circle cx="-1.4" cy="-1.5" r="1.2" fill="#ffffff"/>`
    return svgDoc([-9, -5.5, 15, 11], body, defs)
  },

  /** 跳彈：旋轉的厚圓盤（打水漂石頭的造型），黃色外環 + 青色核心 */
  shell_skip: () => {
    const body =
      `<circle r="7.4" fill="#ffd84a" stroke="${INK}" stroke-width="1"/>` +
      `<circle r="7.4" fill="none" stroke="#c98a12" stroke-width="1.4" stroke-dasharray="2.4 2.2" opacity="0.85"/>` +
      `<circle r="4.2" fill="#3ccfe6" stroke="${INK}" stroke-width="0.9"/>` +
      `<circle r="1.6" fill="#e6fbff" stroke="${INK}" stroke-width="0.6"/>` +
      `<path d="M-5.4,-3.6A6,6 0 0 1 -1,-6" stroke="#ffffff" stroke-width="1.2" fill="none" stroke-linecap="round"/>`
    return svgDoc([-8.5, -8.5, 17, 17], body)
  },

  /** 毒霧彈：圓底燒瓶、軟木塞、冒泡的螢光綠毒液與紫色玻璃 */
  shell_toxin: () => {
    const defs =
      `<clipPath id="fk"><path d="M-2,-3C-7.4,-3 -10,-0.6 -10,2.4C-10,5.6 -6.4,7.4 -2,7.4C2.4,7.4 6,5.6 6,2.4C6,-0.6 3.4,-3 -2,-3Z"/></clipPath>`
    const body =
      // the flask is drawn nose-right: neck points to +x
      `<g transform="rotate(-90)">` +
      `<path d="M-2,-3C-7.4,-3 -10,-0.6 -10,2.4C-10,5.6 -6.4,7.4 -2,7.4C2.4,7.4 6,5.6 6,2.4C6,-0.6 3.4,-3 -2,-3Z" fill="#e9d5ff" opacity="0.95"/>` +
      `<g clip-path="url(#fk)"><rect x="-11" y="0" width="18" height="9" fill="${TOXIC.base}"/><rect x="-11" y="0" width="18" height="1.6" fill="${TOXIC.light}"/><rect x="2.6" y="0" width="4" height="9" fill="${TOXIC.dark}" opacity="0.5"/></g>` +
      `<path d="M-2,-3C-7.4,-3 -10,-0.6 -10,2.4C-10,5.6 -6.4,7.4 -2,7.4C2.4,7.4 6,5.6 6,2.4C6,-0.6 3.4,-3 -2,-3Z" fill="none" stroke="#7c3aed" stroke-width="1.2"/>` +
      `<path d="M-2,-3C-7.4,-3 -10,-0.6 -10,2.4C-10,5.6 -6.4,7.4 -2,7.4C2.4,7.4 6,5.6 6,2.4C6,-0.6 3.4,-3 -2,-3Z" fill="none" stroke="${INK}" stroke-width="0.6"/>` +
      `<rect x="-4.2" y="-8.4" width="4.4" height="6" rx="1" fill="#e9d5ff" stroke="${INK}" stroke-width="0.9"/>` +
      `<rect x="-4.8" y="-11" width="5.6" height="3.4" rx="1" fill="#b07a45" stroke="${INK}" stroke-width="0.8"/>` +
      `<circle cx="-5.4" cy="3.6" r="1.1" fill="#ffffff" opacity="0.85"/><circle cx="-1.4" cy="5" r="0.7" fill="#ffffff" opacity="0.85"/>` +
      `<path d="M-7.6,1.6C-7.6,-0.4 -6,-1.8 -4,-2" stroke="#ffffff" stroke-width="1" fill="none" stroke-linecap="round"/>` +
      `</g>`
    return svgDoc([-12, -7.5, 21.5, 19.5], body, defs)
  },

  /** 酸蝕彈：螢光綠倒鉤毒針 + 滴落的酸液 */
  shell_acid: () => {
    const body =
      `<path d="M-11,-3.6L-7,-1.4V1.4L-11,3.6Z" fill="#9b5de5" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>` +
      `<rect x="-8" y="-2.6" width="8" height="5.2" rx="2.2" fill="#6b3fb8" stroke="${INK}" stroke-width="0.9"/>` +
      `<path d="M-0.6,-3.4C4,-3.4 8.6,-1.4 11.4,0C8.6,1.4 4,3.4 -0.6,3.4Z" fill="${TOXIC.base}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
      `<path d="M2,-2.6L0.6,-5.2L4.2,-2.6" fill="${TOXIC.base}" stroke="${INK}" stroke-width="0.7" stroke-linejoin="round"/>` +
      `<path d="M1,-2C4,-2 6.6,-1.2 8.6,-0.4" stroke="${TOXIC.light}" stroke-width="0.9" fill="none" stroke-linecap="round"/>` +
      `<path d="M5.4,3.2C5.4,4.6 4.6,5.6 4.6,6.4C4.6,7.2 5.2,7.6 5.8,7.6C6.4,7.6 7,7.2 7,6.4C7,5.6 6.2,4.6 6.2,3.2Z" fill="${TOXIC.light}" stroke="${INK}" stroke-width="0.6"/>`
    return svgDoc([-12, -6.5, 24.5, 15], body)
  },

  /** 凍結彈：冰球裡封著六角雪花（自轉） */
  shell_freeze: () => {
    const defs = rGrad(
      'ib',
      [
        [0, '#ffffff'],
        [0.55, '#d6f3ff'],
        [1, '#6cc2ee'],
      ],
      0.4,
      0.38,
      0.62,
    )
    let flake = ''
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 * Math.PI) / 180
      const x = Math.cos(a) * 5
      const y = Math.sin(a) * 5
      flake += `<path d="M0,0L${f1(x)},${f1(y)}" stroke="#2f7fc0" stroke-width="1.2" stroke-linecap="round"/>`
      const bx = Math.cos(a) * 3
      const by = Math.sin(a) * 3
      for (const s of [-1, 1]) {
        const b = a + s * 0.7
        flake += `<path d="M${f1(bx)},${f1(by)}L${f1(bx + Math.cos(b) * 1.6)},${f1(by + Math.sin(b) * 1.6)}" stroke="#2f7fc0" stroke-width="0.9" stroke-linecap="round"/>`
      }
    }
    const body =
      `<circle r="8" fill="url(#ib)" stroke="${INK}" stroke-width="1"/>` +
      flake +
      `<circle r="1.3" fill="#ffffff" stroke="#2f7fc0" stroke-width="0.6"/>` +
      `<path d="M-5.4,-3.4A6.4,6.4 0 0 1 -1.6,-6.4" stroke="#ffffff" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
    return svgDoc([-9, -9, 18, 18], body, defs)
  },

  /** 冰錐彈：尖長的冰晶錐、裂紋與白色高光 */
  shell_icicle: () => {
    const defs = vGrad('ic', -4.4, 4.4, [
      [0, '#ffffff'],
      [0.45, '#bdeaff'],
      [1, '#4ea8dc'],
    ])
    const body =
      `<path d="M-11,-1.6L-8,-4.6L-6,-1Z" fill="#9fdcff" stroke="${INK}" stroke-width="0.7" stroke-linejoin="round"/>` +
      `<path d="M-11,1.8L-8,4.4L-6.4,1Z" fill="#7cc8ec" stroke="${INK}" stroke-width="0.7" stroke-linejoin="round"/>` +
      `<path d="M-8,-4.4L1,-3.6L12,0L1,3.6L-8,4.4L-6,0Z" fill="url(#ic)" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
      `<path d="M-6,0L12,0" stroke="#4ea8dc" stroke-width="0.7"/>` +
      `<path d="M-1,-2.4L2,0.4L0.6,2" stroke="#2f7fc0" stroke-width="0.6" fill="none"/>` +
      `<path d="M-5.6,-2.8L4,-2.2" stroke="#ffffff" stroke-width="0.9" stroke-linecap="round"/>`
    return svgDoc([-12, -5.5, 25, 11], body, defs)
  },

  /** 鑽地彈：黃銅彈身 + 鋼質螺旋鑽頭 */
  shell_drill: () => {
    const defs =
      vGrad('dbd', -4, 4, [
        [0, '#fff0b0'],
        [0.4, '#d9a336'],
        [1, '#8a5a14'],
      ]) + `<clipPath id="dk"><path d="M1.6,-4.4L12.6,0L1.6,4.4Z"/></clipPath>`
    let grooves = ''
    for (const x of [2.6, 5.4, 8.2]) grooves += `<path d="M${x},5L${x + 2.6},-5" stroke="${STEEL.deep}" stroke-width="1"/>`
    const body =
      `<path d="M-11.6,-4L-8,-2V2L-11.6,4Z" fill="#5b6273" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>` +
      `<rect x="-9" y="-4" width="11" height="8" rx="1.6" fill="url(#dbd)" stroke="${INK}" stroke-width="0.9"/>` +
      `<rect x="-3.6" y="-4.2" width="1.6" height="8.4" fill="#b4562b" stroke="${INK}" stroke-width="0.5"/>` +
      `<path d="M1.6,-4.4L12.6,0L1.6,4.4Z" fill="${STEEL.light}"/>` +
      `<g clip-path="url(#dk)"><path d="M1.6,0.6L12.6,0L1.6,4.4Z" fill="${STEEL.base}"/>${grooves}</g>` +
      `<path d="M1.6,-4.4L12.6,0L1.6,4.4Z" fill="none" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>` +
      `<path d="M-7,-2.6H0" stroke="#fff6d0" stroke-width="0.9" stroke-linecap="round"/>`
    return svgDoc([-12.5, -5.5, 26, 11], body, defs)
  },

  /** 震波彈：橘色球體外加兩道同心震波環（自轉） */
  shell_quake: () => {
    const defs = rGrad(
      'qk',
      [
        [0, '#fff3d6'],
        [0.5, '#ffa94d'],
        [1, '#c2410c'],
      ],
      0.4,
      0.38,
      0.62,
    )
    const body =
      `<circle r="9.4" fill="none" stroke="#fdba74" stroke-width="1.6" stroke-dasharray="3.2 2.4" opacity="0.9"/>` +
      `<circle r="6.4" fill="url(#qk)" stroke="${INK}" stroke-width="1"/>` +
      `<path d="M-6.2,0H-3L-1.6,-2.6L0.4,2.6L1.8,0H6.2" stroke="${INK}" stroke-width="1.1" fill="none" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<path d="M-4.4,-3.6A5,5 0 0 1 -1,-5.4" stroke="#ffffff" stroke-width="1.2" fill="none" stroke-linecap="round"/>`
    return svgDoc([-10.5, -10.5, 21, 21], body, defs)
  },

  /** 磁軌狙擊彈：細長的白藍能量長槍，尾端兩道導流片 */
  shell_rail: () => {
    const defs = vGrad('rl', -2.4, 2.4, [
      [0, '#ffffff'],
      [0.5, '#c7dcff'],
      [1, '#4f7fe0'],
    ])
    const body =
      `<path d="M-14,0H-4" stroke="#bfe0ff" stroke-width="3.6" stroke-linecap="round" opacity="0.55"/>` +
      `<path d="M-12,-3.6L-7.6,-1.2H-5.6L-8.4,-3.6Z" fill="${STEEL.base}" stroke="${INK}" stroke-width="0.7" stroke-linejoin="round"/>` +
      `<path d="M-12,3.6L-7.6,1.2H-5.6L-8.4,3.6Z" fill="${STEEL.dark}" stroke="${INK}" stroke-width="0.7" stroke-linejoin="round"/>` +
      `<path d="M-10,-2.2H6L14,0L6,2.2H-10Z" fill="url(#rl)" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>` +
      `<path d="M-8,-1H8" stroke="#ffffff" stroke-width="0.8" stroke-linecap="round"/>` +
      `<rect x="-2" y="-2.6" width="1.8" height="5.2" rx="0.6" fill="#4b8fff" stroke="${INK}" stroke-width="0.5"/>`
    return svgDoc([-15, -4.5, 30, 9], body, defs)
  },

  /** 偵察照明彈：紅色信號筒 + 發光的黃色彈頭 */
  shell_flare: () => {
    const defs = rGrad('fl', [
      [0, '#ffffff', 1],
      [0.4, '#fff3a0', 1],
      [1, '#facc15', 0],
    ])
    const body =
      `<circle cx="7" cy="0" r="7" fill="url(#fl)"/>` +
      `<path d="M-10,-3.6L-6.6,-1.6V1.6L-10,3.6Z" fill="#5b6273" stroke="${INK}" stroke-width="0.7" stroke-linejoin="round"/>` +
      `<rect x="-7.6" y="-3.4" width="11" height="6.8" rx="1.4" fill="#e5484d" stroke="${INK}" stroke-width="0.9"/>` +
      `<path d="M-4,-3.4V3.4M-0.6,-3.4V3.4" stroke="#ffffff" stroke-width="1" opacity="0.9"/>` +
      `<path d="M3.2,-3.6H5.6C8,-3.6 10,-2 10,0C10,2 8,3.6 5.6,3.6H3.2Z" fill="#ffe066" stroke="${INK}" stroke-width="0.9"/>` +
      `<circle cx="6.4" cy="-1" r="1.1" fill="#ffffff"/>` +
      `<path d="M-6,-2.2H2" stroke="#ffb3b5" stroke-width="0.8" stroke-linecap="round"/>`
    return svgDoc([-10.5, -7, 24.5, 14], body, defs)
  },
}

// ───────────────────────── effect particles ─────────────────────────

const glowDisc = (stops) => () => svgDoc([0, 0, 64, 64], `<circle cx="32" cy="32" r="32" fill="url(#g)"/>`, rGrad('g', stops))

const FX = {
  glow_fire: glowDisc([
    [0, '#fffbe6', 1],
    [0.25, '#ffd65c', 0.95],
    [0.55, '#ff8a2a', 0.5],
    [1, '#ff4d1a', 0],
  ]),
  glow_plasma: glowDisc([
    [0, '#ffffff', 1],
    [0.25, '#9df0ff', 0.95],
    [0.55, '#4f8dff', 0.5],
    [1, '#8b5cf6', 0],
  ]),
  /** 毒：螢光綠核心、紫色外暈 */
  glow_toxic: glowDisc([
    [0, '#f7ffe0', 1],
    [0.25, '#b6f05a', 0.95],
    [0.58, '#8b5cf6', 0.5],
    [1, '#6d28d9', 0],
  ]),
  /** 冰：白色核心、冰藍外暈 */
  glow_ice: glowDisc([
    [0, '#ffffff', 1],
    [0.3, '#d6f5ff', 0.95],
    [0.6, '#7dd3fc', 0.5],
    [1, '#38bdf8', 0],
  ]),
  spark: () =>
    svgDoc(
      [0, 0, 32, 8],
      `<path d="M0,4C8,2.6 22,1.4 32,4C22,6.6 8,5.4 0,4Z" fill="url(#g)"/>`,
      `<linearGradient id="g" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#ff8a2a" stop-opacity="0"/><stop offset="0.6" stop-color="#ffd65c"/><stop offset="1" stop-color="#ffffff"/></linearGradient>`,
    ),
  shockwave: () =>
    svgDoc(
      [0, 0, 128, 128],
      `<circle cx="64" cy="64" r="64" fill="url(#g)"/>`,
      rGrad('g', [
        [0, '#ffffff', 0],
        [0.72, '#ffffff', 0],
        [0.86, '#ffffff', 0.85],
        [0.94, '#ffffff', 0.35],
        [1, '#ffffff', 0],
      ]),
    ),
}

// ───────────────────────── output ─────────────────────────

function emit(group, name, svgText, zoom = 1) {
  const svgDir = join(SVG_OUT, group)
  const pngDir = join(PNG_OUT, group)
  mkdirSync(svgDir, { recursive: true })
  mkdirSync(pngDir, { recursive: true })
  writeFileSync(join(svgDir, `${name}.svg`), svgText)
  const fitTo = zoom === 1 ? { mode: 'original' } : { mode: 'zoom', value: zoom }
  const png = new Resvg(svgText, { fitTo, font: { loadSystemFonts: false } }).render().asPng()
  writeFileSync(join(pngDir, `${name}.png`), png)
}

for (const [id, tank] of Object.entries(TANKS)) {
  for (const team of Object.keys(TEAMS)) {
    emit('tanks', `${id}_${team}_hull`, tank.hull(team), TANK_ZOOM)
    emit('tanks', `${id}_${team}_barrel`, barrelSvg(tank.barrel, team), TANK_ZOOM)
  }
}
for (const [key, draw] of Object.entries(SHOTS)) emit('projectiles', key, draw(), SHOT_ZOOM)
for (const [key, draw] of Object.entries(FX)) emit('fx', key, draw())

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
console.log(`tanks: ${Object.keys(TANKS).length * 2} · projectiles: ${Object.keys(SHOTS).length} · fx: ${Object.keys(FX).length}`)
console.log(`svgo: ${svgoOk ? 'optimized' : 'skipped (not on PATH)'} · imagemagick: ${stripped} PNGs stripped`)
