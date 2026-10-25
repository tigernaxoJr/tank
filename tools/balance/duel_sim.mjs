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
 * - 暫不考慮：地形、移動、風的時間變化、直擊以外的導引細節。因此冰凍（移動）、擊退、鑽地 / 墜落、堆土、跳彈、
 *   高拋穿地、偵察的價值都不在模型內（視為「效用」）；靠這些取勝的機種（霜鯨、地鼠工兵、鐵壁堡壘）勝率宜略低於 50%。
 * - 已模型化（docs/06 §三之八）：
 *   - 散彈 / 碎裂：多顆彈體共用同一個瞄準誤差，各自帶固定的前後偏移（散彈以典型距離 SIM_RANGE_PX 換算力道偏移；
 *     冰錐以平地彈道算出各片的落點偏移），每顆各自結算，同一發的總傷害受 damageCapPerTank 限制。
 *   - 中毒：受害者自己回合開始時扣血（套用抗性，同種不疊加只刷新）；破甲：期間裝甲與護盾失效。
 *   - 護盾：先於 HP 吸收；紮根（idleStatus）：假設機種整場不移動，每次受到的爆炸傷害都打折。
 * - 雙方輪流開火（先攻各半），每台坦克挑選「對風速分佈加權平均後」期望價值（傷害 + 命中機率 × 中毒總量）較高的砲彈，輸出各配對的勝率。
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
/** 散彈的典型交戰距離（px）與力道：力道偏移 Δp 造成的落點偏移 ≈ 2·Δp/p × 距離。散彈機種會衝近再開火，取近距離 */
const SIM_RANGE_PX = 300
const SIM_POWER = 60
const STANDARD_GRAVITY = 175
/**
 * 定時彈（fuse）的命中率：落地後對手有一個回合可以離開爆炸範圍，所以不是每發都炸得到人。
 * 0.55 是估計值（約 45% 的情況對手成功離開、或為了躲而放棄原本的站位 / 瞄準），不是實測；
 * 真實平衡要靠實機調整。定時彈對電腦（不會躲）與人類（會躲）差異很大，見 docs/06。
 */
const FUSE_HIT_RATE = 0.55

// 數值直接讀自遊戲的註冊表（單一來源），不再維護副本；用 vite 的 ssrLoadModule 載入 TS。
const vite = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, logLevel: 'silent' })
const { PROJECTILE_REGISTRY } = await vite.ssrLoadModule('/src/features/battle/domain/projectileRegistry.ts')
const { TANK_REGISTRY } = await vite.ssrLoadModule('/src/features/battle/domain/tankRegistry.ts')
await vite.close()

/** 一發砲彈的各彈體沿射擊方向的落點偏移（px），以平均為中心（玩家會把整串彈體對準目標） */
function pelletOffsets(p) {
  let offs = [0]
  if (p.flight?.kind === 'shards') {
    const v = p.flight.speedMilli / 1000
    const g = STANDARD_GRAVITY / 1000
    offs = p.flight.angles.map((a) => (v * v * Math.sin((2 * a * Math.PI) / 180)) / g)
  } else if (p.pattern) {
    offs = p.pattern({}).map((pl) => (2 * pl.powerDelta * SIM_RANGE_PX) / SIM_POWER)
  }
  const mean = offs.reduce((a, b) => a + b, 0) / offs.length
  return offs.map((o) => o - mean)
}

const SHELLS = Object.fromEntries(
  Object.values(PROJECTILE_REGISTRY).map((p) => [
    p.id,
    {
      dmg: p.maxDamage,
      r: p.damageRadius,
      magnet: p.magnetRadius,
      direct: p.directHitMultiplier,
      wm: p.windMultiplier,
      offsets: pelletOffsets(p),
      cap: p.damageCapPerTank ?? Infinity,
      fuse: p.fuse !== undefined,
      poison: p.onHit?.status === 'poison' ? { turns: p.onHit.turns, power: p.onHit.power } : null,
      corrode: p.onHit?.status === 'corrode' ? p.onHit.turns : 0,
      drench: p.onHit?.status === 'drenched' ? p.onHit.power : 0,
    },
  ]),
)
const TANKS = Object.fromEntries(
  Object.values(TANK_REGISTRY).map((t) => [
    t.id,
    {
      id: t.id,
      hp: t.maxHp,
      mult: t.damageMultiplier,
      sens: t.windSensitivity,
      bonus: t.damageRadiusBonus,
      armor: t.armor,
      shield: t.shield,
      resist: t.resist.explosion ?? 0,
      poisonResist: t.resist.poison ?? 0,
      rootedPct: t.idleStatus?.status === 'rooted' ? t.idleStatus.power : 0,
      shots: t.shots.filter((s) => PROJECTILE_REGISTRY[s].maxDamage > 0),
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
// defender 的裝甲 / 爆炸抗性 / 紮根在此結算（破甲時裝甲歸零）
function applyDefense(raw, def, corroded, bonusPct = 0) {
  if (raw <= 0) return 0
  if (!def) return raw
  const afterArmor = Math.max(1, Math.round((raw - (corroded ? 0 : def.armor)) * (1 - def.resist)))
  return Math.max(1, Math.round((afterArmor * (100 - def.rootedPct + bonusPct)) / 100))
}
/** 一發的總傷害：所有彈體共用同一個瞄準誤差，各自加上固定偏移後結算；回傳 [傷害, 是否命中] */
function shotOf(t, s, sigma, wind, def, corroded, bonusPct = 0) {
  const sh = SHELLS[s]
  const ex = gauss() * sigmaX(t, s, sigma, wind)
  const ey = gauss() * sigma
  let total = 0
  for (const off of sh.offsets) total += applyDefense(rawDamage(t, s, Math.hypot(ex + off, ey)), def, corroded, bonusPct)
  total = Math.min(sh.cap, total)
  if (sh.fuse) total = Math.round(total * FUSE_HIT_RATE)
  return [total, total > 0]
}

// 期望傷害（無防禦）：2D 高斯以網格積分（權重 φ(z1)φ(z2)），完全確定性
const GRID = []
for (let z = -GRID_HALF; z <= GRID_HALF + 1e-9; z += GRID_STEP) GRID.push([z, Math.exp(-0.5 * z * z)])
function expected(t, s, sigma, wind) {
  const sx = sigmaX(t, s, sigma, wind)
  const sh = SHELLS[s]
  const dot = sh.poison ? sh.poison.turns * sh.poison.power : 0
  let acc = 0
  let wsum = 0
  for (const [z1, w1] of GRID) {
    for (const [z2, w2] of GRID) {
      const w = w1 * w2
      let total = 0
      for (const off of sh.offsets) total += rawDamage(t, s, Math.hypot(z1 * sx + off, z2 * sigma))
      acc += w * (Math.min(sh.cap, total) * (sh.fuse ? FUSE_HIT_RATE : 1) + (total > 0 ? dot : 0))
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
  const finisher = {}
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
        const side = [a, b].map((n) => ({ t: TANKS[n], s: best[n], hp: TANKS[n].hp, shield: TANKS[n].shield, poison: null, corrode: 0, drench: 0 }))
        let cur = i % 2 === 0 ? 0 : 1
        for (let turn = 0; turn < 200 && side[0].hp > 0 && side[1].hp > 0; turn++) {
          const me = side[cur]
          const foe = side[1 - cur]
          // 自己回合開始：中毒扣血，狀態回合遞減（破甲維持到最後那個自己回合結束）
          if (me.poison) {
            me.hp -= me.t.poisonResist >= 1 ? 0 : Math.max(1, Math.round(me.poison.power * (1 - me.t.poisonResist)))
            if (--me.poison.turns <= 0) me.poison = null
          }
          if (me.corrode > 0) me.corrode--
          if (me.hp > 0) {
            // 濕透連段（海馬）：對手沒濕透就丟潮湧泡泡，濕透了就補一發最強的另一種砲彈
            const drenchShell = me.t.shots.find((id) => SHELLS[id].drench)
            const shell = drenchShell ? (foe.drench ? (finisher[me.t.id] ??= bestShot({ ...me.t, shots: me.t.shots.filter((id) => id !== drenchShell) }, sigma)) : drenchShell) : me.s
            const [dmg, hit] = shotOf(me.t, shell, sigma, wind, foe.t, foe.corrode > 0, foe.drench)
            if (foe.drench && dmg > 0) foe.drench = 0
            const absorbed = foe.corrode > 0 ? 0 : Math.min(foe.shield, dmg)
            foe.shield -= absorbed
            foe.hp -= dmg - absorbed
            const sh = SHELLS[shell]
            if (hit && sh.poison) foe.poison = { turns: Math.max(foe.poison?.turns ?? 0, sh.poison.turns), power: sh.poison.power }
            if (hit && sh.drench) foe.drench = sh.drench
            if (hit && sh.corrode) foe.corrode = Math.max(foe.corrode, sh.corrode)
          }
          cur = 1 - cur
        }
        const [ha, hb] = [side[0].hp, side[1].hp]
        if (hb <= 0 && ha > 0) wins++
        else if (ha <= 0 && hb <= 0) wins += 0.5
      }
      line += ` ${((100 * wins) / DUEL_N).toFixed(0).padStart(3)}% `
    }
    console.log(line)
  }
}
