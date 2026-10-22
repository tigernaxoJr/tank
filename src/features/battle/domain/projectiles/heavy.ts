import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'MISSILE_HEAVY',
  sortOrder: 1,
  name: '重型巨砲核彈 (Heavy Buster)',
  badge: '大範圍 · 單發較低 · 射程較短',
  description: '彈體沉重、初速較慢（射程較短），單發傷害不高，但爆炸範圍大、對瞄不準的對手更寬容，可炸出巨大彈坑。',
  damageRadius: 50,
  terrainRadius: 50,
  maxDamage: 22,
  magnetRadius: 22,
  directHitMultiplier: 1,
  speedMultiplier: 0.85,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 3,
  postImpactHoldMs: 1150,
  visual: {
    sprite: { key: 'shell_heavy', scale: 0.45 },
    coreRadius: 9.5,
    coreColor: 0xffedd5,
    glowColor: 0xef4444,
    strokeColor: 0x7f1d1d,
    fx: {
      glow: 'fx_glow_fire',
      haloAlpha: 0.55,
      trail: {
        glowSize: 0.5,
        glowMs: 320,
        glowDepth: 20,
        puff: { texture: 'fx_smoke', scale: 0.2, scaleJitter: 0.08, chance: 0.6 },
        sparkChance: 0.25,
      },
      explosion: { sheet: 'fx_explosion', sparks: true },
    },
    explosionColors: [0xffffff, 0xfef08a, 0xf97316, 0xdc2626, 0x7f1d1d],
    cameraShakeIntensity: 0.018,
  },
})
