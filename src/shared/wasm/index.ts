/**
 * Shared Wasm Adapter (WP-1.4): 封裝 Rust Wasm 核心引擎的介面契約與確定性純整數實作。
 * 採用與 crates/tank-core 100% 相同的 XorShift32、千分位拋物線與圓形挖坑演算法，
 * 讓前端各 VSA Slice 隨時可獨立運行與測試。
 */

export interface DirtyRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface TrajectoryPoint {
  readonly x: number
  readonly y: number
}

export interface TrajectoryHit {
  readonly hitX: number
  readonly hitY: number
  readonly impactedTerrain: boolean
  readonly hitTank: boolean
  readonly stepsTaken: number
  readonly path: TrajectoryPoint[]
}

/**
 * 地形版型特徵（浮空島、吊橋、雙層峽谷、階梯台地、不可破壞基岩等砲術遊戲常見版型）。
 * 所有座標皆為地圖寬 / 高的比例 (0~1)，讓同一版型可套用不同地圖尺寸。
 * 依陣列順序疊加在基礎波形地表之上；`op` 決定加土、挖空或鋪設不可破壞的基岩。
 */
export type TerrainOp = 'add' | 'carve' | 'bedrock'

export type TerrainFeature =
  /** 浮空島：平頂、底部呈半橢圓垂墜 */
  | {
      readonly kind: 'island'
      readonly cx: number
      readonly y: number
      readonly w: number
      readonly depth: number
      readonly op?: TerrainOp
    }
  /** 橋 / 薄層：沿 x0~x1 延伸的薄板，可拱起 (arch)、下垂 (sag)、W 形或波浪；兩端可加厚成橋墩 */
  | {
      readonly kind: 'bridge'
      readonly x0: number
      readonly x1: number
      readonly y: number
      readonly thickness: number
      readonly shape?: 'flat' | 'arch' | 'sag' | 'w' | 'wave'
      readonly bend?: number
      readonly waves?: number
      readonly endThickness?: number
      readonly op?: TerrainOp
    }
  | {
      readonly kind: 'ellipse'
      readonly cx: number
      readonly cy: number
      readonly rx: number
      readonly ry: number
      readonly op: TerrainOp
    }
  | {
      readonly kind: 'rect'
      readonly x: number
      readonly y: number
      readonly w: number
      readonly h: number
      readonly op: TerrainOp
    }

/** 遮罩值：0 = 空氣、1 = 可破壞土壤、2 = 不可破壞基岩 */
export const AIR = 0
export const DIRT = 1
export const BEDROCK = 2

export interface TerrainWaveOptions {
  /** 'waves' = 由波形地表往下填土；'none' = 沒有地面（下方即深淵），只靠 features 構成地形 */
  readonly baseMode?: 'waves' | 'none'
  /** 只保留地表往下這麼多像素的土層（薄地形，下方為深淵）；未設定 = 填到地圖底部 */
  readonly baseThickness?: number
  readonly features?: readonly TerrainFeature[]
  readonly width?: number
  readonly height?: number
  readonly baseHeightRatio?: number
  readonly amp1?: [number, number]
  readonly amp2?: [number, number]
  readonly amp3?: [number, number]
  readonly wavelength1?: number
  readonly wavelength2?: number
  readonly wavelength3?: number
  /** 地表隨機抖動（random walk）的上限 px，預設 18；平原類地圖調小 */
  readonly jitter?: number
}

export interface TankCorePort {
  readonly width: number
  readonly height: number
  resetTerrain(seed: number, options?: TerrainWaveOptions): void
  isSolid(x: number, y: number): boolean
  /** 0 = 空氣、1 = 土壤、2 = 不可破壞基岩 */
  materialAt(x: number, y: number): number
  /** 整欄最上方的地表（出生點、裝飾擺放用） */
  surfaceY(x: number): number
  /** 從 fromY 往下找第一個實心像素；多層地形（橋下、島下）的坦克必須用這個貼地。找不到回傳 height（深淵） */
  groundBelow(x: number, fromY: number): number
  surfaceSlopeDeg(x: number, sampleSpan?: number, fromY?: number): number
  carveCircle(cx: number, cy: number, radius: number): DirtyRect
  /** 堆出圓形土丘：只把空氣填成土壤（基岩不變），築壘彈用 */
  fillCircle(cx: number, cy: number, radius: number): DirtyRect
  simulateShot(params: {
    startX: number
    startY: number
    vxMilli: number
    vyMilli: number
    windMilli: number
    gravityMilli?: number
    maxSteps?: number
    targetX?: number
    targetY?: number
    targetRadius?: number
  }): TrajectoryHit
  computeExplosionDamage(
    explosionX: number,
    explosionY: number,
    tankX: number,
    tankY: number,
    blastRadius: number,
    maxDamage: number,
  ): number
  getStateHash(): number
}

export class DeterministicRng {
  private state: number

  constructor(seed: number) {
    this.state = seed === 0 ? 0xbad5eed : seed >>> 0
  }

  nextU32(): number {
    let x = this.state >>> 0
    x = (x ^ (x << 13)) >>> 0
    x = (x ^ (x >>> 17)) >>> 0
    x = (x ^ (x << 5)) >>> 0
    this.state = x
    return x
  }

  nextRange(min: number, max: number): number {
    if (min >= max) return min
    const span = (max - min + 1) >>> 0
    return min + (this.nextU32() % span)
  }
}

function isqrt(n: number): number {
  if (n <= 0) return 0
  let x = n | 0
  let y = ((x + 1) >> 1) | 0
  while (y < x) {
    x = y
    y = ((x + Math.floor(n / x)) >> 1) | 0
  }
  return x
}

export const DEFAULT_WORLD_WIDTH = 2400
export const DEFAULT_WORLD_HEIGHT = 1100

export class DeterministicTankCore implements TankCorePort {
  width: number
  height: number
  private mask: Uint8Array

  constructor(
    width = DEFAULT_WORLD_WIDTH,
    height = DEFAULT_WORLD_HEIGHT,
    seed = 1024,
  ) {
    this.width = width
    this.height = height
    this.mask = new Uint8Array(width * height)
    this.resetTerrain(seed)
  }

  resetTerrain(seed: number, options?: TerrainWaveOptions): void {
    if (options?.width && options?.height) {
      if (this.width !== options.width || this.height !== options.height) {
        this.width = options.width
        this.height = options.height
        this.mask = new Uint8Array(this.width * this.height)
      }
    }

    const rng = new DeterministicRng(seed)
    this.mask.fill(0)

    const phase1 = rng.nextRange(0, 628) / 100
    const phase2 = rng.nextRange(0, 628) / 100
    const phase3 = rng.nextRange(0, 628) / 100

    const [a1Min, a1Max] = options?.amp1 ?? [90, 145]
    const [a2Min, a2Max] = options?.amp2 ?? [40, 75]
    const [a3Min, a3Max] = options?.amp3 ?? [15, 30]

    const amp1 = rng.nextRange(a1Min, a1Max)
    const amp2 = rng.nextRange(a2Min, a2Max)
    const amp3 = rng.nextRange(a3Min, a3Max)

    const wl1 = options?.wavelength1 ?? 260
    const wl2 = options?.wavelength2 ?? 115
    const wl3 = options?.wavelength3 ?? 48

    const baseLine = Math.floor(this.height * (options?.baseHeightRatio ?? 0.62))
    const minH = Math.floor(this.height * 0.25)
    const maxH = Math.floor(this.height * 0.86)
    const baseMode = options?.baseMode ?? 'waves'
    const thickness = options?.baseThickness ?? 0
    const jitterMax = options?.jitter ?? 18
    let jitter = 0

    for (let x = 0; x < this.width; x++) {
      jitter = Math.max(-jitterMax, Math.min(jitterMax, jitter + rng.nextRange(-1, 1)))
      if (baseMode === 'none') continue
      const wave =
        Math.sin(x / wl1 + phase1) * amp1 +
        Math.cos(x / wl2 + phase2) * amp2 +
        Math.sin(x / wl3 + phase3) * amp3 +
        jitter

      const surfaceY = Math.max(minH, Math.min(maxH, Math.round(baseLine + wave)))
      const bottom =
        thickness > 0 ? Math.min(this.height, surfaceY + thickness + Math.round(jitter / 3)) : this.height
      for (let y = surfaceY; y < bottom; y++) {
        this.mask[y * this.width + x] = DIRT
      }
    }

    for (const feature of options?.features ?? []) {
      this.applyFeature(feature)
    }
  }

  /** 確定性的低頻正弦雜訊，讓特徵邊緣不那麼死板（不消耗 RNG，避免改變既有地圖的種子結果） */
  private edgeNoise(x: number, k: number, amp: number): number {
    return Math.round(Math.sin(x * 0.045 + k) * amp + Math.sin(x * 0.13 + k * 2.3) * amp * 0.45)
  }

  private paintColumn(x: number, y0: number, y1: number, op: TerrainOp): void {
    if (x < 0 || x >= this.width) return
    const top = Math.max(0, Math.round(y0))
    const bottom = Math.min(this.height, Math.round(y1))
    for (let y = top; y < bottom; y++) {
      const i = y * this.width + x
      if (op === 'carve') {
        if (this.mask[i] !== BEDROCK) this.mask[i] = AIR
      } else if (op === 'bedrock') {
        this.mask[i] = BEDROCK
      } else if (this.mask[i] === AIR) {
        this.mask[i] = DIRT
      }
    }
  }

  private applyFeature(f: TerrainFeature): void {
    const W = this.width
    const H = this.height
    switch (f.kind) {
      case 'island': {
        const op = f.op ?? 'add'
        const half = (f.w * W) / 2
        const cx = f.cx * W
        const top = f.y * H
        const depth = f.depth * H
        const k = cx * 0.01
        for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
          const t = (x - cx) / half
          if (t < -1 || t > 1) continue
          const shoulder = Math.sqrt(1 - t * t)
          // 島緣下削成圓角，底部半橢圓垂墜並帶雜訊
          const y0 = top + (1 - Math.sqrt(Math.max(0, 1 - t ** 8))) * 18 + this.edgeNoise(x, k, 3)
          const y1 = top + 14 + depth * shoulder ** 0.8 + this.edgeNoise(x, k + 1.7, 7) * shoulder
          this.paintColumn(x, y0, Math.max(y0 + 8, y1), op)
        }
        break
      }
      case 'bridge': {
        const op = f.op ?? 'add'
        const x0 = Math.round(f.x0 * W)
        const x1 = Math.round(f.x1 * W)
        const span = Math.max(1, x1 - x0)
        const bend = (f.bend ?? 0) * H
        const waves = f.waves ?? 2
        const thick = f.thickness * H
        const endThick = (f.endThickness ?? f.thickness) * H
        const k = x0 * 0.013
        for (let x = x0; x <= x1; x++) {
          const t = (x - x0) / span
          let offset = 0
          switch (f.shape ?? 'flat') {
            case 'arch':
              offset = -Math.sin(Math.PI * t) * bend
              break
            case 'sag':
              offset = Math.sin(Math.PI * t) * bend
              break
            case 'w':
              offset = ((1 - Math.cos(4 * Math.PI * t)) / 2) * bend
              break
            case 'wave':
              offset = Math.sin(waves * 2 * Math.PI * t) * bend
              break
          }
          // 兩端 15% 範圍內平滑加厚成橋墩
          const edge = Math.max(0, 1 - Math.min(t, 1 - t) / 0.15)
          const th = thick + (endThick - thick) * edge * edge
          const y0 = f.y * H + offset + this.edgeNoise(x, k, 2)
          this.paintColumn(x, y0, y0 + th + this.edgeNoise(x, k + 3.1, 4), op)
        }
        break
      }
      case 'ellipse': {
        const cx = f.cx * W
        const cy = f.cy * H
        const rx = f.rx * W
        const ry = f.ry * H
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const t = (x - cx) / rx
          if (t < -1 || t > 1) continue
          const h = ry * Math.sqrt(1 - t * t)
          this.paintColumn(x, cy - h, cy + h, f.op)
        }
        break
      }
      case 'rect': {
        const x0 = Math.round(f.x * W)
        const x1 = Math.round((f.x + f.w) * W)
        for (let x = x0; x < x1; x++) {
          this.paintColumn(x, f.y * H, (f.y + f.h) * H, f.op)
        }
        break
      }
    }
  }

  isSolid(x: number, y: number): boolean {
    const ix = x | 0
    const iy = y | 0
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) {
      return false
    }
    return this.mask[iy * this.width + ix] !== 0
  }

  materialAt(x: number, y: number): number {
    const ix = x | 0
    const iy = y | 0
    if (ix < 0 || iy < 0 || ix >= this.width || iy >= this.height) {
      return AIR
    }
    return this.mask[iy * this.width + ix]
  }

  surfaceY(x: number): number {
    return this.groundBelow(x, 0)
  }

  groundBelow(x: number, fromY: number): number {
    const cx = Math.max(0, Math.min(this.width - 1, x | 0))
    for (let y = Math.max(0, fromY | 0); y < this.height; y++) {
      if (this.mask[y * this.width + cx] !== 0) {
        return y
      }
    }
    return this.height
  }

  surfaceSlopeDeg(x: number, sampleSpan = 6, fromY?: number): number {
    const span = Math.max(1, sampleSpan | 0)
    const yLeft = fromY === undefined ? this.surfaceY(x - span) : this.groundBelow(x - span, fromY)
    const yRight = fromY === undefined ? this.surfaceY(x + span) : this.groundBelow(x + span, fromY)
    const dy = yRight - yLeft
    const dx = 2 * span
    return Math.max(-45, Math.min(45, Math.trunc((dy * 45) / dx)))
  }

  carveCircle(cx: number, cy: number, radius: number): DirtyRect {
    const minX = Math.max(0, (cx - radius) | 0)
    const maxX = Math.max(0, Math.min(this.width - 1, (cx + radius) | 0))
    const minY = Math.max(0, (cy - radius) | 0)
    const maxY = Math.max(0, Math.min(this.height - 1, (cy + radius) | 0))
    const rSq = radius * radius

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= rSq && this.mask[y * this.width + x] !== BEDROCK) {
          this.mask[y * this.width + x] = AIR
        }
      }
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX + 1),
      height: Math.max(0, maxY - minY + 1),
    }
  }

  fillCircle(cx: number, cy: number, radius: number): DirtyRect {
    const minX = Math.max(0, (cx - radius) | 0)
    const maxX = Math.max(0, Math.min(this.width - 1, (cx + radius) | 0))
    const minY = Math.max(0, (cy - radius) | 0)
    const maxY = Math.max(0, Math.min(this.height - 1, (cy + radius) | 0))
    const rSq = radius * radius

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy <= rSq && this.mask[y * this.width + x] === AIR) {
          this.mask[y * this.width + x] = DIRT
        }
      }
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX + 1),
      height: Math.max(0, maxY - minY + 1),
    }
  }

  simulateShot(params: {
    startX: number
    startY: number
    vxMilli: number
    vyMilli: number
    windMilli: number
    gravityMilli?: number
    maxSteps?: number
    targetX?: number
    targetY?: number
    targetRadius?: number
  }): TrajectoryHit {
    let xMilli = (params.startX | 0) * 1000
    let yMilli = (params.startY | 0) * 1000
    let vx = params.vxMilli | 0
    let vy = params.vyMilli | 0
    const wind = params.windMilli | 0
    const gravity = (params.gravityMilli ?? 180) | 0
    const maxSteps = params.maxSteps ?? 600
    const targetX = params.targetX ?? -9999
    const targetY = params.targetY ?? -9999
    const targetRadius = params.targetRadius ?? 0
    const rSq = targetRadius * targetRadius
    const path: TrajectoryPoint[] = [{ x: params.startX | 0, y: params.startY | 0 }]

    for (let step = 1; step <= maxSteps; step++) {
      xMilli += vx
      yMilli += vy
      vx += wind
      vy += gravity

      const px = Math.trunc(xMilli / 1000)
      const py = Math.trunc(yMilli / 1000)
      if (step % 2 === 0) {
        path.push({ x: px, y: py })
      }

      if (targetRadius > 0) {
        const dx = px - targetX
        const dy = py - targetY
        if (dx * dx + dy * dy <= rSq) {
          path.push({ x: px, y: py })
          return {
            hitX: px,
            hitY: py,
            impactedTerrain: false,
            hitTank: true,
            stepsTaken: step,
            path,
          }
        }
      }

      if (px < 0 || px >= this.width || py >= this.height) {
        path.push({ x: px, y: py })
        return {
          hitX: px,
          hitY: py,
          impactedTerrain: false,
          hitTank: false,
          stepsTaken: step,
          path,
        }
      }

      if (py >= 0 && this.isSolid(px, py)) {
        path.push({ x: px, y: py })
        return {
          hitX: px,
          hitY: py,
          impactedTerrain: true,
          hitTank: false,
          stepsTaken: step,
          path,
        }
      }
    }

    return {
      hitX: Math.trunc(xMilli / 1000),
      hitY: Math.trunc(yMilli / 1000),
      impactedTerrain: false,
      hitTank: false,
      stepsTaken: maxSteps,
      path,
    }
  }

  computeExplosionDamage(
    explosionX: number,
    explosionY: number,
    tankX: number,
    tankY: number,
    blastRadius: number,
    maxDamage: number,
  ): number {
    if (blastRadius <= 0 || maxDamage <= 0) return 0
    const dx = (tankX | 0) - (explosionX | 0)
    const dy = (tankY | 0) - (explosionY | 0)
    const distSq = dx * dx + dy * dy
    const rSq = blastRadius * blastRadius
    if (distSq >= rSq) return 0
    const dist = isqrt(distSq)
    return Math.trunc(((blastRadius - dist) * maxDamage) / blastRadius)
  }

  stateHash(): number {
    return this.getStateHash()
  }

  getStateHash(): number {
    let hash = 0x811c9dc5
    for (let i = 0; i < this.mask.length; i++) {
      hash ^= this.mask[i]
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash >>> 0
  }
}

export * from './adapter'

