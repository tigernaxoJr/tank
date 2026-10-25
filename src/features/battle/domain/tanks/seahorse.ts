import { defineTank } from '../tankBlueprint'
import { SEAHORSE_FACE } from '../faceAtlases/seahorse'

export default defineTank({
  id: 'seahorse',
  sortOrder: 8,
  name: '海馬 Seahorse',
  subtitle: '潮汐砲兵 · 濕透後補一發',
  description: '長吻就是砲管，捲尾牢牢抓著地面。先用潮湧泡泡把對手弄濕，下一次爆炸傷害 +40%，再補上一發雷鳴墨彈。',
  maxHp: 85,
  moveFuel: 260,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 1,
  climbPerPx: 2,
  fallSafePx: 30,
  aimMinDeg: 20,
  aimMaxDeg: 80,
  windSensitivity: 1,
  armor: 0,
  shield: 0,
  resist: {},
  knockbackImmune: true,
  passive: { name: '捲尾抓地', description: '捲尾牢牢抓住地面，免疫所有擊退。' },
  shots: ['SEAHORSE_BUBBLE', 'SEAHORSE_BOLT'],
  sprite: {
    scale: 0.34,
    labelLift: 8,
    pivotX: 21.1,
    pivotY: -67.6,
    face: { x: 13.6, y: -70.5, eyeGap: 8.5, eyeSize: 3.6, lid: 0xe8735f, iris: 0x3b2428, farScale: 0.8, rest: 0.9, mouthDy: 8, restMouth: 'smile', atlas: SEAHORSE_FACE, noMouth: true, singleEye: true },
  },
})
