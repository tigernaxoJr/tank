/**
 * Map Registry (模組化地圖與地貌基底引擎)
 * 日後要新增地圖，只需在 MAP_REGISTRY 新增一筆 MapBlueprint：
 *   - `waveProfile` 決定基礎波形地表；`layout` 再疊加浮空島、吊橋、挖空、不可破壞基岩等版型特徵
 *     （版型設計守則見 docs/05-map-layout-design.md）。
 *   - `theme` 指定美術主題（THEME_REGISTRY）。所有主題都是專案原創向量美術，
 *     由 tools/assets/paint_map_themes.mjs 程式繪製到 public/assets/maps/<theme>/。
 *
 * 每個美術主題的資產：
 *   terrain_cap.png / terrain_fill.png  128×128 四向無縫地表與土壤磚
 *   mountains / hills_far / hills_near  1024×400 可水平無縫捲動的視差圖層
 *   clouds_far                          隨風向飄移的雲層
 *   prop<N>.png                         地表裝飾，爆炸會摧毀或使其下墜
 *   bedrock.png                         128×128 不可破壞基岩紋理
 *   hang<N>.png                         懸掛在浮島 / 橋面底下的樹根、藤蔓、冰柱、鎖鏈、瀑布
 * 大廳縮圖改用依版型即時繪製的地形剪影預覽（renderMapPreview）。
 */
import type { MapPresetId } from '@/shared/kernel/types'
import type { TerrainFeature, TerrainWaveOptions } from '@/shared/wasm'

export type MapThemeId =
  | 'harvest_farm'
  | 'volcano_rift'
  | 'tropic_coast'
  | 'desert_temple'
  | 'sky_meadow'
  | 'aurora_night'
  | 'moon_ruins'

export interface MapTheme {
  readonly id: MapThemeId
  /** prop0 ~ prop<N-1>.png */
  readonly propCount: number
  /** hang0 ~ hang<N-1>.png */
  readonly hangCount: number
  /** 天空中的太陽或月亮，以及在螢幕上的位置（比例）；'none' = 不畫（例如火山濃煙遮天） */
  readonly celestial: { readonly kind: 'sun' | 'moon' | 'none'; readonly x: number; readonly y: number }
}

export const THEME_REGISTRY: Record<MapThemeId, MapTheme> = {
  volcano_rift: { id: 'volcano_rift', propCount: 5, hangCount: 2, celestial: { kind: 'none', x: 0, y: 0 } },
  tropic_coast: { id: 'tropic_coast', propCount: 5, hangCount: 3, celestial: { kind: 'sun', x: 0.2, y: 95 } },
  harvest_farm: { id: 'harvest_farm', propCount: 5, hangCount: 2, celestial: { kind: 'sun', x: 0.78, y: 105 } },
  desert_temple: { id: 'desert_temple', propCount: 5, hangCount: 2, celestial: { kind: 'sun', x: 0.3, y: 230 } },
  sky_meadow: { id: 'sky_meadow', propCount: 5, hangCount: 3, celestial: { kind: 'sun', x: 0.82, y: 110 } },
  aurora_night: { id: 'aurora_night', propCount: 4, hangCount: 3, celestial: { kind: 'moon', x: 0.78, y: 120 } },
  moon_ruins: { id: 'moon_ruins', propCount: 5, hangCount: 3, celestial: { kind: 'moon', x: 0.22, y: 150 } },
}

export interface MapBlueprint {
  readonly id: MapPresetId
  readonly theme: MapThemeId
  readonly name: string
  readonly badge: string
  readonly description: string
  readonly width: number
  readonly height: number
  readonly waveProfile: {
    readonly baseHeightRatio: number
    readonly amp1: [number, number]
    readonly amp2: [number, number]
    readonly amp3: [number, number]
    readonly wavelength1: number
    readonly wavelength2: number
    readonly wavelength3: number
    /** 地表隨機抖動上限 px（預設 18） */
    readonly jitter?: number
  }
  /** 地形版型：'none' = 沒有地面、下方是深淵；baseThickness = 薄地表；features 依序疊加 */
  readonly layout?: {
    readonly baseMode?: 'waves' | 'none'
    readonly baseThickness?: number
    readonly features?: readonly TerrainFeature[]
  }
  readonly sky: {
    readonly top: string
    readonly bottom: string
  }
  /** 地表裝飾每隔多少像素嘗試擺放一個（裝飾種類數量由主題決定） */
  readonly props: { readonly spacing: [number, number] }
  /** 每回合隨機風速上限（|wind| <= maxWind），冰原強風、山谷溫和 */
  readonly maxWind: number
  /** 爆炸飛濺土塊顏色 */
  readonly debrisColors: number[]
}

/** 主題的背景、地表磚與地表裝飾 */
export function mapAssetUrl(theme: MapThemeId, file: string): string {
  return `./assets/maps/${theme}/${file}`
}

/** paint_map_themes.mjs 為所有主題產生的素材（bedrock、hang<N>），以及共用的 _common/moon */
export function generatedAssetUrl(theme: MapThemeId | '_common', file: string): string {
  return `./assets/maps/${theme}/${file}`
}

/** 底部是深淵的地圖（沒有地面或只有薄地表）：戰場底部畫上雲海 / 霧氣提示墜落即陣亡 */
export function hasAbyss(map: MapBlueprint): boolean {
  return map.layout?.baseMode === 'none' || (map.layout?.baseThickness ?? 0) > 0
}

/** resetTerrain 需要的完整參數（尺寸 + 波形 + 版型） */
export function terrainOptionsFor(map: MapBlueprint): TerrainWaveOptions {
  return { width: map.width, height: map.height, ...map.waveProfile, ...map.layout }
}

/** 左右鏡像一組特徵，讓雙方陣營地形對等 */
function mirrored(features: TerrainFeature[]): TerrainFeature[] {
  const flipped = features.map((f): TerrainFeature => {
    switch (f.kind) {
      case 'island':
        return { ...f, cx: 1 - f.cx }
      case 'ellipse':
        return { ...f, cx: 1 - f.cx }
      case 'rect':
        return { ...f, x: 1 - f.x - f.w }
      case 'bridge':
        return { ...f, x0: 1 - f.x1, x1: 1 - f.x0 }
    }
  })
  return [...features, ...flipped]
}

export const MAP_REGISTRY: Record<MapPresetId, MapBlueprint> = {
  harvest_plains: {
    id: 'harvest_plains',
    theme: 'harvest_farm',
    name: '金穗風車農場 (Harvest Plains)',
    badge: '2400 × 1100 · 平原入門圖',
    description: '金黃麥田與風車環繞的平坦農地，兩側各有兩座低矮土丘可當掩體；地形平坦、風力溫和，最適合新手練習力道與角度。',
    width: 2400,
    height: 1100,
    // 幾乎平坦（±6px）的平原
    waveProfile: {
      baseHeightRatio: 0.66,
      amp1: [3, 5],
      amp2: [1, 2],
      amp3: [0, 1],
      wavelength1: 300,
      wavelength2: 140,
      wavelength3: 60,
      jitter: 2,
    },
    layout: {
      // 每側兩座約坦克高度的低矮土丘當入門掩體：出生點分布在寬度 7.5%~39.5%（1v1~5v5），
      // 小丘放在 5v5 第 3、4 台之間的空隙，大丘放在陣線最前方，都不會壓到出生點；中央保持開闊
      features: mirrored([
        { kind: 'ellipse', cx: 0.275, cy: 0.668, rx: 0.014, ry: 0.03, op: 'add' },
        { kind: 'ellipse', cx: 0.445, cy: 0.668, rx: 0.026, ry: 0.036, op: 'add' },
      ]),
    },
    sky: { top: '#5fb4f0', bottom: '#fff1c4' },
    props: { spacing: [90, 210] },
    maxWind: 5,
    debrisColors: [0xe2ad45, 0x6e4428, 0x7da447],
  },
  volcano_gorge: {
    id: 'volcano_gorge',
    theme: 'volcano_rift',
    name: '熔岩火山裂谷 (Volcano Gorge)',
    badge: '2800 × 1250 · 高台 + 深谷 + 石拱',
    description: '兩側是黑曜岩高台，中央是熔岩照亮的深谷，一道天然石拱橫跨谷口；必須高仰角越過石拱，或用重砲把石拱轟塌。',
    width: 2800,
    height: 1250,
    // 兩側高台：基準線偏高、起伏中等
    waveProfile: {
      baseHeightRatio: 0.5,
      amp1: [30, 48],
      amp2: [14, 24],
      amp3: [5, 10],
      wavelength1: 230,
      wavelength2: 95,
      wavelength3: 42,
      jitter: 8,
    },
    layout: {
      features: [
        // 中央深谷：出生點最遠到寬度 38.4%（5v5），谷口設在 39%~61%，不會壓到出生點
        { kind: 'ellipse', cx: 0.5, cy: 0.56, rx: 0.11, ry: 0.27, op: 'carve' },
        // 谷底平台（避免谷底是尖的，掉下去還能還擊）
        { kind: 'rect', x: 0.43, y: 0.8, w: 0.14, h: 0.2, op: 'add' },
        // 天然石拱：兩端落在兩側高台上，中段拱起
        { kind: 'bridge', x0: 0.34, x1: 0.66, y: 0.47, thickness: 0.03, shape: 'arch', bend: 0.07, endThickness: 0.08 },
      ],
    },
    sky: { top: '#2a0a10', bottom: '#d9653a' },
    props: { spacing: [110, 240] },
    maxWind: 9,
    debrisColors: [0x2b2226, 0x4a2a26, 0xff7a2a],
  },
  gale_coast: {
    id: 'gale_coast',
    theme: 'tropic_coast',
    name: '強風珊瑚海岸 (Gale Coast)',
    badge: '2600 × 1150 · 沙丘 + 對稱雙浮島',
    description: '白沙與珊瑚砂岩的熱帶海岸，信風終年把椰子樹吹彎；中央上空懸著兩座椰林浮島，強風讓拋物線大幅偏移。',
    width: 2600,
    height: 1150,
    waveProfile: {
      baseHeightRatio: 0.64,
      amp1: [60, 90],
      amp2: [20, 34],
      amp3: [5, 10],
      wavelength1: 300,
      wavelength2: 130,
      wavelength3: 55,
      jitter: 8,
    },
    layout: {
      features: mirrored([{ kind: 'island', cx: 0.45, y: 0.3, w: 0.08, depth: 0.06 }]),
    },
    sky: { top: '#3fc6e0', bottom: '#d9fbff' },
    props: { spacing: [100, 230] },
    maxWind: 14,
    debrisColors: [0xf3e2b8, 0xe8937e, 0xffffff],
  },

  // ───── 以下為多層 / 懸空版型地圖 ─────

  /** 階梯台地型：兩側階梯高台、中央寬闊凹谷，搶高地者佔優 */
  sphinx_steps: {
    id: 'sphinx_steps',
    theme: 'desert_temple',
    name: '黃沙階梯神殿 (Sphinx Steps)',
    badge: '2400 × 1150 · 兩側階梯高台',
    description: '沙漠古神殿：左右各三層石階高台、中央寬闊凹谷，地層厚實，搶下最高台就掌握戰局。',
    width: 2400,
    height: 1150,
    waveProfile: {
      baseHeightRatio: 0.74,
      amp1: [14, 24],
      amp2: [8, 14],
      amp3: [4, 8],
      wavelength1: 200,
      wavelength2: 90,
      wavelength3: 40,
    },
    layout: {
      features: [
        ...mirrored([
          { kind: 'rect', x: 0, y: 0.36, w: 0.14, h: 0.64, op: 'add' },
          { kind: 'rect', x: 0.14, y: 0.46, w: 0.08, h: 0.54, op: 'add' },
          { kind: 'rect', x: 0.22, y: 0.56, w: 0.07, h: 0.44, op: 'add' },
        ]),
        { kind: 'ellipse', cx: 0.5, cy: 0.73, rx: 0.2, ry: 0.13, op: 'carve' },
      ],
    },
    sky: { top: '#3b1f5c', bottom: '#f7a35c' },
    props: { spacing: [120, 260] },
    maxWind: 8,
    debrisColors: [0xf2c983, 0xd29558, 0xa96535],
  },

  /** 雙層懸谷型：上層薄地表越往中央越薄，下方另有一層 ∼ 形薄層，再往下就是深淵 */
  twin_valley: {
    id: 'twin_valley',
    theme: 'sky_meadow',
    name: '雙層斷崖谷 (Twin Valley)',
    badge: '2400 × 1200 · 雙層薄地 · 深淵',
    description: '雲海之上的斷崖谷：兩端厚實、中央極薄的懸空谷地，底下還有一層 ∼ 形薄層，打穿地面就會墜入深淵。',
    width: 2400,
    height: 1200,
    waveProfile: {
      baseHeightRatio: 0.6,
      amp1: [0, 0],
      amp2: [0, 0],
      amp3: [0, 0],
      wavelength1: 200,
      wavelength2: 100,
      wavelength3: 50,
    },
    layout: {
      baseMode: 'none',
      features: [
        { kind: 'bridge', x0: 0, x1: 1, y: 0.3, thickness: 0.035, shape: 'sag', bend: 0.2, endThickness: 0.24 },
        { kind: 'bridge', x0: 0.27, x1: 0.73, y: 0.8, thickness: 0.02, shape: 'wave', bend: 0.035, waves: 2 },
      ],
    },
    sky: { top: '#2b8fe0', bottom: '#d8f1ff' },
    props: { spacing: [110, 240] },
    maxWind: 9,
    debrisColors: [0x6cc04a, 0x8a5a3b, 0x7a4e33],
  },

  /** 吊橋型：橫跨全圖的 W 形吊橋，兩端橋墩厚實並埋有不可破壞基岩 */
  heaven_bridge: {
    id: 'heaven_bridge',
    theme: 'aurora_night',
    name: '極光天堂吊橋 (Heaven Bridge)',
    badge: '2600 × 1150 · W 形吊橋 · 強風',
    description: '極光下懸在雲端的 W 形冰橋，橋面薄、兩端橋墩厚，墩內埋有打不穿的基岩，上空還有一座險峻浮冰。',
    width: 2600,
    height: 1150,
    waveProfile: {
      baseHeightRatio: 0.6,
      amp1: [0, 0],
      amp2: [0, 0],
      amp3: [0, 0],
      wavelength1: 200,
      wavelength2: 100,
      wavelength3: 50,
    },
    layout: {
      baseMode: 'none',
      features: [
        { kind: 'bridge', x0: 0, x1: 1, y: 0.48, thickness: 0.035, shape: 'w', bend: 0.09, endThickness: 0.3 },
        ...mirrored([{ kind: 'rect', x: 0, y: 0.55, w: 0.035, h: 0.08, op: 'bedrock' }]),
        { kind: 'island', cx: 0.5, y: 0.2, w: 0.07, depth: 0.05 },
      ],
    },
    sky: { top: '#050a1f', bottom: '#173a63' },
    props: { spacing: [120, 260] },
    maxWind: 12,
    debrisColors: [0xf2f8ff, 0x9fd0f0, 0x4c7fb3],
  },

  /** 浮空群島型：三座大浮島 + 小跳島，底部一層薄地 */
  floating_isles: {
    id: 'floating_isles',
    theme: 'sky_meadow',
    name: '翡翠浮空群島 (Floating Isles)',
    badge: '2600 × 1250 · 三大浮島 · 薄底層',
    description: '雲海之上，左右與中央三座大浮島（島心為不可破壞基岩），中間散落小跳島，底部只有一層薄地。',
    width: 2600,
    height: 1250,
    waveProfile: {
      baseHeightRatio: 0.88,
      amp1: [20, 34],
      amp2: [10, 18],
      amp3: [5, 10],
      wavelength1: 220,
      wavelength2: 100,
      wavelength3: 44,
    },
    layout: {
      baseThickness: 70,
      features: [
        { kind: 'ellipse', cx: 0.5, cy: 0.92, rx: 0.1, ry: 0.07, op: 'add' },
        ...mirrored([
          { kind: 'island', cx: 0.16, y: 0.42, w: 0.24, depth: 0.2 },
          { kind: 'ellipse', cx: 0.16, cy: 0.56, rx: 0.025, ry: 0.035, op: 'bedrock' },
          { kind: 'island', cx: 0.33, y: 0.62, w: 0.08, depth: 0.05 },
        ]),
        { kind: 'island', cx: 0.5, y: 0.3, w: 0.18, depth: 0.14 },
      ],
    },
    sky: { top: '#3aa0ea', bottom: '#e6f6ff' },
    props: { spacing: [90, 210] },
    maxWind: 10,
    debrisColors: [0x6cc04a, 0x8a5a3b, 0x7a4e33],
  },

  /** 薄地基岩型：極薄的懸空地表，下方散布不可破壞的半圓基岩，中央聳立高塔 */
  templar_ruins: {
    id: 'templar_ruins',
    theme: 'moon_ruins',
    name: '鐵壁神殿遺跡 (Templar Ruins)',
    badge: '2800 × 1250 · 極薄地表 · 基岩避難所',
    description: '月光下的古老神殿廢墟：地表薄到一兩發就能打穿，底下散落打不壞的半圓基岩可當避難所，中央鐘塔擋住低平彈道。',
    width: 2800,
    height: 1250,
    waveProfile: {
      baseHeightRatio: 0.5,
      amp1: [70, 110],
      amp2: [30, 50],
      amp3: [10, 20],
      wavelength1: 240,
      wavelength2: 105,
      wavelength3: 46,
    },
    layout: {
      baseThickness: 46,
      features: [
        ...mirrored([
          { kind: 'ellipse', cx: 0.1, cy: 1, rx: 0.05, ry: 0.12, op: 'bedrock' },
          { kind: 'ellipse', cx: 0.3, cy: 1, rx: 0.045, ry: 0.1, op: 'bedrock' },
        ]),
        { kind: 'ellipse', cx: 0.5, cy: 1, rx: 0.05, ry: 0.11, op: 'bedrock' },
        { kind: 'rect', x: 0.485, y: 0.2, w: 0.03, h: 0.42, op: 'add' },
        { kind: 'rect', x: 0.48, y: 0.19, w: 0.04, h: 0.02, op: 'bedrock' },
      ],
    },
    sky: { top: '#1a1035', bottom: '#8a4a8f' },
    props: { spacing: [130, 280] },
    maxWind: 10,
    debrisColors: [0xa597b0, 0x52404c, 0x6d8f4e],
  },
}

export const MAP_LIST: MapBlueprint[] = Object.values(MAP_REGISTRY)

/** 實際有用到的美術主題（BattleScene 依此載入素材，避免同一主題重複載入） */
export const MAP_THEMES: MapThemeId[] = [...new Set(MAP_LIST.map((m) => m.theme))]
