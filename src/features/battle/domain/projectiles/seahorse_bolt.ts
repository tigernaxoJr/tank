import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'SEAHORSE_BOLT',
  sortOrder: 17,
  name: '雷鳴墨彈 (Ink Bolt)',
  badge: '高傷害 · 彈道平 · 小範圍',
  description: '黃銅彈頭裹著深海墨汁與電弧，彈道較平、不太吃風，傷害高但爆炸範圍小，要瞄準。先用潮湧泡泡讓對手濕透，這發會痛很多。',
  damageRadius: 28,
  terrainRadius: 26,
  maxDamage: 52,
  magnetRadius: 16,
  directHitMultiplier: 1,
  speedMultiplier: 1.12,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 2,
  postImpactHoldMs: 1000,
  visual: {
    sprite: { key: 'shell_seahorse_bolt', scale: 0.45 },
    coreRadius: 6,
    coreColor: 0xe0e7ff,
    glowColor: 0x3b82f6,
    strokeColor: 0x1e1b4b,
    fx: {
      glow: 'fx_glow_ice',
      haloAlpha: 0.6,
      trail: {
        glowSize: 0.3,
        glowMs: 300,
        glowDepth: 19,
        sparkChance: 0.3,
      },
      explosion: { sheet: 'fx_flash', sparks: true },
    },
    explosionColors: [0xffffff, 0xc7d2fe, 0x3b82f6, 0x1e1b4b],
    cameraShakeIntensity: 0.013,
  },
})
