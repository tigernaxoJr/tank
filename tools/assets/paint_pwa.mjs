/**
 * Paint the PWA icon set and the landscape launch (splash) images. Original art in the lobby's
 * cartoon thick-ink style: a chunky amber tank lobbing a shell across a sunny sky.
 *
 *   node tools/assets/paint_pwa.mjs          (or: pnpm run paint:pwa)
 *
 * Output: public/icons/
 *   icon-192.png, icon-512.png       manifest icons (rounded tile, transparent corners)
 *   icon-maskable-512.png            full-bleed tile, emblem inside the 80% safe zone
 *   apple-touch-icon.png             180×180 full-bleed (iOS rounds the corners itself)
 *   favicon.svg                      browser tab icon
 *   splash-<w>x<h>.png               iOS apple-touch-startup-image, landscape only (the game is landscape)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'public', 'icons')
const INK = '#1d2340'
const SUN = '#ffc93d'
const SKY_TOP = '#4cb2ff'
const SKY_BOTTOM = '#bfe4ff'
const AMBER = '#ff9a1f'
const AMBER_DARK = '#e0700a'
const GRASS = '#74d34e'
const GRASS_DARK = '#4fae2f'

const svg = (w, h, body, defs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`

function png(svgText, width) {
  return new Resvg(svgText, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true } }).render().asPng()
}

/** A puffy inked cloud centred at (x, y) with scale s. */
const cloud = (x, y, s) =>
  `<g transform="translate(${x} ${y}) scale(${s})" stroke="${INK}" stroke-width="5" stroke-linejoin="round">
    <path d="M-60 18 Q-70 -6 -44 -10 Q-40 -36 -12 -32 Q4 -52 28 -34 Q58 -38 56 -8 Q76 0 64 18 Z" fill="#fff"/>
  </g>`

/**
 * The emblem on a 512 canvas: sun, cloud, grassy hill and the tank with a shell arc.
 * Everything important stays inside the central 80% so it survives maskable cropping.
 */
function emblem() {
  return `
  <circle cx="122" cy="124" r="54" fill="${SUN}" stroke="${INK}" stroke-width="10"/>
  <g stroke="#fff4c2" stroke-width="12" stroke-linecap="round">
    <path d="M122 46v-14M50 124h-14M68 70l-10-10M176 70l10-10M68 178l-10 10"/>
  </g>
  ${cloud(388, 104, 0.8)}
  <!-- shell arc: dotted trail from the muzzle to the shell -->
  <path d="M342 196 Q394 118 448 166" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-dasharray="2 20"/>
  <g transform="translate(456 178) rotate(52)">
    <ellipse cx="0" cy="0" rx="22" ry="15" fill="${INK}"/>
    <ellipse cx="-2" cy="-1" rx="15" ry="9" fill="#ffd96b"/>
  </g>
  <!-- hill -->
  <path d="M-10 420 Q140 330 280 360 Q420 330 530 400 V530 H-10 Z" fill="${GRASS}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
  <path d="M40 410 Q150 360 260 380" fill="none" stroke="#a6ea7e" stroke-width="10" stroke-linecap="round"/>
  <path d="M-10 470 Q200 440 530 470 V530 H-10 Z" fill="${GRASS_DARK}" opacity=".45"/>
  <!-- tank -->
  <g transform="translate(232 330) rotate(-6)" stroke="${INK}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">
    <!-- barrel, raised -->
    <g transform="translate(26 -78) rotate(-38)">
      <rect x="0" y="-13" width="112" height="26" rx="8" fill="#8a92b2"/>
      <rect x="92" y="-18" width="26" height="36" rx="6" fill="${AMBER}"/>
    </g>
    <!-- turret dome -->
    <path d="M-58 -50 Q-54 -112 6 -112 Q66 -112 70 -50 Z" fill="${AMBER}"/>
    <path d="M-34 -78 Q-22 -98 4 -100" fill="none" stroke="#ffd08a" stroke-width="10"/>
    <!-- hull -->
    <path d="M-118 -52 H128 Q140 -52 136 -38 L124 -6 H-112 L-128 -38 Q-132 -52 -118 -52 Z" fill="${AMBER}"/>
    <path d="M-104 -22 H118" stroke="${AMBER_DARK}" stroke-width="8"/>
    <!-- tracks -->
    <rect x="-128" y="-10" width="262" height="58" rx="29" fill="#4a5378"/>
    <g fill="#c9cfe3">
      <circle cx="-94" cy="19" r="17"/><circle cx="-38" cy="19" r="17"/><circle cx="18" cy="19" r="17"/><circle cx="74" cy="19" r="17"/>
    </g>
    <!-- face: the house style gives every tank big friendly eyes -->
    <g stroke="none" fill="${INK}">
      <ellipse cx="-12" cy="-76" rx="9" ry="12"/><ellipse cx="26" cy="-76" rx="9" ry="12"/>
    </g>
    <g stroke="none" fill="#fff"><circle cx="-9" cy="-80" r="3.5"/><circle cx="29" cy="-80" r="3.5"/></g>
    <path d="M-2 -60 Q8 -52 18 -60" fill="none" stroke-width="7"/>
  </g>`
}

const skyDefs = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${SKY_TOP}"/><stop offset="1" stop-color="${SKY_BOTTOM}"/></linearGradient>`

/** Full-bleed square tile (maskable / apple-touch). */
function fullTile() {
  return svg(512, 512, `<rect width="512" height="512" fill="url(#sky)"/><g transform="translate(51 51) scale(.8)">${emblem()}</g>`, skyDefs)
}

/** Rounded tile with a thick ink frame and transparent corners (regular "any" icon). */
function roundTile() {
  const clip = `<clipPath id="tile"><rect x="16" y="16" width="480" height="480" rx="112"/></clipPath>`
  return svg(
    512,
    512,
    `<g clip-path="url(#tile)"><rect width="512" height="512" fill="url(#sky)"/><g transform="translate(36 40) scale(.86)">${emblem()}</g></g>
     <rect x="16" y="16" width="480" height="480" rx="112" fill="none" stroke="${INK}" stroke-width="20"/>`,
    skyDefs + clip,
  )
}

/** 以 data URI 嵌入 public/assets/ui2 的素材（agy-ui 切出）；缺檔時回傳 null，改用舊的圓徽章版面 */
function uiImage(sheet, name) {
  const f = join(ROOT, 'public', 'assets', 'ui2', sheet, `${name}.png`)
  if (!existsSync(f)) return null
  return { uri: `data:image/png;base64,${readFileSync(f).toString('base64')}` }
}

/** Landscape launch image: sky, clouds, hills, the game logo and an empty loading bar (same look as #boot-splash in index.html). */
function splash(w, h) {
  const u = h / 100 // layout unit: 1% of the short side
  const logo = uiImage('title', 'logo')
  const bar = uiImage('gauges', 'hp_bar')
  const scenery = `<rect width="${w}" height="${h}" fill="url(#sky)"/>
     ${cloud(w * 0.14, h * 0.2, u * 0.11)}${cloud(w * 0.86, h * 0.3, u * 0.08)}${cloud(w * 0.7, h * 0.1, u * 0.06)}
     <path d="M0 ${h * 0.9} Q${w * 0.2} ${h * 0.84} ${w * 0.42} ${h * 0.89} T${w} ${h * 0.86} V${h} H0 Z" fill="#a6ea7e" stroke="${INK}" stroke-width="${u * 0.8}"/>
     <path d="M0 ${h * 0.96} Q${w * 0.3} ${h * 0.92} ${w * 0.6} ${h * 0.96} T${w} ${h * 0.94} V${h} H0 Z" fill="${GRASS}" stroke="${INK}" stroke-width="${u * 0.8}"/>`
  if (logo && bar) {
    const lw = Math.min(w * 0.7, 88 * u)
    const lh = lw * (448 / 1211)
    const lx = w / 2 - lw / 2
    const ly = h * 0.22
    const bw = 62 * u
    const bh = bw * (106 / 512)
    return svg(
      w,
      h,
      `${scenery}
       <image href="${logo.uri}" x="${lx}" y="${ly}" width="${lw}" height="${lh}"/>
       <image href="${bar.uri}" x="${w / 2 - bw / 2}" y="${ly + lh + 8 * u}" width="${bw}" height="${bh}"/>
       <text x="${w / 2}" y="${ly + lh + 8 * u + bh + 5 * u}" text-anchor="middle" font-family="Microsoft JhengHei, PingFang TC, Noto Sans TC, sans-serif" font-weight="700"
         font-size="${3.4 * u}" fill="${INK}" opacity=".7">空域砲決 · 回合制砲擊</text>`,
      skyDefs,
    )
  }
  const badge = 46 * u
  const bx = w / 2 - badge / 2
  const by = h * 0.12
  const title = 9 * u
  return svg(
    w,
    h,
    `${scenery}
     <g transform="translate(${bx} ${by}) scale(${badge / 512})">${roundTileBody()}</g>
     <text x="${w / 2}" y="${by + badge + title * 1.25}" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900"
       font-size="${title}" fill="#fff" stroke="${INK}" stroke-width="${title * 0.16}" paint-order="stroke" letter-spacing="${title * 0.04}">TANK ARTILLERY</text>
     <text x="${w / 2}" y="${by + badge + title * 2.35}" text-anchor="middle" font-family="Microsoft JhengHei, PingFang TC, Noto Sans TC, sans-serif" font-weight="700"
       font-size="${title * 0.48}" fill="${INK}">空域砲決 · 回合制砲擊</text>`,
    skyDefs + `<clipPath id="tile"><rect x="16" y="16" width="480" height="480" rx="112"/></clipPath>`,
  )
}
function roundTileBody() {
  return `<g clip-path="url(#tile)"><rect width="512" height="512" fill="url(#sky)"/><g transform="translate(36 40) scale(.86)">${emblem()}</g></g>
    <rect x="16" y="16" width="480" height="480" rx="112" fill="none" stroke="${INK}" stroke-width="20"/>`
}

/** iOS launch images, landscape only: [device px width, height] for common iPhones / iPads. */
export const SPLASH_SIZES = [
  [1334, 750], // iPhone SE / 8
  [2532, 1170], // iPhone 12–14
  [2556, 1179], // iPhone 15 / 16
  [2796, 1290], // iPhone 15 / 16 Pro Max
  [2388, 1668], // iPad Pro 11"
  [2732, 2048], // iPad Pro 12.9"
]

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'icon-512.png'), png(roundTile(), 512))
writeFileSync(join(OUT, 'icon-192.png'), png(roundTile(), 192))
writeFileSync(join(OUT, 'icon-maskable-512.png'), png(fullTile(), 512))
writeFileSync(join(OUT, 'apple-touch-icon.png'), png(fullTile(), 180))
writeFileSync(join(OUT, 'favicon.svg'), roundTile())
for (const [w, h] of SPLASH_SIZES) writeFileSync(join(OUT, `splash-${w}x${h}.png`), png(splash(w, h), w))
console.log(`painted icons + ${SPLASH_SIZES.length} splash images into public/icons/`)
