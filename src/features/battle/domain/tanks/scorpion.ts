import { defineTank } from '../tankBlueprint'

export default defineTank({
  id: 'scorpion',
  sortOrder: 2,
  name: '毒蠍 Scorpion',
  subtitle: '持續削血 · 破甲',
  description: '它的第一發從不致命。第三回合，你才發現血條自己在掉。毒霧彈讓對手每回合扣血，酸蝕彈讓裝甲與護盾失效。',
  maxHp: 105,
  moveFuel: 280,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 1,
  climbPerPx: 3,
  fallSafePx: 30,
  windSensitivity: 1,
  armor: 0,
  shield: 0,
  resist: { poison: 1 },
  passive: { name: '抗毒', description: '中毒傷害完全免疫，貼近自己的毒霧也不怕。' },
  shots: ['SCORPION_TOXIN', 'SCORPION_ACID'],
  sprite: { scale: 0.4, pivotX: -2, pivotY: -27, face: { x: 18, y: -10, eyeGap: 15, eyeSize: 6 } },
})
