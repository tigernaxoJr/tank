import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'MISSILE_STANDARD',
  sortOrder: 0,
  name: '高爆榴彈 (Standard HE)',
  badge: '標準拋物線 · 均衡節奏',
  description: '經典投籃拋物線手感，附帶橘黃尾焰與濃煙軌跡，破甲與挖坑表現均衡。',
  damageRadius: 40,
  terrainRadius: 40,
  maxDamage: 34,
  magnetRadius: 24,
  directHitMultiplier: 1,
  speedMultiplier: 1,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 4,
  postImpactHoldMs: 950,
  visual: {
    sprite: { key: 'shell_he', scale: 0.45 },
    coreRadius: 7,
    coreColor: 0xfef08a,
    glowColor: 0xf97316,
    strokeColor: 0xc2410c,
    fx: {
      glow: 'fx_glow_fire',
      haloAlpha: 0.55,
      trail: {
        glowSize: 0.32,
        glowMs: 240,
        glowDepth: 20,
        puff: { texture: 'fx_puff', scale: 0.12, scaleJitter: 0.06, chance: 0.6 },
        sparkChance: 0,
      },
      explosion: { sheet: 'fx_explosion', sparks: true },
    },
    explosionColors: [0xfffbeb, 0xfde047, 0xfb923c, 0xef4444],
    cameraShakeIntensity: 0.011,
  },
})
