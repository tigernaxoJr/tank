import { defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'MISSILE_PLASMA',
  sortOrder: 2,
  name: '疾速電漿彈 (Plasma Bolt)',
  badge: '高速流線 · 電磁星芒',
  description: '初速較快、受重力影響較小的藍紫電漿彈體；爆炸範圍小但單發傷害高，需要精準瞄準。',
  damageRadius: 40,
  terrainRadius: 30,
  maxDamage: 52,
  magnetRadius: 22,
  directHitMultiplier: 1,
  speedMultiplier: 1,
  // 特殊彈：能量彈受重力較小，彈道刻意比一般彈平直
  gravityMilli: 145,
  windMultiplier: 5,
  postImpactHoldMs: 850,
  visual: {
    sprite: { key: 'shell_plasma', scale: 0.42, spin: 9 },
    coreRadius: 6.5,
    coreColor: 0xe0f2fe,
    glowColor: 0x38bdf8,
    strokeColor: 0x6366f1,
    fx: {
      glow: 'fx_glow_plasma',
      haloAlpha: 0.9,
      trail: {
        glowSize: 0.42,
        glowMs: 380,
        glowDepth: 19,
        ring: { fill: 0x38bdf8, stroke: 0xc084fc },
        sparkChance: 0,
      },
      explosion: { sheet: 'fx_flash', sparks: false },
    },
    explosionColors: [0xf0f9ff, 0x7dd3fc, 0x38bdf8, 0x818cf8, 0xc084fc],
    cameraShakeIntensity: 0.013,
  },
})
