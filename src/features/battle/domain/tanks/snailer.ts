import { defineTank } from '../tankBlueprint'

export default defineTank({
  id: 'snailer',
  sortOrder: 6,
  name: '蝸牛迫擊 Snailer',
  subtitle: '慢速重砲 · 縮殼',
  description: '它走得最慢，但從不白走。背著一座螺旋殼堡壘，裝甲厚、血量足，一發迫擊彈就是一個大坑。',
  maxHp: 112,
  moveFuel: 100,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 1,
  climbPerPx: 2,
  fallSafePx: 36,
  aimMinDeg: 25,
  aimMaxDeg: 85,
  windSensitivity: 1,
  armor: 1,
  shield: 0,
  resist: { fall: 0.3 },
  passive: { name: '縮殼', description: '厚殼讓每次爆炸固定少受 1 點傷害，摔落傷害也減 30%；代價是整台車慢到幾乎走不動。' },
  shots: ['SNAILER_SHELL', 'SNAILER_STICKY'],
  sprite: {
    scale: 0.4,
    labelLift: 20,
    pivotX: 15.6,
    pivotY: -37.2,
    // 眼睛長在金色眼柄頂端（貼圖不畫眼睛，遊戲疊上去）：眼皮 = 眼柄金色，微微下垂的憨厚表情
    face: { x: 33.4, y: -29.4, eyeGap: 6, eyeSize: 6, lid: 0xedb63a, iris: 0x2a3b7a, farScale: 0.85, rest: 0.9, mouthDy: 10, restMouth: 'smile' },
  },
})
