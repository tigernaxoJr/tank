import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'
import { spreadPattern } from '../shotExtensions'

export default defineProjectile({
  id: 'QUILL_RAIN',
  sortOrder: 21,
  name: '針雨彈 (Needle Rain)',
  badge: '5 連發 · 前後灑開',
  description: '松果狀的針雨彈一次灑出 5 根長針沿射擊方向前後排開，單根傷害低、半徑小；同一發對同一台坦克最多造成 40 點，離得越近中針越多。',
  damageRadius: 24,
  terrainRadius: 16,
  maxDamage: 10,
  magnetRadius: 16,
  directHitMultiplier: 1,
  speedMultiplier: 1,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 3,
  pattern: spreadPattern(5, 2, 1),
  damageCapPerTank: 40,
  postImpactHoldMs: 900,
  visual: {
    sprite: { key: 'shell_quill_rain', scale: 0.4 },
    coreRadius: 5,
    coreColor: 0xf5d0fe,
    glowColor: 0xc084fc,
    strokeColor: 0x3b2350,
    fx: {
      glow: 'fx_glow_plasma',
      haloAlpha: 0.4,
      trail: { glowSize: 0.2, glowMs: 200, glowDepth: 19, sparkChance: 0.25 },
      explosion: { sheet: 'fx_flash', sparks: true },
    },
    explosionColors: [0xffffff, 0xf5d0fe, 0xc084fc, 0x3b2350],
    cameraShakeIntensity: 0.007,
  },
})
