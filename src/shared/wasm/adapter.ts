import type {
  DirtyRect,
  TankCorePort,
  TerrainWaveOptions,
  TrajectoryHit,
  TrajectoryPoint,
} from './index'
import {
  DEFAULT_WORLD_HEIGHT,
  DEFAULT_WORLD_WIDTH,
  DeterministicTankCore,
} from './index'
import initWasm, {
  compute_explosion_damage,
  preview_trajectory,
  simulate_shot,
  simulate_shot_with_target,
  TerrainGrid,
} from './pkg/tank_core.js'
import wasmUrl from './pkg/tank_core_bg.wasm?url'

let isReady = false
let initPromise: Promise<boolean> | null = null

export function isWasmCoreReady(): boolean {
  return isReady
}

export async function initTankCoreWasm(): Promise<boolean> {
  if (isReady) return true
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      // 區分 Node 環境 (如 Vitest / CLI) 與瀏覽器環境 (Vite)
      const isNode =
        typeof process !== 'undefined' &&
        process.versions != null &&
        process.versions.node != null &&
        typeof window === 'undefined'

      if (isNode) {
        const { readFileSync } = await import('fs')
        const { fileURLToPath } = await import('url')
        const wasmPath = fileURLToPath(new URL('./pkg/tank_core_bg.wasm', import.meta.url))
        const bytes = readFileSync(wasmPath)
        await initWasm({ module_or_path: bytes })
      } else {
        await initWasm({ module_or_path: wasmUrl })
      }
      isReady = true
      return true
    } catch (err) {
      console.warn('[WasmTankCore] Wasm initialization failed, fallback to TS core:', err)
      isReady = false
      return false
    }
  })()

  return initPromise
}

export class WasmTankCore implements TankCorePort {
  width: number
  height: number
  private grid: TerrainGrid

  constructor(
    width = DEFAULT_WORLD_WIDTH,
    height = DEFAULT_WORLD_HEIGHT,
    seed = 1024,
  ) {
    if (!isReady) {
      throw new Error('[WasmTankCore] Wasm module is not initialized. Call initTankCoreWasm() first or use createTankCore().')
    }
    this.width = width
    this.height = height
    this.grid = new TerrainGrid(width, height, seed)
  }

  resetTerrain(seed: number, options?: TerrainWaveOptions): void {
    if (options?.width && options?.height) {
      this.width = options.width
      this.height = options.height
    }
    const json = options ? JSON.stringify(options) : ''
    this.grid.reset_terrain(seed, json)
  }

  carveCircle(centerX: number, centerY: number, radius: number): DirtyRect {
    const r = this.grid.carve_circle(centerX, centerY, radius)
    return {
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
    }
  }

  isSolid(x: number, y: number): boolean {
    return this.grid.is_solid(x, y)
  }

  materialAt(x: number, y: number): number {
    return this.grid.material_at(x, y)
  }

  surfaceY(x: number): number {
    return this.grid.surface_y(x)
  }

  groundBelow(x: number, fromY: number): number {
    return this.grid.ground_below(x, fromY)
  }

  surfaceSlopeDeg(x: number, sampleSpan = 5, fromY?: number): number {
    return this.grid.surface_slope_deg(x, sampleSpan, fromY ?? null)
  }

  stateHash(): number {
    return this.grid.state_hash() >>> 0
  }

  getStateHash(): number {
    return this.stateHash()
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
    const targetRadius = params.targetRadius ?? 0
    const targetX = params.targetX ?? -9999
    const targetY = params.targetY ?? -9999
    const maxSteps = params.maxSteps ?? 600
    const gravityMilli = params.gravityMilli ?? 180

    let hit
    if (targetRadius > 0) {
      hit = simulate_shot_with_target(
        params.startX,
        params.startY,
        params.vxMilli,
        params.vyMilli,
        params.windMilli,
        gravityMilli,
        maxSteps,
        this.grid,
        targetX,
        targetY,
        targetRadius,
      )
    } else {
      hit = simulate_shot(
        params.startX,
        params.startY,
        params.vxMilli,
        params.vyMilli,
        params.windMilli,
        gravityMilli,
        maxSteps,
        this.grid,
      )
    }
    return {
      hitX: hit.hit_x,
      hitY: hit.hit_y,
      impactedTerrain: hit.impacted_terrain,
      hitTank: hit.hit_tank,
      stepsTaken: hit.steps_taken,
      path: [],
    }
  }

  previewTrajectory(
    startX: number,
    startY: number,
    vxMilli: number,
    vyMilli: number,
    windMilli: number,
    gravityMilli: number,
    maxSteps = 600,
    sampleEveryNSteps = 4,
  ): TrajectoryPoint[] {
    const sampleCount = Math.floor(maxSteps / sampleEveryNSteps)
    const raw = preview_trajectory(
      startX,
      startY,
      vxMilli,
      vyMilli,
      windMilli,
      gravityMilli,
      sampleCount,
      sampleEveryNSteps,
    )
    const points: TrajectoryPoint[] = []
    for (let i = 0; i < raw.length; i += 2) {
      points.push({ x: raw[i], y: raw[i + 1] })
    }
    return points
  }

  computeExplosionDamage(
    explosionX: number,
    explosionY: number,
    tankX: number,
    tankY: number,
    blastRadius: number,
    maxDamage: number,
  ): number {
    return compute_explosion_damage(
      explosionX,
      explosionY,
      tankX,
      tankY,
      blastRadius,
      maxDamage,
    )
  }

  getMaskBuffer(): Uint8Array {
    const size = this.width * this.height
    const copy = new Uint8Array(size)
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        copy[y * this.width + x] = this.grid.material_at(x, y)
      }
    }
    return copy
  }
}

/**
 * 工廠函式：優先使用已初始化的 Wasm 核心，若未載入則自動退回純 TS 確定性核心
 */
export function createTankCore(
  width = DEFAULT_WORLD_WIDTH,
  height = DEFAULT_WORLD_HEIGHT,
  seed = 1024,
): TankCorePort {
  if (isReady) {
    return new WasmTankCore(width, height, seed)
  }
  return new DeterministicTankCore(width, height, seed)
}
