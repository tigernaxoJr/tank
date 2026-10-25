import { defineStatus } from '../statusEffects'

/** 濕透：下一次受到的爆炸傷害增加，吃到一次傷害後消失（海馬的潮湧彈）；結束後 1 回合免疫 */
export default defineStatus({
  id: 'drenched',
  sortOrder: 5,
  name: '濕透',
  description: '下一次受到的爆炸傷害增加 40%，受傷後消失。',
  icon: '💧',
  color: '#38bdf8',
  kind: 'debuff',
  explosionBonusPct: (s) => s.power,
  consumedByExplosion: true,
  immuneAfterTurns: 1,
})
