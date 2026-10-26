import { defineTank } from '../tankBlueprint'

export default defineTank({
  id: 'bumble',
  sortOrder: 9,
  name: '蜜蜂轟炸機 Bumble',
  subtitle: '懸浮游擊 · 蜂群齊射',
  description: '它從不貼地走路，翅膀一振就越過彈坑和土丘。血量最薄，輸出靠量：蜂群彈一次放出四隻小蜜蜂，蜂巢彈落地爆成蜜漿四濺。',
  maxHp: 76,
  moveFuel: 380,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 1,
  climbPerPx: 5,
  fallSafePx: 120,
  aimMinDeg: 10,
  aimMaxDeg: 90,
  windSensitivity: 1.1,
  armor: 0,
  shield: 0,
  resist: { fall: 1 },
  passive: { name: '輕盈', description: '翅膀托著車身：免疫摔落傷害，爬坡能力是一般坦克的兩倍以上。' },
  shots: ['BUMBLE_SWARM', 'BUMBLE_HIVE'],
  sprite: {
    scale: 0.4,
    labelLift: 8,
    // 座標都是車身貼圖像素（240×216）
    pivotTex: [174, 105],
    barrelZ: 'front',
    parts: [
      { id: 'collar', z: 'overBarrel', at: [146, 65], origin: [0, 0] },
      { id: 'antenna', z: 'overHull', at: [80, 18], origin: [0.18, 1], motion: { kind: 'sway', ampDeg: 5, periodMs: 1800 } },
      { id: 'wing', z: 'overHull', at: [165, 30], origin: [0.5, 1], motion: { kind: 'sway', ampDeg: 9, periodMs: 160 } },
    ],
    face: { x: -26, y: -45, eyeGap: 16, eyeSize: 8, lid: 0xf7d23a, iris: 0x2b1b10, farScale: 0.85, rest: 0.9, mouthDy: 15, restMouth: 'smile' },
  },
})
