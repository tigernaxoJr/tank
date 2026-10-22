import { defineStatus } from '../statusEffects'

/** 破甲：裝甲與護盾失效（酸蝕彈） */
export default defineStatus({
  id: 'corrode',
  sortOrder: 2,
  name: '破甲',
  description: '裝甲減免與護盾都不再生效。',
  icon: '⚠',
  color: '#84cc16',
  kind: 'debuff',
  ignoresArmor: true,
})
