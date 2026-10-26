import { defineTank } from '../tankBlueprint'

export default defineTank({
  id: 'quillback',
  sortOrder: 10,
  name: '刺蝟 Quillback',
  subtitle: '反傷重甲 · 滾刺轟擊',
  description: '它把自己捲成一顆刺球，誰靠近誰吃虧。滾刺球落地後貼著地面滾出去再爆開，針雨彈從高空灑下一整片尖針；皮厚、跑得慢，近身打它得付出代價。',
  maxHp: 108,
  moveFuel: 200,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 1,
  climbPerPx: 3,
  fallSafePx: 36,
  aimMinDeg: 20,
  aimMaxDeg: 85,
  windSensitivity: 0.9,
  armor: 1,
  shield: 0,
  resist: { fall: 0.3 },
  passive: { name: '滿背尖刺', description: '尖刺扇讓每次爆炸固定少受 1 點傷害，從高處摔落的傷害減少三成。' },
  shots: ['QUILL_ROLL', 'QUILL_RAIN'],
  sprite: {
    scale: 0.4,
    labelLift: 12,
    // 座標都是車身貼圖像素（230×233）
    pivotTex: [196, 53],
    barrelZ: 'front',
    parts: [
      { id: 'collar', z: 'overBarrel', at: [170, 22], origin: [0, 0] },
      { id: 'spikes', z: 'overHull', at: [150, 165], origin: [1, 1], motion: { kind: 'sway', ampDeg: 2, periodMs: 2400 } },
      { id: 'nose', z: 'overHull', at: [222, 120], origin: [0.5, 0.5] },
    ],
    face: { x: 28, y: -42, eyeGap: 14, eyeSize: 7, lid: 0xf1e6cf, iris: 0x24182e, farScale: 0.8, rest: 0.9, mouthDy: 14, restMouth: 'smile' },
  },
})
