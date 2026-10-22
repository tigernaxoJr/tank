import { defineTank } from '../tankBlueprint'

export default defineTank({
  id: 'hawkeye',
  sortOrder: 5,
  name: '鷹眼 Hawkeye',
  subtitle: '高風險狙擊 · 一擊重創',
  description: '它整場只需要打中兩發。磁軌狙擊彈幾乎不受重力與吸附幫忙，偏一點就落空；偵察照明彈讓接下來兩回合看見完整彈道。',
  maxHp: 80,
  moveFuel: 200,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 1,
  climbPerPx: 3,
  fallSafePx: 30,
  windSensitivity: 0.7,
  armor: 0,
  shield: 0,
  resist: {},
  passive: { name: '鷹眼', description: '風敏感度 0.7，砲彈最不容易被風吹偏。' },
  shots: ['HAWK_RAIL', 'HAWK_FLARE'],
  sprite: { scale: 0.4, pivotX: -3, pivotY: -23, face: { x: 16, y: -8, eyeGap: 14, eyeSize: 5.4 } },
})
