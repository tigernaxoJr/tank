import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'
import { spreadPattern } from '../shotExtensions'

export default defineProjectile({
  id: 'ZEPHYR_SCATTER',
  sortOrder: 2,
  name: '散彈砲 (Gale Scatter)',
  badge: '5 顆散射 · 近距爆發',
  description: '一次射出 5 顆彈丸沿射擊方向前後排開，距離愈近命中的顆數愈多。同一發對同一台坦克最多造成 48 點，不會一發秒殺。',
  damageRadius: 28,
  terrainRadius: 22,
  maxDamage: 17,
  magnetRadius: 18,
  directHitMultiplier: 1,
  speedMultiplier: 1,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 4,
  pattern: spreadPattern(5, 2, 1),
  damageCapPerTank: 48,
  postImpactHoldMs: 900,
  visual: {
    sprite: { key: 'shell_scatter', scale: 0.42 },
    coreRadius: 4.5,
    coreColor: 0xe0f2fe,
    glowColor: 0x38bdf8,
    strokeColor: 0x1e3a8a,
    fx: {
      glow: 'fx_glow_plasma',
      haloAlpha: 0.45,
      trail: {
        glowSize: 0.2,
        glowMs: 200,
        glowDepth: 19,
        sparkChance: 0.15,
      },
      explosion: { sheet: 'fx_flash', sparks: true },
    },
    explosionColors: [0xffffff, 0xbae6fd, 0x38bdf8, 0x1d4ed8],
    cameraShakeIntensity: 0.007,
  },
})
