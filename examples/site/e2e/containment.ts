/**
 * What escapes a gallery card, read in the page itself: `await page.evaluate(containment)`.
 *
 * - `escaped`: each card whose descendants paint outside the card's box,
 *   judged by what an ancestor does not clip (a scroller's rows past its own
 *   box are clipped, so a virtual list inside its box does not count).
 * - `tall`: each card's preview frame taller than `limit` pixels.
 * - `overflow`: how far the page runs past the layout viewport's width.
 *
 * Self-contained: Playwright sends the function's source to the page.
 */
export interface Containment {
  readonly escaped: ReadonlyArray<string>
  readonly tall: ReadonlyArray<string>
  readonly overflow: number
}

export const containment = (limit: number): Containment => {
  const cards = Array.from(document.querySelectorAll('[data-size="thumb"]')).map(frame => ({
    frame,
    card: frame.parentElement ?? frame,
  }))
  const name = (card: Element) =>
    card.querySelector(':scope > a[href]')?.getAttribute('href') ?? card.tagName.toLowerCase()
  const clipped = (element: Element, within: Element): DOMRect | undefined => {
    let { left, top, right, bottom } = element.getBoundingClientRect()
    for (let up = element.parentElement; up !== null; up = up.parentElement) {
      const style = getComputedStyle(up)
      const clips = [style.overflowX, style.overflowY, style.contain].some(value =>
        /hidden|clip|scroll|auto|paint|content|strict/.test(value),
      )
      if (clips) {
        const box = up.getBoundingClientRect()
        left = Math.max(left, box.left)
        top = Math.max(top, box.top)
        right = Math.min(right, box.right)
        bottom = Math.min(bottom, box.bottom)
      }
      if (up === within) break
    }
    return right > left && bottom > top
      ? new DOMRect(left, top, right - left, bottom - top)
      : undefined
  }
  const escaped: Array<string> = []
  const tall: Array<string> = []
  for (const { frame, card } of cards) {
    const box = card.getBoundingClientRect()
    const frameBox = frame.getBoundingClientRect()
    if (frameBox.height > limit) tall.push(`${name(card)} ${Math.round(frameBox.height)}px`)
    const outside = Array.from(card.querySelectorAll('*')).find(element => {
      const seen = clipped(element, card)
      return (
        seen !== undefined &&
        (seen.left < box.left - 1 ||
          seen.right > box.right + 1 ||
          seen.top < box.top - 1 ||
          seen.bottom > box.bottom + 1)
      )
    })
    if (outside !== undefined) escaped.push(`${name(card)} ${outside.tagName.toLowerCase()}`)
  }
  return {
    escaped,
    tall,
    overflow: Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  }
}
