import { defineTank } from '../tankBlueprint'
import { SNAILER_FACE } from '../faceAtlases/snailer'

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
    labelLift: 32,
    pivotX: 35.2,
    pivotY: -34,
    // 臉是貼圖（2D 生圖的眼白 / 眼皮 / 嘴，瞳孔仍由程式追視線）：x / y = 兩眼柄頂球的中點，eyeGap = 兩球中心距
    face: { x: 26.4, y: -59.8, eyeGap: 12.7, eyeSize: 5.6, lid: 0xd9a98a, iris: 0x2a3b7a, farScale: 0.9, rest: 0.9, mouthDy: 14, restMouth: 'smile', atlas: SNAILER_FACE, noMouth: true },
  },
})
