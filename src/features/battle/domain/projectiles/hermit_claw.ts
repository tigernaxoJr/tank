import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'HERMIT_CLAW',
  sortOrder: 14,
  name: '鉗擊彈 (Claw Snap)',
  badge: '短程重擊 · 夾住 2 回合',
  description: '射程只有一般砲彈的六成，但傷害高；命中後對手 2 回合裝甲與護盾失效、移動燃料上限 −30%（仍可開砲），結束後 1 回合免疫。要先貼近才打得到。',
  damageRadius: 34,
  terrainRadius: 30,
  maxDamage: 42,
  magnetRadius: 22,
  directHitMultiplier: 1,
  speedMultiplier: 0.78,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 3,
  onHit: { status: 'pinched', turns: 2, power: 30 },
  postImpactHoldMs: 1000,
  visual: {
    sprite: { key: 'shell_hermit_claw', scale: 0.45 },
    coreRadius: 7,
    coreColor: 0xfde68a,
    glowColor: 0xf97316,
    strokeColor: 0x7c2d12,
    fx: {
      glow: 'fx_glow_fire',
      haloAlpha: 0.6,
      trail: {
        glowSize: 0.32,
        glowMs: 300,
        glowDepth: 19,
        sparkChance: 0.2,
      },
      explosion: { sheet: 'fx_flash', sparks: true },
    },
    explosionColors: [0xffffff, 0xfde68a, 0xf97316, 0x9a3412],
    cameraShakeIntensity: 0.011,
  },
})
