import Phaser from 'phaser'
import type { BulletType } from '@/shared/kernel/types'
import {
  getProjectileSpec,
  PROJECTILE_LIST,
  type GlowKey,
  type ProjectileFx,
} from '../../domain/projectileRegistry'
import type { MapBlueprint } from '../../domain/mapRegistry'

export class ProjectileFxSystem {
  private scene: Phaser.Scene
  private getMapSpec: () => MapBlueprint

  constructor(scene: Phaser.Scene, getMapSpec: () => MapBlueprint) {
    this.scene = scene
    this.getMapSpec = getMapSpec
  }

  /** 疊加混色的光暈閃一下（砲口、尾焰、爆炸核心） */
  flashGlow(
    x: number,
    y: number,
    key: GlowKey,
    size: number,
    duration: number,
    depth = 21,
  ): void {
    if (!this.scene.scene.isActive()) return
    const glow = this.scene.add
      .image(x, y, key)
      .setScale(size * 0.4)
      .setDepth(depth)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.scene.tweens.add({
      targets: glow,
      scale: size,
      alpha: 0,
      duration,
      ease: 'Quad.Out',
      onComplete: () => glow.destroy(),
    })
  }

  /** 火花：沿方向飛出並縮短淡出 */
  spawnSparks(x: number, y: number, count: number, speed: number, depth = 25): void {
    if (!this.scene.scene.isActive()) return
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const dist = speed * (0.5 + Math.random() * 0.7)
      const spark = this.scene.add
        .image(x, y, 'fx_spark')
        .setRotation(a)
        .setScale(0.5 + Math.random() * 0.5, 0.7)
        .setDepth(depth)
        .setBlendMode(Phaser.BlendModes.ADD)
      this.scene.tweens.add({
        targets: spark,
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist + dist * 0.25,
        scaleX: 0.1,
        alpha: 0,
        duration: 380 + Math.random() * 260,
        ease: 'Cubic.Out',
        onComplete: () => spark.destroy(),
      })
    }
  }

  spawnPuff(
    x: number,
    y: number,
    scale: number,
    key: 'fx_puff' | 'fx_smoke',
    depth = 19,
  ): void {
    if (!this.scene.scene.isActive()) return
    const s = this.scene.add.sprite(x, y, key).setScale(scale).setDepth(depth).setAlpha(0.85)
    s.play(key)
    this.scene.tweens.add({ targets: s, y: y - 18, alpha: 0, scale: scale * 1.35, duration: 700 })
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy())
  }

  spawnTrailParticle(x: number, y: number, fx: ProjectileFx): void {
    if (!this.scene.scene.isActive()) return
    const { trail } = fx

    // 光點拖尾（疊加混色）
    this.flashGlow(x, y, fx.glow, trail.glowSize, trail.glowMs, trail.glowDepth)
    if (trail.ring) {
      const ring = this.scene.add
        .circle(x, y, 5, trail.ring.fill, 0.5)
        .setStrokeStyle(1.5, trail.ring.stroke)
        .setDepth(19)
      this.scene.tweens.add({
        targets: ring,
        scale: 1.9,
        alpha: 0,
        duration: 340,
        onComplete: () => ring.destroy(),
      })
    }
    if (trail.sparkChance > 0 && Math.random() < trail.sparkChance) {
      this.spawnSparks(x, y, 1, 22, 20)
    }
    const puff = trail.puff
    if (puff && Math.random() < puff.chance) {
      this.spawnPuff(
        x + (Math.random() - 0.5) * 4,
        y + (Math.random() - 0.5) * 4,
        puff.scale + Math.random() * puff.scaleJitter,
        puff.texture,
      )
    }
  }

  triggerExplosionVisual(
    x: number,
    y: number,
    radius = 38,
    bulletType: BulletType = PROJECTILE_LIST[0].id,
  ): void {
    if (!this.scene.scene.isActive()) return
    const projSpec = getProjectileSpec(bulletType)
    const mapSpec = this.getMapSpec()
    this.scene.cameras.main.shake(320, projSpec.visual.cameraShakeIntensity)

    // Kenney 爆炸序列影格（電漿彈改用白藍閃光）
    const fx = projSpec.visual.fx
    const fxKey = fx.explosion.sheet
    const boom = this.scene.add.sprite(x, y, fxKey).setDepth(26)
    boom.setScale((radius * 2.5) / boom.width)
    boom.play(fxKey)
    boom.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => boom.destroy())

    // 疊加光核 + 白色衝擊波 + 四散火花（重砲彈火花更多）
    this.flashGlow(x, y, fx.glow, (radius * 3.2) / 64, 520, 27)
    const wave = this.scene.add
      .image(x, y, 'fx_shockwave')
      .setScale(0.1)
      .setAlpha(0.9)
      .setDepth(25)
      .setBlendMode(Phaser.BlendModes.ADD)
    this.scene.tweens.add({
      targets: wave,
      scale: (radius * 2.4) / 128,
      alpha: 0,
      duration: 460,
      ease: 'Cubic.Out',
      onComplete: () => wave.destroy(),
    })
    if (fx.explosion.sparks) {
      this.spawnSparks(x, y, Math.round(radius / 4), radius * 1.6)
    }

    // 衝擊波擴散環
    const ring = this.scene.add
      .circle(x, y, 10, projSpec.visual.coreColor, 0.25)
      .setStrokeStyle(4, projSpec.visual.glowColor, 1)
      .setDepth(25)
    this.scene.tweens.add({
      targets: ring,
      radius: radius * 1.6,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.Out',
      onComplete: () => ring.destroy(),
    })

    // 地形土塊飛濺（拋物線落下）
    for (let i = 0; i < 16; i++) {
      const size = 2 + Math.random() * 4
      const chunk = this.scene.add
        .rectangle(x, y, size, size, mapSpec.debrisColors[i % mapSpec.debrisColors.length])
        .setDepth(24)
      const vx = (Math.random() - 0.5) * radius * 4.5
      const vy = -radius * (1.5 + Math.random() * 2.5)
      const state = { t: 0 }
      this.scene.tweens.add({
        targets: state,
        t: 1,
        duration: 700 + Math.random() * 300,
        onUpdate: () => {
          chunk.setPosition(x + vx * state.t, y + vy * state.t + 520 * state.t * state.t)
          chunk.setAlpha(1 - state.t * 0.7)
        },
        onComplete: () => chunk.destroy(),
      })
    }

    // 爆炸後殘留的煙柱
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(180 + i * 160, () => {
        this.spawnPuff(
          x + (Math.random() - 0.5) * radius,
          y - 10,
          0.35 + Math.random() * 0.2,
          'fx_smoke',
          23,
        )
      })
    }
  }
}
