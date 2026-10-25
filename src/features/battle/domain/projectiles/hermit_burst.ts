import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'
import { spreadPattern } from '../shotExtensions'

export default defineProjectile({
  id: 'HERMIT_BURST',
  sortOrder: 15,
  name: '連發彈殼節 (Shell Salvo)',
  badge: '3 連發 · 中距離',
  description: '一次射出 3 顆彈殼沿射擊方向前後排開，單顆傷害低；用來在貼近之前先消耗對手，同一發對同一台坦克最多造成 46 點。',
  damageRadius: 32,
  terrainRadius: 26,
  maxDamage: 20,
  magnetRadius: 18,
  directHitMultiplier: 1,
  speedMultiplier: 1,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 4,
  pattern: spreadPattern(3, 3, 1),
  damageCapPerTank: 46,
  postImpactHoldMs: 900,
  visual: {
    sprite: { key: 'shell_hermit_burst', scale: 0.45 },
    coreRadius: 5,
    coreColor: 0xfef3c7,
    glowColor: 0xf59e0b,
    strokeColor: 0x78350f,
    fx: {
      glow: 'fx_glow_fire',
      haloAlpha: 0.5,
      trail: {
        glowSize: 0.22,
        glowMs: 220,
        glowDepth: 19,
        sparkChance: 0.2,
      },
      explosion: { sheet: 'fx_flash', sparks: true },
    },
    explosionColors: [0xffffff, 0xfef3c7, 0xf59e0b, 0x92400e],
    cameraShakeIntensity: 0.008,
  },
})
