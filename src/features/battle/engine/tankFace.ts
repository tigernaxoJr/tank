/**
 * TankFace (坦克表情與小動畫)
 *
 * 以 Phaser Graphics 每幀即時繪製眼睛、眉毛、嘴巴與附加符號（暈眩星星、冷汗），疊在 `rig` 容器內的車身上，
 * 因此會自動跟著坡度旋轉。除了表情，也回傳車身姿勢偏移（跳躍、搖晃）讓 BattleScene 套用到 `rig`。
 *
 * - 純視覺：使用 Math.random 與場景時間，不回寫戰鬥狀態，不影響 P2P 確定性。
 * - 優先序：陣亡 > 短暫反應（開火/受擊/暈眩/得意/尷尬） > 勝負 > 輪到自己（興奮→專注瞄準） > 低血量 > 待機。
 */
import Phaser from 'phaser'
import type { TurnPhase } from '../domain/battleState'
import type { FaceAtlas, FaceSpec } from '../domain/tankRegistry'

export type FaceEvent = 'turnStart' | 'fire' | 'hurt' | 'smug' | 'oops'

type Reaction = 'eager' | 'fire' | 'shock' | 'dizzy' | 'smug' | 'oops'

const REACTION_MS: Record<Reaction, number> = {
  eager: 1100,
  fire: 450,
  shock: 420,
  dizzy: 1500,
  smug: 1700,
  oops: 1500,
}

export interface FaceContext {
  time: number
  dead: boolean
  facingLeft: boolean
  /** 輪到這台坦克瞄準 */
  isActive: boolean
  phase: TurnPhase
  outcome: 'win' | 'lose' | null
  hpPct: number
  /** 視線方向（rig 區域座標的單位向量）；null 表示自由張望 */
  look: { x: number; y: number } | null
}

export interface BodyPose {
  y: number
  rot: number
}

type EyeShape = 'open' | 'happy' | 'squeeze' | 'x' | 'spiral'
type MouthShape = 'smile' | 'grin' | 'flat' | 'frown' | 'o' | 'shout' | 'wavy' | 'smirk'

interface Expression {
  eyes: EyeShape
  /** 0 = 閉眼, 1 = 全開（眼皮由上往下蓋） */
  open: number
  pupil: number
  /** +1 生氣（內側下壓）, -1 擔心（內側上揚） */
  browTilt: number
  browLift: number
  mouth: MouthShape
  sweat: boolean
  stars: boolean
}

const INK = 0x1e1b2e
const HALO = 0xffffff

export class TankFace {
  readonly gfx: Phaser.GameObjects.Graphics
  /** 要加進 rig 的所有物件（貼圖表情的圖片在下、Graphics 在上） */
  readonly objects: Phaser.GameObjects.GameObject[]
  private readonly atlas: FaceAtlas | null
  private eyeImgs: Phaser.GameObjects.Image[] = []
  private pupilImgs: Phaser.GameObjects.Image[] = []
  private mouthImg: Phaser.GameObjects.Image | null = null
  private reaction: { kind: Reaction; start: number } | null = null
  private nextBlinkAt = 0
  private blinkUntil = 0
  private nextGlanceAt = 0
  private glance = { x: 0, y: 0 }
  private lookX = 0
  private lookY = 0
  private lastTime = 0
  private readonly irisDark: number
  private readonly irisLight: number

  constructor(
    scene: Phaser.Scene,
    private readonly spec: FaceSpec,
  ) {
    this.gfx = scene.add.graphics()
    this.atlas = spec.atlas ?? null
    this.objects = [this.gfx]
    if (this.atlas) {
      const tex = scene.textures.get(this.atlas.key)
      for (const [name, f] of Object.entries(this.atlas.frames)) if (!tex.has(name)) tex.add(name, 0, f[0], f[1], f[2], f[3])
      const mk = () => scene.add.image(0, 0, this.atlas!.key, 'eye_closed').setVisible(false)
      this.eyeImgs = [mk(), mk()]
      this.pupilImgs = [mk(), mk()]
      this.mouthImg = mk()
      this.objects.unshift(...this.eyeImgs, ...this.pupilImgs, this.mouthImg)
    }
    const iris = Phaser.Display.Color.IntegerToColor(spec.iris)
    this.irisDark = iris.clone().darken(30).color
    this.irisLight = iris.clone().lighten(25).color
  }

  setAlpha(a: number): void {
    for (const o of this.objects) (o as Phaser.GameObjects.Image).setAlpha(a)
  }

  private get rest(): number {
    return this.spec.rest ?? 1
  }

  trigger(event: FaceEvent, time: number): void {
    const kind: Reaction =
      event === 'turnStart' ? 'eager' : event === 'hurt' ? 'shock' : (event as Reaction)
    // 暈眩中不被「輪到自己」打斷，讓受擊反應演完
    if (kind === 'eager' && this.reaction && (this.reaction.kind === 'shock' || this.reaction.kind === 'dizzy')) return
    this.reaction = { kind, start: time }
  }

  update(ctx: FaceContext): BodyPose {
    const { time } = ctx
    const dt = Math.min(100, time - this.lastTime)
    this.lastTime = time
    const dir = ctx.facingLeft ? -1 : 1

    // 反應逾時；受擊驚嚇結束後接著暈眩
    if (this.reaction && time - this.reaction.start > REACTION_MS[this.reaction.kind]) {
      this.reaction = this.reaction.kind === 'shock' && !ctx.dead ? { kind: 'dizzy', start: time } : null
    }
    if (ctx.dead) this.reaction = null

    // 待機眨眼與隨機張望
    if (time > this.nextBlinkAt) {
      this.blinkUntil = time + 130
      this.nextBlinkAt = time + 2200 + Math.random() * 3000
    }
    if (time > this.nextGlanceAt) {
      const forward = Math.random() < 0.5
      this.glance = forward ? { x: dir * 0.6, y: 0 } : { x: Math.random() * 2 - 1, y: Math.random() * 0.6 - 0.35 }
      this.nextGlanceAt = time + 1500 + Math.random() * 3000
    }

    const expr = this.resolveExpression(ctx)
    if (time < this.blinkUntil && expr.eyes === 'open') expr.open = 0

    // 瞳孔平滑轉向目標
    const target = ctx.look ?? this.glance
    const k = 1 - Math.pow(0.0001, dt / 1000)
    this.lookX += (target.x - this.lookX) * k
    this.lookY += (target.y - this.lookY) * k

    this.draw(expr, dir, time)
    return this.pose(ctx, dir)
  }

  private resolveExpression(ctx: FaceContext): Expression {
    const base: Expression = {
      eyes: 'open',
      open: 1,
      pupil: 1,
      browTilt: 0,
      browLift: 0,
      mouth: this.spec.restMouth ?? 'smile',
      sweat: false,
      stars: false,
    }
    if (ctx.dead) return { ...base, eyes: 'x', mouth: 'wavy', browTilt: -1 }

    switch (this.reaction?.kind) {
      case 'eager':
        return { ...base, browLift: 2.5, pupil: 1.15, mouth: 'grin' }
      case 'fire':
        return { ...base, eyes: 'squeeze', browTilt: 1, mouth: 'shout' }
      case 'shock':
        return { ...base, open: 1.15, pupil: 0.45, browLift: 3, browTilt: -0.6, mouth: 'o' }
      case 'dizzy':
        return { ...base, eyes: 'spiral', browTilt: -0.8, mouth: 'wavy', stars: true }
      case 'smug':
        return { ...base, open: 0.55, browLift: 1.5, browTilt: 0.5, mouth: 'smirk' }
      case 'oops':
        return { ...base, eyes: 'squeeze', browTilt: -1, mouth: 'wavy', sweat: true }
    }

    if (ctx.phase === 'GAME_OVER') {
      if (ctx.outcome === 'win') return { ...base, eyes: 'happy', mouth: 'grin', browLift: 2 }
      if (ctx.outcome === 'lose') return { ...base, open: 0.7, browTilt: -1, mouth: 'frown', sweat: true }
    }
    const lowHp = ctx.hpPct <= 0.3
    if (ctx.isActive) {
      // 專注瞄準：微瞇眼、眉頭下壓
      return { ...base, open: 0.72, browTilt: 0.7, mouth: lowHp ? 'wavy' : 'flat', sweat: lowHp }
    }
    if (lowHp) return { ...base, browTilt: -1, mouth: 'frown', sweat: true }
    return base
  }

  private pose(ctx: FaceContext, dir: number): BodyPose {
    if (ctx.dead) return { y: 0, rot: 0 }
    const t = ctx.time
    let y = Math.sin(t / 520) * 0.7
    let rot = 0
    const r = this.reaction
    const p = r ? Math.min(1, (t - r.start) / REACTION_MS[r.kind]) : 0

    switch (r?.kind) {
      case 'eager':
        y -= Math.abs(Math.sin(p * Math.PI * 2)) * 8 * (1 - p * 0.5)
        break
      case 'fire':
        rot -= dir * 0.06 * (1 - p)
        break
      case 'shock':
        y -= Math.sin(p * Math.PI) * 6
        rot -= dir * 0.14 * Math.sin(p * Math.PI)
        break
      case 'dizzy':
        rot += Math.sin(t / 85) * 0.06 * (1 - p * 0.6)
        break
      case 'smug':
        y -= Math.abs(Math.sin(p * Math.PI * 3)) * 3
        break
      case 'oops':
        rot += Math.sin(t / 60) * 0.015
        break
      default:
        if (ctx.phase === 'GAME_OVER' && ctx.outcome === 'win') {
          y -= Math.max(0, Math.sin(t / 140)) * 9
        } else if (ctx.hpPct <= 0.3) {
          rot += Math.sin(t / 45) * 0.008
        }
    }
    return { y, rot }
  }

  // ───────────────────────────── drawing ─────────────────────────────

  /** 圖集影格：eye_* 近側眼（含眼柄頂球與表情）、far_wide 無瞳孔的白眼球、pupil_*、mouth_* */
  private drawTextured(e: Expression, dir: number, time: number): void {
    const a = this.atlas!
    const { eyeGap, eyeSize } = this.spec
    const far = this.spec.farScale ?? 1
    const cx = this.spec.x * dir
    const cy = this.spec.y
    const lidOpen = e.open > 1 ? 1 : e.open * this.rest
    let frame: string
    let withPupil = false
    switch (e.eyes) {
      case 'x': frame = 'eye_dead'; break
      case 'happy': frame = 'eye_happy'; break
      case 'squeeze': frame = 'eye_hurt'; break
      case 'spiral': frame = 'far_wide'; break
      default:
        if (lidOpen < 0.1) frame = 'eye_closed'
        else if (lidOpen < 0.5) frame = 'eye_sleepy'
        else if (lidOpen < 0.85) frame = 'eye_half'
        else { frame = 'far_wide'; withPupil = true }
    }
    const spiral = e.eyes === 'spiral'
    ;[-1, 1].forEach((side, i) => {
      const k = (side === dir ? far : 1) * a.scale
      const ex = cx + (side * eyeGap) / 2
      this.eyeImgs[i].setFrame(frame).setPosition(ex, cy).setScale(k).setFlipX(dir < 0).setVisible(true)
      const p = this.pupilImgs[i]
      if (withPupil || spiral) {
        const r = (a.frames.far_wide[2] * k) / 2
        const reach = r * 0.3
        p.setFrame(spiral ? 'pupil_dizzy' : 'pupil_normal')
          .setPosition(spiral ? ex : ex + this.lookX * reach, spiral ? cy : cy + this.lookY * reach + r * 0.04)
          .setScale(k * (spiral ? 0.95 : 0.55 * e.pupil))
          .setRotation(spiral ? time / 140 : 0)
          .setVisible(true)
      } else p.setVisible(false)
    })
    const mouth: Record<MouthShape, string> = {
      smile: 'mouth_smile', grin: 'mouth_laugh', flat: 'mouth_flat', frown: 'mouth_frown',
      o: 'mouth_open', shout: 'mouth_open', wavy: 'mouth_flat', smirk: 'mouth_tongue',
    }
    if (this.spec.noMouth) {
      this.mouthImg!.setVisible(false)
      return
    }
    this.mouthImg!
      .setFrame(mouth[e.mouth])
      .setPosition(cx + dir * 1.5, cy + (this.spec.mouthDy ?? eyeSize + 4.5))
      .setScale(a.scale * (e.mouth === 'shout' ? 1.5 : 1))
      .setFlipX(dir < 0)
      .setVisible(true)
  }

  private draw(e: Expression, dir: number, time: number): void {
    const g = this.gfx
    if (this.atlas) {
      g.clear()
      this.drawTextured(e, dir, time)
      const { eyeGap, eyeSize } = this.spec
      const cx = this.spec.x * dir
      const cy = this.spec.y
      if (e.sweat) this.drawSweat(cx - dir * (eyeGap / 2 + eyeSize + 3), cy - eyeSize * 0.4, time)
      if (e.stars) this.drawStars(cx, cy - eyeSize - 11, eyeGap * 0.9 + 4, time)
      return
    }
    const { eyeGap, eyeSize } = this.spec
    const far = this.spec.farScale ?? 1
    const cx = this.spec.x * dir
    const cy = this.spec.y
    const lw = this.lineWidth
    g.clear()

    if (this.spec.blush && e.eyes !== 'x') {
      g.fillStyle(0xff7fb0, 0.45)
      g.fillEllipse(cx + dir * (eyeGap / 2 + eyeSize * 0.2), cy + eyeSize * 1.2, eyeSize * 1.5, eyeSize * 0.65)
    }
    for (const side of [-1, 1]) {
      // 3/4 視角：車頭那側（side 與面向相同）的眼睛在遠側，畫小一點
      const k = side === dir ? far : 1
      const ex = cx + (side * eyeGap) / 2
      const ry = eyeSize * k
      const rx = ry * 0.9
      this.drawEye(e, ex, cy, rx, ry, side, dir, time)
      // >< / XX / 螺旋眼本身就很搶眼，再加眉毛在小小的臉上會糊成一團
      if (e.eyes === 'open' || e.eyes === 'happy') {
        const gap = this.spec.brow === 'block' ? lw * 1.1 : lw * 1.6
        this.drawBrow(e, ex, cy - ry * Math.max(1, e.open) - gap - e.browLift, rx, side)
      }
    }
    const w = Math.max(eyeGap * 0.36, eyeSize * 0.75)
    this.drawMouth(e.mouth, cx + dir * 1.5, cy + (this.spec.mouthDy ?? eyeSize + 4.5), w, dir)
    if (e.sweat) this.drawSweat(cx - dir * (eyeGap / 2 + eyeSize + 3), cy - eyeSize * 0.4, time)
    if (e.stars) this.drawStars(cx, cy - eyeSize - 11, eyeGap * 0.9 + 4, time)
  }

  /** 線寬隨臉的大小縮放，大眼睛配粗墨線 */
  private get lineWidth(): number {
    return Math.max(2, this.spec.eyeSize * 0.32)
  }

  /** 先畫半透明白邊再畫墨線，讓表情線條在深色與淺色車身上都看得清楚 */
  private ink(width: number, draw: () => void): void {
    this.gfx.lineStyle(width + 2.2, HALO, 0.4)
    draw()
    this.gfx.lineStyle(width, INK, 1)
    draw()
  }

  private drawEye(e: Expression, ex: number, ey: number, rx: number, ry: number, side: number, dir: number, time: number): void {
    const g = this.gfx
    const lw = this.lineWidth
    switch (e.eyes) {
      case 'happy':
        this.ink(lw, () => {
          g.beginPath()
          g.arc(ex, ey + ry * 0.35, rx * 0.95, Math.PI * 1.1, Math.PI * 1.9)
          g.strokePath()
        })
        return
      case 'squeeze': {
        // 左眼 >、右眼 <
        const tip = ex - side * rx * 0.7
        const back = ex + side * rx * 0.7
        this.ink(lw, () => {
          g.beginPath()
          g.moveTo(back, ey - ry * 0.6)
          g.lineTo(tip, ey)
          g.lineTo(back, ey + ry * 0.6)
          g.strokePath()
        })
        return
      }
      case 'x':
        this.ink(lw, () => {
          g.lineBetween(ex - rx * 0.7, ey - ry * 0.6, ex + rx * 0.7, ey + ry * 0.6)
          g.lineBetween(ex - rx * 0.7, ey + ry * 0.6, ex + rx * 0.7, ey - ry * 0.6)
        })
        return
      case 'spiral': {
        const rim = Math.max(1.1, ry * 0.2)
        g.fillStyle(INK, 1)
        g.fillEllipse(ex, ey, (rx + rim) * 2, (ry + rim) * 2)
        g.fillStyle(0xffffff, 1)
        g.fillEllipse(ex, ey, rx * 2, ry * 2)
        g.lineStyle(Math.max(1.4, lw * 0.7), INK, 1)
        const spin = time / 120
        g.beginPath()
        for (let i = 0; i <= 28; i++) {
          const a = spin + i * 0.45
          const rr = (i / 28) * rx * 0.85
          const px = ex + Math.cos(a) * rr
          const py = ey + Math.sin(a) * rr * (ry / rx)
          if (i === 0) g.moveTo(px, py)
          else g.lineTo(px, py)
        }
        g.strokePath()
        return
      }
    }

    // 一般睜眼：粗墨框 → 眼白（下緣淡影）→ 虹膜 + 瞳孔 + 反光 → 車身色眼皮由上往下蓋
    const open = Math.max(0, Math.min(1.2, e.open))
    const s = open > 1 ? open : 1
    const RX = rx * s
    const RY = ry * s
    const rim = Math.max(1.1, ry * 0.2)
    // 待機的半垂眼皮只在一般狀態生效；驚嚇（open > 1）一律睜大
    const lidOpen = open > 1 ? 1 : open * this.rest
    g.fillStyle(INK, 1)
    g.fillEllipse(ex, ey, (RX + rim) * 2, (RY + rim) * 2)
    if (lidOpen < 0.1) {
      // 閉眼：眼皮整片蓋住，下緣一道睫毛弧線
      g.fillStyle(this.spec.lid, 1)
      g.fillEllipse(ex, ey, RX * 2, RY * 2)
      this.ink(lw * 0.9, () => {
        g.beginPath()
        g.arc(ex, ey - RY * 0.15, RX * 0.85, Math.PI * 0.18, Math.PI * 0.82)
        g.strokePath()
      })
      return
    }
    g.fillStyle(0xffffff, 1)
    g.fillEllipse(ex, ey, RX * 2, RY * 2)
    g.fillStyle(0xdfe3f5, 1)
    g.fillEllipse(ex, ey + RY * 0.45, RX * 1.6, RY * 0.9)

    const ir = RX * 0.64
    const ix = ex + this.lookX * (RX - ir) * 0.85
    const iy = ey + this.lookY * Math.max(0, RY - ir) * 0.85 + RY * 0.05
    g.fillStyle(this.irisDark, 1)
    g.fillCircle(ix, iy, ir)
    g.fillStyle(this.spec.iris, 1)
    g.fillCircle(ix, iy + ir * 0.08, ir * 0.82)
    g.fillStyle(this.irisLight, 0.75)
    g.fillCircle(ix, iy + ir * 0.38, ir * 0.45)
    g.fillStyle(INK, 1)
    g.fillCircle(ix, iy, ir * 0.48 * e.pupil)
    g.fillStyle(0xffffff, 1)
    g.fillCircle(ix - ir * 0.36, iy - ir * 0.36, Math.max(0.9, ir * 0.3))
    g.fillStyle(0xffffff, 0.85)
    g.fillCircle(ix + ir * 0.36, iy + ir * 0.34, Math.max(0.5, ir * 0.13))

    const tilt = this.spec.lidTilt ?? 0
    if (lidOpen < 0.97 || tilt !== 0) this.drawLid(ex, ey, RX, RY, lidOpen, tilt * dir, lw)
  }

  /**
   * 眼皮：眼白橢圓與「眼皮線以上」半平面的交集，填車身色，再沿眼皮線描墨線。
   * 取樣橢圓周、把 y 夾到眼皮線以上即可得到交集多邊形（凸形 ∩ 半平面）。
   */
  private drawLid(ex: number, ey: number, rx: number, ry: number, open: number, tilt: number, lw: number): void {
    const g = this.gfx
    const lidY = (x: number) => ey - ry + (1 - open) * ry * 1.85 + tilt * ((x - ex) / rx) * ry * 0.35
    const pts: Phaser.Math.Vector2[] = []
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2
      const x = ex + Math.cos(a) * (rx + 0.4)
      const y = ey + Math.sin(a) * (ry + 0.4)
      pts.push(new Phaser.Math.Vector2(x, Math.min(y, lidY(x))))
    }
    g.fillStyle(this.spec.lid, 1)
    g.fillPoints(pts, true)

    const line: Phaser.Math.Vector2[] = []
    for (let i = 0; i <= 14; i++) {
      const x = ex - rx + (i / 14) * rx * 2
      const half = ry * Math.sqrt(Math.max(0, 1 - ((x - ex) / rx) ** 2))
      const y = lidY(x)
      if (y > ey - half && y < ey + half) line.push(new Phaser.Math.Vector2(x, y))
    }
    if (line.length > 1) {
      g.lineStyle(lw * 0.9, INK, 1)
      g.strokePoints(line, false)
    }
  }

  private drawBrow(e: Expression, ex: number, by: number, rx: number, side: number): void {
    const inner = ex - side * rx * 0.95
    const outer = ex + side * rx * 0.95
    const yi = by + e.browTilt * 2.6
    const yo = by - e.browTilt * 1.2
    if (this.spec.brow === 'block') {
      // 石塊眉：車身色的楔形眉骨（內側厚、外側薄），墨框，像從殼上雕出來的
      const t = this.lineWidth * 0.9
      const g = this.gfx
      const pts = [
        new Phaser.Math.Vector2(inner, yi - t * 1.2),
        new Phaser.Math.Vector2(outer + side * rx * 0.15, yo - t * 0.5),
        new Phaser.Math.Vector2(outer + side * rx * 0.15, yo + t * 0.4),
        new Phaser.Math.Vector2(inner, yi + t),
      ]
      g.fillStyle(this.spec.lid, 1)
      g.fillPoints(pts, true)
      g.lineStyle(Math.max(1.2, this.lineWidth * 0.55), INK, 1)
      g.strokePoints(pts, true)
      return
    }
    this.ink(this.lineWidth * 1.15, () => this.gfx.lineBetween(inner, yi, outer, yo))
  }

  private drawMouth(shape: MouthShape, mx: number, my: number, w: number, dir: number): void {
    const g = this.gfx
    const lw = this.lineWidth
    switch (shape) {
      case 'smile':
        this.ink(lw, () => {
          g.beginPath()
          g.arc(mx, my - w * 0.55, w, Math.PI * 0.25, Math.PI * 0.75)
          g.strokePath()
        })
        return
      case 'frown':
        this.ink(lw, () => {
          g.beginPath()
          g.arc(mx, my + w * 0.75, w, Math.PI * 1.25, Math.PI * 1.75)
          g.strokePath()
        })
        return
      case 'flat':
        this.ink(lw, () => g.lineBetween(mx - w * 0.5, my, mx + w * 0.5, my))
        return
      case 'smirk':
        this.ink(lw, () => {
          g.beginPath()
          g.moveTo(mx - dir * w * 0.6, my + 0.5)
          g.lineTo(mx + dir * w * 0.2, my + 0.5)
          g.lineTo(mx + dir * w * 0.7, my - 2.5)
          g.strokePath()
        })
        return
      case 'wavy':
        this.ink(lw * 0.9, () => {
          g.beginPath()
          for (let i = 0; i <= 4; i++) {
            const px = mx - w * 0.6 + (i * w * 1.2) / 4
            const py = my + (i % 2 === 0 ? 1.2 : -1.2)
            if (i === 0) g.moveTo(px, py)
            else g.lineTo(px, py)
          }
          g.strokePath()
        })
        return
      case 'o':
      case 'shout':
      case 'grin': {
        g.lineStyle(lw + 0.5, HALO, 0.4)
        g.fillStyle(INK, 1)
        if (shape === 'grin') {
          g.slice(mx, my - 1.5, w * 0.75, 0, Math.PI, false)
          g.fillPath()
          g.strokePath()
          g.fillStyle(0xf87171, 1)
          g.fillEllipse(mx, my + w * 0.45, w * 0.7, w * 0.35)
        } else {
          const s = shape === 'o' ? 0.45 : 0.75
          g.fillEllipse(mx, my + 1, w * s * 1.6, w * s * 2)
          g.strokeEllipse(mx, my + 1, w * s * 1.6, w * s * 2)
        }
        return
      }
    }
  }

  private drawSweat(x: number, y: number, time: number): void {
    const g = this.gfx
    const p = (time % 1400) / 1400
    const dy = p * 9
    g.fillStyle(0x7dd3fc, 1 - p * 0.6)
    g.fillTriangle(x, y + dy - 5, x - 2.6, y + dy, x + 2.6, y + dy)
    g.fillCircle(x, y + dy + 0.6, 2.7)
    g.fillStyle(0xffffff, 0.8)
    g.fillCircle(x - 0.8, y + dy, 0.8)
  }

  private drawStars(x: number, y: number, radius: number, time: number): void {
    const g = this.gfx
    for (let i = 0; i < 3; i++) {
      const a = time / 260 + (i * Math.PI * 2) / 3
      const sx = x + Math.cos(a) * radius
      const sy = y + Math.sin(a) * 3.5
      const s = 3 + Math.sin(a) * 0.8
      g.fillStyle(0xfde047, 1)
      g.lineStyle(1.2, 0x92400e, 1)
      g.beginPath()
      for (let j = 0; j < 8; j++) {
        const rr = j % 2 === 0 ? s : s * 0.45
        const ang = -Math.PI / 2 + (j * Math.PI) / 4
        const px = sx + Math.cos(ang) * rr
        const py = sy + Math.sin(ang) * rr
        if (j === 0) g.moveTo(px, py)
        else g.lineTo(px, py)
      }
      g.closePath()
      g.fillPath()
      g.strokePath()
    }
  }
}
