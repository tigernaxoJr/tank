/**
 * BattleScene (Phaser 3 Canvas 戰場渲染引擎)
 *
 * 架構定位 (VSA + Pragmatic DDD)：
 * - 物理與狀態同步仍 100% 由確定性核心 (`TankCorePort` + `BattleState`) 驅動，確保 WebRTC P2P 跨瀏覽器零誤差。
 *   本檔只負責「看起來」的部分：任何隨機性（粒子、裝飾擺放抖動）都不會回寫到戰鬥狀態。
 * - 地圖主題與坦克 / 砲彈為原創程式繪製美術（public/assets/maps/、public/assets/units/），
 *   木箱油桶、太陽、爆炸序列影格來自 Kenney CC0（public/assets/kenney/）：
 *   天空漸層 → 隨風飄移的雲層 → 遠山 → 中丘 → 近丘（手動視差） → 可破壞地形（地表磚/土壤磚逐像素取樣）
 *   → 地表裝飾（主題裝飾/木箱，會被炸飛或隨地形下墜） → 坦克 → 砲彈與爆炸序列影格。
 * - 使用 Canvas Renderer（不支援 tint），所以配色差異一律在烘焙階段完成，執行期不做 setTint。
 */
import Phaser from 'phaser'
import type { BulletType } from '@/shared/kernel/types'
import { BEDROCK, DeterministicRng, type DirtyRect, type TankCorePort } from '@/shared/wasm'
import { launchVelocity, MUZZLE_RISE, worldAimAngle, type BattleState, type TankEntity } from '../domain/battleState'
import {
  generatedAssetUrl,
  hasAbyss,
  MAP_REGISTRY,
  MAP_THEMES,
  mapAssetUrl,
  THEME_REGISTRY,
  type MapBlueprint,
} from '../domain/mapRegistry'
import {
  MIN_FLIGHT_MS,
  PLAYBACK_MS_PER_STEP,
  PROJECTILE_LIST,
  getProjectileSpec,
  type ProjectileBlueprint,
  type GlowKey,
  type ProjectileFx,
} from '../domain/projectileRegistry'
import { traceShell } from '../domain/shellFlight'
import { hasStatusFlag, visibleStatuses } from '../domain/statusEffects'
import { TANK_LIST, effectiveWindMilli, getTankSpec } from '../domain/tankRegistry'
import { TankFace } from './tankFace'
import { BattleCameraManager } from './systems/BattleCameraManager'
import { ProjectileFxSystem } from './systems/ProjectileFxSystem'

const TILE = 128
const KENNEY = './assets/kenney'
/** 原創坦克 / 砲彈 / 粒子美術（tools/assets/paint_units.mjs） */
const UNITS = './assets/units'
const UNIT_FX = ['glow_fire', 'glow_plasma', 'glow_toxic', 'glow_ice', 'spark', 'shockwave'] as const
const BACKDROP_FILES = ['clouds_far', 'mountains', 'hills_far', 'hills_near'] as const
const COMMON_PROPS = ['crateWood', 'crateAmmo', 'barrelRed', 'barrelGrey'] as const
/** 瞄準預覽只畫出彈道前段，保留判斷落點的技術含量（偵察狀態下畫完整彈道） */
const AIM_PREVIEW_STEPS = 60
/** 戰場鏡頭縮放：畫面高度低於 VIEW_TARGET_H 時拉遠（手機橫拿），最遠縮到 MIN_ZOOM；高度足夠就維持 1:1 */
const VIEW_TARGET_H = 640
const MIN_ZOOM = 0.5
/** 坦克車身底部相對容器原點的位移（容器原點 = 地表上方 TANK_GROUND_OFFSET） */
const HULL_BASE_Y = 14

type BackdropFile = (typeof BACKDROP_FILES)[number]

interface ParallaxLayer {
  file: BackdropFile
  tile: Phaser.GameObjects.TileSprite
  fill: Phaser.GameObjects.Rectangle
  baseY: number
  factorX: number
  factorY: number
}

interface TankVisualActor {
  container: Phaser.GameObjects.Container
  rig: Phaser.GameObjects.Container
  barrel: Phaser.GameObjects.Image
  hull: Phaser.GameObjects.Image
  nameTag: Phaser.GameObjects.Text
  /** 名牌上方的狀態圖示列（中毒、冰凍…），文字 = 圖示 + 剩餘回合 */
  statusTag: Phaser.GameObjects.Text
  statusKey: string
  hpBarGraphics: Phaser.GameObjects.Graphics
  turnArrow: Phaser.GameObjects.Triangle
  face: TankFace
  /** 上一幀的血量，用來偵測受擊 */
  lastHp: number
  lastSmokeAt: number
}

interface PropActor {
  img: Phaser.GameObjects.Image
  x: number
  /** 地表裝飾 = 腳底 y；懸掛裝飾 = 掛點 y（浮島 / 橋面底部） */
  baseY: number
  hanging?: boolean
}

/** 一顆彈丸的飛行路徑與落點 */
export interface ProjectileFlight {
  path: { x: number; y: number }[]
  explosionX: number
  explosionY: number
  /** 爆炸視覺半徑 (px)，取傷害範圍與挖坑半徑較大者 */
  explosionRadius: number
  /** 定時彈（`fuse`）：落地只濺一下、不爆炸，之後由場上的定時彈標記持續顯示倒數 */
  charge?: boolean
}

/** 引爆定時彈的演出：鏡頭先移到第一個爆心，`onImpact` 在爆炸瞬間套用地形與傷害畫面，停留後呼叫 `onComplete` */
export interface ChargeBurstOptions {
  bursts: readonly { x: number; y: number; radius: number; bulletType: BulletType }[]
  onImpact: () => void
  onComplete: () => void
}

export interface ProjectileFlightOptions {
  shooterId: string
  /** 一次開火的所有彈丸（單發 = 1 顆）；同時起飛，全部落地後才結算，鏡頭跟隨第一顆 */
  flights: ProjectileFlight[]
  bulletType: BulletType
  onArriveImpact: () => void
  onSequenceComplete: () => void
}

export class BattleScene extends Phaser.Scene {
  private battleState!: BattleState
  private core!: TankCorePort
  private onCameraMoved?: (camX: number, camY: number, viewW: number, viewH: number) => void

  private sky!: Phaser.GameObjects.Image
  private sun!: Phaser.GameObjects.Image
  private layers: ParallaxLayer[] = []
  private cloudDrift = 0
  private terrainCanvasTex: Phaser.Textures.CanvasTexture | null = null
  private terrainImage: Phaser.GameObjects.Image | null = null
  private aimGraphics!: Phaser.GameObjects.Graphics
  /** 地形每重畫一次就 +1，雷達縮圖與瞄準預覽靠它判斷快取是否過期 */
  terrainVersion = 0
  /** 上一次畫出的瞄準預覽參數；相同就不重算彈道，空字串代表目前沒有預覽 */
  private aimPreviewKey = ''

  private tankActors = new Map<string, TankVisualActor>()
  private chargeMarkers = new Map<
    string,
    {
      container: Phaser.GameObjects.Container
      ring: Phaser.GameObjects.Arc
      glow: Phaser.GameObjects.Image
      count: Phaser.GameObjects.Text
    }
  >()
  private props: PropActor[] = []
  /** 深淵地圖底部的雲海 / 霧氣漸層（世界座標，畫在地形後方） */
  private abyss: Phaser.GameObjects.Image | null = null
  private tilePixels = new Map<string, Uint8ClampedArray>()
  /**
   * 每個像素距離「原始地形中正上方最近的空氣」有多深：草皮/雪層只畫在原始地表（含浮空島、橋面、下層薄地），
   * 彈坑內壁露出土壤。多層地形無法只靠單一欄高判斷，所以逐像素記錄。
   */
  private originalDepth = new Uint16Array(0)

  private isCreated = false
  private cameraManager!: BattleCameraManager
  private fxSystem!: ProjectileFxSystem
  private flyingProjectile: Phaser.GameObjects.Container | null = null
  private selectedBulletType: BulletType = PROJECTILE_LIST[0].id
  /** 最近一發砲彈的射手，受擊時讓射手做出得意（或誤傷隊友時尷尬）的反應 */
  private lastShooterId: string | null = null
  /** 上一幀的「回合鍵」，變化時讓新的行動坦克做出輪到自己的反應 */
  private lastTurnKey = ''

  constructor() {
    super({ key: 'BattleScene' })
  }

  bindContext(
    state: BattleState,
    core: TankCorePort,
    onCameraMoved?: (camX: number, camY: number, viewW: number, viewH: number) => void,
  ): void {
    this.battleState = state
    this.core = core
    this.onCameraMoved = onCameraMoved
  }

  setSelectedBulletType(bullet: BulletType): void {
    this.selectedBulletType = bullet
  }

  preload(): void {
    for (const tank of TANK_LIST) {
      for (const team of ['A', 'B'] as const) {
        const sprites = tank.getSprites(team)
        this.load.image(`${tank.id}_${team}_hull`, sprites.hullUrl)
        this.load.image(`${tank.id}_${team}_barrel`, sprites.barrelUrl)
      }
      const atlas = tank.sprite.face.atlas
      if (atlas) this.load.image(atlas.key, atlas.url)
    }
    for (const theme of MAP_THEMES) {
      for (const file of [...BACKDROP_FILES, 'terrain_cap', 'terrain_fill']) {
        this.load.image(`${theme}_${file}`, mapAssetUrl(theme, `${file}.png`))
      }
      const spec = THEME_REGISTRY[theme]
      for (let i = 0; i < spec.propCount; i++) {
        this.load.image(`${theme}_prop${i}`, mapAssetUrl(theme, `prop${i}.png`))
      }
      for (let i = 0; i < spec.hangCount; i++) {
        this.load.image(`${theme}_hang${i}`, generatedAssetUrl(theme, `hang${i}.png`))
      }
      this.load.image(`${theme}_bedrock`, generatedAssetUrl(theme, 'bedrock.png'))
    }
    this.load.image('moon', generatedAssetUrl('_common', 'moon.png'))
    for (const name of [...COMMON_PROPS, 'sun']) {
      this.load.image(name, `${KENNEY}/props/${name}.png`)
    }
    for (const proj of PROJECTILE_LIST) {
      const key = proj.visual.sprite?.key
      if (key) this.load.image(key, `${UNITS}/projectiles/${key}.png`)
    }
    for (const fx of UNIT_FX) this.load.image(`fx_${fx}`, `${UNITS}/fx/${fx}.png`)
    this.load.spritesheet('fx_explosion', `${KENNEY}/fx/explosion.png`, { frameWidth: 192 })
    this.load.spritesheet('fx_flash', `${KENNEY}/fx/flash.png`, { frameWidth: 128 })
    this.load.spritesheet('fx_puff', `${KENNEY}/fx/puff.png`, { frameWidth: 96 })
    this.load.spritesheet('fx_smoke', `${KENNEY}/fx/smoke.png`, { frameWidth: 96 })
  }

  create(): void {
    for (const theme of MAP_THEMES) {
      for (const kind of ['terrain_cap', 'terrain_fill', 'bedrock']) {
        const pixels = this.readPixels(`${theme}_${kind}`)
        if (pixels) this.tilePixels.set(`${theme}_${kind}`, pixels)
      }
    }

    const anims: [string, number][] = [
      ['fx_explosion', 24],
      ['fx_flash', 36],
      ['fx_puff', 16],
      ['fx_smoke', 12],
    ]
    for (const [key, frameRate] of anims) {
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(key), frameRate })
    }

    const { width, height } = this.scale
    this.sky = this.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setScrollFactor(0).setDepth(0)
    this.sun = this.add.image(width * 0.8, 120, 'sun').setScrollFactor(0).setDepth(0.5).setScale(1.3)

    // [圖層, 鏡頭在頂端時的螢幕 Y, 水平視差, 垂直視差]
    const layerSpecs: [BackdropFile, number, number, number][] = [
      ['clouds_far', 120, 0.06, 0.04],
      ['mountains', 250, 0.15, 0.12],
      ['hills_far', 330, 0.3, 0.2],
      ['hills_near', 420, 0.45, 0.3],
    ]
    this.layers = layerSpecs.map(([file, baseY, factorX, factorY], i) => ({
      file,
      tile: this.add.tileSprite(0, baseY, width, 400, '__DEFAULT').setOrigin(0, 0).setScrollFactor(0).setDepth(1 + i * 0.1),
      fill: this.add.rectangle(0, baseY + 400, width, height, 0xffffff).setOrigin(0, 0).setScrollFactor(0).setDepth(1 + i * 0.1),
      baseY,
      factorX,
      factorY,
    }))
    // 雲層縮小並半透明，只露出雲頂輪廓在山後
    this.layers[0].tile.setTileScale(0.55).setAlpha(0.9)
    this.layoutBackdrop()
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutBackdrop, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutBackdrop, this)
    })

    this.aimGraphics = this.add.graphics().setDepth(15)
    this.isCreated = true

    const mapSpec = MAP_REGISTRY[this.battleState.mapId] ?? MAP_REGISTRY.harvest_plains
    this.cameraManager = new BattleCameraManager({
      scene: this,
      worldWidth: this.core.width,
      worldHeight: this.core.height,
      backgroundColor: mapSpec.sky.top,
      onCameraMoved: this.onCameraMoved,
    })
    this.fxSystem = new ProjectileFxSystem(
      this,
      () => MAP_REGISTRY[this.battleState?.mapId] ?? MAP_REGISTRY.harvest_plains,
    )

    this.rebuildBackdropAndTerrain()
    this.syncTanksVisuals(0, true)
    this.focusActiveTank(true)
  }

  update(time: number, delta: number): void {
    if (!this.battleState || !this.core) return
    const cam = this.cameras.main

    if (this.flyingProjectile) {
      // 投籃節奏鏡頭平滑追隨飛行中的砲彈
      this.cameraManager.followTarget(this.flyingProjectile.x, this.flyingProjectile.y, 0.22)
    } else if (!this.cameraManager.manualCamera && this.battleState.phase === 'AIMING') {
      const active = this.battleState.tanks[this.battleState.activePlayer]
      if (active) {
        // 坦克略低於視野中心（0.08 個視野高）；縮放後視野高 = 畫布高 / zoom
        const targetX = active.x - cam.width / 2
        const targetY = active.y - cam.height / 2 - (0.08 * cam.height) / cam.zoom
        cam.scrollX += (targetX - cam.scrollX) * 0.1
        cam.scrollY += (targetY - cam.scrollY) * 0.1
        this.cameraManager.notifyMoved()
      }
    }

    // 雲層隨當前風向飄移，讓玩家不看儀表也能感受風勢
    this.cloudDrift += this.battleState.wind * delta * 0.006
    for (const layer of this.layers) {
      const drift = layer.file === 'clouds_far' ? this.cloudDrift : 0
      layer.tile.tilePositionX = cam.scrollX * layer.factorX - drift
      layer.tile.y = this.backdropY(layer.baseY - cam.scrollY * layer.factorY)
      layer.fill.y = layer.tile.y + 399 / cam.zoom
    }

    this.syncTanksVisuals(time)
    this.syncChargeVisuals(time)
    this.drawAimPreview()
    this.cameraManager.notifyMoved()
  }

  /** 場上的定時彈：閃爍的殼 + 剩餘回合數 + 爆炸範圍的淡色圈；清單變動時自動新增 / 移除 */
  private syncChargeVisuals(time: number): void {
    const charges = this.battleState.charges ?? []
    const live = new Set<string>()
    for (const c of charges) {
      live.add(c.id)
      let marker = this.chargeMarkers.get(c.id)
      if (!marker) {
        const proj = getProjectileSpec(c.bulletType)
        const container = this.add.container(c.x, c.y).setDepth(9)
        const ring = this.add.circle(0, 0, c.damageRadius, proj.visual.glowColor, 0.1).setStrokeStyle(2, proj.visual.glowColor, 0.5)
        const glow = this.add
          .image(0, 0, proj.visual.fx.glow)
          .setScale((proj.visual.coreRadius * 5) / 64)
          .setAlpha(0.7)
          .setBlendMode(Phaser.BlendModes.ADD)
        // 有專屬彈體圖就用圖（黏殼彈），沒有就畫發光核心
        const shell = proj.visual.sprite
          ? this.add.image(0, 0, proj.visual.sprite.key).setScale(proj.visual.sprite.scale * 0.9)
          : this.add.circle(0, 0, proj.visual.coreRadius, proj.visual.coreColor, 1).setStrokeStyle(3, proj.visual.strokeColor)
        const count = this.add
          .text(0, 2, String(c.turnsLeft), {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '13px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#1d2340',
            strokeThickness: 3,
          })
          .setOrigin(0.5)
        container.add([ring, glow, shell, count])
        marker = { container, ring, glow, count }
        this.chargeMarkers.set(c.id, marker)
      }
      marker.count.setText(String(c.turnsLeft))
      marker.container.setPosition(c.x, c.y)
      const pulse = 0.5 + 0.5 * Math.sin(time / (c.turnsLeft <= 1 ? 110 : 260))
      marker.glow.setAlpha(0.45 + 0.4 * pulse)
      marker.ring.setAlpha(c.turnsLeft <= 1 ? 0.5 + 0.4 * pulse : 0.7)
    }
    for (const [id, marker] of this.chargeMarkers) {
      if (live.has(id)) continue
      marker.container.destroy()
      this.chargeMarkers.delete(id)
    }
  }

  /**
   * 引爆定時彈的演出：鏡頭平滑移到第一個爆心 → 爆炸（呼叫 `onImpact` 套用地形 / 傷害畫面）→ 停留 → `onComplete`。
   * 場景尚未就緒時直接結算，不卡住回合。
   */
  playChargeBursts(options: ChargeBurstOptions): void {
    const { bursts, onImpact, onComplete } = options
    if (!this.scene.isActive() || !this.cameraManager || bursts.length === 0) {
      onImpact()
      onComplete()
      return
    }
    const cam = this.cameras.main
    const first = bursts[0]
    const from = { x: cam.midPoint.x, y: cam.midPoint.y }
    const state = { t: 0 }
    this.cameraManager.manualCamera = true
    this.tweens.add({
      targets: state,
      t: 1,
      duration: 650,
      ease: 'Sine.InOut',
      onUpdate: () => this.cameraManager.centerOn(from.x + (first.x - from.x) * state.t, from.y + (first.y - from.y) * state.t),
      onComplete: () => {
        onImpact()
        for (const b of bursts) this.triggerExplosionVisual(b.x, b.y, b.radius, b.bulletType)
        this.time.delayedCall(getProjectileSpec(first.bulletType).postImpactHoldMs, () => {
          this.cameraManager.manualCamera = false
          onComplete()
        })
      },
    })
  }

  /** 畫布尺寸隨視窗改變 (Scale.RESIZE)，背景圖層跟著撐滿寬高 */
  private layoutBackdrop(): void {
    const { width, height } = this.scale
    // 手機畫面矮：鏡頭拉遠，讓視野高度約 VIEW_TARGET_H 個世界 px（桌面維持 1:1，不放大）
    const zoom = Math.max(MIN_ZOOM, Math.min(1, height / VIEW_TARGET_H))
    this.cameras.main.setZoom(zoom)
    // 背景全部固定在螢幕座標（scrollFactor 0），但鏡頭縮放會連它們一起縮：反向放大並以畫面中心換算位置，視覺上維持不縮
    const inv = 1 / zoom
    this.sky.setDisplaySize(width * inv, height * inv).setPosition(this.backdropX(0), this.backdropY(0))
    const mapId = this.battleState?.mapId
    const celestial = THEME_REGISTRY[(mapId && MAP_REGISTRY[mapId]?.theme) || 'harvest_farm'].celestial
    this.sun.setPosition(this.backdropX(width * celestial.x), this.backdropY(celestial.y)).setScale((celestial.kind === 'sun' ? 1.3 : 1) * inv)
    for (const layer of this.layers) {
      layer.tile.setSize(width, layer.file === 'clouds_far' ? 220 : 400).setScale(inv).setX(this.backdropX(0))
      layer.fill.setSize(width, height).setScale(inv).setX(this.backdropX(0))
    }
    this.cameraManager?.notifyMoved()
  }

  /** 螢幕座標 → 鏡頭縮放後仍顯示在原位的物件座標（只適用 scrollFactor 0 的背景） */
  private backdropX(x: number): number {
    const cx = this.scale.width / 2
    return cx + (x - cx) / this.cameras.main.zoom
  }

  private backdropY(y: number): number {
    const cy = this.scale.height / 2
    return cy + (y - cy) / this.cameras.main.zoom
  }

  private readPixels(key: string): Uint8ClampedArray | null {
    const src = this.textures.get(key)?.getSourceImage() as HTMLImageElement | undefined
    if (!src || src.width <= 0) return null
    const c = document.createElement('canvas')
    c.width = TILE
    c.height = TILE
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(src, 0, 0, TILE, TILE)
    return ctx.getImageData(0, 0, TILE, TILE).data
  }

  private ensureSkyTexture(map: MapBlueprint): string {
    const key = `sky_${map.id}`
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, 4, 256)
      if (tex) {
        const ctx = tex.getContext()
        const grad = ctx.createLinearGradient(0, 0, 0, 256)
        grad.addColorStop(0, map.sky.top)
        grad.addColorStop(1, map.sky.bottom)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, 4, 256)
        tex.refresh()
      }
    }
    return key
  }

  rebuildBackdropAndTerrain(): void {
    if (!this.isCreated || !this.battleState || !this.core) return
    const mapSpec = MAP_REGISTRY[this.battleState.mapId] ?? MAP_REGISTRY.harvest_plains
    const worldW = this.core.width
    const worldH = this.core.height

    this.cameras.main.setBounds(0, 0, worldW, worldH)
    this.cameras.main.setBackgroundColor(mapSpec.sky.top)

    this.sky.setTexture(this.ensureSkyTexture(mapSpec))

    for (const layer of this.layers) {
      const key = `${mapSpec.theme}_${layer.file}`
      layer.tile.setTexture(key)
      // 視差圖層底部以同色矩形延伸，避免鏡頭下移時露出天空
      const bottom = this.textures.getPixel(512, 398, key)
      layer.fill.setFillStyle(bottom ? bottom.color : 0xffffff, bottom ? bottom.alpha / 255 : 1)
      layer.fill.setVisible(layer.file !== 'clouds_far')
    }
    const celestial = THEME_REGISTRY[mapSpec.theme].celestial
    this.sun.setVisible(celestial.kind !== 'none')
    if (celestial.kind !== 'none') this.sun.setTexture(celestial.kind)
    this.layoutBackdrop()
    this.rebuildAbyss(mapSpec, worldW, worldH)

    // 建立或重設可破壞地形 CanvasTexture（使用獨立 key 避免 Phaser TextureManager 重進場衝突）
    if (
      !this.terrainCanvasTex ||
      this.terrainCanvasTex.width !== worldW ||
      this.terrainCanvasTex.height !== worldH
    ) {
      if (this.terrainImage) {
        this.terrainImage.destroy()
        this.terrainImage = null
      }
      const texKey = `destructible_terrain_${Date.now()}`
      this.terrainCanvasTex = this.textures.createCanvas(texKey, worldW, worldH)
      if (this.terrainCanvasTex) {
        this.terrainImage = this.add.image(0, 0, texKey).setOrigin(0, 0).setDepth(5)
      }
    } else {
      this.terrainCanvasTex.getContext().clearRect(0, 0, worldW, worldH)
    }

    this.originalDepth = new Uint16Array(worldW * worldH)
    for (let x = 0; x < worldW; x++) {
      let runTop = -1
      for (let y = 0; y < worldH; y++) {
        if (this.core.isSolid(x, y)) {
          if (runTop < 0) runTop = y
          this.originalDepth[y * worldW + x] = Math.min(65535, y - runTop)
        } else {
          runTop = -1
        }
      }
    }

    this.redrawTerrain()
    this.placeProps(mapSpec)
  }

  redrawTerrain(dirty?: DirtyRect): void {
    if (!this.terrainCanvasTex || !this.core || !this.battleState) return
    const ctx = this.terrainCanvasTex.getContext()
    const coreW = this.core.width
    const coreH = this.core.height

    // 外擴 RIM 像素，讓彈坑外圈的焦黑描邊也一起重畫
    const RIM = 8
    const minX = dirty ? Math.max(0, (dirty.x | 0) - RIM) : 0
    const minY = dirty ? Math.max(0, (dirty.y | 0) - RIM) : 0
    const maxX = dirty ? Math.min(coreW, ((dirty.x + dirty.width) | 0) + RIM) : coreW
    const maxY = dirty ? Math.min(coreH, ((dirty.y + dirty.height) | 0) + RIM) : coreH

    const w = maxX - minX
    const h = maxY - minY
    if (w <= 0 || h <= 0) return

    const theme = (MAP_REGISTRY[this.battleState.mapId] ?? MAP_REGISTRY.harvest_plains).theme
    const cap = this.tilePixels.get(`${theme}_terrain_cap`)
    const fill = this.tilePixels.get(`${theme}_terrain_fill`)
    const bedrock = this.tilePixels.get(`${theme}_bedrock`)
    const imgData = ctx.createImageData(w, h)
    const data = imgData.data
    const core = this.core
    // 世界邊界視為實心，避免左右邊緣被誤判為彈坑邊緣
    const solidAt = (x: number, y: number) => x < 0 || x >= coreW || y >= coreH || core.isSolid(x, y)

    for (let localY = 0; localY < h; localY++) {
      const y = minY + localY
      for (let localX = 0; localX < w; localX++) {
        const x = minX + localX
        const material = core.materialAt(x, y)
        if (material === 0) continue
        const idx = (localY * w + localX) * 4
        if (material === BEDROCK) {
          this.paintBedrock(data, idx, x, y, solidAt, bedrock)
          continue
        }
        const depth = this.originalDepth[y * coreW + x] ?? 0
        const tx = x & (TILE - 1)
        let src: Uint8ClampedArray | undefined
        let sidx: number
        if (depth < TILE) {
          src = cap
          sidx = (Math.max(0, depth) * TILE + tx) * 4
        } else {
          src = fill
          sidx = ((depth & (TILE - 1)) * TILE + tx) * 4
        }

        // 越深越暗；彈坑邊緣 (挖出來的新表面) 加上焦黑描邊
        let shade = depth > 180 ? Math.max(0.72, 1 - (depth - 180) / 1400) : 1
        if (depth > 6) {
          if (!solidAt(x, y - 3) || !solidAt(x - 3, y) || !solidAt(x + 3, y)) shade *= 0.5
          else if (!solidAt(x, y - 8) || !solidAt(x - 7, y) || !solidAt(x + 7, y)) shade *= 0.76
        }
        // 浮島 / 橋面 / 洞頂的底面背光：讓懸空地形有厚度感
        if (!solidAt(x, y + 3)) shade *= 0.6
        else if (!solidAt(x, y + 9)) shade *= 0.8

        if (src) {
          data[idx] = src[sidx] * shade
          data[idx + 1] = src[sidx + 1] * shade
          data[idx + 2] = src[sidx + 2] * shade
        } else {
          data[idx] = 150 * shade
          data[idx + 1] = 100 * shade
          data[idx + 2] = 60 * shade
        }
        data[idx + 3] = 255
      }
    }

    ctx.putImageData(imgData, minX, minY)
    this.terrainCanvasTex.refresh()
    this.terrainVersion++
  }

  /** 不可破壞基岩：取主題的 bedrock 紋理（缺圖時退回程式石磚紋），外露頂面加高光、底面背光 */
  private paintBedrock(
    data: Uint8ClampedArray,
    idx: number,
    x: number,
    y: number,
    solidAt: (x: number, y: number) => boolean,
    tile?: Uint8ClampedArray,
  ): void {
    let r: number
    let g: number
    let b: number
    let shade = 1
    if (tile) {
      const sidx = ((y & (TILE - 1)) * TILE + (x & (TILE - 1))) * 4
      r = tile[sidx]
      g = tile[sidx + 1]
      b = tile[sidx + 2]
    } else {
      const BW = 44
      const BH = 22
      const row = Math.floor(y / BH)
      const bx = (x + (row & 1) * (BW / 2)) % BW
      const by = y % BH
      const brick = Math.floor((x + (row & 1) * (BW / 2)) / BW) * 7 + row * 13
      shade = 0.85 + (((brick * 2654435761) >>> 24) / 255) * 0.2
      if (bx < 2 || by < 2) shade = 0.48
      else if (bx < 4 || by < 4) shade *= 1.15
      r = 104
      g = 110
      b = 128
    }
    if (!solidAt(x, y - 2) || !solidAt(x - 2, y) || !solidAt(x + 2, y)) shade *= 1.35
    else if (!solidAt(x, y + 3)) shade *= 0.65
    data[idx] = Math.min(255, r * shade)
    data[idx + 1] = Math.min(255, g * shade)
    data[idx + 2] = Math.min(255, b * shade)
    data[idx + 3] = 255
  }

  /** 深淵地圖：戰場最底部畫一道由透明漸變到雲海 / 霧氣色的帶子（在地形後方，不遮擋戰鬥） */
  private rebuildAbyss(map: MapBlueprint, worldW: number, worldH: number): void {
    this.abyss?.destroy()
    this.abyss = null
    if (!hasAbyss(map)) return
    const key = `abyss_${map.id}`
    if (!this.textures.exists(key)) {
      const near = this.textures.getPixel(512, 398, `${map.theme}_hills_near`)
      const rgb = near ? `${near.red},${near.green},${near.blue}` : '255,255,255'
      const tex = this.textures.createCanvas(key, 4, 256)
      if (tex) {
        const ctx = tex.getContext()
        const grad = ctx.createLinearGradient(0, 0, 0, 256)
        grad.addColorStop(0, `rgba(${rgb},0)`)
        grad.addColorStop(0.55, `rgba(${rgb},0.55)`)
        grad.addColorStop(1, `rgba(${rgb},0.95)`)
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, 4, 256)
        tex.refresh()
      }
    }
    const bandH = Math.round(worldH * 0.26)
    this.abyss = this.add.image(0, worldH - bandH, key).setOrigin(0, 0).setDisplaySize(worldW, bandH).setDepth(3)
  }

  /** 依地圖種子確定性地在地表擺放樹木、仙人掌與木箱（純裝飾，不參與碰撞） */
  private placeProps(map: MapBlueprint): void {
    for (const p of this.props) p.img.destroy()
    this.props = []
    const rng = new DeterministicRng((this.battleState.seed * 31 + 7) >>> 0)
    const tanks = Object.values(this.battleState.tanks)
    const [minGap, maxGap] = map.props.spacing
    let x = 40 + rng.nextRange(0, maxGap)
    while (x < this.core.width - 40) {
      const nearTank = tanks.some((t) => Math.abs(t.x - x) < 70)
      if (!nearTank) {
        const useCrate = rng.nextRange(0, 9) === 0
        const key = useCrate
          ? COMMON_PROPS[rng.nextRange(0, COMMON_PROPS.length - 1)]
          : `${map.theme}_prop${rng.nextRange(0, THEME_REGISTRY[map.theme].propCount - 1)}`
        const tex = this.textures.get(key).getSourceImage() as HTMLImageElement
        const targetH = useCrate ? 40 : rng.nextRange(45, 105)
        const scale = Math.min(useCrate ? 0.42 : 0.9, targetH / Math.max(1, tex.height))
        const surface = this.core.surfaceY(x)
        // 深淵欄位（吊橋、浮空島之間的空隙）與不可破壞基岩上不擺裝飾
        if (surface >= this.core.height || this.core.materialAt(x, surface) === BEDROCK) {
          x += rng.nextRange(minGap, maxGap)
          continue
        }
        const baseY = surface + (useCrate ? 3 : 7)
        const img = this.add
          .image(x, baseY, key)
          .setOrigin(0.5, 1)
          .setScale(scale)
          .setFlipX(rng.nextRange(0, 1) === 1)
          .setDepth(useCrate ? 6 : 4)
        this.props.push({ img, x, baseY })
      }
      x += rng.nextRange(minGap, maxGap)
    }
    this.placeHangingProps(map)
  }

  /** 浮島、橋面、懸空地表底下掛上樹根 / 藤蔓 / 冰柱 / 鎖鏈（純裝飾，掛點被炸掉就掉落） */
  private placeHangingProps(map: MapBlueprint): void {
    const count = THEME_REGISTRY[map.theme].hangCount
    if (count <= 0) return
    const rng = new DeterministicRng((this.battleState.seed * 17 + 101) >>> 0)
    const core = this.core
    let x = 30 + rng.nextRange(0, 60)
    while (x < core.width - 30) {
      let runTop = -1
      for (let y = 0; y < core.height - 1; y++) {
        const solid = core.isSolid(x, y)
        if (solid && runTop < 0) runTop = y
        if (!solid) runTop = -1
        // 底面：上方至少 14px 實心、下方至少 70px 懸空
        if (solid && !core.isSolid(x, y + 1) && runTop >= 0 && y - runTop >= 14) {
          let gap = 0
          while (gap < 70 && y + 1 + gap < core.height && !core.isSolid(x, y + 1 + gap)) gap++
          if (gap >= 70 && rng.nextRange(0, 99) < 60) {
            const key = `${map.theme}_hang${rng.nextRange(0, count - 1)}`
            const tex = this.textures.get(key).getSourceImage() as HTMLImageElement
            const scale = rng.nextRange(55, 100) / 100
            const img = this.add
              .image(x, y - 3, key)
              .setOrigin(0.5, 0)
              .setScale(Math.min(1.1, scale * (90 / Math.max(1, tex.height))))
              .setFlipX(rng.nextRange(0, 1) === 1)
              .setDepth(4)
            this.props.push({ img, x, baseY: y, hanging: true })
          }
        }
      }
      x += rng.nextRange(45, 120)
    }
  }

  /** 地形被炸開後：爆心附近的裝飾被炸飛，其餘失去支撐者下墜到新地表 */
  onTerrainCarved(cx: number, cy: number, radius: number): void {
    if (!this.isCreated) return
    const survivors: PropActor[] = []
    for (const prop of this.props) {
      if (prop.hanging) {
        // 掛點附近被炸、或上方支撐的地形沒了：鬆脫掉進深淵
        const nearBlast = Math.hypot(prop.x - cx, prop.baseY - cy) < radius + 16
        if (nearBlast || !this.core.isSolid(prop.x, prop.baseY - 1)) {
          this.tweens.add({
            targets: prop.img,
            y: prop.img.y + 220,
            angle: (Math.random() - 0.5) * 60,
            alpha: 0,
            duration: 900,
            ease: 'Quad.In',
            onComplete: () => prop.img.destroy(),
          })
          continue
        }
        survivors.push(prop)
        continue
      }
      const midY = prop.baseY - prop.img.displayHeight / 2
      const dx = prop.x - cx
      const dist = Math.min(Math.hypot(dx, prop.baseY - cy), Math.hypot(dx, midY - cy))
      if (dist < radius + 12) {
        const dir = dx >= 0 ? 1 : -1
        this.spawnPuff(prop.x, midY, 0.5, 'fx_puff')
        this.tweens.add({
          targets: prop.img,
          x: prop.x + dir * (60 + Math.random() * 60),
          y: prop.baseY - 80 - Math.random() * 40,
          angle: dir * (120 + Math.random() * 120),
          alpha: 0,
          duration: 650,
          ease: 'Quad.Out',
          onComplete: () => prop.img.destroy(),
        })
        continue
      }
      // 從裝飾原本的腳下往下找，避免橋下 / 島下的裝飾被瞬移到上層
      const surface = this.core.groundBelow(prop.x, prop.baseY - 10)
      if (surface >= this.core.height) {
        prop.img.destroy()
        continue
      }
      const newBase = surface + 6
      if (newBase > prop.baseY + 2) {
        prop.baseY = newBase
        this.tweens.add({ targets: prop.img, y: newBase, duration: 380, ease: 'Bounce.Out' })
      }
      survivors.push(prop)
    }
    this.props = survivors
  }

  /**
   * 築壘彈堆出的土丘：重新計算新土的「距原始地表深度」，讓土丘頂端長出主題地表（草皮 / 雪層）而不是一片土色，再重繪。
   */
  onTerrainFilled(cx: number, cy: number, radius: number, dirty: DirtyRect): void {
    if (!this.isCreated || !this.core) return
    const w = this.core.width
    const rSq = radius * radius
    for (let x = Math.max(0, cx - radius); x <= Math.min(w - 1, cx + radius); x++) {
      for (let y = Math.max(0, cy - radius); y <= Math.min(this.core.height - 1, cy + radius); y++) {
        const dx = x - cx
        const dy = y - cy
        if (dx * dx + dy * dy > rSq || !this.core.isSolid(x, y)) continue
        let top = y
        while (top > 0 && this.core.isSolid(x, top - 1)) top--
        this.originalDepth[y * w + x] = Math.min(65535, y - top)
      }
    }
    this.redrawTerrain(dirty)
    this.spawnPuff(cx, cy - radius * 0.5, 0.6, 'fx_puff')
  }

  private syncTanksVisuals(time: number, snap = false): void {
    const currentIds = new Set(Object.keys(this.battleState.tanks))

    // 清理已不存在的 Actor
    for (const [id, actor] of this.tankActors.entries()) {
      if (!currentIds.has(id)) {
        actor.container.destroy()
        this.tankActors.delete(id)
      }
    }

    for (const tank of Object.values(this.battleState.tanks)) {
      let actor = this.tankActors.get(tank.id)
      const spec = getTankSpec(tank.tankId)

      if (!actor) {
        const container = this.add.container(tank.x, tank.y).setDepth(10)
        const rig = this.add.container(0, 0)
        const barrel = this.add.image(0, 0, `${spec.id}_${tank.team}_barrel`).setOrigin(0.08, 0.5)
        const hull = this.add.image(0, HULL_BASE_Y, `${spec.id}_${tank.team}_hull`).setOrigin(0.5, 1)
        const face = new TankFace(this, spec.sprite.face)
        // 貼地陰影：畫在地表上、跟著坡度轉，腳少、底盤高的機種（毒蠍）才不會看起來浮空
        const shadowW = hull.width * spec.sprite.scale * 0.82
        const shadow = this.add.ellipse(0, HULL_BASE_Y - 1.5, shadowW, 7, 0x241e33, 0.24)
        rig.add([shadow, barrel, hull, ...face.objects])

        const hpBarGraphics = this.add.graphics()
        const nameTag = this.add
          .text(0, -62 - (spec.sprite.labelLift ?? 0), tank.name, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11px',
            fontStyle: 'bold',
            color: '#ffffff',
            backgroundColor: tank.team === 'A' ? '#c2410c' : '#1d4ed8',
            padding: { x: 6, y: 2 },
          })
          .setOrigin(0.5, 0.5)

        const turnArrow = this.add
          .triangle(0, -84 - (spec.sprite.labelLift ?? 0), 0, 10, -7, 0, 7, 0, 0xfacc15)
          .setStrokeStyle(2, 0x0f172a)
        const statusTag = this.add
          .text(0, -76 - (spec.sprite.labelLift ?? 0), '', {
            fontFamily: 'system-ui, sans-serif',
            fontSize: '11px',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#241e33',
            strokeThickness: 3,
          })
          .setOrigin(0.5, 0.5)

        container.add([rig, hpBarGraphics, nameTag, statusTag, turnArrow])
        actor = {
          container,
          rig,
          barrel,
          hull,
          nameTag,
          statusTag,
          statusKey: '',
          hpBarGraphics,
          turnArrow,
          face,
          lastHp: tank.hp,
          lastSmokeAt: 0,
        }
        this.tankActors.set(tank.id, actor)
        snap = true
      }

      this.updateSingleTankActor(actor, tank, time, snap)
    }

    const { phase, activePlayer } = this.battleState
    const turnKey = phase === 'AIMING' ? activePlayer : ''
    if (turnKey !== this.lastTurnKey) {
      this.lastTurnKey = turnKey
      this.tankActors.get(turnKey)?.face.trigger('turnStart', time)
    }
  }

  /** 血量下降：受擊者驚嚇暈眩，射手依命中對象得意或尷尬 */
  private reactToDamage(victim: TankEntity, time: number): void {
    this.tankActors.get(victim.id)?.face.trigger('hurt', time)
    const shooterId = this.lastShooterId
    if (!shooterId || shooterId === victim.id) return
    const shooter = this.battleState.tanks[shooterId]
    const shooterActor = this.tankActors.get(shooterId)
    if (!shooter || shooter.hp <= 0 || !shooterActor) return
    shooterActor.face.trigger(shooter.team === victim.team ? 'oops' : 'smug', time + 250)
  }

  private updateSingleTankActor(actor: TankVisualActor, tank: TankEntity, time: number, snap: boolean): void {
    const spec = getTankSpec(tank.tankId)
    const { container, rig, hull, barrel } = actor

    // 地形被挖空時平滑下墜，而不是瞬移
    if (snap) {
      container.setPosition(tank.x, tank.y)
    } else {
      container.x += (tank.x - container.x) * 0.35
      const dy = tank.y - container.y
      container.y = Math.abs(dy) < 0.5 ? tank.y : container.y + Math.sign(dy) * Math.max(1.5, Math.abs(dy) * 0.16)
    }

    if (tank.hp < actor.lastHp) this.reactToDamage(tank, time)
    actor.lastHp = tank.hp

    const facingLeft = tank.angle > 90
    const slopeRad = Phaser.Math.DegToRad(tank.slopeDeg)
    const isDead = tank.hp <= 0
    const isActive = this.battleState.phase === 'AIMING' && this.battleState.activePlayer === tank.id
    const pose = actor.face.update({
      time,
      dead: isDead,
      facingLeft,
      isActive,
      phase: this.battleState.phase,
      outcome:
        this.battleState.phase !== 'GAME_OVER' || this.battleState.winner === 'draw' || !this.battleState.winner
          ? null
          : this.battleState.winner === tank.team
            ? 'win'
            : 'lose',
      hpPct: Math.max(0, tank.hp / tank.maxHp),
      look: this.faceLookDirection(tank, slopeRad, isActive),
    })
    rig.setRotation(slopeRad + pose.rot)
    rig.y = pose.y
    actor.face.setAlpha(isDead ? 0.75 : 1)

    hull.setTexture(`${spec.id}_${tank.team}_hull`).setScale(spec.sprite.scale).setFlipX(facingLeft)
    barrel
      .setTexture(`${spec.id}_${tank.team}_barrel`)
      .setScale(spec.sprite.scale)
      .setPosition(facingLeft ? -spec.sprite.pivotX : spec.sprite.pivotX, spec.sprite.pivotY)
      .setFlipY(facingLeft)

    if (isDead) {
      // 殘骸：半透明、砲管低垂、持續冒黑煙
      hull.setAlpha(0.55)
      barrel.setAlpha(0.55).setRotation((facingLeft ? Math.PI - 0.35 : 0.35) - slopeRad)
      actor.turnArrow.setVisible(false)
      actor.statusTag.setVisible(false)
      actor.nameTag.setText(`💀 ${tank.name}`).setAlpha(0.7)
      actor.hpBarGraphics.clear()
      if (time - actor.lastSmokeAt > 450) {
        actor.lastSmokeAt = time
        this.spawnPuff(container.x + (Math.random() - 0.5) * 14, container.y - 20, 0.28, 'fx_smoke', 9)
      }
      return
    }

    hull.setAlpha(1)
    // 砲管角度相對車體：rig 已經帶著坡度旋轉，砲管只需要自己的相對角
    barrel.setAlpha(1).setRotation(-Phaser.Math.DegToRad(tank.angle))
    actor.nameTag.setText(tank.name).setAlpha(1)

    // 繪製血條
    const barW = 54
    const barH = 7
    const barX = -barW / 2
    const lift = spec.sprite.labelLift ?? 0
    const barY = -48 - lift
    const hpPct = Math.max(0, Math.min(1, tank.hp / tank.maxHp))
    const fillColor = hpPct > 0.5 ? 0x22c55e : hpPct > 0.25 ? 0xfacc15 : 0xef4444

    actor.hpBarGraphics.clear()
    actor.hpBarGraphics.fillStyle(0x0f172a, 0.9)
    actor.hpBarGraphics.lineStyle(1.5, 0xffffff, 1)
    actor.hpBarGraphics.fillRoundedRect(barX, barY, barW, barH, 3)
    actor.hpBarGraphics.strokeRoundedRect(barX, barY, barW, barH, 3)
    if (hpPct > 0) {
      actor.hpBarGraphics.fillStyle(fillColor, 1)
      actor.hpBarGraphics.fillRect(barX + 1, barY + 1, Math.round((barW - 2) * hpPct), barH - 2)
    }

    // 護盾條（青色細條，疊在血條上緣）
    if (tank.maxShield > 0 && tank.shield > 0) {
      actor.hpBarGraphics.fillStyle(0x22d3ee, 1)
      actor.hpBarGraphics.fillRect(barX + 1, barY - 4, Math.round((barW - 2) * (tank.shield / tank.maxShield)), 3)
    }

    // 狀態圖示：只在內容變了才重設文字
    const statuses = visibleStatuses(tank)
    const statusKey = statuses.map((s) => `${s.spec.icon}${Math.max(1, s.turnsLeft)}`).join(' ')
    if (statusKey !== actor.statusKey) {
      actor.statusKey = statusKey
      actor.statusTag.setText(statusKey)
      if (statuses.length > 0) actor.statusTag.setColor(statuses[0].spec.color)
    }
    actor.statusTag.setVisible(statuses.length > 0)

    // 行動回合跳動箭頭（有狀態圖示時往上讓位）
    actor.turnArrow.setVisible(isActive)
    if (isActive) {
      actor.turnArrow.y = (statuses.length > 0 ? -96 : -84) - lift + Math.sin(time / 150) * 4
    }
  }

  /**
   * 視線（rig 區域座標的單位向量）：砲彈飛行中所有坦克盯著砲彈看，瞄準中看著砲管方向，其餘時間交給待機張望。
   */
  private faceLookDirection(tank: TankEntity, slopeRad: number, isActive: boolean): { x: number; y: number } | null {
    let wx: number
    let wy: number
    if (this.flyingProjectile) {
      wx = this.flyingProjectile.x - tank.x
      wy = this.flyingProjectile.y - (tank.y - 20)
    } else if (isActive) {
      const a = Phaser.Math.DegToRad(worldAimAngle(tank.angle, tank.slopeDeg))
      wx = Math.cos(a)
      wy = -Math.sin(a)
    } else {
      return null
    }
    const len = Math.hypot(wx, wy) || 1
    const c = Math.cos(-slopeRad)
    const s = Math.sin(-slopeRad)
    return { x: (wx * c - wy * s) / len, y: (wx * s + wy * c) / len }
  }

  /** 砲口世界座標（依坦克實際顯示的砲管位置計算） */
  private muzzleWorldPoint(tankId: string): { x: number; y: number } | null {
    const actor = this.tankActors.get(tankId)
    if (!actor) return null
    const len = actor.barrel.displayWidth * 0.92
    const local = new Phaser.Math.Vector2(
      actor.barrel.x + Math.cos(actor.barrel.rotation) * len,
      actor.barrel.y + Math.sin(actor.barrel.rotation) * len,
    ).rotate(actor.rig.rotation)
    return { x: actor.container.x + local.x, y: actor.container.y + local.y }
  }

  private drawAimPreview(): void {
    const activeTank = this.battleState.tanks[this.battleState.activePlayer]
    const visible = this.battleState.phase === 'AIMING' && !this.flyingProjectile && !!this.core && !!activeTank && activeTank.hp > 0
    if (!visible) {
      if (this.aimPreviewKey !== '') {
        this.aimGraphics.clear()
        this.aimPreviewKey = ''
      }
      return
    }

    const projSpec = getProjectileSpec(this.selectedBulletType)
    // 偵察狀態：畫出完整彈道（含跳彈、高拋穿地）與落點；平常只畫前段
    const full = hasStatusFlag(activeTank, 'fullAimPreview')
    const key = [
      activeTank.id, activeTank.x, activeTank.y, activeTank.angle, activeTank.power, activeTank.slopeDeg,
      this.battleState.wind, this.selectedBulletType, full, this.terrainVersion,
    ].join('|')
    if (key === this.aimPreviewKey) return
    this.aimPreviewKey = key
    this.aimGraphics.clear()

    const { vxMilli, vyMilli } = launchVelocity(worldAimAngle(activeTank.angle, activeTank.slopeDeg), activeTank.power, projSpec.speedMultiplier)
    const launch = {
      startX: activeTank.x,
      startY: activeTank.y - MUZZLE_RISE,
      vxMilli,
      vyMilli,
      windMilli: effectiveWindMilli(this.battleState.wind, projSpec.windMultiplier, getTankSpec(activeTank.tankId)),
      gravityMilli: projSpec.gravityMilli,
      maxSteps: full ? 1200 : AIM_PREVIEW_STEPS,
    }
    const traced = full ? traceShell(this.core, launch, projSpec.flight) : traceShell(this.core, launch, projSpec.flight?.kind === 'lob' ? projSpec.flight : undefined)
    const path = traced[0].hit.path

    const dotColor = projSpec.visual.coreColor
    for (let i = 3; i < path.length; i += 2) {
      const pt = path[i]
      const alpha = full ? 0.85 : Math.max(0.15, 1 - i / path.length)
      this.aimGraphics.fillStyle(dotColor, alpha)
      this.aimGraphics.lineStyle(1.5, 0x0f172a, alpha)
      this.aimGraphics.fillCircle(pt.x, pt.y, full ? 2.6 : 3.2)
      this.aimGraphics.strokeCircle(pt.x, pt.y, full ? 2.6 : 3.2)
    }
    if (full) {
      // 落點準星（碎裂彈每片各一個）
      for (const { hit } of traced) {
        if (!hit.impactedTerrain && !hit.hitTank) continue
        this.aimGraphics.lineStyle(2.5, 0x241e33, 1)
        this.aimGraphics.strokeCircle(hit.hitX, hit.hitY, 11)
        this.aimGraphics.lineStyle(2, 0xfacc15, 1)
        this.aimGraphics.strokeCircle(hit.hitX, hit.hitY, 9)
        this.aimGraphics.lineBetween(hit.hitX - 15, hit.hitY, hit.hitX + 15, hit.hitY)
        this.aimGraphics.lineBetween(hit.hitX, hit.hitY - 15, hit.hitX, hit.hitY + 15)
      }
    }
  }

  private spawnPuff(x: number, y: number, scale: number, key: 'fx_puff' | 'fx_smoke', depth = 19): void {
    this.fxSystem?.spawnPuff(x, y, scale, key, depth)
  }

  /**
   * 播放模組化砲彈的「投籃節奏」拋物線飛行演出：
   * - 依 `ProjectileBlueprint` 決定飛行時間 (`minFlightMs` ~ `maxFlightMs`，約 1.6s ~ 3.3s)
   * - 飛行途中即時噴發專屬尾焰與煙霧粒子（參數見 `ProjectileFx`）
   * - 飛抵終點時觸發 `onArriveImpact`（挖坑與扣血），接著停留 `postImpactHoldMs` 讓玩家看清爆炸結果後再呼叫 `onSequenceComplete` 切換回合
   */
  playProjectileFlight(options: ProjectileFlightOptions): void {
    const { shooterId, flights, bulletType, onArriveImpact, onSequenceComplete } = options
    const projSpec = getProjectileSpec(bulletType)
    const showExplosions = (): void => {
      for (const f of flights) {
        if (f.charge) {
          // 黏住：小小一團濺開，不爆炸
          this.spawnPuff(f.explosionX, f.explosionY - 4, 0.34, 'fx_puff', 21)
          this.flashGlow(f.explosionX, f.explosionY, projSpec.visual.fx.glow, 0.7, 260)
        } else {
          this.triggerExplosionVisual(f.explosionX, f.explosionY, f.explosionRadius, bulletType)
        }
      }
    }

    if (!this.scene.isActive() || flights.length === 0 || flights.some((f) => f.path.length < 2)) {
      onArriveImpact()
      showExplosions()
      setTimeout(() => onSequenceComplete(), projSpec.postImpactHoldMs)
      return
    }

    if (this.cameraManager) this.cameraManager.manualCamera = false
    if (this.flyingProjectile) {
      this.flyingProjectile.destroy()
      this.flyingProjectile = null
    }

    // 砲口閃光 (Kenney Flash 序列) + 砲管後座
    const muzzle = this.muzzleWorldPoint(shooterId) ?? flights[0].path[0]
    const flash = this.add.sprite(muzzle.x, muzzle.y, 'fx_flash').setScale(0.32).setDepth(24)
    flash.play('fx_flash')
    flash.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => flash.destroy())
    this.flashGlow(muzzle.x, muzzle.y, projSpec.visual.fx.glow, 0.9, 220)
    const shooterActor = this.tankActors.get(shooterId)
    this.lastShooterId = shooterId
    if (shooterActor) {
      this.tweens.add({ targets: shooterActor.rig, scaleX: 0.92, duration: 70, yoyo: true })
      shooterActor.face.trigger('fire', this.game.loop.time)
    }

    let remaining = flights.length
    const onFlightDone = (): void => {
      if (--remaining > 0) return
      this.flyingProjectile = null

      // 1. 全部抵達落點：執行真實地形挖坑與傷害結算
      onArriveImpact()

      // 2. 播放該砲彈專屬爆炸序列與震動
      showExplosions()

      // 3. 停留 postImpactHoldMs 讓玩家看清楚命中結果與坦克下墜，再切換下一回合
      this.time.delayedCall(projSpec.postImpactHoldMs, () => {
        onSequenceComplete()
      })
    }
    flights.forEach((f, i) => this.launchFlight(f.path, muzzle, projSpec, i === 0, onFlightDone))
  }

  /** 播放單顆彈丸的飛行動畫；`primary` 的彈體供鏡頭跟隨與瞄準預覽參考 */
  private launchFlight(
    path: { x: number; y: number }[],
    muzzle: { x: number; y: number },
    projSpec: ProjectileBlueprint,
    primary: boolean,
    onDone: () => void,
  ): void {
    const fx = projSpec.visual.fx
    // 砲彈：實體彈使用 Kenney 彈體精靈並沿速度方向旋轉；能量彈畫發光核心
    const projContainer = this.add.container(muzzle.x, muzzle.y).setDepth(22)
    let body: Phaser.GameObjects.Image | null = null
    const spin = projSpec.visual.sprite?.spin ?? 0
    if (projSpec.visual.sprite) {
      // 疊加光暈讓彈體在任何背景上都醒目（Canvas 渲染器不能 tint，所以光暈貼圖本身就帶顏色）
      const halo = this.add
        .image(0, 0, fx.glow)
        .setScale((projSpec.visual.coreRadius * 4.2) / 64)
        .setAlpha(fx.haloAlpha)
        .setBlendMode(Phaser.BlendModes.ADD)
      body = this.add.image(0, 0, projSpec.visual.sprite.key).setScale(projSpec.visual.sprite.scale)
      projContainer.add([halo, body])
      this.tweens.add({ targets: halo, scale: halo.scale * 1.25, duration: 120, yoyo: true, repeat: -1 })
    } else {
      projContainer.add([
        this.add.circle(0, 0, projSpec.visual.coreRadius * 1.8, projSpec.visual.glowColor, 0.42),
        this.add
          .circle(0, 0, projSpec.visual.coreRadius, projSpec.visual.coreColor, 1)
          .setStrokeStyle(2.5, projSpec.visual.strokeColor),
      ])
    }
    if (primary) this.flyingProjectile = projContainer

    // 固定播放時鐘：路徑每點 = 2 個模擬步，不依射程縮放，視覺重力加速度才會一致
    const flightDuration = Math.max(MIN_FLIGHT_MS, (path.length - 1) * 2 * PLAYBACK_MS_PER_STEP)

    let lastTrailIndex = -1
    const tweenState = { t: 0 }

    this.tweens.add({
      targets: tweenState,
      t: 1,
      duration: flightDuration,
      ease: 'Linear',
      onUpdate: () => {
        const exactIdx = tweenState.t * (path.length - 1)
        const idx = Math.min(path.length - 1, Math.floor(exactIdx))
        const nextIdx = Math.min(path.length - 1, idx + 1)
        const frac = exactIdx - idx

        // 線性插值座標讓慢速飛行依然 60fps 絲滑不頓挫；前 10% 由砲口過渡到彈道起點
        let px = path[idx].x + (path[nextIdx].x - path[idx].x) * frac
        let py = path[idx].y + (path[nextIdx].y - path[idx].y) * frac
        const blend = Math.min(1, tweenState.t * 10)
        px = muzzle.x + (px - muzzle.x) * blend
        py = muzzle.y + (py - muzzle.y) * blend
        if (body) {
          if (spin) body.rotation += (spin * this.game.loop.delta) / 1000
          else body.setRotation(Math.atan2(py - projContainer.y, px - projContainer.x))
        }
        projContainer.setPosition(px, py)

        // 每隔固定步數釋放該砲彈專屬尾焰特效
        if (idx !== lastTrailIndex) {
          lastTrailIndex = idx
          this.spawnTrailParticle(px, py, fx)
        }
      },
      onComplete: () => {
        projContainer.destroy()
        onDone()
      },
    })
  }

  /** 疊加混色的光暈閃一下（砲口、尾焰、爆炸核心） */
  private flashGlow(x: number, y: number, key: GlowKey, size: number, duration: number, depth = 21): void {
    this.fxSystem?.flashGlow(x, y, key, size, duration, depth)
  }

  private spawnTrailParticle(x: number, y: number, fx: ProjectileFx): void {
    this.fxSystem?.spawnTrailParticle(x, y, fx)
  }

  triggerExplosionVisual(
    x: number,
    y: number,
    radius = 38,
    bulletType: BulletType = PROJECTILE_LIST[0].id,
  ): void {
    this.fxSystem?.triggerExplosionVisual(x, y, radius, bulletType)
  }

  /** 傷害數字飄字；擊毀時額外顯示 K.O. */
  showDamage(x: number, y: number, amount: number, killed: boolean, color?: string): void {
    if (!this.scene.isActive()) return
    const text = this.add
      .text(x, y, `-${amount}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: amount >= 30 ? '26px' : '20px',
        fontStyle: '900',
        color: color ?? (amount >= 30 ? '#fde047' : '#ffffff'),
        stroke: color ? '#241e33' : '#b91c1c',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setScale(0.4)
    this.tweens.add({ targets: text, scale: 1, duration: 180, ease: 'Back.Out' })
    this.tweens.add({
      targets: text,
      y: y - 46,
      alpha: 0,
      delay: 650,
      duration: 650,
      onComplete: () => text.destroy(),
    })

    if (killed) {
      const ko = this.add
        .text(x, y - 30, 'K.O.!', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '30px',
          fontStyle: '900',
          color: '#fef08a',
          stroke: '#0f172a',
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(31)
        .setScale(2)
        .setAlpha(0)
      this.tweens.add({ targets: ko, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' })
      this.tweens.add({ targets: ko, alpha: 0, y: y - 70, delay: 1100, duration: 500, onComplete: () => ko.destroy() })
    }
  }

  focusActiveTank(immediate = false): void {
    if (!this.cameraManager) return
    this.cameraManager.manualCamera = false
    // 開局時 Vue 可能比 Phaser 場景先就緒，scene 尚未建立就先略過
    if (!this.scene?.isActive() || !this.battleState) return
    const active = this.battleState.tanks[this.battleState.activePlayer]
    if (active && immediate) {
      this.cameraManager.focusTank(active)
    }
  }

  panCameraBy(dx: number, dy: number): void {
    if (!this.scene?.isActive() || !this.cameraManager) return
    this.cameraManager.manualCamera = true
    this.cameraManager.panBy(dx, dy)
  }

  centerCameraAt(worldX: number, worldY: number): void {
    if (!this.scene?.isActive() || !this.cameraManager) return
    this.cameraManager.manualCamera = true
    this.cameraManager.centerOn(worldX, worldY)
  }

  getTerrainCanvasSource(): HTMLCanvasElement | null {
    return this.terrainCanvasTex ? this.terrainCanvasTex.getCanvas() : null
  }
}
