import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'QUILL_ROLL',
  sortOrder: 20,
  name: '滾刺球 (Rolling Quill)',
  badge: '落地滾出一段 · 貼地',
  description: '捲成刺球的刺蝟砲彈，碰到地面時往前滾成 2 片再各自爆開；半徑大、傷害中等，適合打貼著掩體或下坡的目標。',
  damageRadius: 40,
  terrainRadius: 30,
  maxDamage: 23,
  magnetRadius: 18,
  directHitMultiplier: 1,
  speedMultiplier: 1,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 4,
  flight: { kind: 'shards', angles: [8, 22], speedMilli: 3000, damageScale: 0.6 },
  postImpactHoldMs: 1000,
  visual: {
    sprite: { key: 'shell_quill_roll', scale: 0.42 },
    coreRadius: 7,
    coreColor: 0xe9d5ff,
    glowColor: 0xa855f7,
    strokeColor: 0x3b2350,
    fx: {
      glow: 'fx_glow_plasma',
      haloAlpha: 0.45,
      trail: { glowSize: 0.26, glowMs: 240, glowDepth: 19, sparkChance: 0.3 },
      explosion: { sheet: 'fx_flash', sparks: true },
    },
    explosionColors: [0xffffff, 0xf5d0fe, 0xa855f7, 0x3b2350],
    cameraShakeIntensity: 0.01,
  },
})
