import { defineStatus } from '../statusEffects'

/** 偵察：瞄準預覽畫出完整彈道與落點（偵察照明彈） */
export default defineStatus({
  id: 'scout',
  sortOrder: 4,
  name: '偵察',
  description: '瞄準預覽會畫出完整彈道與落點。',
  icon: '◉',
  color: '#facc15',
  kind: 'buff',
  fullAimPreview: true,
})
