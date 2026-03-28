import { layoutWithLines, prepareWithSegments } from '../../src/layout.ts'

const FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif'

type ShapeId = 'heart' | 'circle' | 'star' | 'wave' | 'spiral'

type ShapeFn = (nx: number, ny: number) => number

type StaticChar = {
  ch: string
  x: number
  y: number
  width: number
  charIdx: number
  globalIdx: number
}

type AnimatedChar = StaticChar & {
  targetX: number
  targetY: number
  currentX: number
  currentY: number
  velX: number
  velY: number
  targetAlpha: number
  currentAlpha: number
  delay: number
}

function getRequiredCanvas(id: string): HTMLCanvasElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLCanvasElement)) throw new Error(`#${id} not found`)
  return element
}

function getRequiredInput(id: string): HTMLInputElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLInputElement)) throw new Error(`#${id} not found`)
  return element
}

function getRequiredSpan(id: string): HTMLSpanElement {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLSpanElement)) throw new Error(`#${id} not found`)
  return element
}

function isShape(value: string): value is ShapeId {
  return value === 'heart' || value === 'circle' || value === 'star' || value === 'wave' || value === 'spiral'
}

const canvas = getRequiredCanvas('calligramCanvas')
const context = canvas.getContext('2d')
if (context === null) throw new Error('2d context not available')
const ctx = context
const input = getRequiredInput('wordInput')
const sizeSlider = getRequiredInput('sizeSlider')
const densitySlider = getRequiredInput('densitySlider')
const sizeVal = getRequiredSpan('sizeVal')
const densityVal = getRequiredSpan('densityVal')

const charWidthCache = new Map<string, number>()

function measureChar(ch: string, fontSize: number): number {
  const key = `${ch}:${fontSize}`
  const cached = charWidthCache.get(key)
  if (cached !== undefined) return cached

  const font = `${fontSize}px ${FONT_FAMILY}`
  const prepared = prepareWithSegments(ch, font)
  const result = layoutWithLines(prepared, 10_000, fontSize * 1.2)
  const width = result.lines.length > 0 ? result.lines[0]!.width : fontSize * 0.5
  charWidthCache.set(key, width)
  return width
}

function heartSDF(nx: number, ny: number): number {
  const x = nx * 1.2
  const y = -ny * 1.1 + 0.3
  const d = Math.sqrt(x * x + y * y)
  const angle = Math.atan2(y, x)
  const heartR = 0.5 + 0.15 * Math.cos(angle * 2) + 0.1 * Math.cos(angle) + 0.02 * Math.sin(angle * 3)
  return d - heartR
}

function circleSDF(nx: number, ny: number): number {
  return Math.sqrt(nx * nx + ny * ny) - 0.75
}

function starSDF(nx: number, ny: number): number {
  const angle = Math.atan2(ny, nx)
  const d = Math.sqrt(nx * nx + ny * ny)
  const points = 5
  const innerR = 0.35
  const outerR = 0.8
  const a = (((angle / Math.PI + 1) / 2) * points) % 1
  const r = a < 0.5
    ? innerR + (outerR - innerR) * (1 - Math.abs(a - 0.25) * 4)
    : innerR + (outerR - innerR) * (1 - Math.abs(a - 0.75) * 4)
  return d - r
}

function waveSDF(nx: number, ny: number): number {
  const waveY = Math.sin(nx * 4) * 0.25
  const thickness = 0.2 + Math.cos(nx * 2) * 0.05
  return Math.abs(ny - waveY) - thickness
}

function spiralSDF(nx: number, ny: number): number {
  const d = Math.sqrt(nx * nx + ny * ny)
  const angle = Math.atan2(ny, nx)
  const spiralR = ((angle / Math.PI + 1) / 2) * 0.6 + d * 0.15
  const armDist = Math.abs(((d - spiralR * 0.5) % 0.25) - 0.125)
  return d > 0.85 ? d - 0.85 : armDist - 0.06
}

const SHAPES: Record<ShapeId, ShapeFn> = {
  heart: heartSDF,
  circle: circleSDF,
  star: starSDF,
  wave: waveSDF,
  spiral: spiralSDF,
}

let currentShape: ShapeId = 'heart'
let currentWord = 'heart'
let canvasSize = 400
let charSize = 14
let animChars: AnimatedChar[] = []
let animT = 0

function wordColor(word: string, charIdx: number, total: number): string {
  const hue = (word.charCodeAt(0) * 37 + word.length * 73) % 360
  const t = charIdx / Math.max(1, total - 1)
  const h = (hue + t * 60) % 360
  const s = 60 + Math.sin(t * Math.PI) * 20
  const l = 55 + Math.sin(t * Math.PI * 2) * 15
  return `hsl(${h}, ${s}%, ${l}%)`
}

function generateCalligram(): void {
  const dpr = devicePixelRatio
  canvas.width = canvasSize * dpr
  canvas.height = canvasSize * dpr
  canvas.style.width = `${canvasSize}px`
  canvas.style.height = `${canvasSize}px`
  charWidthCache.clear()

  const word = currentWord.toLowerCase().replace(/[^a-z0-9]/g, '') || 'text'
  const sdf = SHAPES[currentShape]
  const fontSize = charSize
  const charWidths = word.split('').map(ch => measureChar(ch, fontSize))
  const positions: StaticChar[] = []
  const lineHeight = fontSize * 1.3
  const padding = canvasSize * 0.08
  const drawArea = canvasSize - padding * 2
  let charCounter = 0

  for (let pixelY = padding; pixelY < canvasSize - padding; pixelY += lineHeight) {
    let pixelX = padding
    while (pixelX < canvasSize - padding) {
      const nx = (pixelX - canvasSize / 2) / (drawArea / 2)
      const ny = (pixelY - canvasSize / 2) / (drawArea / 2)
      const dist = sdf(nx, ny)

      if (dist < -0.02) {
        const charIdx = charCounter % word.length
        const ch = word[charIdx]!
        const width = charWidths[charIdx]!
        positions.push({
          ch,
          x: pixelX,
          y: pixelY,
          width,
          charIdx,
          globalIdx: charCounter,
        })
        pixelX += width + fontSize * 0.05
        charCounter++
      } else if (dist < 0.05) {
        pixelX += fontSize * 0.3
      } else {
        pixelX += fontSize * 0.5
      }
    }
  }

  animChars = positions.map(position => ({
    ...position,
    targetX: position.x,
    targetY: position.y,
    currentX: canvasSize / 2 + (Math.random() - 0.5) * canvasSize * 0.3,
    currentY: canvasSize / 2 + (Math.random() - 0.5) * canvasSize * 0.3,
    velX: 0,
    velY: 0,
    targetAlpha: 1,
    currentAlpha: 0,
    delay: position.globalIdx * 0.015 + Math.random() * 0.1,
  }))
  animT = 0
}

function renderFrame(): void {
  const dpr = devicePixelRatio
  const width = canvas.width
  const height = canvas.height
  ctx.clearRect(0, 0, width, height)
  const fontSize = charSize * dpr
  ctx.font = `${fontSize}px ${FONT_FAMILY}`
  ctx.textBaseline = 'top'
  animT += 0.016

  let allArrived = true
  for (let index = 0; index < animChars.length; index++) {
    const ch = animChars[index]!
    const t = Math.max(0, animT - ch.delay)
    if (t <= 0) {
      allArrived = false
      continue
    }

    const springK = 0.08
    const damping = 0.75
    const forceX = (ch.targetX - ch.currentX) * springK
    const forceY = (ch.targetY - ch.currentY) * springK
    ch.velX = (ch.velX + forceX) * damping
    ch.velY = (ch.velY + forceY) * damping
    ch.currentX += ch.velX
    ch.currentY += ch.velY
    ch.currentAlpha += (ch.targetAlpha - ch.currentAlpha) * 0.08

    const distToTarget = Math.abs(ch.currentX - ch.targetX) + Math.abs(ch.currentY - ch.targetY)
    if (distToTarget > 0.5) allArrived = false

    ctx.fillStyle = wordColor(currentWord, ch.charIdx, currentWord.length)
    ctx.globalAlpha = Math.min(1, ch.currentAlpha)
    ctx.fillText(ch.ch, ch.currentX * dpr, ch.currentY * dpr)
  }

  ctx.globalAlpha = 1
  if (allArrived && animChars.length > 0) {
    const pulse = (Math.sin(animT * 2) + 1) / 2
    const glowAlpha = 0.02 + pulse * 0.02
    const sdf = SHAPES[currentShape]
    const padding = canvasSize * 0.08
    const drawArea = canvasSize - padding * 2
    ctx.fillStyle = `rgba(100, 180, 255, ${glowAlpha})`
    for (let y = 0; y < height; y += 4 * dpr) {
      for (let x = 0; x < width; x += 4 * dpr) {
        const nx = (x / dpr - canvasSize / 2) / (drawArea / 2)
        const ny = (y / dpr - canvasSize / 2) / (drawArea / 2)
        const dist = sdf(nx, ny)
        if (dist > -0.05 && dist < 0.02) {
          ctx.fillRect(x, y, 3 * dpr, 3 * dpr)
        }
      }
    }
  }

  requestAnimationFrame(renderFrame)
}

input.addEventListener('input', () => {
  currentWord = input.value || 'text'
  generateCalligram()
})

document.querySelectorAll<HTMLButtonElement>('.shape-btn').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll<HTMLButtonElement>('.shape-btn').forEach(other => other.classList.remove('active'))
    button.classList.add('active')
    const shape = button.dataset['shape']
    if (shape === undefined || !isShape(shape)) return
    currentShape = shape
    generateCalligram()
  })
})

document.querySelectorAll<HTMLButtonElement>('.preset-btn').forEach(button => {
  button.addEventListener('click', () => {
    const word = button.dataset['word']
    const shape = button.dataset['shape']
    if (word === undefined || shape === undefined || !isShape(shape)) return
    input.value = word
    currentWord = word
    currentShape = shape
    document.querySelectorAll<HTMLButtonElement>('.shape-btn').forEach(other => {
      other.classList.toggle('active', other.dataset['shape'] === currentShape)
    })
    generateCalligram()
  })
})

sizeSlider.addEventListener('input', () => {
  canvasSize = Number.parseInt(sizeSlider.value, 10)
  sizeVal.textContent = String(canvasSize)
  generateCalligram()
})

densitySlider.addEventListener('input', () => {
  charSize = Number.parseInt(densitySlider.value, 10)
  densityVal.textContent = `${charSize}px`
  generateCalligram()
})

generateCalligram()
requestAnimationFrame(renderFrame)
