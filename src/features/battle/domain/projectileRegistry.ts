/**
 * Projectile Registry (模組化砲彈與特效基底引擎)
 *
 * 設計規範：
 * 1. 日後要新增任何特殊砲彈（如分裂彈、電磁彈、鑽地彈）或自訂飛行尾焰/爆炸特效，
 *    只需在 `projectiles/` 新增一個檔（default export `defineProjectile({...})`），本檔以 import.meta.glob 自動收集。
 * 2. 物理一致性：一般砲彈一律使用同一個重力 `STANDARD_GRAVITY_MILLI`（彈種重量只影響爆炸與風阻，
 *    不影響落地加速度）；只有「特殊彈」（如電漿彈）才可以自訂 `gravityMilli`。
 *    播放時鐘固定為每模擬步 `PLAYBACK_MS_PER_STEP` 毫秒，**不依射程拉伸或壓縮**，
 *    所以每一發看起來的重力加速度都相同；常見射擊約滯空 1.5s ~ 3.3s，保有「投籃拋物線節奏」。
 * 3. 爆炸後以 `postImpactHoldMs` 停留觀察彈坑與傷害，再平滑切換至下一位行動玩家。
 */
import type { BulletType } from '@/shared/kernel/types'
import type { ProjectileBlueprint } from './projectileBlueprint'

export * from './projectileBlueprint'

// 新增彈種只需新增 projectiles/<name>.ts，不必改這裡
const modules = import.meta.glob<{ default: ProjectileBlueprint }>('./projectiles/*.ts', { eager: true })

export const PROJECTILE_LIST: ProjectileBlueprint[] = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => a.sortOrder - b.sortOrder)

export const PROJECTILE_REGISTRY: Record<BulletType, ProjectileBlueprint> = Object.fromEntries(
  PROJECTILE_LIST.map((p) => [p.id, p]),
)

/** 查砲彈；id 不認得時退回清單第一種 */
export function getProjectileSpec(id: BulletType | undefined): ProjectileBlueprint {
  return (id && PROJECTILE_REGISTRY[id]) || PROJECTILE_LIST[0]
}
