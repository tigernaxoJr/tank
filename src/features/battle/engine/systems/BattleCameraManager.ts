import type Phaser from 'phaser'

export interface CameraManagerOptions {
  scene: Phaser.Scene
  worldWidth: number
  worldHeight: number
  backgroundColor?: string
  onCameraMoved?: (camX: number, camY: number, viewW: number, viewH: number) => void
}

export class BattleCameraManager {
  private scene: Phaser.Scene
  private cam: Phaser.Cameras.Scene2D.Camera
  private onCameraMoved?: (camX: number, camY: number, viewW: number, viewH: number) => void
  private isDragging = false
  private dragStartX = 0
  private dragStartY = 0
  private camStartX = 0
  private camStartY = 0
  manualCamera = false

  constructor(opts: CameraManagerOptions) {
    this.scene = opts.scene
    this.cam = opts.scene.cameras.main
    this.onCameraMoved = opts.onCameraMoved

    this.cam.setBounds(0, 0, opts.worldWidth, opts.worldHeight)
    if (opts.backgroundColor) {
      this.cam.setBackgroundColor(opts.backgroundColor)
    }

    this.setupDragEvents()
  }

  private setupDragEvents(): void {
    const input = this.scene.input
    input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.isDragging = true
      this.manualCamera = true
      this.dragStartX = pointer.x
      this.dragStartY = pointer.y
      this.camStartX = this.cam.scrollX
      this.camStartY = this.cam.scrollY
    })

    input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging) return
      const dx = ((pointer.x - this.dragStartX) * 1.35) / this.cam.zoom
      const dy = ((pointer.y - this.dragStartY) * 1.35) / this.cam.zoom
      this.cam.scrollX = this.camStartX - dx
      this.cam.scrollY = this.camStartY - dy
      this.notifyMoved()
    })

    input.on('pointerup', () => {
      this.isDragging = false
    })
  }

  followTarget(targetX: number, targetY: number, factor = 0.22): void {
    const destX = targetX - this.cam.width / 2
    const destY = targetY - this.cam.height * 0.5
    this.cam.scrollX += (destX - this.cam.scrollX) * factor
    this.cam.scrollY += (destY - this.cam.scrollY) * factor
    this.notifyMoved()
  }

  focusTank(target: { x: number; y: number }): void {
    this.cam.centerOn(target.x, target.y - 40)
    this.notifyMoved()
  }

  centerOn(worldX: number, worldY: number): void {
    this.cam.centerOn(worldX, worldY)
    this.notifyMoved()
  }

  panBy(dx: number, dy: number): void {
    this.cam.scrollX += dx
    this.cam.scrollY += dy
    this.notifyMoved()
  }

  shake(duration = 320, intensity = 0.005): void {
    this.cam.shake(duration, intensity)
  }

  notifyMoved(): void {
    // 回報世界座標中實際看得到的矩形（縮放後視野比畫布大）；scroll 是以鏡頭中心換算的
    const z = this.cam.zoom
    const viewW = this.cam.width / z
    const viewH = this.cam.height / z
    this.onCameraMoved?.(
      this.cam.scrollX + (this.cam.width - viewW) / 2,
      this.cam.scrollY + (this.cam.height - viewH) / 2,
      viewW,
      viewH,
    )
  }

  get scrollX(): number {
    return this.cam.scrollX
  }

  get scrollY(): number {
    return this.cam.scrollY
  }

  get width(): number {
    return this.cam.width
  }

  get height(): number {
    return this.cam.height
  }
}
