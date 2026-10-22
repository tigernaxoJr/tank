import { defineTank } from '../tankBlueprint'

export default defineTank({
  id: 'zephyr',
  sortOrder: 1,
  name: '疾風遊俠 Zephyr',
  subtitle: '貼臉刺客 · 散彈爆發',
  description: '八十公尺外它只是一陣風；八公尺內它就是霰彈槍。全場最多燃料、血量最薄，衝到對手面前用散彈一口氣打出爆發。',
  maxHp: 80,
  moveFuel: 420,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 1,
  climbPerPx: 4,
  fallSafePx: 70,
  windSensitivity: 1.1,
  armor: 0,
  shield: 0,
  resist: { fall: 0.5 },
  passive: { name: '滑行', description: '落差 70 px 內不受摔落傷害，摔落傷害再減半，可以直接跳下懸崖突襲。' },
  shots: ['ZEPHYR_SCATTER', 'ZEPHYR_SKIP'],
  sprite: { scale: 0.4, pivotX: -6, pivotY: -25, face: { x: 14, y: -9, eyeGap: 14, eyeSize: 5.2 } },
})
