import { defineStatus } from '../statusEffects'

/** 泥濘：移動燃料上限降低，仍可開砲（跳蛙的泥巴彈）；結束後 1 回合免疫 */
export default defineStatus({
  id: 'mired',
  sortOrder: 6,
  name: '泥濘',
  description: '渾身黏著泥巴，移動燃料上限降低，仍可正常瞄準開火。',
  icon: '●',
  color: '#a16207',
  kind: 'debuff',
  moveFuelPermille: (s) => 1000 - s.power * 10,
  immuneAfterTurns: 1,
})
