import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  type ComputedRef,
} from 'vue'
import { quantizePower, type TankEntity } from '../../domain/battleState'
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
  const CHARGE_RATE_PER_SEC = 80
  const CHARGE_START_POWER = 10
  let chargeDirection = 1
  let animFrameId: number | null = null
  let currentChargingPower = 0
  let lastChargeTs: number | null = null

  /** 砲口朝左（angle > 90）；仰角 = 與水平的夾角，不分左右 */
  const facingLeft = computed(() => (ctx.activeTank.value?.angle ?? 45) > 90)
  const elevation = computed(() => {
    const a = ctx.activeTank.value?.angle ?? 45
    return a > 90 ? 180 - a : a
  })

  /** delta 為仰角變化（+ 抬高、- 壓低），朝左時換算成相反方向的角度變化 */
  function adjustAngle(delta: number): void {
    const tank = ctx.activeTank.value
    if (ctx.controlsDisabled.value || !tank) return
    const signed = facingLeft.value ? -delta : delta
    const nextAngle = Math.max(15, Math.min(165, tank.angle + signed))
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

  function onClickPowerGauge(e: MouseEvent): void {
    const tank = ctx.activeTank.value
    if (ctx.controlsDisabled.value || !powerBarRef.value || !tank) return
    const rect = powerBarRef.value.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const newPower = Math.max(10, Math.min(100, quantizePower(ratio * 100)))
    ctx.onUpdateAim(tank.angle, newPower)
  }

  function startCharging(): void {
    const tank = ctx.activeTank.value
    if (ctx.controlsDisabled.value || isCharging.value || !tank) return
    isCharging.value = true
    chargeDirection = 1
    currentChargingPower = CHARGE_START_POWER
    lastChargeTs = null
    ctx.onUpdateAim(tank.angle, CHARGE_START_POWER)

    const loop = (ts: number) => {
      if (!isCharging.value || !ctx.activeTank.value) return
      const dt = lastChargeTs === null ? 0 : Math.min(0.05, (ts - lastChargeTs) / 1000)
      lastChargeTs = ts
      currentChargingPower += chargeDirection * CHARGE_RATE_PER_SEC * dt
      if (currentChargingPower >= 100) {
        currentChargingPower = 100
        chargeDirection = -1
      } else if (currentChargingPower <= 10) {
        currentChargingPower = 10
        chargeDirection = 1
      }
      ctx.onUpdateAim(ctx.activeTank.value.angle, quantizePower(currentChargingPower))
      animFrameId = requestAnimationFrame(loop)
    }
    animFrameId = requestAnimationFrame(loop)
  }

  function stopChargingAndFire(): void {
    if (!isCharging.value) return
    isCharging.value = false
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId)
      animFrameId = null
    }
    const tank = ctx.activeTank.value
    if (!ctx.controlsDisabled.value && tank) {
      const finalPower = quantizePower(currentChargingPower)
      ctx.onUpdateAim(tank.angle, finalPower)
      lastFiredPowerByPlayer[tank.id] = finalPower
      ctx.onFire()
    }
  }

  function cancelCharging(): void {
    if (isCharging.value) {
      isCharging.value = false
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId)
        animFrameId = null
      }
    }
  }

  function onPointerDownCharge(e: PointerEvent): void {
    if (ctx.controlsDisabled.value) return
    e.preventDefault()
    startCharging()

    const onPointerUp = () => {
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      stopChargingAndFire()
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
      startCharging()
    } else if (e.key === 'p' || e.key === 'P') {
      e.preventDefault()
      ctx.onPass?.()
    }
  }

  function handleKeyUp(e: KeyboardEvent): void {
    if (isInputFocused()) return
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault()
      stopChargingAndFire()
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
  })

  return {
    powerBarRef,
    lastFiredPowerByPlayer,
    isCharging,
    facingLeft,
    elevation,
    adjustAngle,
    turnToward,
    handleMove,
    onClickPowerGauge,
    startCharging,
    stopChargingAndFire,
    cancelCharging,
    onPointerDownCharge,
  }
}
