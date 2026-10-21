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
import type { FaceSpec } from '../domain/tankRegistry'

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
  private reaction: { kind: Reaction; start: number } | null = null
  private nextBlinkAt = 0
  private blinkUntil = 0
  private nextGlanceAt = 0
  private glance = { x: 0, y: 0 }
  private lookX = 0
  private lookY = 0
  private lastTime = 0

  constructor(
    scene: Phaser.Scene,
    private readonly spec: FaceSpec,
  ) {
    this.gfx = scene.add.graphics()
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
      mouth: 'smile',
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

  private draw(e: Expression, dir: number, time: number): void {
    const g = this.gfx
    const { eyeGap, eyeSize } = this.spec
    const cx = this.spec.x * dir
    const cy = this.spec.y
    const rx = eyeSize * 0.8
    const ry = eyeSize
    g.clear()

    for (const side of [-1, 1]) {
      const ex = cx + (side * eyeGap) / 2
      this.drawEye(e, ex, cy, rx, ry, side, time)
      // >< / XX / 螺旋眼本身就很搶眼，再加眉毛在 25px 的臉上會糊成一團
      if (e.eyes === 'open' || e.eyes === 'happy') this.drawBrow(e, ex, cy - ry - 2.5 - e.browLift, rx, side)
    }
    this.drawMouth(e.mouth, cx + dir * 1.5, cy + ry + 4.5, eyeGap * 0.36, dir)
    if (e.sweat) this.drawSweat(cx - dir * (eyeGap / 2 + rx + 3), cy - ry * 0.4, time)
    if (e.stars) this.drawStars(cx, cy - ry - 11, eyeGap * 0.9, time)
  }

  /** 先畫半透明白邊再畫墨線，讓表情線條在沙漠與海軍兩種塗裝上都看得清楚 */
  private ink(width: number, draw: () => void): void {
    this.gfx.lineStyle(width + 2.5, HALO, 0.5)
    draw()
    this.gfx.lineStyle(width, INK, 1)
    draw()
  }

  private drawEye(e: Expression, ex: number, ey: number, rx: number, ry: number, side: number, time: number): void {
    const g = this.gfx
    switch (e.eyes) {
      case 'happy':
        this.ink(2.2, () => {
          g.beginPath()
          g.arc(ex, ey + ry * 0.35, rx * 0.95, Math.PI * 1.1, Math.PI * 1.9)
          g.strokePath()
        })
        return
      case 'squeeze': {
        // 左眼 >、右眼 <
        const tip = ex - side * rx * 0.7
        const back = ex + side * rx * 0.7
        this.ink(2.2, () => {
          g.beginPath()
          g.moveTo(back, ey - ry * 0.6)
          g.lineTo(tip, ey)
          g.lineTo(back, ey + ry * 0.6)
          g.strokePath()
        })
        return
      }
      case 'x':
        this.ink(2.2, () => {
          g.lineBetween(ex - rx * 0.7, ey - ry * 0.6, ex + rx * 0.7, ey + ry * 0.6)
          g.lineBetween(ex - rx * 0.7, ey + ry * 0.6, ex + rx * 0.7, ey - ry * 0.6)
        })
        return
      case 'spiral': {
        g.fillStyle(0xffffff, 1)
        g.fillEllipse(ex, ey, rx * 2, ry * 2)
        g.lineStyle(1.6, INK, 1)
        g.strokeEllipse(ex, ey, rx * 2, ry * 2)
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

    // 一般睜眼：眼皮由上往下蓋，眼睛高度縮短並往下靠
    const open = Math.max(0, Math.min(1.2, e.open))
    if (open < 0.12) {
      this.ink(2, () => g.lineBetween(ex - rx, ey + ry * 0.5, ex + rx, ey + ry * 0.5))
      return
    }
    const h = ry * 2 * Math.min(1, open)
    const scale = open > 1 ? open : 1
    const cy = ey + ry * (1 - Math.min(1, open))
    g.fillStyle(0xffffff, 1)
    g.fillEllipse(ex, cy, rx * 2 * scale, h * scale)
    g.lineStyle(1.6, INK, 1)
    g.strokeEllipse(ex, cy, rx * 2 * scale, h * scale)

    const pr = rx * 0.52 * e.pupil
    const px = ex + this.lookX * (rx - pr) * 0.85
    const py = cy + this.lookY * Math.max(0, h / 2 - pr) * 0.85
    g.fillStyle(INK, 1)
    g.fillCircle(px, py, pr)
    g.fillStyle(0xffffff, 0.9)
    g.fillCircle(px - pr * 0.35, py - pr * 0.4, Math.max(0.8, pr * 0.32))
    if (open < 1) {
      // 眼皮線
      this.ink(1.8, () => g.lineBetween(ex - rx, cy - h / 2, ex + rx, cy - h / 2))
    }
  }

  private drawBrow(e: Expression, ex: number, by: number, rx: number, side: number): void {
    const inner = ex - side * rx * 0.95
    const outer = ex + side * rx * 0.95
    this.ink(2.2, () => this.gfx.lineBetween(inner, by + e.browTilt * 2.6, outer, by - e.browTilt * 1.2))
  }

  private drawMouth(shape: MouthShape, mx: number, my: number, w: number, dir: number): void {
    const g = this.gfx
    switch (shape) {
      case 'smile':
        this.ink(2, () => {
          g.beginPath()
          g.arc(mx, my - w * 0.55, w, Math.PI * 0.25, Math.PI * 0.75)
          g.strokePath()
        })
        return
      case 'frown':
        this.ink(2, () => {
          g.beginPath()
          g.arc(mx, my + w * 0.75, w, Math.PI * 1.25, Math.PI * 1.75)
          g.strokePath()
        })
        return
      case 'flat':
        this.ink(2, () => g.lineBetween(mx - w * 0.5, my, mx + w * 0.5, my))
        return
      case 'smirk':
        this.ink(2, () => {
          g.beginPath()
          g.moveTo(mx - dir * w * 0.6, my + 0.5)
          g.lineTo(mx + dir * w * 0.2, my + 0.5)
          g.lineTo(mx + dir * w * 0.7, my - 2.5)
          g.strokePath()
        })
        return
      case 'wavy':
        this.ink(1.8, () => {
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
        g.lineStyle(2.5, HALO, 0.5)
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
