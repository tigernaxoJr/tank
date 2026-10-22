/**
 * 坦克對轟平衡模擬（蒙地卡羅）。
 *
 * 用法：node tools/balance/duel_sim.mjs
 *
 * 模型：落點誤差為 2D 高斯 (σ = 瞄準誤差 px)，傷害與遊戲一致：
 *   trunc((r - d) * round(maxDamage * damageMultiplier) / r)，其中 r = 傷害範圍 damageRadius + damageRadiusBonus（挖地用的 terrainRadius 不影響對轟勝率）。
 * 雙方輪流開火（先攻各半），每台坦克挑選期望傷害較高的專屬砲彈，輸出各配對的勝率。
 *
 * 平衡原則：血量愈少輸出愈高；目標是三種瞄準精度下勝率都落在約 40% ~ 60%。
 * 數值需與 src/features/battle/domain 的 tankRegistry / projectileRegistry 同步（修改任一邊都要重跑）。
 */
const SHELLS = {
  MISSILE_STANDARD: { dmg: 34, r: 40, magnet: 30, direct: 1 },
  MISSILE_HEAVY: { dmg: 22, r: 50, magnet: 22, direct: 1 },
  MISSILE_PLASMA: { dmg: 52, r: 30, magnet: 26, direct: 1 },
  MISSILE_RAILGUN: { dmg: 75, r: 18, magnet: 0, direct: 1 },
}
const TANKS = {
  aegis: { hp: 100, mult: 1.0, bonus: 0, armor: 0, shield: 0, resist: 0, shots: ['MISSILE_STANDARD', 'MISSILE_HEAVY'] },
  goliath: { hp: 130, mult: 0.82, bonus: 0, armor: 2, shield: 0, resist: 0, shots: ['MISSILE_HEAVY', 'MISSILE_STANDARD'] },
  zephyr: { hp: 80, mult: 1.15, bonus: 0, armor: 0, shield: 0, resist: 0, shots: ['MISSILE_PLASMA', 'MISSILE_RAILGUN'] },
}

function gauss() {
  let u = 0
  while (!u) u = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random())
}
// 進入吸附半徑視為直擊（爆心在坦克中心：全額 × 直擊倍率）；其餘依距離線性衰減。defender 的裝甲 / 爆炸抗性在此結算
function dmgOf(t, s, sigma, def) {
  const sh = SHELLS[s]
  const r = sh.r + t.bonus
  const d = Math.hypot(gauss() * sigma, gauss() * sigma)
  const full = Math.round(sh.dmg * t.mult)
  let raw
  if (d <= Math.max(22, sh.magnet)) raw = Math.round(full * sh.direct)
  else if (d >= r) raw = 0
  else raw = Math.trunc(((r - d) * full) / r)
  if (raw <= 0) return 0
  return def ? Math.max(1, Math.round((raw - def.armor) * (1 - def.resist))) : raw
}
function expected(t, s, sigma) {
  let a = 0
  for (let i = 0; i < 2000; i++) a += dmgOf(t, s, sigma)
  return a / 2000
}
function bestShot(t, sigma) {
  return t.shots.map((s) => [expected(t, s, sigma), s]).sort((a, b) => b[0] - a[0])[0][1]
}

const names = Object.keys(TANKS)
for (const sigma of [25, 45, 70]) {
  const best = Object.fromEntries(names.map((n) => [n, bestShot(TANKS[n], sigma)]))
  console.log(`σ=${sigma}px  best shell: ${JSON.stringify(best)}`)
  console.log('  win% of row vs column:', names.join(' / '))
  for (const a of names) {
    let line = `  ${a.padEnd(8)}`
    for (const b of names) {
      if (a === b) {
        line += '  --  '
        continue
      }
      let wins = 0
      const N = 4000
      for (let i = 0; i < N; i++) {
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
      line += ` ${((100 * wins) / N).toFixed(0).padStart(3)}% `
    }
    console.log(line)
  }
}
