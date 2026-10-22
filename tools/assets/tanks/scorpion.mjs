/**
 * 毒蠍 Scorpion — character-first art: a lacquered purple bean that is also the head, overlapping
 * back plates, a segmented tail arching to the turret ball, stubby boot legs, a venom flask and one
 * big team-coloured pincer. The face is NOT painted here: tankFace.ts draws it live on the plain
 * front of the shell (keep that area free of marks except the soft growth lines).
 *
 * Authored in design space (ground at Y = 281, X = 216 is the hull centre) and scaled by K into
 * game pixels. Anchors in svg pixels (rig y = svg y + 13 because the hull bottom sits at rig y 14):
 *   pivot (-18.2, -53.8) · face centre (16.5, -30.7), near eye r 6.5, far eye ×0.76 → scorpion.ts adds 13 to y
 */
import { cartoonKit, bez, chip, cubicD, ellipseD, f1, mud, bump, bristles, IVORY, DUST, MUD } from '../cartoon_kit.mjs'

const K = 0.26
const OX = 216
const GY = 281
const SKIN = { light: '#c9a8f5', base: '#8a5ad0', dark: '#5f3a9a', deep: '#3a2066', rim: '#f0c8ff' }
const VENOM = { light: '#eaffb4', base: '#8fe24f', dark: '#4f9e2a', deep: '#2f6418', glow: '#d6ff7a', rim: '#ffffff' }
const STEEL = { light: '#e8eef8', base: '#a9b3c6', dark: '#6c768a', deep: '#3b4252', rim: '#ffffff' }
const W = '#ffffff'

export const scorpionSkin = SKIN
export const HULL_BOX = [-61, -62, 122, 63]
/** design-space barrel span: pivot at X 146 sits at 8% of the width */
const BARREL_X0 = 133.6
const BARREL_LEN = 154.4

const team = (t) => ({ ...t, rim: t.trim })

function svgDoc([x0, y0, w, h], body, defs) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x0} ${y0} ${w} ${h}"><defs>${defs}</defs>${body}</svg>`
}

/** Team collar: painted steel band, paint chipped on the edge, lit top lip. */
function collar(k, T, d, bbox, chips) {
  return k.part(d, T, {
    sx: 2,
    sy: 3,
    bbox,
    ink: 6,
    tex:
      chips.map(([x, y, w]) => `<path d="M${x},${y}l${w},-1l-1,2.6l${f1(-w * 0.7)},0.4z" fill="${STEEL.dark}"/><path d="M${x},${y + 2.4}l${f1(w * 0.9)},-0.4" stroke="${T.light}" stroke-width="0.8" opacity="0.8"/>`).join('') +
      `<path d="M${bbox[0]},${bbox[1] + 3}H${bbox[2]}" stroke="${T.light}" stroke-width="1.4" opacity="0.6"/>`,
  })
}

/** Stubby leg: chitin thigh plate, wrinkled joint membrane, worn boot foot with a muddy sole. */
function leg(k, ink, hx, hy, fx, seed, far) {
  const c = far ? { ...SKIN, base: SKIN.dark, light: SKIN.base, dark: SKIN.deep } : SKIN
  const kx = (hx + fx) / 2 + (fx > hx ? 6 : -6)
  const thigh = `M${hx - 11},${hy}C${hx - 13},${hy + 22} ${kx - 12},262 ${kx - 9},268L${kx + 9},268C${kx + 11},258 ${hx + 13},${hy + 22} ${hx + 11},${hy}Z`
  const foot = `M${fx - 17},281C${fx - 18},266 ${fx - 8},259 ${fx + 2},259C${fx + 14},259 ${fx + 21},268 ${fx + 20},281Z`
  const back = fx > hx ? -1 : 1
  let o = far ? '' : bristles(back < 0 ? hx - 11 : hx + 11, hy + 10, 2, back, seed, ink)
  o += k.part(thigh, c, {
    sx: 5,
    sy: 5,
    bbox: [hx - 16, hy, hx + 16, 270],
    ink: 7,
    tex: far
      ? ''
      : k.chitin(c, [hx - 16, hy, hx + 16, 270], seed, { pores: 6, poreR: [0.7, 1.2], scratches: 1, dust: 4, dustFrom: 0.6 }) +
        `<path d="M${hx - 3},${hy + 4}C${hx - 4},${hy + 14} ${kx - 3},256 ${kx - 1},264" stroke="${c.light}" stroke-width="2" fill="none" opacity="0.7" stroke-linecap="round"/>`,
  })
  o += `<path d="M${kx - 9},266Q${kx},272 ${kx + 9},266L${kx + 8},262Q${kx},267 ${kx - 8},262Z" fill="${far ? SKIN.deep : '#b07ac8'}" stroke="${ink}" stroke-width="2"/>`
  if (!far) o += `<path d="M${kx - 5},265q2,2 4,0M${kx + 1},266q2,1.6 4,0" stroke="${SKIN.deep}" stroke-width="1" fill="none" opacity="0.7"/>`
  o += k.part(foot, c, {
    sx: 5,
    sy: 6,
    bbox: [fx - 20, 256, fx + 22, 283],
    ink: 7,
    gloss: far ? null : [fx - 4, 265, 6, 2.6],
    tex: far
      ? ''
      : k.chitin(c, [fx - 20, 256, fx + 22, 283], seed + 7, { pores: 3, scratches: 1, dust: 8, dustFrom: 0.45 }) +
        `<path d="M${fx - 19},276Q${fx},272 ${fx + 21},276V284H${fx - 19}Z" fill="${MUD}" opacity="0.6"/>` +
        `<path d="M${fx + 8},262q7,3 9,11" stroke="${c.rim}" stroke-width="1.6" fill="none" opacity="0.65" stroke-linecap="round"/>`,
  })
  return o
}

export function scorpionHull(teamColors, ink) {
  const T = team(teamColors)
  const k = cartoonKit('s', ink)
  let s = `<ellipse cx="215" cy="283" rx="165" ry="11" fill="${ink}" opacity="0.2"/>`

  for (const [i, [hx, fx]] of [[150, 128], [205, 214], [258, 300]].entries()) s += leg(k, ink, hx + 14, 222, fx + 14, 60 + i, true)

  // tail: overlapping chitin rings arching up to the turret ball
  for (const [i, [cx, cy, rx, ry]] of [[96, 205, 34, 30], [76, 160, 30, 27], [86, 118, 27, 24], [112, 88, 25, 22]].entries()) {
    const bb = [cx - rx, cy - ry, cx + rx, cy + ry]
    const lip = (dy0, dy1, sc) => `M${f1(cx - rx * sc)},${f1(cy + ry * dy0)}Q${cx},${f1(cy + ry * dy1)} ${f1(cx + rx * sc)},${f1(cy + ry * dy0)}`
    s += k.part(ellipseD(cx, cy, rx, ry), SKIN, {
      sx: 6,
      sy: 8,
      bbox: bb,
      ink: 8,
      tex:
        k.chitin(SKIN, bb, 10 + i, { pores: 9, poreR: [0.8, 1.5], scratches: 2, dust: i === 0 ? 8 : 2, dustFrom: 0.7 }) +
        `<path d="${lip(0.3, 0.78, 0.75)}" stroke="${SKIN.deep}" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round"/>` +
        `<path d="${lip(0.2, 0.64, 0.7)}" stroke="${SKIN.rim}" stroke-width="1.6" fill="none" opacity="0.6" stroke-linecap="round"/>` +
        `<path d="${lip(-0.05, 0.35, 0.6)}" stroke="${SKIN.deep}" stroke-width="0.8" fill="none" opacity="0.35"/>` +
        k.sheen(bb),
      gloss: [cx - rx * 0.35, cy - ry * 0.45, rx * 0.35, ry * 0.18, -30],
    })
  }

  // turret ball (barrel pivot) + team collar with rivets
  s += k.part(ellipseD(146, 74, 26, 24), SKIN, { sx: 6, sy: 7, bbox: [120, 50, 172, 98], ink: 8, tex: k.chitin(SKIN, [120, 50, 172, 98], 41, { pores: 10, scratches: 2, dust: 0 }) + k.sheen([120, 50, 172, 98]), gloss: [136, 63, 9, 4, -30] })
  s += collar(k, T, 'M124,82C134,94 158,94 168,82L170,90C158,104 134,104 122,90Z', [120, 80, 172, 104], [[130, 92, 5], [156, 93, 4]])
  for (const [x, y] of [[133, 95], [146, 96.5], [159, 95]]) s += `<circle cx="${x}" cy="${y}" r="2" fill="${T.deep}"/><circle cx="${x - 0.6}" cy="${y - 0.6}" r="0.8" fill="${T.light}"/>`

  // venom flask: thick glass, liquid with a meniscus, torn paper hazard label, knurled steel cap
  const flask = 'M190,66H204V80C216,84 222,94 221,106C220,120 208,128 197,128C186,128 175,120 174,106C173,94 179,84 190,80Z'
  const liquid = k.gradient(`<radialGradient id="ID" cx="0.42" cy="0.4" r="0.6"><stop offset="0" stop-color="${VENOM.light}"/><stop offset="0.55" stop-color="${VENOM.base}"/><stop offset="1" stop-color="${VENOM.deep}"/></radialGradient>`)
  s +=
    k.inkBack(flask, 7) +
    `<path d="${flask}" fill="#eefbff"/>` +
    `<g clip-path="${k.clip(flask)}">` +
    `<rect x="170" y="96" width="56" height="40" fill="${liquid}"/>` +
    `<ellipse cx="197.5" cy="96" rx="25" ry="3.4" fill="${VENOM.light}"/><path d="M172.5,96Q197,100 222.5,96" stroke="${VENOM.dark}" stroke-width="1.4" fill="none"/>` +
    `<path d="${flask}" fill="none" stroke="${W}" stroke-width="5" opacity="0.35" transform="translate(197 98) scale(0.88) translate(-197 -98)"/>` +
    `<circle cx="188" cy="118" r="3.4" fill="${W}" opacity="0.85"/><circle cx="187" cy="117" r="1.4" fill="${VENOM.light}"/><circle cx="199" cy="112" r="2.2" fill="${W}" opacity="0.8"/><circle cx="205" cy="121" r="1.4" fill="${W}" opacity="0.7"/><circle cx="194" cy="104" r="1.2" fill="${W}" opacity="0.7"/>` +
    `<path d="M200,98H219V113L216,111.6L213,114L210,111.8L207,114.2L204,112L200,113.6Z" fill="${IVORY}" stroke="${ink}" stroke-width="1.6"/>` +
    `<path d="M209.5,100.5C211.8,104 213,105.6 213,107.4A3.5,3.5 0 0 1 206,107.4C206,105.6 207.2,104 209.5,100.5Z" fill="${VENOM.dark}"/>` +
    `<path d="M201.5,99.6H217.5" stroke="${DUST}" stroke-width="0.8" opacity="0.6"/>` +
    `<path d="M210,86l5,2M178,108l3,4" stroke="${W}" stroke-width="0.8" opacity="0.8"/>` +
    `</g>` +
    `<path d="M182,96C179,104 180,114 184,122" stroke="${W}" stroke-width="3.4" fill="none" stroke-linecap="round" opacity="0.9"/>` +
    `<path d="M187,86C185,88 184,90 183.6,92" stroke="${W}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.8"/>`
  s += k.part('M186,58H208Q211,58 211,61V67Q211,70 208,70H186Q183,70 183,67V61Q183,58 186,58Z', STEEL, {
    sx: 2,
    sy: 2,
    bbox: [183, 58, 211, 70],
    ink: 5,
    tex: [187, 191, 195, 199, 203, 207].map((x) => `<path d="M${x},59V69" stroke="${STEEL.dark}" stroke-width="1.2"/><path d="M${x + 1.2},59V69" stroke="${STEEL.light}" stroke-width="0.7"/>`).join(''),
  })

  // body: lacquered carapace that is also the head
  const bodyD = 'M96,236C72,220 72,178 102,152C134,124 196,108 254,114C316,121 348,164 340,210C334,246 304,264 258,266H146C122,266 108,252 96,236Z'
  const BB = [70, 108, 346, 268]
  let tex = k.chitin(SKIN, [70, 108, 230, 268], 7, { pores: 50, poreR: [0.9, 1.9], scratches: 5, dust: 22, dustFrom: 0.72 })
  // the face side gets fewer, finer pores so the live face reads cleanly
  tex += k.chitin(SKIN, [230, 108, 346, 268], 8, { pores: 14, poreR: [0.6, 1.1], scratches: 2, dust: 12, dustFrom: 0.8 })
  // overlapping back plates: undercut behind each lip, lit edge in front, growth lines, a pore row
  for (const x of [150, 178, 206]) {
    const c = [[x, 118 + (206 - x) * 0.08], [x - 22, 150], [x - 26, 196], [x - 14, 240]]
    tex += `<path d="${cubicD(c)}" transform="translate(-4 0)" stroke="${SKIN.deep}" stroke-width="7" fill="none" opacity="0.4" stroke-linecap="round"/>`
    tex += `<path d="${cubicD(c)}" stroke="${SKIN.deep}" stroke-width="3.6" fill="none" opacity="0.7" stroke-linecap="round"/>`
    tex += `<path d="${cubicD(c)}" transform="translate(3.6 1)" stroke="${SKIN.rim}" stroke-width="2.2" fill="none" opacity="0.7" stroke-linecap="round"/>`
    for (const dx of [-10, -15, -21]) tex += `<path d="${cubicD(c)}" transform="translate(${dx} 0)" stroke="${SKIN.deep}" stroke-width="0.8" fill="none" opacity="0.3"/>`
    for (let t = 0.12; t < 0.9; t += 0.09) {
      const [px, py] = bez(c, t)
      tex += `<circle cx="${f1(px - 7)}" cy="${f1(py)}" r="1.2" fill="${SKIN.deep}" opacity="0.45"/><circle cx="${f1(px - 6.6)}" cy="${f1(py + 0.9)}" r="0.6" fill="${SKIN.light}" opacity="0.6"/>`
    }
  }
  // head shell: soft growth lines fanning down from the crown
  for (let a = -0.9; a <= 0.7; a += 0.32) tex += `<path d="M${f1(250 + Math.cos(a - 1.57) * 18)},${f1(120 - Math.sin(a - 1.57) * 4)}q${f1(Math.sin(a) * 30)},14 ${f1(Math.sin(a) * 40)},36" stroke="${SKIN.light}" stroke-width="0.8" fill="none" opacity="0.35"/>`
  // belly plate: paler, softer, ribbed across
  tex += `<path d="M150,266C176,244 236,236 300,246C320,250 336,240 342,226V280H140Z" fill="${SKIN.light}" opacity="0.5"/>`
  for (const x of [190, 222, 254, 286]) tex += `<path d="M${x},${f1(246 - (x - 190) * 0.02)}q-3,10 -1,22" stroke="${SKIN.dark}" stroke-width="1.4" fill="none" opacity="0.5"/>`
  tex += `<path d="M150,266C176,244 236,236 300,246C320,250 336,240 342,226" stroke="${SKIN.deep}" stroke-width="3" fill="none" opacity="0.55"/>`
  // glowing venom glands: halo, recessed rim, bright core
  const gland = k.glow(VENOM.glow)
  for (const [x, y, r] of [[110, 190, 9], [128, 220, 6], [150, 160, 7], [104, 228, 4]]) {
    tex +=
      `<circle cx="${x}" cy="${y}" r="${r * 2}" fill="${gland}"/><circle cx="${x + 0.8}" cy="${y + 1}" r="${r + 1.6}" fill="${SKIN.deep}" opacity="0.6"/>` +
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${VENOM.base}" stroke="${VENOM.deep}" stroke-width="1.6"/><circle cx="${f1(x - r * 0.15)}" cy="${f1(y - r * 0.15)}" r="${f1(r * 0.55)}" fill="${VENOM.light}"/><circle cx="${f1(x - r * 0.35)}" cy="${f1(y - r * 0.4)}" r="${f1(r * 0.22)}" fill="${W}"/>`
  }
  tex += chip(226, 117, 6, SKIN) + chip(118, 147, 5, SKIN) + chip(88, 178, 4, SKIN)
  tex += mud(120, 258, 6, 3) + mud(212, 262, 5, 4) + mud(280, 258, 4, 5)
  tex += k.sheen(BB)
  const top =
    `<path d="M92,206C92,228 108,252 132,262" fill="none" stroke="${SKIN.rim}" stroke-width="6" stroke-linecap="round" opacity="0.7"/>` +
    `<path d="M120,140C160,118 220,112 262,118" stroke="${W}" stroke-width="2" fill="none" opacity="0.55" stroke-linecap="round"/>`
  s += k.part(bodyD, SKIN, { sx: 14, sy: 17, bbox: BB, ink: 10, tex, top, gloss: [178, 132, 30, 9, -12] })

  for (const [i, [hx, fx]] of [[136, 108], [196, 186], [254, 282]].entries()) s += leg(k, ink, hx, 236, fx, 70 + i, false)

  // pincer: thick team-coloured chitin, tubercle rows, ivory teeth, worn pale tips, dark hinge
  s += k.part('M300,236C312,226 334,222 350,224L356,246C338,248 318,252 306,256Z', SKIN, {
    sx: 4,
    sy: 5,
    bbox: [298, 220, 358, 258],
    ink: 8,
    tex: k.chitin(SKIN, [298, 220, 358, 258], 51, { pores: 6, scratches: 1, dust: 4 }) + `<path d="M330,226q-2,12 2,26" stroke="${SKIN.deep}" stroke-width="2.4" fill="none" opacity="0.55"/>`,
  })
  const clawTex = (bb, seed, bumps) => k.chitin(T, bb, seed, { pores: 5, poreR: [0.7, 1.2], scratches: 3, dust: 3, dustFrom: 0.75 }) + bumps.map(([x, y, r]) => bump(x, y, r, T)).join('')
  s += k.part('M392,246C404,262 430,262 438,246C442,238 434,232 426,236C416,240 404,240 398,236Z', T, {
    sx: 4,
    sy: 5,
    bbox: [390, 230, 442, 264],
    ink: 8,
    tex: clawTex([390, 230, 442, 264], 52, [[404, 252, 1.8], [413, 255, 1.6], [422, 254, 1.4]]) + `<ellipse cx="436" cy="246" rx="5" ry="4" fill="${T.rim}" opacity="0.7"/>`,
    gloss: [420, 250, 6, 2.2, 0],
  })
  s += k.part('M372,214C380,186 414,174 432,192C440,200 436,212 426,212C414,212 404,210 396,220Z', T, {
    sx: 6,
    sy: 7,
    bbox: [370, 176, 440, 222],
    ink: 9,
    tex:
      clawTex([370, 176, 440, 222], 53, [[388, 200, 2.2], [397, 192, 2], [408, 188, 1.8], [393, 208, 1.6], [419, 189, 1.5]]) +
      `<ellipse cx="431" cy="198" rx="6" ry="5" fill="${T.rim}" opacity="0.75"/><path d="M427,194l4,3M429,200l3,1" stroke="${T.deep}" stroke-width="0.8" opacity="0.6"/>`,
    gloss: [406, 186, 10, 3.6, -20],
  })
  s += k.part(ellipseD(378, 232, 30, 25), T, {
    sx: 8,
    sy: 9,
    bbox: [348, 207, 408, 257],
    ink: 9,
    tex:
      clawTex([348, 207, 408, 257], 54, [[360, 238, 2.4], [370, 246, 2.2], [382, 248, 2], [352, 228, 1.8], [372, 236, 1.6]]) +
      `<ellipse cx="398" cy="222" rx="9" ry="7" fill="${T.deep}" opacity="0.45"/><path d="M396,226C402,230 404,238 400,244" stroke="${T.deep}" stroke-width="3.4" fill="none" stroke-linecap="round" opacity="0.6"/>`,
    gloss: [366, 219, 9, 4, -25],
  })
  for (const [x, y] of [[404, 213], [413, 214], [422, 214]]) s += `<path d="M${x - 3},${y}L${x},${y + 6}L${x + 3},${y}Z" fill="${IVORY}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>`
  for (const [x, y] of [[408, 238], [417, 238], [426, 236]]) s += `<path d="M${x - 3},${y}L${x},${y - 6}L${x + 3},${y}Z" fill="${IVORY}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>`

  return svgDoc(HULL_BOX, `<g transform="scale(${K}) translate(${-OX} ${-GY})">${s}</g>`, k.defs())
}

/** Stinger barrel: three shrinking chitin segments with team collars, translucent venom tip, hanging drop. */
export function scorpionBarrel(teamColors, ink) {
  const T = team(teamColors)
  const k = cartoonKit('b', ink)
  let b = ''
  for (const [i, [x, r]] of [[168, 17], [196, 14.5], [221, 12]].entries()) {
    const bb = [x - r * 1.2, -r, x + r * 1.2, r]
    b += k.part(ellipseD(x, 0, r * 1.15, r), SKIN, {
      sx: 4,
      sy: 5,
      bbox: bb,
      ink: 7,
      tex: k.chitin(SKIN, bb, 30 + i, { pores: 5, poreR: [0.7, 1.2], scratches: 1, dust: 0 }) + k.sheen(bb, 0.18) + `<path d="M${f1(x - r * 0.4)},${f1(r * 0.55)}Q${x},${f1(r * 0.85)} ${f1(x + r * 0.7)},${f1(r * 0.45)}" stroke="${SKIN.deep}" stroke-width="2.4" fill="none" opacity="0.5"/>`,
      gloss: [x - r * 0.3, -r * 0.5, r * 0.4, r * 0.18, -8],
    })
    b += collar(k, T, `M${f1(x - r * 1.05)},${f1(-r * 0.6)}Q${f1(x - r * 1.35)},0 ${f1(x - r * 1.05)},${f1(r * 0.6)}L${f1(x - r * 0.8)},${f1(r * 0.62)}Q${f1(x - r * 1.08)},0 ${f1(x - r * 0.8)},${f1(-r * 0.62)}Z`, [x - r * 1.4, -r, x - r * 0.7, r], [])
  }
  b += k.part('M228,-12C243,-13 258,-7 272,0C258,7 243,13 228,12C232,4 232,-4 228,-12Z', VENOM, {
    sx: 3,
    sy: 4,
    bbox: [226, -14, 274, 14],
    ink: 7,
    tex:
      `<path d="M232,-2C246,-4 258,-2 268,0C258,3 246,4 232,3Z" fill="${VENOM.glow}" opacity="0.85"/>` +
      `<path d="M236,-7Q248,-6 258,-2M236,7Q248,6 258,2" stroke="${VENOM.deep}" stroke-width="1" fill="none" opacity="0.5"/>` +
      `<circle cx="240" cy="1" r="1.6" fill="${W}" opacity="0.8"/><circle cx="250" cy="-1.5" r="1" fill="${W}" opacity="0.8"/><circle cx="245" cy="5" r="0.8" fill="${W}" opacity="0.7"/>`,
    gloss: [242, -6, 7, 2, -6],
  })
  b +=
    `<circle cx="274" cy="0" r="12" fill="${k.glow(VENOM.glow, 0.75)}"/>` +
    `<path d="M276,3C279,8 280,10 280,12A4,4 0 0 1 272,12C272,10 273,8 276,3Z" fill="${VENOM.base}" stroke="${ink}" stroke-width="2.2"/>` +
    `<path d="M273.6,12.4A2.6,2.6 0 0 0 278.4,12.6" stroke="${VENOM.deep}" stroke-width="1.2" fill="none"/><circle cx="274.8" cy="10" r="1.1" fill="${W}"/>`
  const len = f1(BARREL_LEN * K)
  return svgDoc([0, -6, len, 12], `<g transform="scale(${K}) translate(${-BARREL_X0} 0)">${b}</g>`, k.defs())
}
