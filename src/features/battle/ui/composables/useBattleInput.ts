import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  type ComputedRef,
} from 'vue'
import { quantizePower, worldAimAngle, type TankEntity } from '../../domain/battleState'
import { clampAim, getTankSpec } from '../../domain/tankRegistry'
import type { ProjectileBlueprint } from '../../domain/projectileRegistry'
import type { BulletType } from '@/shared/kernel/types'

export interface BattleInputContext {
  activeTank: ComputedRef<TankEntity | undefined>
  controlsDisabled: ComputedRef<boolean>
  activeShots: ComputedRef<ProjectileBlueprint[] | null>
  onMove: (deltaX: number) => void
  onUpdateAim: (angle: number, power: number) => void
  onChangeBullet: (bullet: BulletType) => void
  onFire: () => void
  onPass?: () => void
}

export function useBattleInput(ctx: BattleInputContext) {
  const powerBarRef = ref<HTMLDivElement | null>(null)
  const lastFiredPowerByPlayer = reactive<Record<string, number>>({})

  const isCharging = ref(false)
  // 蓄力速度所有坦克共用同一個值（10 → 100 約 3.2 秒），不得依機種或砲彈改變
  const CHARGE_RATE_PER_SEC = 28
  const CHARGE_START_POWER = 10
  let animFrameId: number | null = null
  let chargeStartMs = 0
  let powerBeforeCharge = 0

  /** 依按住的時間算力道（10 → 100，到頂就停在 100 不回落），與影格率無關，每台坦克手感一致 */
  function chargedPowerAt(nowMs: number): number {
    const travelled = ((nowMs - chargeStartMs) / 1000) * CHARGE_RATE_PER_SEC
    return quantizePower(Math.min(100, CHARGE_START_POWER + travelled))
  }

  /** 砲口朝左（angle > 90）；仰角 = 與水平的夾角，不分左右 */
  const facingLeft = computed(() => (ctx.activeTank.value?.angle ?? 45) > 90)
  const elevation = computed(() => {
    const a = ctx.activeTank.value?.angle ?? 45
    return a > 90 ? 180 - a : a
  })

  /** 相對地面（水平線）的實際發射仰角：車體傾斜時與 elevation 不同，可為負（砲口朝下） */
  const worldElevation = computed(() => {
    const tank = ctx.activeTank.value
    if (!tank) return 45
    const world = worldAimAngle(tank.angle, tank.slopeDeg)
    return Math.round(world > 90 ? 180 - world : world)
  })

  /** delta 為仰角變化（+ 抬高、- 壓低），朝左時換算成相反方向的角度變化 */
  function adjustAngle(delta: number): void {
    const tank = ctx.activeTank.value
    if (ctx.controlsDisabled.value || !tank) return
    const signed = facingLeft.value ? -delta : delta
    const nextAngle = clampAim(getTankSpec(tank.tankId), tank.angle + signed)
    ctx.onUpdateAim(nextAngle, tank.power)
  }

  /** 轉向：保持仰角、左右鏡射（不耗燃料），之後可朝另一側開火 */
  function turnToward(dir: 1 | -1): void {
    const tank = ctx.activeTank.value
    if (ctx.controlsDisabled.value || !tank) return
    const wantLeft = dir < 0
    if (wantLeft !== facingLeft.value) {
      ctx.onUpdateAim(180 - tank.angle, tank.power)
    }
  }

  function handleMove(deltaX: number): void {
    const tank = ctx.activeTank.value
    if (ctx.controlsDisabled.value || !tank) return
    turnToward(deltaX < 0 ? -1 : 1)
    if (tank.moveFuel <= 0) return
    ctx.onMove(deltaX)
  }

  function setPowerFromPointer(clientX: number): void {
    const tank = ctx.activeTank.value
    if (ctx.controlsDisabled.value || !powerBarRef.value || !tank) return
    const rect = powerBarRef.value.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const newPower = Math.max(10, Math.min(100, quantizePower(ratio * 100)))
    ctx.onUpdateAim(tank.angle, newPower)
  }

  /** 力道條：按下即設定，按住拖曳可連續微調（只跟著按下的那一根手指，雙手操作互不干擾） */
  function onPointerDownPowerGauge(e: PointerEvent): void {
    if (ctx.controlsDisabled.value || isCharging.value) return
    e.preventDefault()
    setPowerFromPointer(e.clientX)
    const onMoveEv = (ev: PointerEvent) => {
      if (ev.pointerId === e.pointerId) setPowerFromPointer(ev.clientX)
    }
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      window.removeEventListener('pointermove', onMoveEv)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMoveEv)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // --- 按住連發：移動 / 仰角按鈕按住不放會持續作用（先單發，停頓後連續） ---
  let repeatDelay: ReturnType<typeof setTimeout> | null = null
  let repeatTimer: ReturnType<typeof setInterval> | null = null

  function stopRepeat(): void {
    if (repeatDelay !== null) clearTimeout(repeatDelay)
    if (repeatTimer !== null) clearInterval(repeatTimer)
    repeatDelay = null
    repeatTimer = null
  }

  function holdRepeat(e: PointerEvent, action: () => void, intervalMs: number): void {
    if (ctx.controlsDisabled.value) return
    e.preventDefault()
    stopRepeat()
    action()
    repeatDelay = setTimeout(() => {
      repeatTimer = setInterval(() => {
        if (ctx.controlsDisabled.value) return stopRepeat()
        action()
      }, intervalMs)
    }, 260)
    // 只有按下的那根手指放開才停（手機上另一隻手指放開不影響）
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      stopRepeat()
    }
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const holdMove = (e: PointerEvent, dir: 1 | -1) => holdRepeat(e, () => handleMove(dir * 6), 40)
  const holdAngle = (e: PointerEvent, delta: number) => holdRepeat(e, () => adjustAngle(delta), 70)

  /**
   * pressedAtMs / releasedAtMs 用事件本身的 timeStamp（與 performance.now() 同一時鐘）：主執行緒忙著畫圖時，
   * 事件要等到這一幀做完才會處理，若改用處理當下的時間，放開後力道還會多漲一截（感覺像放開有延遲）
   */
  function startCharging(pressedAtMs = performance.now()): void {
    const tank = ctx.activeTank.value
    if (ctx.controlsDisabled.value || isCharging.value || !tank) return
    isCharging.value = true
    chargeStartMs = Math.min(pressedAtMs, performance.now())
    powerBeforeCharge = tank.power
    ctx.onUpdateAim(tank.angle, CHARGE_START_POWER)

    const loop = () => {
      if (!isCharging.value || !ctx.activeTank.value) return
      ctx.onUpdateAim(ctx.activeTank.value.angle, chargedPowerAt(performance.now()))
      animFrameId = requestAnimationFrame(loop)
    }
    animFrameId = requestAnimationFrame(loop)
  }

  function stopChargingAndFire(releasedAtMs = performance.now()): void {
    if (!isCharging.value) return
    isCharging.value = false
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
    const tank = ctx.activeTank.value
    if (!ctx.controlsDisabled.value && tank) {
      const finalPower = chargedPowerAt(Math.max(chargeStartMs, Math.min(releasedAtMs, performance.now())))
      ctx.onUpdateAim(tank.angle, finalPower)
      lastFiredPowerByPlayer[tank.id] = finalPower
      ctx.onFire()
    }
  }

  /** 取消蓄力（Esc 或視窗失焦）：不開火，力道還原成蓄力前的值；之後的放開也不會開火 */
  function cancelCharging(): void {
    if (isCharging.value) {
      isCharging.value = false
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId)
        animFrameId = null
      }
      const tank = ctx.activeTank.value
      if (tank) ctx.onUpdateAim(tank.angle, powerBeforeCharge)
    }
  }

  function onPointerDownCharge(e: PointerEvent): void {
    if (ctx.controlsDisabled.value) return
    e.preventDefault()
    startCharging(e.timeStamp)

    // 只認按下發射鈕的那根手指：雙手操作時，另一隻手放開方向鍵不會提早開火
    const onPointerUp = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      stopChargingAndFire(ev.timeStamp)
    }

    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  function isInputFocused(): boolean {
    const activeEl = document.activeElement
    if (!activeEl) return false
    const tag = activeEl.tagName.toLowerCase()
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      (activeEl as HTMLElement).isContentEditable
    )
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && isCharging.value) {
      e.preventDefault()
      cancelCharging()
      return
    }
    if (isInputFocused() || ctx.controlsDisabled.value) return

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      handleMove(-6)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      handleMove(6)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      adjustAngle(1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      adjustAngle(-1)
    } else if (/^[1-9]$/.test(e.key)) {
      const shot = ctx.activeShots.value?.[Number(e.key) - 1]
      if (shot) ctx.onChangeBullet(shot.id)
    } else if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault()
      if (e.repeat) return
      startCharging(e.timeStamp)
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault()
      ctx.onPass?.()
    }
  }

  function handleKeyUp(e: KeyboardEvent): void {
    if (isInputFocused()) return
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault()
      stopChargingAndFire(e.timeStamp)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', cancelCharging)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    window.removeEventListener('blur', cancelCharging)
    cancelCharging()
    stopRepeat()
  })

  return {
    powerBarRef,
    lastFiredPowerByPlayer,
    isCharging,
    facingLeft,
    elevation,
    worldElevation,
    adjustAngle,
    turnToward,
    handleMove,
    holdMove,
    holdAngle,
    onPointerDownPowerGauge,
    startCharging,
    stopChargingAndFire,
    cancelCharging,
    onPointerDownCharge,
  }
}
