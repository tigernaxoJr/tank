import { defineTank } from '../tankBlueprint'

export default defineTank({
  id: 'goliath',
  sortOrder: 1,
  name: '巨像重砲 Goliath',
  subtitle: '重裝破甲巨獸',
  description: '厚重圓頂裝甲，全場最高血量，但單發輸出最低、移動燃料最少，適合穩紮穩打。',
  maxHp: 130,
  moveFuel: 200,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 0.82,
  climbPerPx: 2,
  fallSafePx: 40,
  windSensitivity: 0.8,
  armor: 2,
  shield: 0,
  resist: { fall: 0.4 },
  shots: ['MISSILE_HEAVY', 'MISSILE_STANDARD'],
  sprite: { scale: 0.4, pivotX: 13, pivotY: -28, face: { x: 7, y: -17, eyeGap: 17, eyeSize: 7 } },
})
