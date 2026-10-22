/**
 * 坦克對轟平衡模擬（蒙地卡羅，固定種子可重現）。
 *
 * 用法：node tools/balance/duel_sim.mjs
 *      （可用環境變數覆寫假設：WIND_MAX、WIND_SIGMA、WIND_COMP_ERROR）
 *
 * 模型：
 * - 落點誤差為 2D 高斯 (σ = 瞄準誤差 px)，傷害與遊戲一致：
 *   trunc((r - d) * round(maxDamage * damageMultiplier) / r)，其中 r = 傷害範圍 damageRadius + damageRadiusBonus（挖地用的 terrainRadius 不影響對轟勝率）。
 * - 風（只影響精準度）：風力 = 風速 × 砲彈風係數 × 坦克風敏感度（同 `effectiveWindMilli`），每步加到水平速度，
 *   飛行 FLIGHT_STEPS 步造成的位移 ≈ 風力 × T² / 2。玩家會補償風的平均偏移，殘餘誤差為
 *   WIND_COMP_ERROR × 位移，加進水平方向的 σ（σx = √(σ² + 殘餘²)）。
 * - 風速分佈：不是每場都有風。風速服從以 0 為中心的離散常態分佈（標準差 WIND_SIGMA），
 *   截斷在 [-WIND_MAX, WIND_MAX]，無風機率最高，微風、大風依距離遞減。每場對戰抽一次，整場固定。
 * - 暫不考慮：地形、移動、風的時間變化、直擊以外的導引細節。
 * - 雙方輪流開火（先攻各半），每台坦克挑選「對風速分佈加權平均後」期望傷害較高的專屬砲彈，輸出各配對的勝率。
 *
 * 可重現性：對戰用固定種子的 PRNG（mulberry32），每次執行結果完全相同。
 * 選彈用期望傷害的確定性網格積分（不取樣），避免兩種砲彈接近平手時因雜訊翻面。
 *
 * 平衡原則：血量愈少輸出愈高；目標是三種瞄準精度下勝率都落在約 40% ~ 60%。
 * 數值直接讀自 src/features/battle/domain 的 tankRegistry / projectileRegistry，改完註冊表重跑即可。
 */
import { createServer } from 'vite'

const SEED = 20261022
const DUEL_N = 20000
const WIND_MAX = Number(process.env.WIND_MAX ?? 9)
const WIND_SIGMA = Number(process.env.WIND_SIGMA ?? 3)
const WIND_COMP_ERROR = Number(process.env.WIND_COMP_ERROR ?? 0.25)
const FLIGHT_STEPS = 120
const BOT_PERFECT_SIGMA = 5 // 「變態」電腦的近似精準參考（見 sigmaX）
const GRID_HALF = 6
const GRID_STEP = 0.05

// 數值直接讀自遊戲的註冊表（單一來源），不再維護副本；用 vite 的 ssrLoadModule 載入 TS。
const vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, logLevel: 'silent' })
const { PROJECTILE_REGISTRY } = await vite.ssrLoadModule('/src/features/battle/domain/projectileRegistry.ts')
const { TANK_REGISTRY } = await vite.ssrLoadModule('/src/features/battle/domain/tankRegistry.ts')
await vite.close()

const SHELLS = Object.fromEntries(
  Object.values(PROJECTILE_REGISTRY).map((p) => [
    p.id,
    { dmg: p.maxDamage, r: p.damageRadius, magnet: p.magnetRadius, direct: p.directHitMultiplier, wm: p.windMultiplier },
  ]),
)
const TANKS = Object.fromEntries(
  Object.values(TANK_REGISTRY).map((t) => [
    t.id,
    {
      hp: t.maxHp,
      mult: t.damageMultiplier,
      sens: t.windSensitivity,
      bonus: t.damageRadiusBonus,
      armor: t.armor,
      shield: t.shield,
      resist: t.resist.explosion ?? 0,
      shots: [...t.shots],
    },
  ]),
)

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

// 風速分佈：離散常態（以 0 為中心，無風機率最高），截斷在 [-WIND_MAX, WIND_MAX] 並正規化
const WIND_DIST = []
{
  let total = 0
  for (let w = -WIND_MAX; w <= WIND_MAX; w++) {
    const p = Math.exp((-w * w) / (2 * WIND_SIGMA * WIND_SIGMA))
    WIND_DIST.push([w, p])
    total += p
  }
  for (const entry of WIND_DIST) entry[1] /= total
}
// 依分佈抽一個風速（整數）
function sampleWind() {
  let u = rng()
  for (const [w, p] of WIND_DIST) {
    u -= p
    if (u < 0) return w
  }
  return WIND_DIST[WIND_DIST.length - 1][0]
}

// 風力（千分位整數，同 tankRegistry.effectiveWindMilli）
function windMilli(t, s, wind) {
  return Math.round(wind * SHELLS[s].wm * t.sens)
}
// 風造成的水平位移（px）：每步加速 windMilli，飛行 T 步 ≈ windMilli·T²/2/1000
function windDisplacement(t, s, wind) {
  return (Math.abs(windMilli(t, s, wind)) * FLIGHT_STEPS * FLIGHT_STEPS) / 2000
}
// 水平方向的殘餘誤差 σx（玩家補償平均偏移後，仍有比例性的誤差）。
// σ ≤ BOT_PERFECT_SIGMA 代表「變態」電腦：瞄準解已用 simulateShot 含風、且抖動為 0，風對它沒有殘餘誤差。
function sigmaX(t, s, sigma, wind) {
  if (sigma <= BOT_PERFECT_SIGMA) return sigma
  const resid = WIND_COMP_ERROR * windDisplacement(t, s, wind)
  return Math.hypot(sigma, resid)
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
function dmgOf(t, s, sigma, wind, def) {
  const sx = sigmaX(t, s, sigma, wind)
  const d = Math.hypot(gauss() * sx, gauss() * sigma)
  return applyDefense(rawDamage(t, s, d), def)
}

// 期望傷害（無防禦）：2D 高斯以網格積分（權重 φ(z1)φ(z2)），完全確定性
const GRID = []
for (let z = -GRID_HALF; z <= GRID_HALF + 1e-9; z += GRID_STEP) GRID.push([z, Math.exp(-0.5 * z * z)])
function expected(t, s, sigma, wind) {
  const sx = sigmaX(t, s, sigma, wind)
  let acc = 0
  let wsum = 0
  for (const [z1, w1] of GRID) {
    for (const [z2, w2] of GRID) {
      const w = w1 * w2
      acc += w * rawDamage(t, s, Math.hypot(z1 * sx, z2 * sigma))
      wsum += w
    }
  }
  return acc / wsum
}
// 對風速分佈加權平均（與對戰抽樣的分佈一致）
function expectedOverWind(t, s, sigma) {
  let acc = 0
  for (const [w, p] of WIND_DIST) acc += p * expected(t, s, sigma, w)
  return acc
}
function bestShot(t, sigma) {
  return t.shots.map((s) => [expectedOverWind(t, s, sigma), s]).sort((a, b) => b[0] - a[0])[0][1]
}

const names = Object.keys(TANKS)
console.log(`假設：風速 ~ 離散常態 σ=${WIND_SIGMA}（截斷 ±${WIND_MAX}，無風最常見），補償殘餘 ${WIND_COMP_ERROR}，飛行 ${FLIGHT_STEPS} 步；暫不含地形與移動`)
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
        const wind = sampleWind() // 本場風速，整場固定
        let ha = TANKS[a].hp + TANKS[a].shield
        let hb = TANKS[b].hp + TANKS[b].shield // 護盾與 HP 同為緩衝池，模擬時合併計算
        let aTurn = i % 2 === 0
        for (let turn = 0; turn < 200 && ha > 0 && hb > 0; turn++) {
          if (aTurn) hb -= dmgOf(TANKS[a], best[a], sigma, wind, TANKS[b])
          else ha -= dmgOf(TANKS[b], best[b], sigma, wind, TANKS[a])
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
