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
