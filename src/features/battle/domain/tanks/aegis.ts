import { defineTank } from '../tankBlueprint'

export default defineTank({
  id: 'aegis',
  sortOrder: 0,
  name: '神盾騎士 Aegis',
  subtitle: '均衡泛用型裝甲戰車',
  description: '圓豆形車身配頭盔式砲塔與精準加農砲，適合各種地形全距離拋物線作戰。',
  maxHp: 100,
  moveFuel: 280,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 1.0,
  climbPerPx: 3,
  fallSafePx: 30,
  windSensitivity: 1,
  armor: 0,
  shield: 0,
  resist: {},
  shots: ['MISSILE_STANDARD', 'MISSILE_HEAVY'],
  sprite: { scale: 0.4, pivotX: 1, pivotY: -31, face: { x: 10, y: -13, eyeGap: 15, eyeSize: 6 } },
})
