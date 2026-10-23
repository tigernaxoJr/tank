import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'SNAILER_SHELL',
  sortOrder: 12,
  name: '螺旋迫擊彈 (Spiral Mortar)',
  badge: '大範圍 · 慢速',
  description: '蝸牛的招牌重砲彈：爆炸範圍大、挖坑深，但初速慢，射程比一般彈短，需要預留飛行時間。',
  damageRadius: 48,
  terrainRadius: 48,
  maxDamage: 31,
  magnetRadius: 18,
  directHitMultiplier: 1,
  speedMultiplier: 0.9,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 5,
  postImpactHoldMs: 1100,
  visual: {
    // 使用者的設計圖（tools/blender/refs/snailer/shells.jpg）去背縮小而成
    sprite: { key: 'shell_snailer', scale: 0.45 },
    coreRadius: 8.5,
    coreColor: 0xfde68a,
    glowColor: 0xf59e0b,
    strokeColor: 0x78350f,
    fx: {
      glow: 'fx_glow_fire',
      haloAlpha: 0.5,
      trail: {
        glowSize: 0.42,
        glowMs: 300,
        glowDepth: 20,
        puff: { texture: 'fx_smoke', scale: 0.16, scaleJitter: 0.06, chance: 0.5 },
        sparkChance: 0.2,
      },
      explosion: { sheet: 'fx_explosion', sparks: true },
    },
    explosionColors: [0xffffff, 0xfef08a, 0xf59e0b, 0xb45309, 0x78350f],
    cameraShakeIntensity: 0.017,
  },
})
