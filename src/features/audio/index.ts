/**
 * Audio Slice (小型模組 - 務實 DDD 單檔結構)
 * 小型且規則單純的功能不拆 domain/application/infra 子目錄，直接於 index.ts 內完成封裝。
 */

export type SoundEffect =
  | 'fire'
  | 'explosion'
  | 'move'
  | 'tick'
  | 'ui_click'
  | 'ui_select'
  | 'ui_ready'
  | 'ui_start'

export class SoundController {
  private muted = false
  private ctx: AudioContext | null = null

  setMuted(muted: boolean): void {
    this.muted = muted
  }

  isMuted(): boolean {
    return this.muted
  }

  play(effect: SoundEffect): void {
    if (this.muted) return

    try {
      if (!this.ctx && typeof window !== 'undefined') {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (AudioCtx) {
          this.ctx = new AudioCtx()
        }
      }

      if (!this.ctx) return

      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {})
      }

      const now = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const gain = this.ctx.createGain()

      osc.connect(gain)
      gain.connect(this.ctx.destination)

      switch (effect) {
        case 'fire': {
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(280, now)
          osc.frequency.exponentialRampToValueAtTime(90, now + 0.18)
          gain.gain.setValueAtTime(0.3, now)
          gain.gain.linearRampToValueAtTime(0.001, now + 0.18)
          osc.start(now)
          osc.stop(now + 0.18)
          break
        }
        case 'explosion': {
          osc.type = 'triangle'
          osc.frequency.setValueAtTime(110, now)
          osc.frequency.exponentialRampToValueAtTime(25, now + 0.38)
          gain.gain.setValueAtTime(0.4, now)
          gain.gain.linearRampToValueAtTime(0.001, now + 0.38)
          osc.start(now)
          osc.stop(now + 0.38)
          break
        }
        case 'move': {
          osc.type = 'square'
          osc.frequency.setValueAtTime(140, now)
          osc.frequency.linearRampToValueAtTime(100, now + 0.05)
          gain.gain.setValueAtTime(0.15, now)
          gain.gain.linearRampToValueAtTime(0.001, now + 0.05)
          osc.start(now)
          osc.stop(now + 0.05)
          break
        }
        case 'tick': {
          osc.type = 'sine'
          osc.frequency.setValueAtTime(880, now)
          gain.gain.setValueAtTime(0.2, now)
          gain.gain.linearRampToValueAtTime(0.001, now + 0.04)
          osc.start(now)
          osc.stop(now + 0.04)
          break
        }
        case 'ui_click': {
          osc.type = 'sine'
          osc.frequency.setValueAtTime(650, now)
          osc.frequency.exponentialRampToValueAtTime(450, now + 0.035)
          gain.gain.setValueAtTime(0.18, now)
          gain.gain.linearRampToValueAtTime(0.001, now + 0.035)
          osc.start(now)
          osc.stop(now + 0.035)
          break
        }
        case 'ui_select': {
          osc.type = 'triangle'
          osc.frequency.setValueAtTime(440, now)
          osc.frequency.exponentialRampToValueAtTime(720, now + 0.06)
          gain.gain.setValueAtTime(0.22, now)
          gain.gain.linearRampToValueAtTime(0.001, now + 0.06)
          osc.start(now)
          osc.stop(now + 0.06)
          break
        }
        case 'ui_ready': {
          osc.type = 'sine'
          osc.frequency.setValueAtTime(523.25, now) // C5
          osc.frequency.setValueAtTime(659.25, now + 0.05) // E5
          osc.frequency.setValueAtTime(783.99, now + 0.1) // G5
          gain.gain.setValueAtTime(0.25, now)
          gain.gain.linearRampToValueAtTime(0.001, now + 0.22)
          osc.start(now)
          osc.stop(now + 0.22)
          break
        }
        case 'ui_start': {
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(220, now)
          osc.frequency.exponentialRampToValueAtTime(880, now + 0.25)
          gain.gain.setValueAtTime(0.28, now)
          gain.gain.linearRampToValueAtTime(0.001, now + 0.25)
          osc.start(now)
          osc.stop(now + 0.25)
          break
        }
      }
    } catch {
      // Safe guard for SSR or headless test environments without full Web Audio support
    }
  }
}

export const soundController = new SoundController()
