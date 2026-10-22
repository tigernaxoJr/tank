/**
 * 地圖預覽：以與戰場相同的確定性地形核心（同一種子）生成地形，套上主題的天空、太陽 / 月亮、
 * 視差山丘、地表 / 土壤 / 基岩紋理與卡通粗墨線，再標出兩隊出生點，讓不同版型在選圖時一眼就能分辨。
 * 戰鬥中的雷達小地圖共用同一套背景（paintMapBackdrop）。
 *
 * 一律以 2 倍像素繪製，在高解析度螢幕上不糊。素材是非同步載入，載入失敗的圖層直接略過。
 */
import { BEDROCK, DeterministicTankCore } from '@/shared/wasm'
import { findSpawnGround } from '../domain/battleState'
import {
  THEME_REGISTRY,
  generatedAssetUrl,
  hasAbyss,
  mapAssetUrl,
  terrainOptionsFor,
  type MapBlueprint,
  type MapThemeId,
} from '../domain/mapRegistry'

const SCALE = 2
const TILE = 128
const INK = [29, 35, 64] as const
const TEAM_COLORS = { A: '#ff9a1f', B: '#3d8bff' } as const

/** [檔名, 鏡頭在頂端時的世界 Y]：與 BattleScene 的視差圖層同一組位置 */
const BACKDROP_LAYERS: [string, number][] = [
  ['mountains', 250],
  ['hills_far', 330],
  ['hills_near', 420],
]

export interface ThemeArt {
  layers: { img: HTMLImageElement; worldY: number; bottom: string }[]
  cap: Uint8ClampedArray | null
  fill: Uint8ClampedArray | null
  bedrock: Uint8ClampedArray | null
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>()
function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = imageCache.get(url)
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    })
    imageCache.set(url, p)
  }
  return p
}

function readTile(img: HTMLImageElement | null): Uint8ClampedArray | null {
  if (!img) return null
  const c = document.createElement('canvas')
  c.width = TILE
  c.height = TILE
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, TILE, TILE)
  return ctx.getImageData(0, 0, TILE, TILE).data
}

/** 圖層最底一列的平均色：圖層下方用它補滿，接上地形之前不會露出天空 */
function bottomColor(img: HTMLImageElement): string {
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = 1
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 'transparent'
  ctx.drawImage(img, 0, img.height - 2, img.width, 1, 0, 0, img.width, 1)
  const d = ctx.getImageData(0, 0, img.width, 1).data
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue
    r += d[i]; g += d[i + 1]; b += d[i + 2]; n++
  }
  return n ? `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})` : 'transparent'
}

const themeCache = new Map<MapThemeId, Promise<ThemeArt>>()
export function loadThemeArt(theme: MapThemeId): Promise<ThemeArt> {
  let p = themeCache.get(theme)
  if (!p) {
    p = (async () => {
      const [layerImgs, cap, fill, bedrock] = await Promise.all([
        Promise.all(BACKDROP_LAYERS.map(([file]) => loadImage(mapAssetUrl(theme, `${file}.png`)))),
        loadImage(mapAssetUrl(theme, 'terrain_cap.png')),
        loadImage(mapAssetUrl(theme, 'terrain_fill.png')),
        loadImage(generatedAssetUrl(theme, 'bedrock.png')),
      ])
      const layers: ThemeArt['layers'] = []
      layerImgs.forEach((img, i) => {
        if (img) layers.push({ img, worldY: BACKDROP_LAYERS[i][1], bottom: bottomColor(img) })
      })
      return { layers, cap: readTile(cap), fill: readTile(fill), bedrock: readTile(bedrock) }
    })()
    themeCache.set(theme, p)
  }
  return p
}

/** 天空漸層、太陽 / 月亮、三層視差山丘與深淵霧氣；w、h 為畫布實際像素 */
export function paintMapBackdrop(ctx: CanvasRenderingContext2D, map: MapBlueprint, art: ThemeArt | null, w: number, h: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, map.sky.top)
  grad.addColorStop(1, map.sky.bottom)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  const kx = w / map.width
  const ky = h / map.height
  const celestial = THEME_REGISTRY[map.theme].celestial
  if (celestial.kind !== 'none') {
    const cx = celestial.x * w
    const cy = Math.max(h * 0.1, celestial.y * ky * 0.9)
    const r = Math.max(4, h * 0.075)
    const sun = celestial.kind === 'sun'
    const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2.6)
    glow.addColorStop(0, sun ? 'rgba(255,236,140,0.75)' : 'rgba(235,240,255,0.55)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 6)
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = sun ? '#ffd23f' : '#f2f4ff'
    ctx.fill()
    ctx.lineWidth = Math.max(1, r * 0.22)
    ctx.strokeStyle = `rgb(${INK.join(',')})`
    ctx.stroke()
  }

  // 縮圖裡把圖層放大一些（底邊位置不變），整張圖才不會重複太多次而顯得雜亂
  const LAYER_ZOOM = 1.6
  for (const layer of art?.layers ?? []) {
    const tileW = Math.max(1, layer.img.width * kx * LAYER_ZOOM)
    const tileH = layer.img.height * ky * LAYER_ZOOM
    const y = (layer.worldY + layer.img.height) * ky - tileH
    for (let x = 0; x < w; x += tileW) ctx.drawImage(layer.img, x, y, tileW + 0.5, tileH)
    ctx.fillStyle = layer.bottom
    ctx.fillRect(0, y + tileH - 1, w, h - y - tileH + 1)
  }

  if (hasAbyss(map)) {
    const bandTop = h * 0.74
    const fog = ctx.createLinearGradient(0, bandTop, 0, h)
    fog.addColorStop(0, 'rgba(255,255,255,0)')
    fog.addColorStop(1, 'rgba(240,247,255,0.92)')
    ctx.fillStyle = fog
    ctx.fillRect(0, bandTop, w, h - bandTop)
  }
}

/** 取紋理一格（RGB），兩點平均以減少縮小時的閃點 */
function texel(tile: Uint8ClampedArray, x: number, y: number, out: number[]): void {
  const a = (((y & (TILE - 1)) * TILE + (x & (TILE - 1))) * 4)
  const b = ((((y + 1) & (TILE - 1)) * TILE + ((x + 2) & (TILE - 1))) * 4)
  out[0] = (tile[a] + tile[b]) / 2
  out[1] = (tile[a + 1] + tile[b + 1]) / 2
  out[2] = (tile[a + 2] + tile[b + 2]) / 2
}

function paintTerrain(ctx: CanvasRenderingContext2D, map: MapBlueprint, core: DeterministicTankCore, art: ThemeArt | null, w: number, h: number): void {
  const sx = map.width / w
  const sy = map.height / h
  // 取樣成實心遮罩（0 空氣、1 土、2 基岩）
  const mask = new Uint8Array(w * h)
  for (let py = 0; py < h; py++) {
    const wy = Math.floor((py + 0.5) * sy)
    for (let px = 0; px < w; px++) {
      const m = core.materialAt(Math.floor((px + 0.5) * sx), wy)
      mask[py * w + px] = m === 0 ? 0 : m === BEDROCK ? 2 : 1
    }
  }
  // 左右與底邊視為實心，只有朝向空氣的邊緣描墨線
  const solid = (x: number, y: number) => x < 0 || x >= w || y >= h || (y >= 0 && mask[y * w + x] !== 0)
  const OUTLINE = 2 * SCALE - 1

  const img = ctx.getImageData(0, 0, w, h)
  const data = img.data
  const fallbackCap = [126, 196, 80]
  const fallbackFill = [170, 118, 72]
  const rgb = [0, 0, 0]
  for (let px = 0; px < w; px++) {
    const wx = Math.floor((px + 0.5) * sx)
    let runTop = -1
    for (let py = 0; py < h; py++) {
      const m = mask[py * w + px]
      if (m === 0) {
        runTop = -1
        continue
      }
      if (runTop < 0) runTop = py
      const idx = (py * w + px) * 4
      let edge = false
      for (let d = 1; d <= OUTLINE && !edge; d++) {
        edge = !solid(px, py - d) || !solid(px - d, py) || !solid(px + d, py) || !solid(px, py + d)
      }
      if (edge) {
        data[idx] = INK[0]; data[idx + 1] = INK[1]; data[idx + 2] = INK[2]; data[idx + 3] = 255
        continue
      }
      const depth = Math.floor((py - runTop) * sy)
      if (m === 2) {
        if (art?.bedrock) texel(art.bedrock, wx, Math.floor(py * sy), rgb)
        else { rgb[0] = 104; rgb[1] = 110; rgb[2] = 128 }
      } else if (depth < TILE) {
        if (art?.cap) texel(art.cap, wx, depth, rgb)
        else { rgb[0] = fallbackCap[0]; rgb[1] = fallbackCap[1]; rgb[2] = fallbackCap[2] }
      } else if (art?.fill) {
        texel(art.fill, wx, depth, rgb)
      } else {
        rgb[0] = fallbackFill[0]; rgb[1] = fallbackFill[1]; rgb[2] = fallbackFill[2]
      }
      // 越深越暗；懸空地形的底面背光，看得出浮島與橋面的厚度
      let shade = depth > 180 ? Math.max(0.7, 1 - (depth - 180) / 1400) : 1
      if (!solid(px, py + OUTLINE + 3)) shade *= 0.7
      data[idx] = rgb[0] * shade
      data[idx + 1] = rgb[1] * shade
      data[idx + 2] = rgb[2] * shade
      data[idx + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 出生點小旗：與 createInitialBattleState 1v1 時的位置相同 */
function paintSpawnFlags(ctx: CanvasRenderingContext2D, map: MapBlueprint, core: DeterministicTankCore, w: number, h: number): void {
  const span = Math.floor(map.width * 0.32 * 0.35)
  const spots = [
    { team: 'A' as const, x: 180 + span },
    { team: 'B' as const, x: map.width - 180 - span },
  ]
  const kx = w / map.width
  const ky = h / map.height
  const pole = Math.max(10, h * 0.13)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (const { team, x } of spots) {
    const g = findSpawnGround(core, x)
    if (g.groundY >= map.height) continue
    const fx = g.x * kx
    const fy = g.groundY * ky
    const dir = team === 'A' ? 1 : -1
    ctx.lineWidth = SCALE * 1.5
    ctx.strokeStyle = `rgb(${INK.join(',')})`
    ctx.beginPath()
    ctx.moveTo(fx, fy)
    ctx.lineTo(fx, fy - pole)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(fx, fy - pole)
    ctx.lineTo(fx + dir * pole * 0.62, fy - pole * 0.78)
    ctx.lineTo(fx, fy - pole * 0.56)
    ctx.closePath()
    ctx.fillStyle = TEAM_COLORS[team]
    ctx.fill()
    ctx.stroke()
  }
}

const previewCache = new Map<string, Promise<string>>()

/** 地圖預覽圖（data URL）；width、height 為 CSS 像素，實際以 2 倍繪製 */
export function loadMapPreview(map: MapBlueprint, width = 160, height = 88, seed = 1024): Promise<string> {
  const key = `${map.id}:${width}x${height}:${seed}`
  let p = previewCache.get(key)
  if (!p) {
    p = loadThemeArt(map.theme).then((art) => {
      const w = Math.round(width * SCALE)
      const h = Math.round(height * SCALE)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return ''
      const core = new DeterministicTankCore(map.width, map.height, seed)
      core.resetTerrain(seed, terrainOptionsFor(map))
      paintMapBackdrop(ctx, map, art, w, h)
      paintTerrain(ctx, map, core, art, w, h)
      paintSpawnFlags(ctx, map, core, w, h)
      return canvas.toDataURL('image/png')
    })
    previewCache.set(key, p)
  }
  return p
}
