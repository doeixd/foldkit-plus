/// <reference types="@vitest/browser-playwright" />
/**
 * A solid button's press on a real page: at rest its border is its fill, so
 * the fill reaches its edge; held down, the border clears, and the fill
 * stands exactly 1px in on every side; let go, it comes back.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp } from 'vitest/browser'
import { ButtonSlots, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const button = Style.forSlots(ButtonSlots)(Recipes.Button({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + button.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'press-browser'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const b = SlotView.buildersFor(ButtonSlots, [button.mixin], { input: undefined, h })
    return h.button(b.button.attrs([h.Type('button')]), ['Save'])
  }
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
}

/**
 * Holds the main mouse button down over `element`, or lets it go. The
 * protocol takes the top page's coordinates, and the test runs in a frame
 * that stands elsewhere on it when several files run side by side, and may
 * be drawn scaled.
 */
const mouse = (element: Element, type: 'mousePressed' | 'mouseReleased') => {
  const box = element.getBoundingClientRect()
  const frame = window.frameElement?.getBoundingClientRect() ?? {
    left: 0,
    top: 0,
    width: window.innerWidth,
  }
  // The runner may draw the frame scaled down to fit; its pixels are then smaller.
  const scale = frame.width / window.innerWidth
  return cdp().send('Input.dispatchMouseEvent', {
    type,
    x: frame.left + (box.left + box.width / 2) * scale,
    y: frame.top + (box.top + box.height / 2) * scale,
    button: 'left',
    clickCount: 1,
  })
}

const transparent = 'rgba(0, 0, 0, 0)'

test('held down, a solid button stands 1px in on every side, and comes back when let go', async () => {
  const handle = mount()
  try {
    const element = await vi.waitFor(() => {
      const found = document.querySelector('button')
      expect(found).not.toBeNull()
      return found!
    })
    const style = getComputedStyle(element)
    // At rest the border is the fill, so the fill reaches the edge.
    await vi.waitFor(() => expect(style.borderTopColor).toBe(style.backgroundColor))
    expect(style.backgroundClip).toBe('padding-box')
    await mouse(element, 'mousePressed')
    await vi.waitFor(() => expect(style.borderTopColor).toBe(transparent))
    expect(style.borderTopWidth).toBe('1px')
    await mouse(element, 'mouseReleased')
    await vi.waitFor(() => expect(style.borderTopColor).toBe(style.backgroundColor))
  } finally {
    handle.dispose()
  }
})
