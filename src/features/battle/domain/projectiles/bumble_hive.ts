import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'BUMBLE_HIVE',
  sortOrder: 19,
  name: '蜂巢彈 (Hive Bomb)',
  badge: '落地碎成 3 片 · 蜜漿四濺',
  description: '碰到地面時碎成 3 塊蜂巢往前滾出一小段再各自爆開，覆蓋範圍比單發大；直接命中坦克時只有主彈爆開。',
  damageRadius: 36,
  terrainRadius: 28,
  maxDamage: 24,
  magnetRadius: 18,
  directHitMultiplier: 1,
  speedMultiplier: 1,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 4,
  flight: { kind: 'shards', angles: [14, 30, 50], speedMilli: 3200, damageScale: 1 },
  postImpactHoldMs: 1000,
  visual: {
    sprite: { key: 'shell_bumble_hive', scale: 0.36 },
    coreRadius: 7,
    coreColor: 0xfde68a,
    glowColor: 0xf59e0b,
    strokeColor: 0x78350f,
    fx: {
      glow: 'fx_glow_fire',
      haloAlpha: 0.5,
      trail: { glowSize: 0.3, glowMs: 260, glowDepth: 20, sparkChance: 0.3 },
      explosion: { sheet: 'fx_explosion', sparks: true },
    },
    explosionColors: [0xffffff, 0xfde68a, 0xf59e0b, 0x92400e],
    cameraShakeIntensity: 0.01,
  },
})
