import { defineStatus } from '../statusEffects'

/** 冰凍：移動燃料上限降低，仍可開砲（不跳過回合）；結束後 1 回合免疫（凍結彈） */
export default defineStatus({
  id: 'freeze',
  sortOrder: 1,
  name: '冰凍',
  description: '移動燃料上限降低，仍可正常瞄準開火。',
  icon: '❄',
  color: '#38bdf8',
  kind: 'debuff',
  moveFuelPermille: (s) => 1000 - s.power * 10,
  immuneAfterTurns: 1,
})
