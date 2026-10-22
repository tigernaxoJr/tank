import { defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'BASTION_MORTAR',
  sortOrder: 0,
  name: '高拋迫擊彈 (Siege Mortar)',
  badge: '上升段穿地 · 越牆',
  description: '上升時能穿過地形，從坑底、橋下或自己堆的土丘後方開火；下墜很快、爆炸範圍大，但受風影響明顯。',
  damageRadius: 48,
  terrainRadius: 42,
  maxDamage: 26,
  magnetRadius: 20,
  directHitMultiplier: 1,
  speedMultiplier: 1.25,
  // 特殊彈：重力約一般彈 1.6 倍、初速補回，射程相近但彈道更急墜
  gravityMilli: 280,
  windMultiplier: 5,
  flight: { kind: 'lob' },
  postImpactHoldMs: 1100,
  visual: {
    sprite: { key: 'shell_mortar', scale: 0.45 },
    coreRadius: 8.5,
    coreColor: 0xfde68a,
    glowColor: 0xf59e0b,
    strokeColor: 0x78350f,
    fx: {
      glow: 'fx_glow_fire',
      haloAlpha: 0.5,
      trail: {
        glowSize: 0.42,
        glowMs: 300,
        glowDepth: 20,
        puff: { texture: 'fx_smoke', scale: 0.16, scaleJitter: 0.06, chance: 0.5 },
        sparkChance: 0.2,
      },
      explosion: { sheet: 'fx_explosion', sparks: true },
    },
    explosionColors: [0xffffff, 0xfef08a, 0xf59e0b, 0xb45309, 0x78350f],
    cameraShakeIntensity: 0.017,
  },
})
