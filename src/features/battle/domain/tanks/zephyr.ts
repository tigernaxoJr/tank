import { defineTank } from '../tankBlueprint'

export default defineTank({
  id: 'zephyr',
  sortOrder: 2,
  name: '疾風磁軌 Zephyr',
  subtitle: '高機動突擊戰車',
  description: '低矮水滴形輕量底盤配磁軌砲，全場最高機動與輸出，但血量最低，吃兩三發就倒，擅長游擊搶先手。',
  maxHp: 80,
  moveFuel: 360,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 1.15,
  climbPerPx: 4,
  fallSafePx: 36,
  windSensitivity: 1.25,
  armor: 0,
  shield: 0,
  resist: { fall: 0.15 },
  shots: ['MISSILE_PLASMA', 'MISSILE_RAILGUN'],
  sprite: { scale: 0.4, pivotX: -4, pivotY: -25, face: { x: 8, y: -9, eyeGap: 14, eyeSize: 5.2 } },
})
