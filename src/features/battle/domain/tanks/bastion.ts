import { defineTank } from '../tankBlueprint'

export default defineTank({
  id: 'bastion',
  sortOrder: 0,
  name: '鐵壁堡壘 Bastion',
  subtitle: '據點守衛 · 堆牆拋射',
  description: '它不追你。它把山蓋在你面前，然後從山後面打你。全場最厚的血量與裝甲，幾乎不移動，用築壘彈堆出掩體，再以高拋迫擊彈越牆轟炸。',
  maxHp: 110,
  moveFuel: 140,
  damageRadiusBonus: 0,
  terrainRadiusBonus: 0,
  damageMultiplier: 1,
  climbPerPx: 2,
  fallSafePx: 40,
  windSensitivity: 0.9,
  armor: 1,
  shield: 0,
  resist: { fall: 0.3 },
  passive: { name: '紮根', description: '整個回合沒有移動，下一次受到的爆炸傷害 −20%。' },
  idleStatus: { status: 'rooted', turns: 1, power: 20 },
  shots: ['BASTION_MORTAR', 'BASTION_RAMPART'],
  sprite: { scale: 0.4, pivotX: -2.1, pivotY: -44.2, face: { x: 24.2, y: -16.6, eyeGap: 12, eyeSize: 7, lid: 0xd3c9b2, iris: 0xc07a2a, farScale: 0.78, rest: 0.82, mouthDy: 13, restMouth: 'flat', brow: 'block' } },
})
