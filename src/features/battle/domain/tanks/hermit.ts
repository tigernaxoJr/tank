import { defineTank } from '../tankBlueprint'
import { HERMIT_FACE } from '../faceAtlases/hermit'

export default defineTank({
  id: 'hermit',
  sortOrder: 7,
  name: '寄居蟹 Hermit',
  subtitle: '貼身突擊 · 鉗擊夾住',
  description: '它背著一顆砲彈殼當房子，扛著一隻大鉗當砲管。遠處先用連發彈殼節磨血，貼近之後一記鉗擊，讓你護甲全失、跑也跑不快。',
  maxHp: 95,
  moveFuel: 320,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 1,
  climbPerPx: 2,
  fallSafePx: 36,
  aimMinDeg: 15,
  aimMaxDeg: 85,
  windSensitivity: 1,
  armor: 1,
  shield: 0,
  resist: {},
  passive: { name: '砲彈殼屋', description: '黃銅彈殼讓每次爆炸固定少受 1 點傷害。' },
  shots: ['HERMIT_BURST', 'HERMIT_CLAW'],
  sprite: {
    scale: 0.4,
    labelLift: 15,
    pivotX: 36.4,
    pivotY: -22.4,
    face: { x: 25.2, y: -55.2, eyeGap: 20.8, eyeSize: 7, lid: 0xe8735f, iris: 0x3b2428, farScale: 0.8, rest: 0.9, mouthDy: 14, restMouth: 'smile', atlas: HERMIT_FACE, noMouth: true },
  },
})
