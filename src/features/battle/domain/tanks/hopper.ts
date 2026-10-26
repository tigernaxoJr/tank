import { defineTank } from '../tankBlueprint'

export default defineTank({
  id: 'hopper',
  sortOrder: 11,
  name: '跳蛙 Hopper',
  subtitle: '拉近距離 · 彈簧蹦跳',
  description: '它靠一條彈簧後腿蹦蹦跳跳，哪裡都去得了。舌鞭彈命中後把對手往自己拉近，泥巴彈砸出一坨黏土讓對手跑不動；拉近之後，再補一發近距離轟擊。',
  maxHp: 100,
  moveFuel: 300,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 1,
  climbPerPx: 4,
  fallSafePx: 80,
  aimMinDeg: 15,
  aimMaxDeg: 88,
  windSensitivity: 1,
  armor: 0,
  shield: 0,
  resist: { fall: 0.6 },
  passive: { name: '彈簧腿', description: '摔落傷害減少六成，爬坡能力強，跳過小坑不費力。' },
  shots: ['HOPPER_TONGUE', 'HOPPER_MUD'],
  sprite: {
    scale: 0.4,
    labelLift: 10,
    // 座標都是車身貼圖像素（260×201）
    pivotTex: [98, 16],
    barrelZ: 'front',
    parts: [
      { id: 'collar', z: 'overBarrel', at: [69, 1], origin: [0, 0] },
      { id: 'leg', z: 'overHull', at: [62, 206], origin: [0.5, 1], motion: { kind: 'pop', on: 'fire', dy: 4, rotDeg: 0, ms: 240 } },
    ],
    face: { x: 22, y: -55, eyeGap: 10, eyeSize: 7, lid: 0xd4dc3a, iris: 0x24301a, farScale: 0.85, rest: 0.85, mouthDy: 15, restMouth: 'flat' },
  },
})
