/**
 * 彈藥配置（Loadout）：每台坦克從自己的砲彈池（`TankBlueprint.shots`）選 2 種，依序為主彈、副彈，
 * 對戰中只能在這兩種之間切換。
 *
 * 連線對戰要有迷霧（開火前不知道對手帶什麼），又要確保沒有中途偷換，所以用「承諾 + 揭露」：
 *  - 每格各算一個葉子雜湊 `leaf = SHA-256(機種|格|砲彈|鹽)`（鹽每格獨立，否則揭露一格的鹽就能反推另一格）。
 *  - 兩個葉子合成 Merkle 根 `root = SHA-256(leaf0 | leaf1)`，開戰前只廣播根。
 *  - 開火時揭露「用的那一格」的鹽與「另一格的葉子雜湊」，收到的人重算根比對；沒用過的那一格始終不會洩漏。
 * 單機熱座與電腦不需要迷霧，直接以明牌 `loadout` 記在坦克上。
 */
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import type { BulletType, LoadoutReveal, TankArchetypeId } from '@/shared/kernel/types'
import { getTankSpec } from './tankRegistry'

export const LOADOUT_SIZE = 2

/** 玩家自己保管的承諾原文（不得放進房間名單、快照或任何廣播） */
export interface LoadoutSecret {
  readonly loadout: readonly BulletType[]
  /** 每格一個鹽，長度 = LOADOUT_SIZE */
  readonly salts: readonly string[]
}

const hash = (text: string): string => bytesToHex(sha256(utf8ToBytes(text)))
const leafOf = (tankId: TankArchetypeId, slot: number, bullet: BulletType, salt: string): string =>
  hash(`${tankId}|${slot}|${bullet}|${salt}`)
const rootOf = (leaf0: string, leaf1: string): string => hash(`${leaf0}|${leaf1}`)

/** 預設配置：砲彈池前兩種 */
export function defaultLoadout(tankId: TankArchetypeId): BulletType[] {
  return getTankSpec(tankId).shots.slice(0, LOADOUT_SIZE)
}

/** 整理使用者的選擇：必須是這台坦克砲彈池內、不重複、剛好 LOADOUT_SIZE 種，否則退回預設 */
export function sanitizeLoadout(tankId: TankArchetypeId, picks: readonly BulletType[] | null | undefined): BulletType[] {
  const pool = getTankSpec(tankId).shots
  const ok =
    !!picks &&
    picks.length === LOADOUT_SIZE &&
    new Set(picks).size === LOADOUT_SIZE &&
    picks.every((b) => pool.includes(b))
  return ok ? [...picks] : defaultLoadout(tankId)
}

/** 這台坦克現在能用哪些砲彈：已知配置優先，否則是整個砲彈池 */
export function availableShots(tank: { tankId: TankArchetypeId; loadout?: readonly BulletType[] }): readonly BulletType[] {
  return tank.loadout ?? getTankSpec(tank.tankId).shots
}

export function createLoadoutSecret(tankId: TankArchetypeId, picks: readonly BulletType[]): LoadoutSecret {
  return {
    loadout: sanitizeLoadout(tankId, picks),
    salts: Array.from({ length: LOADOUT_SIZE }, () => bytesToHex(randomBytes(16))),
  }
}

function leavesOf(tankId: TankArchetypeId, secret: LoadoutSecret): [string, string] {
  return [
    leafOf(tankId, 0, secret.loadout[0], secret.salts[0]),
    leafOf(tankId, 1, secret.loadout[1], secret.salts[1]),
  ]
}

/** 要廣播的承諾（Merkle 根） */
export function loadoutRoot(tankId: TankArchetypeId, secret: LoadoutSecret): string {
  const [l0, l1] = leavesOf(tankId, secret)
  return rootOf(l0, l1)
}

/** 開火時要附上的揭露；`bullet` 不在配置內時回傳 null */
export function revealFor(tankId: TankArchetypeId, secret: LoadoutSecret, bullet: BulletType): LoadoutReveal | null {
  const slot = secret.loadout.indexOf(bullet)
  if (slot < 0) return null
  const leaves = leavesOf(tankId, secret)
  return { slot, salt: secret.salts[slot], sibling: leaves[1 - slot] }
}

/** 驗證 `bullet` 確實是承諾 `root` 中揭露那一格的砲彈 */
export function verifyReveal(tankId: TankArchetypeId, root: string, bullet: BulletType, reveal: LoadoutReveal | undefined): boolean {
  if (!reveal || (reveal.slot !== 0 && reveal.slot !== 1)) return false
  if (typeof reveal.salt !== 'string' || typeof reveal.sibling !== 'string') return false
  const mine = leafOf(tankId, reveal.slot, bullet, reveal.salt)
  return (reveal.slot === 0 ? rootOf(mine, reveal.sibling) : rootOf(reveal.sibling, mine)) === root
}
