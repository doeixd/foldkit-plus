/**
 * A floating element follows its own size in a real browser: one measured before its styles or
 * content settle is placed again when its size changes, so a toolbar first drawn tall, below the
 * selection, goes over it once it is its real height.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { anchorToSelection } from '../src/floating.js'

afterEach(() => {
  document.body.replaceChildren()
})

it('is placed again when its own size changes', async () => {
  const host = document.createElement('div')
  host.id = 'floating-host'
  host.style.cssText = 'margin-top: 200px; font: 16px/20px sans-serif'
  host.textContent = 'Select this word please'
  const floating = document.createElement('div')
  // Taller than the room above the selection, as an unstyled toolbar is.
  floating.style.cssText = 'width: 200px; height: 400px'
  document.body.append(host, floating)
  const text = host.firstChild!
  const range = document.createRange()
  range.setStart(text, 7)
  range.setEnd(text, 11)
  getSelection()!.removeAllRanges()
  getSelection()!.addRange(range)
  // The selection's own change is reported later; let it pass, so only a size change can move it.
  await new Promise(resolve => setTimeout(resolve, 50))
  const release = anchorToSelection(floating, 'floating-host', 8)
  try {
    const selected = range.getBoundingClientRect()
    expect(floating.getBoundingClientRect().top).toBeGreaterThan(selected.bottom)
    floating.style.height = '40px'
    await vi.waitFor(() =>
      expect(floating.getBoundingClientRect().bottom).toBeLessThanOrEqual(selected.top),
    )
  } finally {
    release()
  }
})
