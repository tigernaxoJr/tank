/**
 * 大廳地圖預覽：以與戰場相同的確定性地形核心（同一種子）生成地形，縮小繪製成剪影縮圖，
 * 讓共用同一美術主題的不同版型（浮空島、吊橋、雙層谷…）在選圖時一眼就能分辨。
 */
import { BEDROCK, DeterministicTankCore } from '@/shared/wasm'
import { terrainOptionsFor, type MapBlueprint } from '../domain/mapRegistry'

const cache = new Map<string, string>()

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function renderMapPreview(map: MapBlueprint, width = 160, height = 88, seed = 1024): string {
  const key = `${map.id}:${width}x${height}:${seed}`
  const cached = cache.get(key)
  if (cached) return cached

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  const grad = ctx.createLinearGradient(0, 0, 0, height)
  grad.addColorStop(0, map.sky.top)
  grad.addColorStop(1, map.sky.bottom)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)

  const core = new DeterministicTankCore(map.width, map.height, seed)
  core.resetTerrain(seed, terrainOptionsFor(map))

  const sx = map.width / width
  const sy = map.height / height
  const [capColor, fillColor] = map.debrisColors.map(hex)
  for (let px = 0; px < width; px++) {
    const wx = Math.floor((px + 0.5) * sx)
    let prevSolid = 0
    for (let py = 0; py < height; py++) {
      const wy = Math.floor((py + 0.5) * sy)
      const material = core.materialAt(wx, wy)
      if (material === 0) {
        prevSolid = 0
        continue
      }
      ctx.fillStyle = material === BEDROCK ? '#687088' : prevSolid >= 2 ? fillColor : capColor
      ctx.fillRect(px, py, 1, 1)
      prevSolid++
    }
  }

  const url = canvas.toDataURL('image/png')
  cache.set(key, url)
  return url
}
