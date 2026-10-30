/// <reference types="@vitest/browser-playwright" />
/**
 * The Picker on a phone's touch screen: a tap on the opener shows the Sheet
 * and a tap on an option chooses it and closes the Sheet; a swipe down the
 * Sheet takes it away and chooses nothing. Taps are the browser's own
 * (`Input.dispatchTouchEvent`), so the click they make is the one a finger
 * makes.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, page } from 'vitest/browser'
import { chosen, mount, opener, panel, settled, sheetOptions } from './pickerFixture.js'
import { swipe } from './touchGesture.js'

let handle: { dispose: () => void } | undefined

afterEach(async () => {
  handle?.dispose()
  handle = undefined
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  await page.viewport(1440, 900)
})

/** Where an element's middle is on the top page, which is where CDP's touches land. */
const middleOnPage = (element: Element): { readonly x: number; readonly y: number } => {
  const box = element.getBoundingClientRect()
  let x = box.left + box.width / 2
  let y = box.top + box.height / 2
  for (let frame = window.frameElement; frame !== null;) {
    const outer = frame.getBoundingClientRect()
    x += outer.left
    y += outer.top
    frame = frame.ownerDocument.defaultView?.frameElement ?? null
  }
  return { x, y }
}

const tap = async (element: Element) => {
  await cdp().send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [middleOnPage(element)],
  })
  await cdp().send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

const opened = async () => {
  await tap(opener())
  const sheet = await vi.waitFor(() => {
    expect(panel()).not.toBeNull()
    return panel()!
  })
  await settled(sheet)
  return sheet
}

test('a tap opens the sheet, and a tap on an option chooses it', async () => {
  await page.viewport(390, 844)
  handle = await mount()
  expect(matchMedia('(pointer: coarse)').matches).toBe(true)
  await opened()
  await tap(sheetOptions()[2]!)
  await vi.waitFor(() => expect(panel()).toBeNull())
  expect(chosen).toEqual(['name'])
  expect(opener().textContent).toContain('Name')
})

test('a swipe down the sheet takes it away and chooses nothing', async () => {
  await page.viewport(390, 844)
  handle = await mount()
  const sheet = await opened()
  swipe(sheet.querySelector('h2')!, 300)
  await vi.waitFor(() => expect(panel()).toBeNull())
  expect(chosen).toEqual([])
  // Still a working picker: it opens again.
  await opened()
})
