import { STANDARD_GRAVITY_MILLI, defineProjectile } from '../projectileBlueprint'

export default defineProjectile({
  id: 'HOPPER_TONGUE',
  sortOrder: 22,
  name: '舌鞭彈 (Tongue Lash)',
  badge: '拉近對手 · 重擊',
  description: '黏呼呼的舌頭球砸中目標後，把爆炸範圍內的坦克往射手方向拉近（最多拉到離射手 60 px）；傷害中等，但拉近後對手就進了你的散彈與近距離砲彈射程。',
  damageRadius: 44,
  terrainRadius: 22,
  maxDamage: 40,
  magnetRadius: 18,
  directHitMultiplier: 1,
  speedMultiplier: 1,
  gravityMilli: STANDARD_GRAVITY_MILLI,
  windMultiplier: 4,
  knockbackPx: -90,
  postImpactHoldMs: 1000,
  visual: {
    sprite: { key: 'shell_hopper_tongue', scale: 0.42 },
    coreRadius: 7,
    coreColor: 0xfbcfe8,
    glowColor: 0xf472b6,
    strokeColor: 0x831843,
    fx: {
      glow: 'fx_glow_fire',
      haloAlpha: 0.45,
      trail: { glowSize: 0.26, glowMs: 240, glowDepth: 19, sparkChance: 0.25 },
      explosion: { sheet: 'fx_puff', sparks: false },
    },
    explosionColors: [0xffffff, 0xfbcfe8, 0xf472b6, 0x831843],
    cameraShakeIntensity: 0.009,
  },
})
