/**
 * A Drawer swiped from its panel on a touch screen: a swipe down the open
 * drawer's content takes it down, one up its peek opens it, and with
 * `swipe.from: 'handle'` the content holds still while the handle drags.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mount, panel, settled } from './drawerFixture.js'
import { mouseDrag, swipe } from './touchGesture.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const isOpen = (element: HTMLElement) => element.getAttribute('data-open')

test('a swipe down the open content takes it down, and one up the peek opens it', async () => {
  const handle = mount(true)
  try {
    const drawer = await panel()
    await settled(drawer)
    swipe(drawer.querySelector('#drawer-body button')!, 200)
    await vi.waitFor(() => expect(isOpen(drawer)).toBe('false'))
    await settled(drawer)
    swipe(drawer.querySelector('#in-grip')!.parentElement!.parentElement!, -200)
    await vi.waitFor(() => expect(isOpen(drawer)).toBe('true'))
  } finally {
    handle.dispose()
  }
})

test("with `from: 'handle'` the content holds still, and the handle still drags", async () => {
  const handle = mount(true, undefined, { from: 'handle' })
  try {
    const drawer = await panel()
    await settled(drawer)
    swipe(drawer.querySelector('#drawer-body button')!, 200)
    mouseDrag(drawer.querySelector('button')!, 200)
    await vi.waitFor(() => expect(isOpen(drawer)).toBe('false'))
    // The handle's drag alone: the content's would have been a release before it.
    expect(handle.releases()).toBe(1)
  } finally {
    handle.dispose()
  }
})
