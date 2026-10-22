import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'FROST_ICICLE',
  sortOrder: 7,
  name: '冰錐彈 (Icicle Burst)',
  badge: '落地碎成 3 片 · 貼地滑行',
  description: '碰到地面時往前碎成 3 片冰錐，貼著地面往前飛一小段再各自爆開；適合打下坡處或緊貼掩體的目標。直接命中坦克時只有主彈一發爆開。',
  damageRadius: 28,
  terrainRadius: 18,
  maxDamage: 15,
  magnetRadius: 18,
  directHitMultiplier: 1,
  speedMultiplier: 1,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 4,
  flight: { kind: 'shards', angles: [12, 28, 46], speedMilli: 3400, damageScale: 1 },
  postImpactHoldMs: 1000,
  visual: {
    sprite: { key: 'shell_icicle', scale: 0.45 },
    coreRadius: 6,
    coreColor: 0xf0f9ff,
    glowColor: 0x38bdf8,
    strokeColor: 0x075985,
    fx: {
      glow: 'fx_glow_ice',
      haloAlpha: 0.55,
      trail: {
        glowSize: 0.28,
        glowMs: 260,
        glowDepth: 20,
        sparkChance: 0.35,
      },
      explosion: { sheet: 'fx_flash', sparks: true },
    },
    explosionColors: [0xffffff, 0xbae6fd, 0x38bdf8, 0x0c4a6e],
    cameraShakeIntensity: 0.009,
  },
})
