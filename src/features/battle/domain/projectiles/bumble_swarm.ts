import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'
import { spreadPattern } from '../shotExtensions'

export default defineProjectile({
  id: 'BUMBLE_SWARM',
  sortOrder: 18,
  name: '蜂群彈 (Swarm Volley)',
  badge: '4 連發 · 容錯高',
  description: '一次放出 4 隻小蜜蜂沿射擊方向前後排開，單隻傷害低、吸附範圍寬，不用瞄很準也能叮到；同一發對同一台坦克最多造成 36 點。',
  damageRadius: 26,
  terrainRadius: 18,
  maxDamage: 18,
  magnetRadius: 24,
  directHitMultiplier: 1,
  speedMultiplier: 1,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 3,
  pattern: spreadPattern(4, 2, 1),
  damageCapPerTank: 50,
  postImpactHoldMs: 900,
  visual: {
    sprite: { key: 'shell_bumble_swarm', scale: 0.38 },
    coreRadius: 5,
    coreColor: 0xfef08a,
    glowColor: 0xfacc15,
    strokeColor: 0x5a3a22,
    fx: {
      glow: 'fx_glow_fire',
      haloAlpha: 0.45,
      trail: { glowSize: 0.2, glowMs: 200, glowDepth: 19, sparkChance: 0.25 },
      explosion: { sheet: 'fx_flash', sparks: true },
    },
    explosionColors: [0xffffff, 0xfef08a, 0xfacc15, 0x92400e],
    cameraShakeIntensity: 0.007,
  },
})
