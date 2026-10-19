/**
 * A ScrollArea drawn with `ScrollArea.overlayBars`, on a real page: the browser's bar
 * gives way to a thumb as long as the view is of the content, resting 4px
 * wide 2px off the edge and widening to 6px under the pointer, shown while
 * the area scrolls; with `travel` at 0 (reduced motion) the widening snaps
 * and the fade keeps its time.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Recipes, ScrollArea, ScrollAreaSlots } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(ScrollAreaSlots)(
  Recipes.ScrollArea.extend({
    base: { root: { inlineSize: '200px' }, viewport: { blockSize: '100px' } },
  })({}),
)
const Model = Schema.Struct({})

afterEach(async () => {
  await userEvent.hover(document.getElementById('away') ?? document.body)
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (root: Readonly<Record<string, string>> = {}) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'scroll-bars'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style(root)],
          [
            // Where the pointer is put, away from the area.
            h.div([h.Id('away'), h.Style({ height: '40px', marginBlockEnd: '40px' })], []),
            ScrollArea.view(
              {
                content: h.div([h.Style({ height: '400px' })], ['Long']),
                mixins: ScrollArea.overlayBars,
                style,
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const parts = () => {
  const viewport = document.querySelector<HTMLElement>('[data-scroll-overlaid]')!
  const bar = document.querySelector<HTMLElement>('[data-scroll-bar="block"]')!
  return { viewport, bar, thumb: bar.firstElementChild as HTMLElement }
}

test('the browser bar gives way to a thumb as long as the view is of the content', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-scroll-overlaid]')).not.toBeNull())
    const { viewport, bar, thumb } = parts()
    expect(getComputedStyle(viewport).scrollbarWidth).toBe('none')
    expect(viewport.clientWidth).toBe(200)
    // The inline axis has nothing to scroll, so its bar is not drawn.
    expect(getComputedStyle(document.querySelector('[data-scroll-bar="inline"]')!).display).toBe(
      'none',
    )
    await vi.waitFor(() => expect(thumb.getBoundingClientRect().height).toBe(25))
    // 2px in from the area's edge, and the bar flush with it.
    const area = viewport.getBoundingClientRect()
    expect(bar.getBoundingClientRect().right).toBe(area.right)
    expect(thumb.getBoundingClientRect().right).toBe(area.right - 2)
    expect(thumb.getBoundingClientRect().width).toBe(4)
  } finally {
    handle.dispose()
  }
})

test('the bar shows while the area scrolls, and the thumb moves with it', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-scroll-overlaid]')).not.toBeNull())
    const { viewport, bar, thumb } = parts()
    // The pointer is shared with every test file: put it where it shows nothing.
    await userEvent.hover(document.getElementById('away')!)
    await vi.waitFor(() => expect(getComputedStyle(bar).opacity).toBe('0'), { timeout: 3000 })
    const top = thumb.getBoundingClientRect().top
    viewport.scrollTop = 150
    await vi.waitFor(() => expect(getComputedStyle(bar).opacity).toBe('1'))
    // Half of the 300px it scrolls, along the 75px the thumb travels.
    await vi.waitFor(() => expect(thumb.getBoundingClientRect().top - top).toBe(37.5))
  } finally {
    handle.dispose()
  }
})

test('the thumb widens to 6px under the pointer', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-scroll-overlaid]')).not.toBeNull())
    const { bar, thumb } = parts()
    await userEvent.hover(bar)
    await vi.waitFor(() => expect(thumb.getBoundingClientRect().width).toBe(6))
    await userEvent.hover(document.getElementById('away')!)
    await vi.waitFor(() => expect(thumb.getBoundingClientRect().width).toBe(4))
  } finally {
    handle.dispose()
  }
})

test('with travel stilled, the widening snaps and the fade keeps its time', async () => {
  const handle = mount({ '--fk-knob-travel': '0' })
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-scroll-overlaid]')).not.toBeNull())
    const { bar, thumb } = parts()
    const [widening, ink] = getComputedStyle(thumb).transitionDuration.split(', ')
    expect(widening).toBe('0s')
    expect(ink).not.toBe('0s')
    expect(getComputedStyle(bar).transitionDuration).not.toBe('0s')
  } finally {
    handle.dispose()
  }
})
