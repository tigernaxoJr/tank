import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'SNAILER_STICKY',
  sortOrder: 13,
  name: '定時黏殼彈 (Sticky Shell)',
  badge: '黏住不爆 · 對手一回合後引爆',
  description: '落地不會爆炸，黏在原地閃著光倒數：經過對手的下一個回合結束才引爆，範圍大、傷害高。對手可以跑，但你自己站太近也會被炸。',
  damageRadius: 66,
  terrainRadius: 54,
  maxDamage: 36,
  magnetRadius: 0,
  directHitMultiplier: 1,
  speedMultiplier: 1,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 4,
  fuse: { turns: 2 },
  postImpactHoldMs: 900,
  visual: {
    // 使用者的設計圖（tools/blender/refs/snailer/shells.jpg）去背縮小而成
    sprite: { key: 'shell_sticky', scale: 0.45 },
    coreRadius: 8,
    coreColor: 0xfef3c7,
    glowColor: 0xfacc15,
    strokeColor: 0x854d0e,
    fx: {
      glow: 'fx_glow_toxic',
      haloAlpha: 0.55,
      trail: {
        glowSize: 0.38,
        glowMs: 320,
        glowDepth: 20,
        puff: { texture: 'fx_puff', scale: 0.14, scaleJitter: 0.05, chance: 0.45 },
        sparkChance: 0.15,
      },
      explosion: { sheet: 'fx_explosion', sparks: true },
    },
    explosionColors: [0xffffff, 0xfef9c3, 0xfacc15, 0xca8a04, 0x713f12],
    cameraShakeIntensity: 0.02,
  },
})
