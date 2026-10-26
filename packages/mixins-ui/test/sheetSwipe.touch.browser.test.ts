/**
 * A Sheet swiped from its panel on a touch screen, with the touch events a
 * finger sends: a swipe down the content takes it away; content scrolled
 * down scrolls first; a field, a mouse and `swipe.from: 'handle'` start no
 * drag there; and resting below its highest point the content holds still,
 * so a swipe up raises the sheet. Each case that starts no drag is followed
 * by one that does, so a case cannot pass on a gesture nothing reads; a
 * sideways swipe starts none, and a finger on the handle drags it once.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { open, settled } from './sheetFixture.js'
import { mouseDrag, swipe } from './touchGesture.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const away = (panel: HTMLElement) =>
  vi.waitFor(() => expect(panel.hasAttribute('data-closed') || !panel.isConnected).toBe(true))

const paragraph = (panel: HTMLElement) => panel.querySelector('p')!

test('a swipe down the content takes the sheet away, as one on its handle does', async () => {
  const { panel, dispose } = await open({}, {}, { lines: 3 })
  try {
    // The first move, past the slop, decides it: the browser scrolls none of the eight.
    expect(swipe(paragraph(panel), 300)).toBe(8)
    await away(panel)
  } finally {
    dispose()
  }
})

test('a sideways swipe across the content starts no drag', async () => {
  const { panel, releases, dispose } = await open({}, {}, { lines: 3 })
  try {
    expect(swipe(paragraph(panel), 300, { axis: 'x' })).toBe(0)
    swipe(paragraph(panel), 300)
    await away(panel)
    // The second swipe's release alone: a drag of the first would have been another.
    expect(releases()).toBe(1)
  } finally {
    dispose()
  }
})

test('a finger on the handle is the handle’s: one drag, not two', async () => {
  const { panel, grabber, releases, dispose } = await open({ points: [0.5, 1], opensAt: 1 })
  try {
    swipe(grabber, 40, { pointers: true })
    // The release lands after the swipe returns; settling alone can finish before it starts.
    await vi.waitFor(() => expect(releases()).toBeGreaterThan(0))
    await settled(panel)
    expect(releases()).toBe(1)
  } finally {
    dispose()
  }
})

test('content scrolled down scrolls first; at its top the swipe takes the sheet', async () => {
  const { panel, releases, dispose } = await open({}, {}, { lines: 60 })
  try {
    expect(panel.scrollHeight).toBeGreaterThan(panel.clientHeight + 200)
    panel.scrollTop = 200
    // The browser keeps every move: the content scrolls.
    expect(swipe(paragraph(panel), 300)).toBe(0)
    panel.scrollTop = 0
    swipe(paragraph(panel), 300)
    await away(panel)
    expect(releases()).toBe(1)
  } finally {
    dispose()
  }
})

test('a swipe on a field, or a mouse on the content, starts no drag', async () => {
  const { panel, releases, dispose } = await open(
    {},
    {},
    { content: h => [h.input([h.AriaLabel('Search')])] },
  )
  try {
    swipe(panel.querySelector('input')!, 300)
    mouseDrag(paragraph(panel), 300)
    swipe(paragraph(panel), 300)
    await away(panel)
    expect(releases()).toBe(1)
  } finally {
    dispose()
  }
})

test("with `from: 'handle'` the content holds still, and the handle still drags", async () => {
  const { panel, grabber, releases, dispose } = await open({ swipe: { from: 'handle' } })
  try {
    swipe(paragraph(panel), 300)
    mouseDrag(grabber, 300)
    await away(panel)
    expect(releases()).toBe(1)
  } finally {
    dispose()
  }
})

test('below its highest point the content holds still, and a swipe up raises the sheet', async () => {
  const { panel, dispose } = await open({ points: [0.5, 1] }, {}, { lines: 60 })
  try {
    expect(panel.hasAttribute('data-lowered')).toBe(true)
    expect(getComputedStyle(panel).overflowY).toBe('hidden')
    swipe(paragraph(panel), -250)
    await vi.waitFor(() => expect(panel.style.getPropertyValue('--fk-sheet-snap')).toBe('1'))
    expect(panel.hasAttribute('data-lowered')).toBe(false)
    expect(getComputedStyle(panel).overflowY).toBe('auto')
  } finally {
    dispose()
  }
})
