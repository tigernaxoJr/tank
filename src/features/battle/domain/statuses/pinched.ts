import { defineStatus } from '../statusEffects'

/** 夾住：裝甲與護盾失效，移動燃料上限降低，仍可開砲（寄居蟹的鉗擊彈）；結束後 1 回合免疫 */
export default defineStatus({
  id: 'pinched',
  sortOrder: 3,
  name: '夾住',
  description: '裝甲與護盾失效，移動燃料上限降低，仍可正常瞄準開火。',
  icon: '✂',
  color: '#f87171',
  kind: 'debuff',
  moveFuelPermille: (s) => 1000 - s.power * 10,
  ignoresArmor: true,
  immuneAfterTurns: 1,
})
