import { defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'MISSILE_RAILGUN',
  sortOrder: 3,
  name: '穿甲狙擊彈 (Rail Sniper)',
  badge: '零導引 · 極高傷害',
  description: '小範圍、幾乎不挖地形，但完全沒有吸附導引；打得準就是一發重創，考驗落點與風向控制。',
  damageRadius: 18,
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
    coreRadius: 5,
    coreColor: 0xffffff,
    glowColor: 0xa3e635,
    strokeColor: 0x365314,
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
    explosionColors: [0xffffff, 0xd9f99d, 0xa3e635, 0x4d7c0f],
    cameraShakeIntensity: 0.016,
  },
})
