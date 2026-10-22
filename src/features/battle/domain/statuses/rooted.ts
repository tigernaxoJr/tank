import { defineStatus } from '../statusEffects'

/** 紮根：上一回合沒移動，下一次受到的爆炸傷害減少（鐵壁堡壘被動），受傷一次就消失 */
export default defineStatus({
  id: 'rooted',
  sortOrder: 3,
  name: '紮根',
  description: '下一次受到的爆炸傷害減少。',
  icon: '⛨',
  color: '#f59e0b',
  kind: 'buff',
  explosionReductionPct: (s) => s.power,
  consumedByExplosion: true,
})
