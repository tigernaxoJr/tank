/**
 * Cartoon character kit for the "character-first" tank art (first used by 毒蠍 Scorpion).
 *
 * Parts are authored in a large design space (about 4× game pixels) so curves and texture marks can
 * be placed by hand, then the caller wraps them in `scale()` down to game pixels.
 *
 * Look: fat variable-weight ink (an ink silhouette nudged down-right sits behind every part), hard
 * cel shadow, soft top-left bloom, bottom occlusion, toy-plastic gloss. On top of that every
 * material gets its own hand-made marks — chitin pores and growth lines, lacquer chips, beetle
 * sheen, claw tubercles, joint membranes, bristles, dust and mud — never one shared noise filter
 * (see docs/04 「紋理逐張手工守則」).
 *
 * Each kit owns its own <defs>, so make one kit per SVG document.
 */

export const f1 = (v) => Math.round(v * 100) / 100

export function rng(seed) {
  let a = seed >>> 0
  return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

/** Point on a cubic bezier given as [p0, p1, p2, p3]. */
export function bez([p0, p1, p2, p3], t) {
  const u = 1 - t
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
  return [0, 1].map((i) => k[0] * p0[i] + k[1] * p1[i] + k[2] * p2[i] + k[3] * p3[i])
}
export const cubicD = ([a, b, c, d]) => `M${a}C${b} ${c} ${d}`

export function ellipseD(cx, cy, rx, ry) {
  return `M${cx - rx},${cy}A${rx},${ry} 0 1 0 ${cx + rx},${cy}A${rx},${ry} 0 1 0 ${cx - rx},${cy}Z`
}

export const DUST = '#8c7d6c'
export const MUD = '#6e5b47'
export const IVORY = '#fff6e0'
const W = '#ffffff'

export function cartoonKit(prefix, ink) {
  let defs = ''
  let n = 0
  const uid = (p) => `${prefix}${p}${n++}`

  /** Variable-weight ink: a fat silhouette nudged down-right, plus a centred one. */
  const inkBack = (d, w = 9, dx = 1.6, dy = 2.4) =>
    `<path d="${d}" transform="translate(${dx} ${dy})" fill="${ink}" stroke="${ink}" stroke-width="${w}" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="${ink}" stroke="${ink}" stroke-width="${f1(w * 0.62)}" stroke-linejoin="round"/>`

  function glossy(x, y, rx, ry, rot = -20) {
    return (
      `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" transform="rotate(${rot} ${f1(x)} ${f1(y)})" fill="${W}" opacity="0.5"/>` +
      `<ellipse cx="${f1(x - rx * 0.35)}" cy="${f1(y - ry * 0.05)}" rx="${f1(rx * 0.38)}" ry="${f1(ry * 0.55)}" transform="rotate(${rot} ${f1(x)} ${f1(y)})" fill="${W}"/>` +
      `<circle cx="${f1(x + rx * 0.75)}" cy="${f1(y + ry * 0.9)}" r="${f1(Math.max(2, ry * 0.35))}" fill="${W}" opacity="0.85"/>`
    )
  }

  /**
   * Cel-shaded part. `tex` is the material pass, painted inside the clip between the shading and the
   * occlusion so wear and dirt still sit in shadow; `top` is painted after the occlusion.
   * c = { light, base, dark, deep }.
   */
  function part(d, c, { sx = 10, sy = 13, bbox, gloss, ink: inkW = 9, tex = '', top = '' } = {}) {
    const id = uid('c')
    const [x0, y0, x1, y1] = bbox
    const w = f1(x1 - x0)
    const h = f1(y1 - y0)
    defs +=
      `<clipPath id="${id}"><path d="${d}"/></clipPath>` +
      `<radialGradient id="${id}b" cx="0.3" cy="0.22" r="0.65"><stop offset="0" stop-color="${c.light}" stop-opacity="0.9"/><stop offset="1" stop-color="${c.light}" stop-opacity="0"/></radialGradient>` +
      `<linearGradient id="${id}o" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="${c.deep}" stop-opacity="0"/><stop offset="1" stop-color="${c.deep}" stop-opacity="0.55"/></linearGradient>`
    const g =
      `<path d="${d}" fill="${c.dark}"/>` +
      `<path d="${d}" transform="translate(${-sx} ${-sy})" fill="${c.base}"/>` +
      `<rect x="${f1(x0)}" y="${f1(y0)}" width="${w}" height="${h}" fill="url(#${id}b)"/>` +
      tex +
      `<rect x="${f1(x0)}" y="${f1(y0)}" width="${w}" height="${h}" fill="url(#${id}o)"/>` +
      top
    return inkBack(d, inkW) + `<g clip-path="url(#${id})">${g}</g>` + (gloss ? glossy(...gloss) : '')
  }

  /**
   * Lacquered chitin: punctate pores (a dark pit with a lit lower lip reads as a dent, not a dot),
   * hair-line scratches only on the exposed upper curve, dust settling low.
   */
  function chitin(c, [x0, y0, x1, y1], seed, { pores = 30, poreR = [0.9, 1.8], scratches = 4, dust = 14, dustFrom = 0.68 } = {}) {
    const r = rng(seed)
    const w = x1 - x0
    const h = y1 - y0
    let s = ''
    for (let i = 0; i < pores; i++) {
      const x = x0 + r() * w
      const y = y0 + h * (0.08 + r() * 0.75)
      const pr = poreR[0] + r() * (poreR[1] - poreR[0])
      s += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(pr)}" ry="${f1(pr * 0.8)}" fill="${c.deep}" opacity="0.38"/>`
      s += `<path d="M${f1(x - pr * 0.8)},${f1(y + pr * 0.5)}Q${f1(x)},${f1(y + pr * 1.3)} ${f1(x + pr * 0.8)},${f1(y + pr * 0.5)}" stroke="${c.light}" stroke-width="${f1(pr * 0.45)}" fill="none" opacity="0.55"/>`
    }
    for (let i = 0; i < scratches; i++) {
      const x = x0 + w * (0.15 + r() * 0.7)
      const y = y0 + h * (0.06 + r() * 0.3)
      const l = 4 + r() * 9
      const bend = (r() - 0.5) * 4
      const q = `q${f1(l / 2)},${f1(bend - l * 0.18)} ${f1(l)},${f1(-l * 0.3)}`
      s += `<path d="M${f1(x)},${f1(y)}${q}" stroke="${W}" stroke-width="0.9" fill="none" stroke-linecap="round" opacity="0.5"/>`
      s += `<path d="M${f1(x + 0.6)},${f1(y + 1)}${q}" stroke="${c.deep}" stroke-width="0.7" fill="none" stroke-linecap="round" opacity="0.35"/>`
    }
    if (dust) {
      const id = uid('d')
      defs += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="${dustFrom}" stop-color="${DUST}" stop-opacity="0"/><stop offset="1" stop-color="${DUST}" stop-opacity="0.42"/></linearGradient>`
      s += `<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(w)}" height="${f1(h)}" fill="url(#${id})"/>`
      for (let i = 0; i < dust; i++) {
        const x = x0 + r() * w
        const y = y0 + h * (dustFrom + r() * (1 - dustFrom))
        s += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.6 + r() * 1.4)}" fill="${r() < 0.5 ? DUST : '#c9b8a2'}" opacity="${f1(0.35 + r() * 0.3)}"/>`
      }
    }
    return s
  }

  /** Beetle-shell oil-slick sheen: a magenta→sky band laid with screen blending. */
  function sheen([x0, y0, x1, y1], op = 0.2) {
    const id = uid('ir')
    defs += `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0.12" stop-color="#ff7ad9" stop-opacity="0"/><stop offset="0.3" stop-color="#ff7ad9" stop-opacity="${op}"/><stop offset="0.48" stop-color="#7ab8ff" stop-opacity="${op}"/><stop offset="0.66" stop-color="#7ab8ff" stop-opacity="0"/></linearGradient>`
    return `<rect x="${f1(x0)}" y="${f1(y0)}" width="${f1(x1 - x0)}" height="${f1(y1 - y0)}" fill="url(#${id})" style="mix-blend-mode:screen"/>`
  }

  /** Radial glow used for venom glands and the stinger tip. */
  function glow(color, op = 0.7) {
    const id = uid('g')
    defs += `<radialGradient id="${id}"><stop offset="0.35" stop-color="${color}" stop-opacity="${op}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`
    return `url(#${id})`
  }

  /** Free-form gradient def; returns url(). */
  function gradient(inner) {
    const id = uid('x')
    defs += inner.replace('ID', id)
    return `url(#${id})`
  }

  function clip(d) {
    const id = uid('k')
    defs += `<clipPath id="${id}"><path d="${d}"/></clipPath>`
    return `url(#${id})`
  }

  return { part, glossy, chitin, sheen, glow, gradient, clip, inkBack, defs: () => defs }
}

/** Chip in the lacquer: a jagged flake showing the deeper layer, lit on its lower lip. c needs deep + rim. */
export function chip(x, y, s, c) {
  const d = `M${x},${y}l${f1(s * 0.9)},${f1(-s * 0.35)}l${f1(s * 0.5)},${f1(s * 0.55)}l${f1(-s * 0.2)},${f1(s * 0.6)}l${f1(-s * 0.95)},${f1(s * 0.1)}z`
  return `<path d="${d}" fill="${c.deep}" opacity="0.75"/><path d="M${f1(x + s * 0.2)},${f1(y + s * 0.85)}l${f1(s * 0.95)},${f1(-s * 0.1)}" stroke="${c.rim}" stroke-width="1.1" stroke-linecap="round" opacity="0.8"/>`
}

/** Mud splash thrown up by the feet: blob, darker core, droplets flung upward. */
export function mud(x, y, s, seed) {
  const r = rng(seed)
  let o = `<ellipse cx="${x}" cy="${y}" rx="${f1(s)}" ry="${f1(s * 0.7)}" fill="${MUD}" opacity="0.55"/><ellipse cx="${f1(x - s * 0.2)}" cy="${f1(y + s * 0.15)}" rx="${f1(s * 0.5)}" ry="${f1(s * 0.35)}" fill="#4f4032" opacity="0.5"/>`
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI * (0.15 + r() * 0.7)
    const d = s * (1.3 + r() * 0.9)
    o += `<circle cx="${f1(x + Math.cos(a) * d)}" cy="${f1(y + Math.sin(a) * d)}" r="${f1(0.8 + r() * 1.2)}" fill="${MUD}" opacity="0.55"/>`
  }
  return o
}

/** Raised tubercle (claw bump): shadowed base, lit cap. */
export const bump = (x, y, r, c) =>
  `<circle cx="${f1(x + r * 0.35)}" cy="${f1(y + r * 0.45)}" r="${r}" fill="${c.deep}" opacity="0.45"/><circle cx="${x}" cy="${y}" r="${r}" fill="${c.base}"/><circle cx="${f1(x - r * 0.35)}" cy="${f1(y - r * 0.35)}" r="${f1(r * 0.45)}" fill="${c.light}"/>`

/** Stiff bristles (setae) poking out of a leg's back edge. */
export function bristles(x, y, count, dir, seed, ink) {
  const r = rng(seed)
  let s = ''
  for (let i = 0; i < count; i++) {
    const yy = y + i * 6 + r() * 2
    s += `<path d="M${f1(x)},${f1(yy)}q${f1(dir * 3)},-1 ${f1(dir * (5 + r() * 2))},${f1(-3 - r() * 2)}" stroke="${ink}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
  }
  return s
}
