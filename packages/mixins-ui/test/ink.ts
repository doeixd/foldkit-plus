import { page } from 'vitest/browser'

/**
 * The bounding box of the pixels of `element` that `isInk` picks, read off a
 * screenshot, in CSS pixels from the element's top-left corner. `margin` is
 * the share of each side ignored, clear of rounded corners where the page
 * shows through. Null when nothing is ink.
 */
export const inkBox = async (
  element: HTMLElement,
  isInk: (brightness: number) => boolean,
  margin = 0.15,
) => {
  const shot = await page.screenshot({ element, base64: true, save: false })
  const image = new Image()
  image.src = `data:image/png;base64,${shot}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0)
  const { data } = context.getImageData(0, 0, image.width, image.height)
  const [mx, my] = [Math.round(image.width * margin), Math.round(image.height * margin)]
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity]
  for (let y = my; y < image.height - my; y++)
    for (let x = mx; x < image.width - mx; x++) {
      const at = (y * image.width + x) * 4
      if (!isInk((data[at]! + data[at + 1]! + data[at + 2]!) / 3)) continue
      left = Math.min(left, x)
      right = Math.max(right, x + 1)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y + 1)
    }
  if (left === Infinity) return null
  const scale = image.width / element.getBoundingClientRect().width
  return {
    left: left / scale,
    right: right / scale,
    top: top / scale,
    bottom: bottom / scale,
    width: image.width / scale,
    height: image.height / scale,
  }
}

/** How far the ink's middle sits from the element's, in CSS pixels. */
export const inkOffsetOf = async (
  element: HTMLElement,
  isInk: (brightness: number) => boolean,
  margin = 0.15,
) => {
  const box = await inkBox(element, isInk, margin)
  if (box === null) throw new Error('no ink')
  return {
    x: (box.left + box.right) / 2 - box.width / 2,
    y: (box.top + box.bottom) / 2 - box.height / 2,
  }
}
