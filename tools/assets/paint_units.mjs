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
import { HULL_BOX as SCORPION_BOX, scorpionBarrel, scorpionHull } from './tanks/scorpion.mjs'

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
// Paper-doll rule: each tank's body wears its own signature colour (who it is); only a few fixed
// upper parts (turret / flag / scarf / claws / saddle / helmet / emblem) wear the team colour (whose side).
// Signature colours steer clear of both team hues so the two never blur together.
const SKINS = {
  bastion: { light: '#f3f1ea', base: '#c9c4b6', dark: '#9b9586', deep: '#625d52' },
  zephyr: { light: '#ffffff', base: '#f1ecdd', dark: '#cbc2a8', deep: '#8c836b' },
  scorpion: { light: '#c8a6f2', base: '#8858c8', dark: '#5d3896', deep: '#3b2163' },
  frostback: { light: '#b9bccb', base: '#7c8092', dark: '#565a6b', deep: '#363a48' },
  burrower: { light: '#d4a477', base: '#9e6b3d', dark: '#6f4523', deep: '#4a2d14' },
  hawkeye: { light: '#ffffff', base: '#e6e9ef', dark: '#b3b9c6', deep: '#767d8c' },
}
const CARBON = { light: '#7d8394', base: '#4c5161', dark: '#33364a', deep: '#22242f' }
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

/** Big off-road buggy tyre: knobbly tread blocks, five-spoke rim, gloss. */
function offroadWheel(x, y, r) {
  let knobs = ''
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    knobs += `<rect x="${f1(x + Math.cos(a) * r - 1.5)}" y="${f1(y + Math.sin(a) * r - 1.5)}" width="3" height="3" rx="0.7" transform="rotate(${f1((a * 180) / Math.PI)} ${f1(x + Math.cos(a) * r)} ${f1(y + Math.sin(a) * r)})" fill="${RUBBER.dark}" stroke="${INK}" stroke-width="0.7"/>`
  }
  let spokes = ''
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2
    spokes += line(x, y, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, STEEL.dark, 1.6)
  }
  return (
    knobs +
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${RUBBER.base}" stroke="${INK}" stroke-width="${SW}"/>` +
    `<circle cx="${x}" cy="${y}" r="${f1(r * 0.62)}" fill="${STEEL.base}" stroke="${INK}" stroke-width="1"/>` +
    spokes +
    `<circle cx="${x}" cy="${y}" r="${f1(r * 0.2)}" fill="${GOLD.base}" stroke="${INK}" stroke-width="0.8"/>` +
    `<path d="M${f1(x - r * 0.75)},${f1(y - r * 0.25)}A${f1(r * 0.8)},${f1(r * 0.8)} 0 0 1 ${f1(x - r * 0.1)},${f1(y - r * 0.8)}" stroke="${RUBBER.light}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
  )
}

/** Exhaust pipe at the rear. */
function exhaust(x, y, h = 6) {
  return (
    `<rect x="${x - 2}" y="${y - h}" width="4" height="${h + 2}" rx="1.2" fill="${STEEL.dark}" stroke="${INK}" stroke-width="${SW * 0.75}"/>` +
    `<rect x="${x - 2.8}" y="${y - h - 1.6}" width="5.6" height="2.6" rx="1.1" fill="${STEEL.base}" stroke="${INK}" stroke-width="${SW * 0.75}"/>`
  )
}

/** Deterministic tiny LCG so every bake paints the same grain. */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0
    return a / 2 ** 32
  }
}

/**
 * Material pass over a part already painted with toon(): soft occlusion towards the bottom, fine
 * speckle grain (dark pits + light flecks), a few light scuffs on the upper third, then the ink
 * outline again so the texture never eats the edge. bbox = [x0, y0, x1, y1]. Returns [defs, body].
 */
function finish(id, d, c, [x0, y0, x1, y1], { seed = 1, grain = 40, grainR = [0.35, 0.85], scuffs = 4, ao = 0.3, stroke = SW } = {}) {
  const r = rng(seed)
  const defs =
    `<clipPath id="${id}F"><path d="${d}"/></clipPath>` +
    vGrad(`${id}A`, y0, y1, [
      [0, c.deep, 0],
      [0.5, c.deep, 0],
      [1, c.deep, ao],
    ])
  let g = `<rect x="${x0}" y="${y0}" width="${f1(x1 - x0)}" height="${f1(y1 - y0)}" fill="url(#${id}A)"/>`
  for (let i = 0; i < grain; i++) {
    const x = x0 + r() * (x1 - x0)
    const y = y0 + r() * (y1 - y0)
    const rr = grainR[0] + r() * (grainR[1] - grainR[0])
    const dark = r() < 0.6
    g += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rr)}" fill="${dark ? c.deep : c.light}" opacity="${dark ? 0.32 : 0.6}"/>`
  }
  for (let i = 0; i < scuffs; i++) {
    const x = x0 + 3 + r() * (x1 - x0 - 6)
    const y = y0 + 2 + r() * (y1 - y0) * 0.3
    const l = 1.6 + r() * 2.6
    g += line(x, y, x + l, y - l * 0.25, '#ffffff', 0.7, 0.55)
  }
  return [defs, `<g clip-path="url(#${id}F)">${g}</g><path d="${d}" fill="none" stroke="${INK}" stroke-width="${stroke}" stroke-linejoin="round"/>`]
}

/** toon() + finish() in one go for the big parts. */
function skinPart(id, d, c, bbox, toonOpts = {}, finishOpts = {}) {
  const [d1, b1] = toon(id, d, c, toonOpts)
  const [d2, b2] = finish(id, d, c, bbox, { stroke: toonOpts.stroke ?? SW, ...finishOpts })
  return [d1 + d2, b1 + b2]
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
 *   rails   twin rails, energy channel, team coils and a muzzle brake (Hawkeye)
 */
function barrelSvg(spec, team, skin = STEEL) {
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
   * 鐵壁堡壘：石灰岩城牆車身（底部外擴、磚紋）、後方瞭望塔、短粗迫擊砲塔、沙包堆、五輪重履帶；隊伍色＝圓頂、城垛、小旗。
   * face (19,-13) pivot (3,-34)
   */
  bastion: {
    box: [-48, -76, 96, 77],
    barrel: { len: 28, thick: 12, band: 0.34, muzzle: { w: 8, h: 17 } },
    hull(team) {
      const c = TEAMS[team]
      const s = SKINS.bastion
      const p = painter()
      // rear watchtower (castle silhouette): stone shaft, team merlons, pennant on top
      p.raw(line(-30, -58, -30, -72, INK, 1.5))
      p.raw(`<path d="M-29.4,-72L-16,-68L-29.4,-63.6Z" fill="${c.base}" stroke="${INK}" stroke-width="${SW * 0.7}" stroke-linejoin="round"/>`)
      p.raw(`<path d="M-28.6,-70.2L-21,-68" stroke="${c.light}" stroke-width="1" stroke-linecap="round"/>`)
      p.raw(`<circle cx="-30" cy="-72.6" r="1.6" fill="${GOLD.base}" stroke="${INK}" stroke-width="0.8"/>`)
      for (const [x0, x1] of [[-39, -34.4], [-32.4, -27.6], [-25.6, -21]]) {
        p.add(toon(`t${x0}`, `M${x0},-52V-57Q${x0},-58.4 ${x0 + 1.4},-58.4H${x1 - 1.4}Q${x1},-58.4 ${x1},-57V-52Z`, c, { shade: [1, 1.4], rim: 0.7 }))
      }
      const towerD = 'M-38,-40V-51Q-38,-53 -36,-53H-24Q-22,-53 -22,-51V-40Z'
      p.add(skinPart('tw', towerD, s, [-38, -53, -22, -40], { shade: [1.4, 2] }, { seed: 11, grain: 24, scuffs: 2, ao: 0.25 }))
      p.raw(`<path d="M-33,-49.6H-27V-44.6Q-30,-47 -33,-44.6Z" fill="${INK}" opacity="0.85"/>`)
      p.raw(`<path d="M-38,-46.6H-22" stroke="${s.deep}" stroke-width="0.9" opacity="0.4"/>`)
      // wall merlons in team colour (front pair + one behind the turret)
      for (const [x0, x1] of [[-19, -13], [21, 27], [30, 36]]) {
        p.add(toon(`m${x0}`, `M${x0},-38V-46Q${x0},-47.5 ${x0 + 1.5},-47.5H${x1 - 1.5}Q${x1},-47.5 ${x1},-46V-38Z`, c, { shade: [1.2, 1.6], rim: 0.8 }))
      }
      // squat mortar turret: team dome + steel collar
      p.add(skinPart('tu', 'M-11,-41C-11,-52 -4.5,-56.5 3,-56.5C10.5,-56.5 17,-52 17,-41Z', c, [-11, -57, 17, -41], { shade: [1.6, 2.4] }, { seed: 12, grain: 16, scuffs: 3, ao: 0.2 }))
      p.raw(gloss(-1, -52, 5.4, 1.7))
      p.raw(rivet(9.5, -50.5, 1.1, c))
      p.add(toon('cl', 'M-13.5,-43.5H19.5V-39.6H-13.5Z', STEEL, { shade: [0.8, 1.2], rim: 0.6, stroke: SW * 0.85 }))
      for (const x of [-9, -2, 5, 12]) p.raw(rivet(x + 1.5, -41.5, 0.9))
      // heavy track: five fat wheels
      p.raw(tracks('tr', -39, 39, -16, [[-29, 6.6], [-14.5, 6.6], [0, 6.6], [14.5, 6.6], [29, 6.6]]))
      // battered fortress wall (flares out at the base)
      const bodyD = 'M-40,-14L-37.4,-38.6Q-37,-41 -34.6,-41H34.6Q37,-41 37.4,-38.6L40,-14Z'
      p.add(skinPart('hu', bodyD, s, [-40, -41, 40, -14], { shade: [2.6, 3.2] }, { seed: 13, grain: 70, scuffs: 4, ao: 0.3 }))
      // ashlar courses on the rear half, each block with a light top edge; a few cracks and moss
      p.def(`<clipPath id="br"><path d="M-40,-41H3V-14H-40Z"/></clipPath>`)
      let bricks = ''
      for (const [y0, y1, off] of [[-41, -32.5, 0], [-32.5, -23.5, 6], [-23.5, -14, 0]]) {
        bricks += `<path d="M-40,${y1}H3" stroke="${s.deep}" stroke-width="1" opacity="0.55"/>`
        for (let x = -42 + off; x < 3; x += 12) {
          bricks += `<path d="M${x},${y0}V${y1}" stroke="${s.deep}" stroke-width="1" opacity="0.55"/>`
          bricks += line(x + 1.2, y0 + 1.1, x + 9.6, y0 + 1.1, s.light, 0.9, 0.9)
        }
      }
      bricks += `<path d="M-14,-32.5L-12.4,-29L-14.6,-26.4L-13,-23.5" stroke="${s.deep}" stroke-width="0.8" fill="none" opacity="0.8"/>`
      bricks += `<path d="M-40,-14.4C-36,-17 -31,-16.2 -27,-14.4Z" fill="#7fb85a" stroke="${INK}" stroke-width="0.6"/><circle cx="-33" cy="-16.2" r="0.8" fill="#b8e08a"/>`
      p.raw(`<g clip-path="url(#br)">${bricks}</g>`)
      p.raw(`<path d="${bodyD}" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`)
      p.raw(gloss(6, -37.4, 12, 1.6, -2))
      // gate arch on the front lower edge (keeps the face area above it free)
      p.raw(`<path d="M28.6,-14V-19.5A4.5,4.5 0 0 1 37.6,-19.5V-14Z" fill="#7a4a24" stroke="${INK}" stroke-width="${SW * 0.7}"/>`)
      p.raw(line(33.1, -23.6, 33.1, -14.6, INK, 0.8, 0.6))
      p.raw(rivet(31.4, -17.4, 0.6, GOLD))
      // sandbag pile against the rear corner
      p.add(sandbag('sb1', -42, -18.4))
      p.add(sandbag('sb2', -32.6, -18.8))
      p.add(sandbag('sb3', -37.6, -25))
      return p.doc(this.box)
    },
  },

  /**
   * 疾風遊俠：象牙白楔形車身、兩顆越野大輪（沙灘車）、遊俠頭盔 + 碳灰護目鏡、後噴推進器、喇叭口散彈砲；隊伍色＝圍巾、側條紋。
   * face (17,-8) pivot (-6,-25)
   */
  zephyr: {
    box: [-54, -62, 102, 63],
    barrel: { len: 34, thick: 6.6, bell: 15, style: 'bell' },
    hull(team) {
      const c = TEAMS[team]
      const s = SKINS.zephyr
      const p = painter()
      // wind-swept team-colour scarf: two wavy tails streaming back from the helmet neck
      p.add(toon('sf1', 'M-15,-38.6C-21,-41.6 -26,-42 -31,-40.4C-36,-38.8 -40,-41.6 -44,-45.6L-48.4,-44C-44.6,-39 -40,-34.6 -33.6,-35.6C-27,-36.6 -22,-36.4 -16,-34.2Z', c, { shade: [0.9, 1.3], rim: 0.6, stroke: SW * 0.8 }))
      p.add(toon('sf2', 'M-16,-35.4C-21.6,-34.6 -25.4,-32.6 -29.6,-30.4C-33,-28.8 -36.6,-29.6 -40,-31.4L-42.6,-28.6C-38.6,-25.6 -34,-25.2 -29.4,-27C-25,-28.8 -21,-31 -16.4,-31.6Z', c, { shade: [0.9, 1.3], rim: 0.6, stroke: SW * 0.8 }))
      for (const [x0, y0, x1, y1] of [[-30, -39.6, -32.6, -36.4], [-38, -40.6, -40.6, -37.4], [-28.4, -30.4, -30.6, -27.6]]) p.raw(line(x0, y0, x1, y1, c.light, 1.1, 0.9))
      // twin rear boosters: short nozzles pointing backwards with little flames
      for (const [y, l] of [[-17.6, 7], [-23.4, 6]]) {
        p.raw(`<path d="M-41,${y - 2.2}C-${44 + l * 0.4},${y - 3.6} -${44 + l},${y - 1.4} -${45 + l},${y}C-${44 + l},${y + 1.4} -${44 + l * 0.4},${y + 3.6} -41,${y + 2.2}Z" fill="#ffb43a" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>`)
        p.raw(`<path d="M-41.4,${y - 1}C-43,${y - 1.4} -${43 + l * 0.5},${y - 0.6} -${43.6 + l * 0.6},${y}C-${43 + l * 0.5},${y + 0.6} -43,${y + 1.4} -41.4,${y + 1}Z" fill="#fff4b8"/>`)
        p.raw(`<rect x="-42" y="${y - 2.6}" width="6" height="5.2" rx="1.4" fill="${STEEL.base}" stroke="${INK}" stroke-width="${SW * 0.75}"/><rect x="-41" y="${y - 1.8}" width="4" height="1.1" rx="0.5" fill="#ffffff" opacity="0.7"/>`)
      }
      // ranger helmet turret + the scarf knot wrapped around its neck
      p.add(toon('tu', 'M-19,-33C-19,-43.5 -12.5,-48 -5,-48C2.5,-48 8,-43.5 8,-33Z', s, { shade: [1.6, 2.2] }))
      p.add(toon('kn', 'M-20,-38.4C-18,-35.4 -14,-34.6 -12,-36.4C-13,-38.6 -17,-40.6 -20,-38.4Z', c, { shade: [0.6, 0.9], rim: 0.5, stroke: SW * 0.7 }))
      p.raw(`<path d="M-20.5,-34.6H10.4Q11.6,-34.6 11.6,-33.4V-32.6H-20.5Z" fill="${s.deep}" stroke="${INK}" stroke-width="1"/>`)
      p.raw(gloss(-10, -44.4, 4.6, 1.5))
      // goggles pushed up on the helmet
      p.raw(`<path d="M-17,-40.4C-10,-42.4 -1,-42.4 6.4,-40.6" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`)
      p.raw(`<path d="M-17,-40.4C-10,-42.4 -1,-42.4 6.4,-40.6" stroke="${CARBON.light}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`)
      for (const gx of [-7.4, -0.4]) {
        p.raw(`<circle cx="${gx}" cy="-42" r="3.3" fill="${CARBON.base}" stroke="${INK}" stroke-width="1.1"/>`)
        p.raw(`<circle cx="${gx}" cy="-42" r="2.1" fill="${GLASS.base}"/><circle cx="${gx - 0.8}" cy="-42.8" r="0.8" fill="#ffffff"/>`)
      }
      // no track: a dune buggy on two big knobbly off-road wheels, chassis rail between them
      p.raw(`<path d="M-30,-9.6H33" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/><path d="M-30,-9.6H33" stroke="${CARBON.base}" stroke-width="2.4" stroke-linecap="round"/>`)
      for (const [x, r] of [[-26, 9.4], [31, 8.4]]) p.raw(offroadWheel(x, -r - 1.2, r))
      // wedge teardrop body: rounded rear, long low nose
      const bodyD = 'M-34,-11C-39.5,-11 -40,-20 -37,-26.5C-34,-32.5 -26,-35.5 -14,-35.5C3,-35.5 17,-30 29,-23.5C37,-19 44,-17 44,-13.6C44,-11.6 42.4,-11 40,-11Z'
      p.add(skinPart('hu', bodyD, s, [-40, -36, 44, -10], { shade: [2.4, 3] }, { seed: 21, grain: 46, scuffs: 4, ao: 0.32 }))
      // panel seam, louvred side vent, fuel cap
      p.raw(`<path d="M-8,-35C-9,-28 -9,-20 -8,-18.6" stroke="${s.deep}" stroke-width="0.9" fill="none" opacity="0.6"/>`)
      for (const y of [-31, -28.4, -25.8]) p.raw(`<path d="M-15.6,${y}H-10.4" stroke="${INK}" stroke-width="1.3" stroke-linecap="round" opacity="0.7"/><path d="M-15.6,${y + 0.8}H-10.4" stroke="${s.light}" stroke-width="0.7" stroke-linecap="round"/>`)
      p.raw(`<circle cx="2" cy="-31.4" r="1.7" fill="${CARBON.base}" stroke="${INK}" stroke-width="0.7"/><circle cx="1.6" cy="-31.8" r="0.6" fill="#ffffff" opacity="0.7"/>`)
      p.raw(gloss(-17, -32.2, 10, 1.9, -3))
      // speed chevrons on the rear flank
      p.def(`<clipPath id="st"><path d="${bodyD}"/></clipPath>`)
      p.raw(`<g clip-path="url(#st)"><path d="M-42,-18.6H46V-14H-42Z" fill="${c.base}" stroke="${INK}" stroke-width="0.9"/></g>`)
      for (const x of [-30, -24.5, -19]) p.raw(`<path d="M${x},-29.5L${x + 3.6},-25L${x},-20.5" stroke="${CARBON.base}" stroke-width="2.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/><path d="M${x},-29.5L${x + 3.6},-25L${x},-20.5" stroke="${INK}" stroke-width="0.6" fill="none" stroke-linejoin="round"/>`)
      // nose intake
      p.raw(`<path d="M37,-17.2C40,-16.4 42,-15.4 42.6,-14H36.4Z" fill="${INK}" opacity="0.85"/>`)
      return p.doc(this.box)
    },
  },

  /**
   * 毒蠍：角色優先的新畫風（車身即頭、大眼由 tankFace.ts 即時畫在殼前方），美術在 tools/assets/tanks/scorpion.mjs。
   * face (16.5,-30.7) pivot (-18.2,-53.8)
   */
  scorpion: {
    box: SCORPION_BOX,
    hull: (team) => scorpionHull(TEAMS[team], INK),
    barrelArt: (team) => scorpionBarrel(TEAMS[team], INK),
  },

  /**
   * 霜鯨：石墨灰鯨魚車身（背上積雪、白腹喉褶）、雪橇滑板、冰晶噴口砲塔、掛冰柱的雪砲管；隊伍色＝鞍帶、尾鰭尖。
   * face (22,-14) pivot (2,-32)
   */
  frostback: {
    box: [-50, -68, 98, 69],
    barrel: { len: 32, thick: 9, rings: [0.38, 0.56], muzzle: { w: 8, h: 13, ice: true }, drips: true },
    hull(team) {
      const c = TEAMS[team]
      const s = SKINS.frostback
      const p = painter()
      // tail fluke rising behind the body, team-coloured tips
      const flD = 'M-30,-28C-36,-33 -38,-40 -40,-46C-44,-46 -48,-50 -49,-55C-44,-55 -40.5,-52 -38.4,-49.4C-38,-54 -35,-58.6 -30.6,-60C-31.4,-54 -33,-48 -31.4,-43C-30,-38.6 -27,-35 -24,-33Z'
      p.add(toon('fl', flD, s, { shade: [1.2, 1.6] }))
      p.def(`<clipPath id="ft"><path d="${flD}"/></clipPath>`)
      p.raw(`<g clip-path="url(#ft)"><path d="M-52,-50.6C-46,-52 -40,-50 -36.6,-52.6C-35,-54 -33,-55 -29,-55V-62H-52Z" fill="${c.base}"/><path d="M-52,-50.6C-46,-52 -40,-50 -36.6,-52.6C-35,-54 -33,-55 -29,-55" stroke="${INK}" stroke-width="0.9" fill="none"/></g>`)
      p.raw(`<path d="${flD}" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`)
      // ice-crystal spout turret: steel ring + three crystals spraying up
      p.add(crystal('cr1', -6, -54, 11, 5.6, -24))
      p.add(crystal('cr2', 9.6, -55, 10, 5, 22))
      p.add(crystal('cr3', 2, -59, 13.6, 6.4, 0))
      p.add(toon('tu', 'M-10,-43C-10,-49.5 -4,-52.6 2,-52.6C8,-52.6 14,-49.5 14,-43Z', STEEL, { shade: [1.2, 1.6] }))
      p.raw(`<ellipse cx="2" cy="-50.6" rx="5" ry="1.4" fill="${STEEL.deep}"/>`)
      for (const x of [-6, 2, 10]) p.raw(rivet(x, -45.4, 0.9))
      // no track: a sled. Far runner (darker, offset), struts, near runner with a curled ice-blade tip
      const runner = (dx, y, col) => {
        const d = `M${-38 + dx},${y}H${30 + dx}C${37 + dx},${y} ${41 + dx},${y - 2.6} ${42.6 + dx},${y - 8}`
        return (
          `<path d="${d}" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>` +
          `<path d="${d}" stroke="${col.base}" stroke-width="2.9" fill="none" stroke-linecap="round"/>` +
          `<path d="M${-36 + dx},${y - 0.7}H${28 + dx}" stroke="${col.light}" stroke-width="0.9" stroke-linecap="round" opacity="0.9"/>`
        )
      }
      p.raw(runner(5, -4.2, { base: ICE.dark, light: ICE.base }))
      for (const x of [-26, -6, 14, 30]) {
        p.raw(`<rect x="${x - 1.8}" y="-15" width="3.6" height="11.6" rx="1.2" fill="${STEEL.dark}" stroke="${INK}" stroke-width="${SW * 0.7}"/>`)
        p.raw(`<rect x="${x - 3}" y="-6.6" width="6" height="3" rx="1.2" fill="${STEEL.base}" stroke="${INK}" stroke-width="${SW * 0.6}"/>`)
      }
      p.raw(runner(0, -2.5, ICE))
      // whale body: big round head at the front, tapering to the tail
      const bodyD = 'M-30,-13C-36,-13 -38.5,-19 -38.5,-25C-38.5,-31 -34,-37 -25,-40C-10,-45.5 13,-46.5 27,-40.5C37.5,-36 41.5,-27 40.6,-20.5C40,-15.6 36.6,-13 32,-13Z'
      p.add(toon('hu', bodyD, s, { shade: [2.6, 3.4] }))
      p.add(finish('hu', bodyD, s, [-39, -47, 42, -12], { seed: 41, grain: 60, scuffs: 3, ao: 0.22, stroke: SW }))
      p.def(`<clipPath id="bl"><path d="${bodyD}"/></clipPath>`)
      // snow cap along the back + white belly with throat pleats + team saddle strap
      const snow = 'M-40,-29C-33,-35 -24,-38.6 -14,-40.4C-6,-41.6 4,-42 12,-41.4C20,-41 28,-39 34,-35.6L38,-38V-50H-40Z'
      let in_ = `<path d="${snow}" fill="#ffffff"/>`
      for (const [x, dl] of [[-24, 3.2], [-14, 4.4], [-4, 2.8], [8, 3.8], [20, 2.6]]) {
        const y = x < 0 ? -37.6 - (x + 24) * 0.15 : -40.6 + x * 0.12
        in_ += `<path d="M${x - 2.4},${f1(y - 0.6)}Q${x},${f1(y + dl)} ${x + 2.4},${f1(y - 0.6)}Z" fill="#ffffff"/>`
      }
      in_ += `<path d="M-40,-29C-33,-35 -24,-38.6 -14,-40.4C-6,-41.6 4,-42 12,-41.4C20,-41 28,-39 34,-35.6" stroke="${ICE.dark}" stroke-width="0.8" fill="none" opacity="0.6"/>`
      in_ += `<path d="M-40,-17C-20,-21 10,-24.5 44,-21.5V-10H-40Z" fill="#f4fbff"/>`
      in_ += `<path d="M-40,-17C-20,-21 10,-24.5 44,-21.5" stroke="${INK}" stroke-width="1.1" fill="none"/>`
      in_ += `<path d="M-6,-18.6C8,-20.6 22,-21 36,-19.6M-2,-15.6C10,-17.2 22,-17.6 34,-16.6" stroke="${ICE.dark}" stroke-width="1" fill="none" stroke-linecap="round"/>`
      in_ += `<path d="M-15,-50L-7,-50L-9.6,-20L-17.6,-19Z" fill="${c.base}" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`
      in_ += `<path d="M-13.6,-44L-9.6,-44L-10.6,-27" stroke="${c.light}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`
      in_ += `<rect x="-16" y="-34" width="6.4" height="5" rx="1.2" fill="${GOLD.base}" stroke="${INK}" stroke-width="0.8"/><rect x="-14.4" y="-32.6" width="3.2" height="2.2" rx="0.6" fill="${c.deep}"/>`
      p.raw(`<g clip-path="url(#bl)">${in_}</g>`)
      p.raw(`<path d="${bodyD}" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`)
      p.raw(gloss(-2, -40.4, 10, 1.9, -6))
      // frost freckles on the back (rear half)
      for (const [x, y, r] of [[-30, -31, 1.5], [-26, -35.6, 1.1], [-22.6, -29, 1.3]]) p.raw(`<circle cx="${x}" cy="${y}" r="${r}" fill="${ICE.base}" stroke="${INK}" stroke-width="0.4" opacity="0.95"/>`)
      // flipper
      p.add(toon('fp', 'M-2,-24C2,-22 8,-18.6 8.6,-14.6C4,-15 -1,-17.6 -4,-21.6Z', s, { shade: [0.8, 1.1], rim: 0.6, stroke: SW * 0.8 }))
      return p.doc(this.box)
    },
  },

  /**
   * 地鼠工兵：泥土棕焊接鋼板車身（鉚釘、鏽痕）、楔形工程履帶、鋼鑽頭、礦工頭盔 + 頭燈；隊伍色＝頭盔、頭燈座。
   * face (17,-18) pivot (-9,-36)
   */
  burrower: {
    box: [-48, -68, 98, 69],
    barrel: { len: 30, thick: 9, band: 0.3, spiral: true, muzzle: { w: 7, h: 12 } },
    hull(team) {
      const c = TEAMS[team]
      const s = SKINS.burrower
      const p = painter()
      // headlamp beam (behind everything, faint)
      p.raw(`<path d="M4,-52.6L44,-60L44,-42Z" fill="#fff6b0" opacity="0.32"/>`)
      // miner hard hat turret in team colour: ridge, brim, lamp housing
      const hatD = 'M-21,-44C-21,-55 -14,-60 -7,-60C1,-60 6,-55 6,-44Z'
      p.add(skinPart('tu', hatD, c, [-21, -60, 6, -44], { shade: [1.6, 2.2] }, { seed: 51, grain: 16, scuffs: 3, ao: 0.2 }))
      p.raw(`<path d="M-7,-60V-45" stroke="${c.dark}" stroke-width="2.4"/><path d="M-7,-60V-45" stroke="${INK}" stroke-width="0.6" opacity="0.6"/>`)
      p.add(toon('br', 'M-24,-45.6H9.4Q11,-45.6 11,-44V-42.6H-24Z', c, { shade: [0.6, 1], rim: 0.5, stroke: SW * 0.85 }))
      p.raw(gloss(-14, -55.6, 4.6, 1.6))
      p.raw(`<rect x="-0.4" y="-56.2" width="6.6" height="7.2" rx="1.8" fill="${c.dark}" stroke="${INK}" stroke-width="1"/>`)
      p.raw(`<circle cx="4.6" cy="-52.6" r="2.7" fill="#fff6b0" stroke="${INK}" stroke-width="1"/><circle cx="4" cy="-53.4" r="0.9" fill="#ffffff"/>`)
      // drill on the lower nose: collar + hardened-steel spiral cone
      p.add(toon('dc', 'M28,-27.6H34V-12.4H28Z', STEEL, { shade: [0.8, 1.2], rim: 0.6 }))
      for (const y of [-25, -20, -15]) p.raw(rivet(31, y, 0.8))
      const drillD = 'M33.6,-26.4L47.6,-19.6Q48.6,-19 47.6,-18.4L33.6,-12.6Z'
      p.add(toon('dr', drillD, STEEL, { shade: [0.8, 1.4], rim: 0.6 }))
      p.def(`<clipPath id="dk"><path d="${drillD}"/></clipPath>`)
      let grooves = ''
      for (const x of [35.5, 39, 42.5]) grooves += `<path d="M${x},-28L${x + 3.4},-10" stroke="${STEEL.deep}" stroke-width="1.3"/><path d="M${x + 1.2},-28L${x + 4.6},-10" stroke="${STEEL.light}" stroke-width="0.6"/>`
      p.raw(`<g clip-path="url(#dk)">${grooves}</g>`)
      // tall rounded body
      const bodyD = 'M-34,-13C-39,-13 -40,-21 -38.5,-29C-36.6,-38 -28,-43.6 -16,-43.6H8C20,-43.6 29.6,-37 31.6,-28L32.6,-13Z'
      p.add(skinPart('hu', bodyD, s, [-40, -44, 33, -12], { shade: [2.6, 3.4] }, { seed: 52, grain: 80, grainR: [0.35, 1], scuffs: 5 }))
      p.def(`<clipPath id="mb"><path d="${bodyD}"/></clipPath>`)
      // welded plate seams + rivets, rust streaks under them
      let plates = `<path d="M-38,-31H31M-6,-44V-31" stroke="${s.deep}" stroke-width="1.1" opacity="0.7"/>`
      for (const x of [-34, -26, -18, -10, 26]) plates += rivet(x, -33.4, 0.9, s)
      for (const [x, l] of [[-22, 6], [-13, 4], [22, 5]]) plates += `<path d="M${x},-30.6V${-30.6 + l}" stroke="#a8502a" stroke-width="1.3" stroke-linecap="round" opacity="0.55"/>`
      p.raw(`<g clip-path="url(#mb)">${plates}${mud(-18, -13, 2.2)}${mud(6, -13.6, 2.6)}</g>`)
      p.raw(gloss(-17, -39.6, 10, 2, -4))
      // shovel badge on the rear (above the tall track)
      p.raw(`<path d="M-33,-41L-26,-34" stroke="${STEEL.dark}" stroke-width="2.2" stroke-linecap="round"/><path d="M-33,-41L-26,-34" stroke="${INK}" stroke-width="0.6" opacity="0.5"/>`)
      p.raw(`<path d="M-27.4,-35.6L-23,-31.2C-22.4,-28.4 -24.6,-26.2 -27.4,-26.8L-31.8,-31.2Z" fill="${STEEL.light}" stroke="${INK}" stroke-width="${SW * 0.65}" stroke-linejoin="round"/>`)
      // no flat track: a wedge dozer track in front of the body, tall drive sprocket at the rear
      const trD = 'M-30,-25L22,-13A6.5,6.5 0 0 1 22,0H-30A12.5,12.5 0 0 1 -30,-25Z'
      p.def(`<clipPath id="tk"><path d="${trD}"/></clipPath>`)
      p.raw(`<path d="${trD}" fill="${RUBBER.base}"/>`)
      p.raw(`<g clip-path="url(#tk)"><path d="${trD}" fill="none" stroke="${RUBBER.dark}" stroke-width="5.4" stroke-dasharray="2.4 1.8"/>` +
        `<path d="M-28,-19.6L20,-8.6V-5H-28Z" fill="${RUBBER.dark}"/></g>`)
      p.raw(`<path d="${trD}" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`)
      // rear drive sprocket with teeth
      let teeth = ''
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        teeth += `<circle cx="${f1(-30 + Math.cos(a) * 7.4)}" cy="${f1(-12.5 + Math.sin(a) * 7.4)}" r="1.6" fill="${STEEL.dark}" stroke="${INK}" stroke-width="0.6"/>`
      }
      p.raw(teeth + wheel(-30, -12.5, 7))
      p.raw(wheel(21, -6.5, 4.6))
      for (const x of [-14, -2, 10]) p.raw(wheel(x, -4.6, 4))
      for (const [x, y, r] of [[-38, -6, 2.6], [-20, -1, 2.2], [4, -1.4, 2.4], [16, -12.4, 1.6], [-8, -16.6, 1.8]]) p.raw(mud(x, y, r))
      return p.doc(this.box)
    },
  },

  /**
   * 鷹眼：白色鷹羽車身（羽毛披肩、扇形尾羽、鳥喙車鼻）、後方駐鋤、細長多輪履帶、碳灰砲塔、雷達盤、長磁軌砲；隊伍色＝羽翼徽、砲塔條紋。
   * face (25,-6) pivot (-3,-23)
   */
  hawkeye: {
    box: [-60, -66, 120, 67],
    barrel: { len: 66, thick: 6, style: 'rails', brake: 10 },
    hull(team) {
      const c = TEAMS[team]
      const s = SKINS.hawkeye
      const p = painter()
      // radar mast + tilted dish
      p.raw(line(-15, -40, -17, -54, INK, 1.6))
      p.raw(line(-15, -40, -17, -54, STEEL.base, 0.7))
      p.add(toon('rd', 'M-26,-55C-24,-61 -14,-63.6 -8.4,-60C-12,-58.4 -18.4,-55.6 -26,-55Z', STEEL, { shade: [0.8, 1.2], rim: 0.6, stroke: SW * 0.85 }))
      p.raw(`<circle cx="-17.2" cy="-56.6" r="1.4" fill="${c.base}" stroke="${INK}" stroke-width="0.7"/>`)
      p.raw(line(-17.2, -56.6, -14, -61, INK, 0.8))
      // tail feathers fanning up behind the hull
      for (const [rot, col] of [[44, s.dark], [28, s.base], [12, s.light]]) {
        p.raw(`<g transform="rotate(${rot} -38 -22)"><path d="M-36,-22C-43,-25 -54,-26 -59,-22C-54,-18.6 -43,-19 -36,-20.6Z" fill="${col}" stroke="${INK}" stroke-width="${SW * 0.75}" stroke-linejoin="round"/>` +
          `<path d="M-40,-21.6H-55" stroke="${s.deep}" stroke-width="0.7" opacity="0.7"/></g>`)
      }
      // angular slate turret with a scope on top
      const tuD = 'M-20,-31L-17,-41.4Q-16.4,-43 -14.6,-43H6Q8,-43 8.6,-41.4L11,-31Z'
      p.add(skinPart('tu', tuD, CARBON, [-20, -43, 11, -31], { shade: [1.4, 2] }, { seed: 61, grain: 14, scuffs: 3, ao: 0.2 }))
      p.raw(`<path d="M-18.6,-36.4H9.6" stroke="${c.base}" stroke-width="2.2"/><path d="M-18.6,-36.4H9.6" stroke="${INK}" stroke-width="0.5" opacity="0.5"/>`)
      p.raw(gloss(-8, -40, 5, 1.1))
      p.add(toon('sc', 'M-12,-48.6H6Q8,-48.6 8,-46.6V-45.4Q8,-43.4 6,-43.4H-12Q-14,-43.4 -14,-45.4V-46.6Q-14,-48.6 -12,-48.6Z', STEEL, { shade: [0.6, 1], rim: 0.5, stroke: SW * 0.8 }))
      p.raw(`<circle cx="8" cy="-46" r="2.6" fill="${GLASS.base}" stroke="${INK}" stroke-width="1"/><circle cx="7.4" cy="-46.8" r="0.9" fill="#ffffff"/>`)
      // rear outrigger: a stabiliser arm braced into the ground with a spade (sniper stance)
      p.raw(`<path d="M-36,-16L-47,-2" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M-36,-16L-47,-2" stroke="${STEEL.base}" stroke-width="3" stroke-linecap="round"/>`)
      p.raw(`<path d="M-51.6,-4.4H-42.4L-44,0.4H-50Z" fill="${STEEL.dark}" stroke="${INK}" stroke-width="${SW * 0.75}" stroke-linejoin="round"/>`)
      p.raw(rivet(-41.6, -8.8, 1))
      // track: long, thin, many small road wheels
      p.raw(tracks('tr', -38, 37, -9.4, [[-32, 3.8], [-23, 3.8], [-14, 3.8], [-5, 3.8], [4, 3.8], [13, 3.8], [22, 3.8], [31, 3.8]]))
      // long sleek white body with a beak-like nose
      const bodyD = 'M-41,-11C-46,-11 -46.4,-18.6 -43.6,-23.4C-40.6,-28.6 -32,-31 -22,-31H14C28,-31 40,-25.6 46.6,-18.4C48.2,-16.6 48,-14.2 46.2,-13.2L42,-11Z'
      p.add(skinPart('hu', bodyD, s, [-46, -31, 48, -10], { shade: [2.2, 2.8] }, { seed: 62, grain: 36, scuffs: 2, ao: 0.4 }))
      p.def(`<clipPath id="nk"><path d="${bodyD}"/></clipPath>`)
      // layered feather scallops on the rear half, golden beak on the nose
      let fx = ''
      // a cape of pointed covert feathers over the rear half (curved tips)
      for (const [xr, top, tip, col] of [[0, -32, -19, s.base]]) {
        let d = `M-47,${top}H${xr}L${xr},${tip - 3}`
        for (let x = xr; x > -47; x -= 6) d += `Q${f1(x - 0.6)},${tip} ${f1(x - 2.6)},${tip + 0.6}Q${f1(x - 4.4)},${tip - 1} ${f1(x - 6)},${tip - 3.6}`
        fx += `<path d="${d}Z" fill="${col}" stroke="${s.deep}" stroke-width="0.8" stroke-linejoin="round"/>`
        for (let x = xr - 2.6; x > -45; x -= 6) fx += line(x, tip - 0.4, x + 2, tip - 6, s.dark, 0.6, 0.7)
      }
      fx += `<path d="M41,-30L50,-30V-10L40,-10C42.6,-14 43,-20 41,-30Z" fill="${GOLD.base}"/><path d="M44,-27C46,-24 46.6,-20 46,-16" stroke="${GOLD.light}" stroke-width="1" fill="none"/><path d="M41,-30C43,-20 42.6,-14 40,-10" stroke="${INK}" stroke-width="1" fill="none"/>`
      p.raw(`<g clip-path="url(#nk)">${fx}</g>`)
      p.raw(`<path d="${bodyD}" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`)
      p.raw(gloss(-14, -27.6, 11, 1.5, -2))
      // team-colour wing emblem on the flank
      p.raw(`<path d="M-30,-15C-24,-25 -12,-27.6 2,-25.4C-4,-23.6 -8,-22 -11,-19.6C-15,-17 -22,-15 -30,-15Z" fill="${c.base}" stroke="${INK}" stroke-width="${SW * 0.7}" stroke-linejoin="round"/>`)
      p.raw(`<path d="M-24,-20C-18,-24 -8,-25.4 -1,-25" stroke="${c.light}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`)
      for (const [x0, x1] of [[-25, -19.4], [-19.6, -14.6], [-14.4, -10]]) p.raw(line(x0, -16.4, x1, -20.6, c.deep, 0.9, 0.85))
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
    emit('tanks', `${id}_${team}_barrel`, tank.barrelArt ? tank.barrelArt(team) : barrelSvg(tank.barrel, team, SKINS[id]), TANK_ZOOM)
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
