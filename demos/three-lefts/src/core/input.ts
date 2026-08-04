export class Input {
  private readonly down = new Set<string>()
  private readonly pressed = new Set<string>()
  mouseDX = 0
  mouseDY = 0
  locked = false
  sensitivity = 0.0022
  invertY = false

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return
    this.down.add(e.code)
    this.pressed.add(e.code)
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
  }
  private readonly onKeyUp = (e: KeyboardEvent) => this.down.delete(e.code)
  private readonly onBlur = () => this.down.clear()
  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return
    this.mouseDX += e.movementX
    this.mouseDY += e.movementY
  }
  private readonly onLockChange = () => {
    this.locked = document.pointerLockElement === this.element
    if (!this.locked) this.down.clear()
  }

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onLockChange)
  }

  requestLock() {
    this.element.requestPointerLock()
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  isDown(code: string) {
    return this.down.has(code)
  }

  /** True once per press. */
  consume(code: string) {
    if (!this.pressed.has(code)) return false
    this.pressed.delete(code)
    return true
  }

  axis(negative: string, positive: string) {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0)
  }

  endFrame() {
    this.mouseDX = 0
    this.mouseDY = 0
    this.pressed.clear()
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onLockChange)
  }
}
