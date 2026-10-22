/**
 * 鐵壁堡壘 Bastion — character-first art: a fat limestone loaf that is also the head, with block
 * courses wrapping its rear half and one big smooth cornerstone in front (the face lives there), a
 * team-coloured crenellated crown, a squat cast-iron mortar pot, a round rear watchtower with a cone
 * roof and pennant, burlap sandbags piled at the back and a stubby rubber track underneath.
 * The face is NOT painted here: tankFace.ts draws it live on the cornerstone (keep it plain).
 *
 * Authored in design space (ground at Y = 281, X = 216 is the hull centre) and scaled by K into
 * game pixels. Anchors in svg pixels (rig y = svg y + 13 because the hull bottom sits at rig y 14):
 *   pivot (-2.1, -57.2) · face centre (24.2, -29.6), near eye r 7, far eye ×0.78 → bastion.ts adds 13 to y
 */
import { cartoonKit, chip, ellipseD, f1, mud, rng, MUD } from '../cartoon_kit.mjs'

const K = 0.26
const OX = 216
const GY = 281
const STONE = { light: '#f6f0e0', base: '#d3c9b2', dark: '#a59a82', deep: '#6b604e', rim: '#fffaf0' }
const IRON = { light: '#9aa3b8', base: '#5d6578', dark: '#3f4556', deep: '#262a36', rim: '#c8d0e0' }
const RUBBER = { light: '#6a7183', base: '#454b5a', dark: '#2e323d', deep: '#1c1f27', rim: '#8a91a3' }
const BURLAP = { light: '#f0dcae', base: '#cfb07a', dark: '#a3814f', deep: '#6e5531', rim: '#fff1cc' }
const WOOD = { light: '#d39a62', base: '#9c6634', dark: '#6e431f', deep: '#45280f', rim: '#f0c08a' }
const MOSS = ['#3f7426', '#5c9a36', '#7fb848', '#b8e07a']
const RUST = '#b5651d'
const W = '#ffffff'

export const bastionSkin = STONE
export const HULL_BOX = [-52, -75, 104, 76]
/** design-space barrel span: pivot at X 0 sits at 8% of the width */
const BARREL_X0 = -10
const BARREL_LEN = 125

const team = (t) => ({ ...t, rim: t.trim })

function svgDoc([x0, y0, w, h], body, defs) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}"><defs>${defs}</defs>${body}</svg>`
}

/** Limestone: calcite specks (light and dark), shallow pits with a lit lower lip, dust settling low. */
function stone(k, c, bbox, seed, { specks = 40, pits = 14, dust = 14, dustFrom = 0.7 } = {}) {
  const r = rng(seed + 900)
  const [x0, y0, x1, y1] = bbox
  let s = k.chitin(c, bbox, seed, { pores: pits, poreR: [1, 2.2], scratches: 0, dust, dustFrom })
  for (let i = 0; i < specks; i++) {
    const x = x0 + r() * (x1 - x0)
    const y = y0 + r() * (y1 - y0)
    s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.5 + r() * 0.9)}" fill="${r() < 0.55 ? c.rim : c.deep}" opacity="${f1(0.3 + r() * 0.35)}"/>`
  }
  return s
}

/** Forking hairline crack: dark split with a lit lower edge. */
function crack(x, y, seed, len = 30) {
  const r = rng(seed)
  let d = `M${x},${y}`
  let px = x
  let py = y
  let fork = ''
  for (let i = 0; i < 4; i++) {
    px += (r() - 0.3) * len * 0.35
    py += len * 0.25
    d += `L${f1(px)},${f1(py)}`
    if (i === 1) fork = `M${f1(px)},${f1(py)}l${f1(len * 0.22)},${f1(len * 0.12)}l${f1(len * 0.1)},${f1(len * 0.16)}`
  }
  return (
    `<path d="${d}${fork}" transform="translate(1 1.2)" stroke="${STONE.rim}" stroke-width="1.2" fill="none" opacity="0.7" stroke-linejoin="round"/>` +
    `<path d="${d}${fork}" stroke="${STONE.deep}" stroke-width="1.6" fill="none" opacity="0.8" stroke-linejoin="round" stroke-linecap="round"/>`
  )
}

/** Moss cushion tucked into a joint: overlapping blobs dark→light, a few hanging strands. */
function moss(x, y, w, seed, hang = 2) {
  const r = rng(seed)
  let s = ''
  for (const [i, col] of MOSS.entries()) {
    const n = 5 - i
    for (let j = 0; j < n; j++) {
      const bx = x + (r() - 0.5) * w
      const by = y - i * 1.4 + (r() - 0.5) * 2
      const br = (w / 4) * (1 - i * 0.18) * (0.7 + r() * 0.5)
      s += `<circle cx="${f1(bx)}" cy="${f1(by)}" r="${f1(br)}" fill="${col}"/>`
    }
  }
  for (let i = 0; i < hang; i++) {
    const hx = x + (r() - 0.5) * w * 0.7
    s += `<path d="M${f1(hx)},${f1(y + 1)}q${f1((r() - 0.5) * 3)},${f1(4 + r() * 3)} ${f1((r() - 0.5) * 2)},${f1(8 + r() * 5)}" stroke="${MOSS[1]}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
  }
  return s
}

/** Iron: casting pits plus a rust run dripping from a rivet or seam. */
function iron(k, bbox, seed, streaks = []) {
  let s = k.chitin(IRON, bbox, seed, { pores: 10, poreR: [0.6, 1.2], scratches: 3, dust: 6, dustFrom: 0.75 })
  for (const [x, y, l] of streaks) s += `<path d="M${x},${y}q1,${f1(l * 0.5)} -0.5,${l}" stroke="${RUST}" stroke-width="2.2" fill="none" opacity="0.55" stroke-linecap="round"/><circle cx="${x}" cy="${y}" r="1.8" fill="${RUST}" opacity="0.6"/>`
  return s
}

const rivet = (x, y, r, c) => `<circle cx="${f1(x + r * 0.3)}" cy="${f1(y + r * 0.4)}" r="${r}" fill="${c.deep}" opacity="0.7"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c.base}"/><circle cx="${f1(x - r * 0.35)}" cy="${f1(y - r * 0.35)}" r="${f1(r * 0.45)}" fill="${c.light}"/>`

/** Burlap sack: cross weave, a stitched seam, tied ear corners and a dusty bottom. */
function sandbag(k, ink, cx, cy, rx, ry, seed) {
  const d = `M${cx - rx},${cy}C${cx - rx},${cy - ry * 1.1} ${cx + rx},${cy - ry * 1.1} ${cx + rx},${cy}C${cx + rx},${cy + ry * 1.05} ${cx - rx},${cy + ry * 1.05} ${cx - rx},${cy}Z`
  const bb = [cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2]
  const r = rng(seed)
  let weave = ''
  for (let y = cy - ry; y < cy + ry; y += 3.2) weave += `<path d="M${cx - rx},${f1(y)}Q${cx},${f1(y + 3)} ${cx + rx},${f1(y)}" stroke="${BURLAP.dark}" stroke-width="0.8" fill="none" opacity="0.45" stroke-dasharray="2.2 1.4"/>`
  for (let x = cx - rx; x < cx + rx; x += 3.2) weave += `<path d="M${f1(x)},${cy - ry}V${cy + ry}" stroke="${BURLAP.light}" stroke-width="0.7" opacity="0.35" stroke-dasharray="1.4 2.2"/>`
  for (let i = 0; i < 4; i++) weave += `<path d="M${f1(cx - rx * 0.8 + r() * rx * 1.4)},${f1(cy - ry * 0.6 + r() * ry)}l${f1(2 + r() * 3)},${f1(r() * 2)}" stroke="${BURLAP.deep}" stroke-width="0.7" opacity="0.6"/>`
  weave += `<path d="M${cx - rx * 0.85},${f1(cy + ry * 0.15)}Q${cx},${f1(cy + ry * 0.45)} ${cx + rx * 0.85},${f1(cy + ry * 0.15)}" stroke="${BURLAP.deep}" stroke-width="1.4" fill="none" stroke-dasharray="3 2.4" opacity="0.8"/>`
  let o = k.part(d, BURLAP, {
    sx: 3,
    sy: 4,
    bbox: bb,
    ink: 7,
    tex: weave + k.chitin(BURLAP, bb, seed, { pores: 0, scratches: 0, dust: 6, dustFrom: 0.55 }),
    gloss: null,
  })
  // tied ears poking out of both ends
  for (const s of [-1, 1]) {
    const ex = cx + s * rx
    o += `<path d="M${ex},${cy - 3}l${s * 5},-3l${s * 1},4l${s * -1},4l${s * -5},-2Z" fill="${BURLAP.base}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/><path d="M${ex + s * 1.5},${cy - 4}v8" stroke="${BURLAP.deep}" stroke-width="1.8"/>`
  }
  return o
}

/** Team-painted merlon: lacquer chipped back to bare stone, lit top lip. */
function merlon(k, T, x0, x1, top, bottom, seed) {
  const d = `M${x0},${bottom}V${top + 5}Q${x0},${top} ${x0 + 5},${top}H${x1 - 5}Q${x1},${top} ${x1},${top + 5}V${bottom}Z`
  const bb = [x0, top, x1, bottom]
  const r = rng(seed)
  let tex = `<path d="M${x0 + 3},${top + 3.5}H${x1 - 3}" stroke="${T.light}" stroke-width="2" opacity="0.8" stroke-linecap="round"/>`
  for (let i = 0; i < 2; i++) tex += chip(f1(x0 + 4 + r() * (x1 - x0 - 12)), f1(top + 8 + r() * 14), 4 + r() * 2, { deep: STONE.dark, rim: T.light })
  tex += `<path d="M${x1 - 4},${top + 6}V${bottom}" stroke="${T.deep}" stroke-width="2.4" opacity="0.4"/>`
  return k.part(d, T, { sx: 3, sy: 4, bbox: bb, ink: 7, tex, gloss: [x0 + (x1 - x0) * 0.35, top + 8, 4, 2, -10] })
}

export function bastionHull(teamColors, ink) {
  const T = team(teamColors)
  const k = cartoonKit('f', ink)
  let s = `<ellipse cx="214" cy="283" rx="170" ry="11" fill="${ink}" opacity="0.2"/>`

  // rear watchtower: round stone shaft, arrow slit, team cone roof, wooden pole and pennant
  s += `<path d="M84,24V6" stroke="${ink}" stroke-width="6" stroke-linecap="round"/><path d="M84,24V6" stroke="${WOOD.base}" stroke-width="2.6" stroke-linecap="round"/>`
  s += k.part('M82,8C68,4 56,10 42,8C50,14 50,20 44,26C58,24 70,20 82,22Z', T, {
    sx: 2,
    sy: 3,
    bbox: [40, 2, 84, 28],
    ink: 6,
    tex: `<path d="M78,12C68,10 60,14 52,12" stroke="${T.light}" stroke-width="1.6" fill="none" opacity="0.7"/><path d="M60,20Q66,22 74,20" stroke="${T.deep}" stroke-width="1.2" fill="none" opacity="0.5"/>`,
  })
  s += `<circle cx="84" cy="5" r="4" fill="#ffcf3f" stroke="${ink}" stroke-width="2.4"/><circle cx="83" cy="4" r="1.4" fill="${W}"/>`
  const shaft = 'M58,150V54Q84,46 110,54V150Z'
  let shaftTex = stone(k, STONE, [58, 46, 110, 150], 21, { specks: 26, pits: 8, dust: 0 })
  for (const y of [74, 98, 122]) shaftTex += `<path d="M58,${y}Q84,${y + 6} 110,${y}" stroke="${STONE.deep}" stroke-width="1.8" fill="none" opacity="0.55"/><path d="M58,${y + 2}Q84,${y + 8} 110,${y + 2}" stroke="${STONE.rim}" stroke-width="1" fill="none" opacity="0.6"/>`
  for (const [x, y0, y1] of [[76, 54, 74], [96, 76, 98], [70, 100, 122]]) shaftTex += `<path d="M${x},${y0 + 3}V${y1 + 3}" stroke="${STONE.deep}" stroke-width="1.6" opacity="0.55"/><path d="M${x + 1.6},${y0 + 4}V${y1 + 3}" stroke="${STONE.rim}" stroke-width="0.9" opacity="0.6"/>`
  shaftTex += `<path d="M80,80Q84,76 88,80V96H80Z" fill="${ink}"/><path d="M82,84Q84,82 86,84V94H82Z" fill="#4b3f6b" opacity="0.6"/><path d="M79,97H89" stroke="${STONE.rim}" stroke-width="1.6"/>`
  shaftTex += `<rect x="58" y="46" width="52" height="104" fill="url(#ftw)"/>`
  s += k.part(shaft, STONE, { sx: 4, sy: 0, bbox: [58, 46, 110, 150], ink: 8, tex: shaftTex })
  s += k.part('M50,58C60,40 74,24 84,18C94,24 108,40 118,58Q84,66 50,58Z', T, {
    sx: 3,
    sy: 4,
    bbox: [50, 18, 118, 64],
    ink: 8,
    tex:
      [62, 73, 84, 95, 106].map((x) => `<path d="M84,20L${x},${x === 84 ? 62 : 60}" stroke="${T.deep}" stroke-width="1.4" opacity="0.45"/>`).join('') +
      `<path d="M52,57Q84,64 116,57" stroke="${T.deep}" stroke-width="3" fill="none" opacity="0.5"/>` +
      chip(98, 44, 4, { deep: T.deep, rim: T.light }),
    gloss: [72, 38, 6, 2.4, -50],
  })

  // crenellated crown in team colour, peeking over the top of the loaf
  s += merlon(k, T, 134, 164, 72, 116, 31) + merlon(k, T, 262, 292, 70, 114, 32) + merlon(k, T, 304, 334, 84, 128, 33)

  // squat cast-iron mortar pot with a team band and rivets (the barrel pivots in its mouth)
  s += k.part('M176,96C174,66 186,44 208,44C230,44 242,66 240,96Z', IRON, {
    sx: 5,
    sy: 6,
    bbox: [174, 44, 242, 96],
    ink: 8,
    tex: iron(k, [174, 44, 242, 96], 41, [[192, 80, 10], [224, 82, 8]]),
    gloss: [196, 54, 7, 3, -30],
  })
  s += k.part('M178,64C196,70 220,70 238,64L240,76C220,82 196,82 176,76Z', T, {
    sx: 2,
    sy: 3,
    bbox: [176, 64, 240, 82],
    ink: 6,
    tex: `<path d="M180,67C196,72 220,72 236,67" stroke="${T.light}" stroke-width="1.6" fill="none" opacity="0.7"/>` + chip(226, 70, 4, { deep: IRON.dark, rim: T.light }),
  })
  for (const x of [186, 199, 212, 225]) s += rivet(x, 73 + (x === 186 || x === 225 ? -0.5 : 1), 2, IRON)

  // stubby track: rubber belt with lugs, five steel road wheels, mud
  const belt = 'M96,226H336A28,28 0 0 1 336,282H96A28,28 0 0 1 96,226Z'
  let beltTex = ''
  for (let x = 74; x < 360; x += 13) beltTex += `<path d="M${x},274L${x + 4},283H${x + 10}L${x + 7},274Z" fill="${RUBBER.deep}" opacity="0.8"/>`
  for (let x = 80; x < 352; x += 13) beltTex += `<path d="M${x},228V236" stroke="${RUBBER.light}" stroke-width="1.4" opacity="0.5"/>`
  for (const [x, cy] of [[102, 256], [159, 258], [216, 258], [273, 258], [330, 256]]) {
    beltTex +=
      `<circle cx="${x + 1.5}" cy="${cy + 2}" r="19" fill="${RUBBER.deep}"/><circle cx="${x}" cy="${cy}" r="18" fill="${IRON.base}" stroke="${ink}" stroke-width="3.4"/>` +
      `<circle cx="${x + 1}" cy="${cy + 1.5}" r="11" fill="${IRON.dark}"/><circle cx="${x}" cy="${cy}" r="10" fill="${IRON.light}"/><circle cx="${x}" cy="${cy}" r="4" fill="${IRON.deep}"/>` +
      [0, 1.26, 2.51, 3.77, 5.03].map((a) => `<circle cx="${f1(x + Math.cos(a) * 7)}" cy="${f1(cy + Math.sin(a) * 7)}" r="1.3" fill="${IRON.deep}"/>`).join('') +
      `<path d="M${x - 12},${cy - 8}A14,14 0 0 1 ${x + 4},${cy - 14}" stroke="${IRON.rim}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8"/>` +
      `<path d="M${x - 14},${cy + 10}A18,18 0 0 0 ${x + 12},${cy + 13}" stroke="${MUD}" stroke-width="4" fill="none" opacity="0.6"/>`
  }
  beltTex += mud(130, 278, 5, 7) + mud(250, 279, 6, 8) + mud(318, 278, 4, 9)
  s += k.part(belt, RUBBER, { sx: 3, sy: 4, bbox: [68, 226, 364, 282], ink: 8, tex: beltTex })

  // body: limestone loaf that is also the head
  const bodyD = 'M84,244C60,226 56,176 76,140C96,104 150,94 216,94C282,94 336,104 356,140C376,176 372,226 348,244Z'
  const BB = [58, 94, 372, 244]
  let tex = stone(k, STONE, [58, 94, 244, 244], 13, { specks: 70, pits: 22, dust: 20, dustFrom: 0.72 })
  // the cornerstone keeps only faint specks so the live face reads cleanly
  tex += stone(k, STONE, [244, 94, 372, 244], 14, { specks: 22, pits: 4, dust: 10, dustFrom: 0.8 })
  // block courses wrapping the rear half: mortar groove, lit top lip of the block below, offset joints
  const courses = [[96, 134], [134, 174], [174, 212], [212, 246]]
  const courseY = (y, x) => f1(y + ((x - 160) / 110) ** 2 * -6 + 6)
  for (const [ci, [y0, y1]] of courses.entries()) {
    if (ci > 0) {
      tex += `<path d="M54,${courseY(y0, 54)}Q150,${y0 + 12} 242,${courseY(y0, 242)}" stroke="${STONE.deep}" stroke-width="3.4" fill="none" opacity="0.55"/>`
      tex += `<path d="M54,${courseY(y0, 54) + 2.6}Q150,${y0 + 14.6} 242,${courseY(y0, 242) + 2.6}" stroke="${STONE.rim}" stroke-width="1.8" fill="none" opacity="0.75"/>`
    }
    for (let x = 64 + (ci % 2) * 30; x < 236; x += 58) {
      const ya = y0 + (ci > 0 ? 9 : 4)
      tex += `<path d="M${x},${ya}Q${x - 2},${(ya + y1) / 2} ${x},${y1 + 4}" stroke="${STONE.deep}" stroke-width="3" fill="none" opacity="0.5"/>`
      tex += `<path d="M${x + 2.4},${ya + 2}Q${x + 0.6},${(ya + y1) / 2} ${x + 2.4},${y1 + 2}" stroke="${STONE.rim}" stroke-width="1.4" fill="none" opacity="0.7"/>`
    }
  }
  // cornerstone seam: one smooth slab under the face
  tex += `<path d="M244,98C234,140 234,200 246,246" stroke="${STONE.deep}" stroke-width="4" fill="none" opacity="0.5"/>`
  tex += `<path d="M248,100C238,140 238,200 250,246" stroke="${STONE.rim}" stroke-width="2.2" fill="none" opacity="0.75"/>`
  for (const y of [112, 160, 214]) tex += `<path d="M238,${y}l7,1" stroke="${STONE.deep}" stroke-width="2.4" opacity="0.5"/>`
  // carved face: the live eyes (tankFace.ts) sit in two chiselled sockets (the brows are
  // stone blocks drawn live, FaceSpec brow: 'block'), so they read as part of the stone rather than stickers. Near (rear) eye at X 286, far eye ×0.78 at X 332.
  const socket = k.gradient(`<radialGradient id="ID" cx="0.5" cy="0.42" r="0.55"><stop offset="0.55" stop-color="${STONE.deep}" stop-opacity="0.55"/><stop offset="1" stop-color="${STONE.deep}" stop-opacity="0"/></radialGradient>`)
  for (const [x, rx, ry] of [[286, 36, 38], [332, 29, 31]]) {
    tex += `<ellipse cx="${x}" cy="166" rx="${rx}" ry="${ry}" fill="${socket}"/>`
    tex += `<path d="M${x - rx * 0.78},${f1(166 + ry * 0.42)}Q${x},${f1(166 + ry * 1.02)} ${x + rx * 0.78},${f1(166 + ry * 0.42)}" stroke="${STONE.rim}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.85"/>`
    tex += `<path d="M${x - rx * 0.8},${f1(166 + ry * 0.62)}Q${x},${f1(166 + ry * 1.18)} ${x + rx * 0.8},${f1(166 + ry * 0.62)}" stroke="${STONE.dark}" stroke-width="1.4" fill="none" opacity="0.6"/>`
  }
  // cheek seams under each socket so the mouth sits on a little carved chin
  tex += `<path d="M300,206Q314,214 330,208" stroke="${STONE.deep}" stroke-width="1.6" fill="none" opacity="0.4"/>`
  // battle damage: cracks, chipped corners, soot from near misses
  tex += crack(120, 140, 61, 34) + crack(212, 182, 62, 26)
  tex += chip(170, 104, 7, STONE) + chip(96, 192, 6, STONE) + chip(236, 226, 5, STONE) + chip(352, 222, 4, STONE)
  const soot = k.glow('#4a4038', 0.35)
  tex += `<ellipse cx="150" cy="208" rx="26" ry="18" fill="${soot}"/><ellipse cx="236" cy="132" rx="18" ry="12" fill="${soot}"/>`
  tex += moss(96, 174, 22, 71) + moss(186, 214, 18, 72) + moss(226, 214, 12, 73, 1) + moss(150, 134, 14, 74, 1)
  tex += `<path d="M84,244C110,236 300,234 348,244" stroke="${MOSS[1]}" stroke-width="5" fill="none" opacity="0.6"/>`
  tex += mud(110, 240, 5, 11) + mud(200, 242, 4, 12) + mud(300, 240, 5, 13)
  const top =
    `<path d="M74,190C76,214 84,232 98,242" fill="none" stroke="${STONE.rim}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>` +
    `<path d="M110,116C150,100 230,98 300,106" stroke="${W}" stroke-width="2.4" fill="none" opacity="0.6" stroke-linecap="round"/>`
  s += k.part(bodyD, STONE, { sx: 14, sy: 16, bbox: BB, ink: 10, tex, top, gloss: [176, 114, 26, 7, -6] })

  // sandbags piled against the rear
  s += sandbag(k, ink, 50, 258, 25, 19, 81) + sandbag(k, ink, 98, 262, 24, 18, 82) + sandbag(k, ink, 72, 226, 25, 18, 83)

  // gradient used to darken the far side of the round tower
  const defs = k.defs() + `<linearGradient id="ftw" x1="0" y1="0" x2="1" y2="0"><stop offset="0.55" stop-color="${STONE.deep}" stop-opacity="0"/><stop offset="1" stop-color="${STONE.deep}" stop-opacity="0.35"/></linearGradient>`
  return svgDoc(HULL_BOX, `<g transform="scale(${K}) translate(${-OX} ${-GY})">${s}</g>`, defs)
}

/** Mortar barrel: cast-iron breech ball, stubby tapered tube with two team bands, flared muzzle. */
export function bastionBarrel(teamColors, ink) {
  const T = team(teamColors)
  const k = cartoonKit('g', ink)
  let b = ''
  const tube = 'M6,-20L94,-17V17L6,20Z'
  b += k.part(tube, IRON, {
    sx: 2,
    sy: 4,
    bbox: [6, -20, 94, 20],
    ink: 7,
    tex: iron(k, [6, -20, 94, 20], 51, [[52, -8, 14]]) + `<path d="M10,-14L90,-12" stroke="${IRON.rim}" stroke-width="2.4" stroke-linecap="round" opacity="0.7"/>`,
  })
  for (const [x0, x1] of [[26, 38], [66, 76]]) {
    b += k.part(`M${x0},-22H${x1}V22H${x0}Z`, T, {
      sx: 1,
      sy: 3,
      bbox: [x0, -22, x1, 22],
      ink: 6,
      tex: `<path d="M${x0 + 2},-19V-6" stroke="${T.light}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>` + chip(x0 + 3, 4, 4, { deep: IRON.dark, rim: T.light }),
    })
    b += rivet((x0 + x1) / 2, -13, 1.8, T) + rivet((x0 + x1) / 2, 13, 1.8, T)
  }
  b += k.part('M92,-18L110,-25Q114,-25 114,-21V21Q114,25 110,25L92,18Z', IRON, {
    sx: 2,
    sy: 3,
    bbox: [92, -25, 114, 25],
    ink: 7,
    tex: `<path d="M96,-18L109,-22" stroke="${IRON.rim}" stroke-width="2" stroke-linecap="round" opacity="0.8"/>`,
  })
  b += `<ellipse cx="112.5" cy="0" rx="3.4" ry="19" fill="${ink}"/><ellipse cx="113" cy="-2" rx="1.4" ry="11" fill="${IRON.deep}"/>`
  // soot ring around the muzzle
  b += `<path d="M100,-20L108,-23M100,20L108,23" stroke="#2a2420" stroke-width="2" opacity="0.5" stroke-linecap="round"/>`
  b += k.part(ellipseD(2, 0, 12, 12), IRON, { sx: 2, sy: 3, bbox: [-10, -12, 14, 12], ink: 6, tex: rivet(2, 0, 3, T), gloss: null })
  const len = f1(BARREL_LEN * K)
  return svgDoc([0, -8, len, 16], `<g transform="scale(${K}) translate(${-BARREL_X0} 0)">${b}</g>`, k.defs())
}
