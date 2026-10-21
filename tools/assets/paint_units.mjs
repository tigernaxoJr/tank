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

/**
 * Chunky barrel pointing right. The pivot (8% of width) sits inside the turret, so the breech is
 * hidden behind the hull. Options: team-colour band, flared muzzle, twin rails with glowing coils.
 */
function barrelSvg({ len, thick, muzzle, band, rails }, team) {
  const H = Math.max(thick, muzzle?.h ?? 0) + SW + 1
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
  if (rails) {
    // twin rails with a glowing energy channel and team-colour coils (Zephyr)
    defs += vGrad('rl', -t, t, [
      [0, '#ffffff'],
      [0.5, '#9ff3ff'],
      [1, '#48c2f0'],
    ])
    body += `<rect x="1.5" y="${-t * 0.5}" width="${len - 4}" height="${t}" rx="${f1(t * 0.5)}" fill="url(#rl)"/>`
    body += `<rect x="1" y="${f1(-t - 0.3)}" width="${len - 2.5}" height="${f1(thick * 0.34)}" rx="${f1(thick * 0.17)}" fill="${STEEL.base}" stroke="${INK}" stroke-width="${SW * 0.8}"/>`
    body += `<rect x="1" y="${f1(t - thick * 0.34 + 0.3)}" width="${len - 2.5}" height="${f1(thick * 0.34)}" rx="${f1(thick * 0.17)}" fill="${STEEL.dark}" stroke="${INK}" stroke-width="${SW * 0.8}"/>`
    for (let x = len * 0.28; x < len - 6; x += 6) {
      body += `<rect x="${f1(x)}" y="${f1(-t - 1)}" width="2.6" height="${f1(thick + 2)}" rx="1.2" fill="${c.base}" stroke="${INK}" stroke-width="${SW * 0.65}"/>`
    }
    body += `<rect x="${len - 4.6}" y="${f1(-t - 1.3)}" width="4" height="${f1(thick + 2.6)}" rx="1.6" fill="${STEEL.base}" stroke="${INK}" stroke-width="${SW * 0.8}"/>`
    return svgDoc(box, body, defs)
  }
  body += `<rect x="1" y="${-t}" width="${len - 2}" height="${thick}" rx="${f1(t * 0.8)}" fill="url(#bt)" stroke="${INK}" stroke-width="${SW}"/>`
  body += line(3.5, -t + thick * 0.24, len - 6, -t + thick * 0.24, '#ffffff', thick * 0.14, 0.75)
  if (band) {
    body += `<rect x="${f1(len * band)}" y="${f1(-t - 0.8)}" width="4" height="${f1(thick + 1.6)}" rx="1.4" fill="${c.base}" stroke="${INK}" stroke-width="${SW * 0.8}"/>`
    body += `<rect x="${f1(len * band + 0.9)}" y="${f1(-t + 0.1)}" width="2" height="${f1(thick * 0.28)}" rx="0.6" fill="${c.light}"/>`
  }
  if (muzzle) {
    const mh = muzzle.h / 2
    const x = len - muzzle.w - 1
    body += `<path d="M${f1(x)},${f1(-t)}L${f1(x + 2)},${-mh}H${f1(len - 1.4)}Q${len - 0.4},${-mh} ${len - 0.4},${f1(-mh + 1.4)}V${f1(mh - 1.4)}Q${len - 0.4},${mh} ${f1(len - 1.4)},${mh}H${f1(x + 2)}L${f1(x)},${f1(t)}Z" fill="${STEEL.base}" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="round"/>`
    body += `<rect x="${f1(x + 2.6)}" y="${f1(-mh + 1)}" width="${f1(muzzle.w - 4)}" height="${f1(muzzle.h * 0.2)}" rx="0.6" fill="#ffffff" opacity="0.75"/>`
    body += `<rect x="${f1(len - 2.6)}" y="${f1(-mh + 1.6)}" width="1.6" height="${f1(muzzle.h - 3.2)}" rx="0.6" fill="${INK}" opacity="0.85"/>`
  }
  return svgDoc(box, body, defs)
}

// ───────────────────────── tanks ─────────────────────────

/**
 * Chunky toy-like artillery tanks (original designs). Proportions are deliberately chibi:
 * big rounded body, oversized turret, short track with a few fat wheels, thick ink outline.
 * The face (tankFace.ts) is painted on the body front; keep that area free of decals.
 *
 * Each tank lists its rig-space anchors next to the art, so tankRegistry.ts can be kept in sync:
 * rig y = HULL_BASE_Y (14) + svg y, rig x = svg x (facing right).
 */
const TANKS = {
  /** 均衡型：圓豆形車身、頭盔式圓砲塔、盾形徽章、天線小球；face (10,-27) pivot (1,-45) */
  aegis: {
    box: [-42, -62, 84, 63],
    barrel: { len: 36, thick: 7, band: 0.42, muzzle: { w: 7, h: 10 } },
    hull(team) {
      const c = TEAMS[team]
      let defs = ''
      let body = ''
      const add = ([d, b]) => {
        defs += d
        body += b
      }
      // antenna with a ball tip (behind the turret)
      body += line(-13, -48, -18, -58, INK, 1.4)
      body += `<circle cx="-18.4" cy="-58.6" r="2.6" fill="${c.base}" stroke="${INK}" stroke-width="${SW * 0.7}"/><circle cx="-19.2" cy="-59.4" r="0.9" fill="#fff"/>`
      body += exhaust(-28, -37, 5)
      // helmet turret
      add(toon('tu', 'M-20,-37C-20,-50 -12,-55.5 -2.5,-55.5C7,-55.5 14,-50 14,-37Z', c, { shade: [1.8, 2.6] }))
      body += `<path d="M-20.2,-41.5H14.2" stroke="${INK}" stroke-width="1.2"/>`
      body += `<path d="M-19.6,-41.4H13.8V-38.6H-19.4Z" fill="${c.deep}" opacity="0.35"/>`
      body += `<circle cx="-11" cy="-46.5" r="2.4" fill="${GOLD.base}" stroke="${INK}" stroke-width="1"/>`
      body += gloss(-7, -50.5, 6, 2)
      // track: three fat wheels
      body += tracks('tr', -31, 31, -15, [
        [-20.5, 6.6],
        [0, 6.6],
        [20.5, 6.6],
      ])
      // bean body
      const bodyD = 'M-31,-13.5C-37,-13.5 -38.5,-20 -37.5,-27C-36.5,-35 -29,-40 -19,-40H16C27,-40 35,-34.5 37,-26.5C38.5,-19.5 36,-13.5 30,-13.5Z'
      add(toon('hu', bodyD, c, { shade: [2.6, 3.4] }))
      body += gloss(-14, -35.6, 11, 2.2, -4)
      // shield badge on the rear
      body += `<path d="M-32,-31.5H-23V-25.5C-23,-21.6 -27.5,-19.6 -27.5,-19.6C-27.5,-19.6 -32,-21.6 -32,-25.5Z" fill="${GOLD.base}" stroke="${INK}" stroke-width="${SW * 0.7}" stroke-linejoin="round"/>`
      body += `<path d="M-30,-28.5L-27.5,-25.8L-25,-28.5" stroke="${INK}" stroke-width="1.1" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      // headlight on the nose
      body += `<circle cx="34.2" cy="-24" r="2.4" fill="#fff8c8" stroke="${INK}" stroke-width="1"/>`
      return svgDoc(this.box, body, defs)
    },
  },

  /** 重裝型：鐘形巨大圓背、鋼製下顎護板、短粗巨砲、雙排氣管；face (7,-31) pivot (13,-42) */
  goliath: {
    box: [-44, -62, 88, 63],
    barrel: { len: 34, thick: 10.5, band: 0.38, muzzle: { w: 9, h: 14 } },
    hull(team) {
      const c = TEAMS[team]
      let defs = ''
      let body = ''
      const add = ([d, b]) => {
        defs += d
        body += b
      }
      body += exhaust(-30, -38, 8)
      body += exhaust(-23.5, -43, 9)
      // cupola hatch on top
      add(toon('cu', 'M-12,-48C-12,-56 -3,-58.5 2,-58.5C7,-58.5 12,-56 12,-48Z', STEEL, { shade: [1.4, 2] }))
      body += `<rect x="-3" y="-60.4" width="7" height="2.8" rx="1.2" fill="${STEEL.dark}" stroke="${INK}" stroke-width="1"/>`
      // track: four fat wheels
      body += tracks('tr', -37, 37, -16.5, [
        [-26, 7.2],
        [-8.7, 7.2],
        [8.7, 7.2],
        [26, 7.2],
      ])
      // bell-shaped heavy body
      const bodyD = 'M-38,-14C-42.5,-14 -42.5,-22 -41,-29C-38.5,-41 -25,-50.5 -2,-50.5C22,-50.5 37,-42 40.5,-29C42,-22 41.5,-14 37,-14Z'
      add(toon('hu', bodyD, c, { shade: [2.8, 3.8] }))
      body += gloss(-16, -44, 13, 2.6, -10)
      // armour seam with rivets across the dome
      body += `<path d="M-40,-26.5C-30,-24.5 -24,-24 -21,-24" stroke="${c.deep}" stroke-width="1.1" fill="none" opacity="0.55"/>`
      for (const [x, y] of [[-36, -36], [-30, -42], [-21, -46.5]]) body += rivet(x, y, 1.15, c)
      // steel jaw plate along the bottom
      add(toon('jw', 'M-40.5,-22.5H39.8C40.8,-19 40.2,-15.6 37.5,-13.6H-38.5C-41,-15.6 -41.4,-19 -40.5,-22.5Z', STEEL, { shade: [1, 1.6], stroke: SW * 0.9 }))
      for (let x = -33; x <= 33; x += 11) body += rivet(x, -18, 1.15)
      // hazard plate on the rear
      defs += `<clipPath id="hz"><rect x="-37.5" y="-37" width="11" height="9" rx="2"/></clipPath>`
      let stripes = `<rect x="-37.5" y="-37" width="11" height="9" fill="${GOLD.base}"/>`
      for (let x = -46; x < -24; x += 4.6) stripes += `<path d="M${x},-28L${x + 2.3},-28L${x + 11.3},-37L${x + 9},-37Z" fill="${INK}"/>`
      body += `<g clip-path="url(#hz)">${stripes}</g><rect x="-37.5" y="-37" width="11" height="9" rx="2" fill="none" stroke="${INK}" stroke-width="${SW * 0.7}"/>`
      return svgDoc(this.box, body, defs)
    },
  },

  /** 高機動：低矮水滴形車身、後掠大尾翼、泡泡座艙、速度條紋、閃電貼紙；face (8,-23) pivot (-5,-37) */
  zephyr: {
    box: [-46, -62, 92, 63],
    barrel: { len: 42, thick: 7, rails: true },
    hull(team) {
      const c = TEAMS[team]
      let defs = ''
      let body = ''
      const add = ([d, b]) => {
        defs += d
        body += b
      }
      // swept tail fin (behind)
      add(toon('fn', 'M-35,-30C-38,-40 -41,-48 -44,-53C-38,-53.5 -33,-50 -24,-34Z', c, { shade: [1.4, 2] }))
      // bubble cockpit / turret
      add(toon('tu', 'M-19,-33C-19,-44 -12,-48.5 -4,-48.5C4,-48.5 10,-44 10,-33Z', STEEL, { shade: [1.6, 2.2] }))
      add(toon('gl', 'M-6,-45.5C1,-45.5 6.5,-42 7,-36H-6Z', GLASS, { shade: [1, 1.4], stroke: SW * 0.7 }))
      body += `<path d="M-3.5,-43.5C0,-43.4 2.5,-42.2 3.6,-40.4" stroke="#fff" stroke-width="1" fill="none" stroke-linecap="round"/>`
      // track: compact, three fat wheels
      body += tracks('tr', -31, 29, -12.5, [
        [-21.5, 5.6],
        [-4, 5.6],
        [14, 5.6],
        [24.2, 3.6],
      ])
      // teardrop body: tall rounded rear, long low nose
      const bodyD = 'M-34,-11C-39.5,-11 -40,-20 -37.5,-27C-35,-33.5 -28,-36.5 -16,-36.5C2,-36.5 16,-31 28,-24C36,-19.5 43,-17 43,-13.5C43,-11.6 41.5,-11 39,-11Z'
      add(toon('hu', bodyD, c, { shade: [2.4, 3] }))
      body += gloss(-16, -33, 10, 1.9, -3)
      // speed stripes along the flank
      defs += `<clipPath id="st"><path d="${bodyD}"/></clipPath>`
      body += `<g clip-path="url(#st)"><path d="M-42,-17.5H44V-14.6H-42Z" fill="${c.trim}"/><path d="M-42,-13H44V-11.8H-42Z" fill="${c.trim}" opacity="0.6"/></g>`
      // lightning decal on the rear
      body += `<path d="M-25,-34L-31.5,-26.5H-27.5L-31,-20L-23,-28H-27Z" fill="${GOLD.base}" stroke="${INK}" stroke-width="${SW * 0.6}" stroke-linejoin="round"/>`
      // nose intake
      body += `<path d="M36.5,-17.4C39.5,-16.6 41.5,-15.6 42,-14.2H36Z" fill="${INK}" opacity="0.85"/>`
      return svgDoc(this.box, body, defs)
    },
  },
}

// ───────────────────────── projectiles ─────────────────────────

const SHOTS = {
  /** 高爆榴彈：黃銅彈殼、紅色彈頭、銅質彈帶、小尾翼 */
  shell_he: () => {
    const defs =
      vGrad('cs', -3.6, 3.6, [
        [0, '#fff0b0'],
        [0.4, '#e9b545'],
        [1, '#9a6512'],
      ]) +
      vGrad('nz', -3.6, 3.6, [
        [0, '#ffb3a1'],
        [0.4, '#ec4b32'],
        [1, '#8f1b12'],
      ])
    const body =
      `<path d="M-10.5,-4.6L-7,-2.6V2.6L-10.5,4.6Z" fill="#3d4352" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>` +
      `<rect x="-8" y="-3.4" width="9" height="6.8" rx="1" fill="url(#cs)" stroke="${INK}" stroke-width="0.9"/>` +
      `<rect x="-2.6" y="-3.6" width="1.8" height="7.2" fill="#b4562b" stroke="${INK}" stroke-width="0.6"/>` +
      `<path d="M0.6,-3.4H3.5C7.2,-3.4 10.4,-1.4 11,0C10.4,1.4 7.2,3.4 3.5,3.4H0.6Z" fill="url(#nz)" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>` +
      `<path d="M2,-2.3H5.4C7,-2.3 8.4,-1.6 9.2,-0.9" stroke="#ffe1d8" stroke-width="0.8" fill="none" stroke-linecap="round"/>`
    return svgDoc([-11.5, -5.5, 23, 11], body, defs)
  },

  /** 重型巨砲：粗胖鐵灰炸彈、黃黑警示帶、環形尾翼 */
  shell_heavy: () => {
    const defs = vGrad('bd', -6, 6, [
      [0, '#a5aebf'],
      [0.35, '#5d6576'],
      [1, '#2a2f3b'],
    ])
    let stripes = ''
    for (let x = -6; x < 8; x += 2.6) stripes += `<path d="M${x},6L${x + 1.3},6L${x + 5.3},-6L${x + 4},-6Z" fill="${INK}"/>`
    const body =
      // ring tail fins
      `<path d="M-14,-6.6L-8.5,-3.4V3.4L-14,6.6Z" fill="#c43b2c" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>` +
      `<rect x="-15" y="-7.4" width="3" height="14.8" rx="1" fill="#7f1d1d" stroke="${INK}" stroke-width="0.8"/>` +
      `<path d="M-10,-2.2H-5V2.2H-10Z" fill="#2a2f3b" stroke="${INK}" stroke-width="0.7"/>` +
      // fat body
      `<path d="M-7,-5.4C-2,-6.6 6,-6.6 9.5,-4.2C13.6,-1.4 13.6,1.4 9.5,4.2C6,6.6 -2,6.6 -7,5.4C-8.6,3.6 -8.6,-3.6 -7,-5.4Z" fill="url(#bd)" stroke="${INK}" stroke-width="1"/>` +
      // hazard band
      `<clipPath id="hb"><rect x="-2.6" y="-6.4" width="4.2" height="12.8"/></clipPath>` +
      `<g clip-path="url(#hb)"><rect x="-2.6" y="-6.4" width="4.2" height="12.8" fill="#f5c84a"/>${stripes}</g>` +
      `<path d="M-2.6,-6.2V6.2M1.6,-6.3V6.3" stroke="${INK}" stroke-width="0.6"/>` +
      // nose cap + highlight
      `<path d="M8.4,-4.6C12.8,-2 12.8,2 8.4,4.6Z" fill="#c43b2c" stroke="${INK}" stroke-width="0.8"/>` +
      `<path d="M-5,-4C0,-5 5,-5 8,-3.4" stroke="#dfe5ef" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.85"/>` +
      `<circle cx="4.4" cy="1.6" r="0.7" fill="#1b1f29"/><circle cx="-5.2" cy="1.6" r="0.7" fill="#1b1f29"/>`
    return svgDoc([-16, -8, 30, 16], body, `${defs}`)
  },

  /** 電漿彈：白熱核心、青紫光暈、環繞電弧（純能量，旋轉而非沿速度轉向） */
  shell_plasma: () => {
    const defs =
      rGrad('halo', [
        [0, '#ffffff', 1],
        [0.28, '#c9f4ff', 1],
        [0.5, '#4cc9ff', 0.85],
        [0.75, '#7c6bff', 0.35],
        [1, '#7c3aed', 0],
      ]) +
      rGrad('core', [
        [0, '#ffffff'],
        [0.6, '#e9fbff'],
        [1, '#8fe3ff'],
      ])
    const arc = (a) => {
      const pts = []
      for (let i = 0; i <= 6; i++) {
        const t = a + i * 0.32
        const r = 6.4 + (i % 2 ? 2 : -0.4)
        pts.push([Math.cos(t) * r, Math.sin(t) * r])
      }
      return `<path d="M${pts.map(([x, y]) => `${f1(x)},${f1(y)}`).join('L')}" stroke="#eafcff" stroke-width="0.9" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`
    }
    const body =
      `<circle r="11" fill="url(#halo)"/>` +
      arc(0.3) +
      arc(2.4) +
      arc(4.4) +
      `<circle r="4.4" fill="url(#core)" stroke="#5b8dff" stroke-width="0.8"/>` +
      `<circle cx="-1.3" cy="-1.5" r="1.4" fill="#ffffff"/>`
    return svgDoc([-11, -11, 22, 22], body, defs)
  },
}

// ───────────────────────── effect particles ─────────────────────────

const FX = {
  glow_fire: () =>
    svgDoc(
      [0, 0, 64, 64],
      `<circle cx="32" cy="32" r="32" fill="url(#g)"/>`,
      rGrad('g', [
        [0, '#fffbe6', 1],
        [0.25, '#ffd65c', 0.95],
        [0.55, '#ff8a2a', 0.5],
        [1, '#ff4d1a', 0],
      ]),
    ),
  glow_plasma: () =>
    svgDoc(
      [0, 0, 64, 64],
      `<circle cx="32" cy="32" r="32" fill="url(#g)"/>`,
      rGrad('g', [
        [0, '#ffffff', 1],
        [0.25, '#9df0ff', 0.95],
        [0.55, '#4f8dff', 0.5],
        [1, '#8b5cf6', 0],
      ]),
    ),
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
