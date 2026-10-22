import { defineTank } from '../tankBlueprint'

export default defineTank({
  id: 'frostback',
  sortOrder: 3,
  name: '霜鯨 Frostback',
  subtitle: '控場 · 限制走位',
  description: '被它打中的那一刻你還能開砲，只是哪裡也去不了。凍結彈削減對手的移動燃料，冰錐彈落地碎成三片貼地滑行。',
  maxHp: 115,
  moveFuel: 220,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 1,
  climbPerPx: 2,
  fallSafePx: 34,
  windSensitivity: 0.9,
  armor: 0,
  shield: 15,
  resist: {},
  passive: { name: '冰甲', description: '開場自帶 15 點護盾（不會回復）。' },
  shots: ['FROST_FREEZE', 'FROST_ICICLE'],
  sprite: { scale: 0.4, pivotX: 2, pivotY: -32, face: { x: 18, y: -15, eyeGap: 16, eyeSize: 6.5, lid: 0x7c8092, iris: 0x7cc8ec } },
})
