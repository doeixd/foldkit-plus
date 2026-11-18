/** A colour as the browser paints it over nothing: `[r, g, b, a]`, each 0 to 255. */
export const painted = (color: string): ReadonlyArray<number> => {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  return Array.from(context.getImageData(0, 0, 1, 1).data)
}

export const backgroundOf = (id: string) =>
  painted(getComputedStyle(document.getElementById(id)!).backgroundColor)

export const alpha = (color: ReadonlyArray<number>) => color[3]!

/** `color` painted over `under` (an opaque colour as `painted` returns it). */
export const paintedOver = (color: string, under: ReadonlyArray<number>): ReadonlyArray<number> => {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d')!
  context.fillStyle = `rgb(${under[0]}, ${under[1]}, ${under[2]})`
  context.fillRect(0, 0, 1, 1)
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  return Array.from(context.getImageData(0, 0, 1, 1).data)
}

const luminance = ([r = 0, g = 0, b = 0]: ReadonlyArray<number>) => {
  const channel = (value: number) => {
    const s = value / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast of two opaque painted colours. */
export const contrast = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}
