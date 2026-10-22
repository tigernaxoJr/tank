import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'HAWK_FLARE',
  sortOrder: 11,
  name: '偵察照明彈 (Scout Flare)',
  badge: '無傷害 · 2 回合完整彈道',
  description: '不造成傷害；發射後接下來 2 個自己的回合，瞄準預覽會畫出完整彈道與落點準星，用來校正下一發狙擊。',
  damageRadius: 0,
  terrainRadius: 0,
  maxDamage: 0,
  magnetRadius: 0,
  directHitMultiplier: 1,
  speedMultiplier: 1,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 4,
  selfEffect: { status: 'scout', turns: 2, power: 0 },
  postImpactHoldMs: 800,
  visual: {
    sprite: { key: 'shell_flare', scale: 0.45 },
    coreRadius: 6,
    coreColor: 0xfef08a,
    glowColor: 0xfacc15,
    strokeColor: 0x854d0e,
    fx: {
      glow: 'fx_glow_fire',
      haloAlpha: 0.9,
      trail: {
        glowSize: 0.46,
        glowMs: 520,
        glowDepth: 19,
        sparkChance: 0.55,
      },
      explosion: { sheet: 'fx_flash', sparks: true },
    },
    explosionColors: [0xffffff, 0xfef9c3, 0xfacc15, 0xca8a04],
    cameraShakeIntensity: 0.004,
  },
})
