import { defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'HAWK_RAIL',
  sortOrder: 10,
  name: '磁軌狙擊彈 (Rail Lance)',
  badge: '零吸附 · 極高傷害',
  description: '彈道比一般彈平直、完全沒有吸附導引、爆炸範圍極小，幾乎不挖地形。正中就是重創，偏一點就幾乎沒傷害。',
  damageRadius: 22,
  terrainRadius: 8,
  maxDamage: 75,
  magnetRadius: 0,
  directHitMultiplier: 1,
  speedMultiplier: 1,
  // 特殊彈：高初速、彈道比一般彈平直
  gravityMilli: 150,
  windMultiplier: 5,
  postImpactHoldMs: 850,
  visual: {
    sprite: { key: 'shell_rail', scale: 0.45 },
    coreRadius: 5,
    coreColor: 0xffffff,
    glowColor: 0x93c5fd,
    strokeColor: 0x1e3a8a,
    fx: {
      glow: 'fx_glow_plasma',
      haloAlpha: 0.85,
      trail: {
        glowSize: 0.4,
        glowMs: 420,
        glowDepth: 19,
        ring: { fill: 0x93c5fd, stroke: 0xe0e7ff },
        sparkChance: 0,
      },
      explosion: { sheet: 'fx_flash', sparks: false },
    },
    explosionColors: [0xffffff, 0xe0e7ff, 0x93c5fd, 0x1d4ed8],
    cameraShakeIntensity: 0.016,
  },
})
