/**
 * 坦克對轟平衡模擬（蒙地卡羅，固定種子可重現）。
 *
 * 用法：node tools/balance/duel_sim.mjs
 *
 * 模型：落點誤差為 2D 高斯 (σ = 瞄準誤差 px)，傷害與遊戲一致：
 *   trunc((r - d) * round(maxDamage * damageMultiplier) / r)，其中 r = 傷害範圍 damageRadius + damageRadiusBonus（挖地用的 terrainRadius 不影響對轟勝率）。
 * 雙方輪流開火（先攻各半），每台坦克挑選期望傷害較高的專屬砲彈，輸出各配對的勝率。
 *
 * 可重現性：對戰用固定種子的 PRNG（mulberry32），每次執行結果完全相同。
 * 選彈用期望傷害的確定性數值積分（不取樣），避免兩種砲彈接近平手時因雜訊翻面。
 *
 * 平衡原則：血量愈少輸出愈高；目標是三種瞄準精度下勝率都落在約 40% ~ 60%。
 * 數值需與 src/features/battle/domain 的 tankRegistry / projectileRegistry 同步（修改任一邊都要重跑）。
 */
const SEED = 20261022
const DUEL_N = 20000
const SELECT_BINS = 200000

const SHELLS = {
  MISSILE_STANDARD: { dmg: 34, r: 40, magnet: 30, direct: 1 },
  MISSILE_HEAVY: { dmg: 22, r: 50, magnet: 22, direct: 1 },
  MISSILE_PLASMA: { dmg: 52, r: 40, magnet: 22, direct: 1 },
  MISSILE_RAILGUN: { dmg: 75, r: 18, magnet: 0, direct: 1 },
}
const TANKS = {
  aegis: { hp: 100, mult: 1.0, bonus: 0, armor: 0, shield: 0, resist: 0, shots: ['MISSILE_STANDARD', 'MISSILE_HEAVY'] },
  goliath: { hp: 130, mult: 0.82, bonus: 0, armor: 2, shield: 0, resist: 0, shots: ['MISSILE_HEAVY', 'MISSILE_STANDARD'] },
  zephyr: { hp: 80, mult: 1.15, bonus: 0, armor: 0, shield: 0, resist: 0, shots: ['MISSILE_PLASMA', 'MISSILE_RAILGUN'] },
}

// mulberry32：固定種子的 32 位元 PRNG，回傳 [0, 1)
function makeRng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = makeRng(SEED)

function gauss() {
  let u = 0
  while (!u) u = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

// 攻擊者造成的原始傷害（未計防禦）。進入吸附半徑視為直擊（全額 × 直擊倍率）；其餘依距離線性衰減。
function rawDamage(t, s, d) {
  const sh = SHELLS[s]
  const r = sh.r + t.bonus
  const full = Math.round(sh.dmg * t.mult)
  if (d <= Math.max(22, sh.magnet)) return Math.round(full * sh.direct)
  if (d >= r) return 0
  return Math.trunc(((r - d) * full) / r)
}
// defender 的裝甲 / 爆炸抗性在此結算
function applyDefense(raw, def) {
  if (raw <= 0) return 0
  return def ? Math.max(1, Math.round((raw - def.armor) * (1 - def.resist))) : raw
}
function dmgOf(t, s, sigma, def) {
  const d = Math.hypot(gauss() * sigma, gauss() * sigma)
  return applyDefense(rawDamage(t, s, d), def)
}
// 期望傷害（無防禦）：落點距離為 Rayleigh 分布，以分位數中點積分，完全確定性
function expected(t, s, sigma) {
  let acc = 0
  for (let i = 0; i < SELECT_BINS; i++) {
    const u = (i + 0.5) / SELECT_BINS
    acc += rawDamage(t, s, sigma * Math.sqrt(-2 * Math.log(1 - u)))
  }
  return acc / SELECT_BINS
}
function bestShot(t, sigma) {
  return t.shots.map((s) => [expected(t, s, sigma), s]).sort((a, b) => b[0] - a[0])[0][1]
}

const names = Object.keys(TANKS)
// σ=5 為近似精準（電腦 σ→0）：不納入 40%~60% 目標，只用來檢查「好操作的一方在精準時是否偏弱」（見 docs/06 §三之一）
for (const sigma of [5, 25, 45, 70]) {
  const best = Object.fromEntries(names.map((n) => [n, bestShot(TANKS[n], sigma)]))
  const label = sigma === 5 ? '（近似精準，參考用）' : ''
  console.log(`σ=${sigma}px${label}  best shell: ${JSON.stringify(best)}`)
  console.log('  win% of row vs column:', names.join(' / '))
  for (const a of names) {
    let line = `  ${a.padEnd(8)}`
    for (const b of names) {
      if (a === b) {
        line += '  --  '
        continue
      }
      let wins = 0
      for (let i = 0; i < DUEL_N; i++) {
        let ha = TANKS[a].hp + TANKS[a].shield
        let hb = TANKS[b].hp + TANKS[b].shield // 護盾與 HP 同為緩衝池，模擬時合併計算
        let aTurn = i % 2 === 0
        for (let turn = 0; turn < 200 && ha > 0 && hb > 0; turn++) {
          if (aTurn) hb -= dmgOf(TANKS[a], best[a], sigma, TANKS[b])
          else ha -= dmgOf(TANKS[b], best[b], sigma, TANKS[a])
          aTurn = !aTurn
        }
        if (hb <= 0 && ha > 0) wins++
        else if (ha <= 0 && hb <= 0) wins += 0.5
      }
      line += ` ${((100 * wins) / DUEL_N).toFixed(0).padStart(3)}% `
    }
    console.log(line)
  }
}
