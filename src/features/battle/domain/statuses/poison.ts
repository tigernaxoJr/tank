import { defineStatus } from '../statusEffects'

/** 中毒：自己回合開始時固定扣血（毒霧彈） */
export default defineStatus({
  id: 'poison',
  sortOrder: 0,
  name: '中毒',
  description: '每個自己的回合開始時扣血。',
  icon: '☠',
  color: '#a855f7',
  kind: 'debuff',
  damageType: 'poison',
  turnStartDamage: (s) => s.power,
})
