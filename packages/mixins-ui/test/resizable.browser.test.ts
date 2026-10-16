/**
 * A resizable split laid out and dragged in a real browser: right to left its
 * first panel is on the right, so a drag to the left grows it, as a drag to
 * the right does left to right.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Recipes, Resizable, ResizableSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(ResizableSlots)(Recipes.Resizable({}))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (direction: 'ltr' | 'rtl') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = `resizable-${direction}`
  document.body.appendChild(container)
  const view = (model: Resizable.Model, h: HtmlBuilder<Resizable.Message>) =>
    h.div(
      // No `dir` here: the view draws its own `direction`.
      [h.Style({ inlineSize: '600px', blockSize: '100px' })],
      [
        Resizable.view(
          {
            model,
            onMessage: message => message,
            direction,
            label: 'Resize the list',
            first: h.p([h.Id('first')], ['one']),
            second: h.p([h.Id('second')], ['two']),
            style,
          },
          h,
        ),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model: Resizable.Model,
      container,
      init: () => ({ model: Resizable.init(0.5) }),
      update: (model: Resizable.Model, message: Resizable.Message) => ({
        model: Resizable.update(model, message),
      }),
      view,
    }),
  )
}

const handle = () => document.querySelector<HTMLElement>('[role="separator"]')
const frame = () => new Promise(resolve => requestAnimationFrame(resolve))

/** Drags the handle by `dx` pixels, once the group has been measured. */
const drag = async (dx: number) => {
  const separator = await vi.waitFor(() => {
    const found = handle()
    expect(found).not.toBeNull()
    return found!
  })
  // The Resize Mount reports the group's size on its first observation.
  await frame()
  await frame()
  const { left, top } = separator.getBoundingClientRect()
  const at = (type: string, x: number) =>
    separator.dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: top }),
    )
  at('pointerdown', left)
  at('pointermove', left + dx)
  at('pointerup', left + dx)
}

test.each([
  ['ltr', 60, 60],
  ['ltr', -60, 40],
  ['rtl', -60, 60],
  ['rtl', 60, 40],
] as const)('%s, a drag of %ipx sets the first panel to %i%', async (direction, dx, percent) => {
  const mounted = mount(direction)
  try {
    await drag(dx)
    await vi.waitFor(() => expect(handle()?.getAttribute('aria-valuenow')).toBe(String(percent)))
  } finally {
    mounted.dispose()
  }
})

test('right to left, the first panel is on the right', async () => {
  const mounted = mount('rtl')
  try {
    await vi.waitFor(() => expect(document.getElementById('first')).not.toBeNull())
    const first = document.getElementById('first')!.getBoundingClientRect()
    const second = document.getElementById('second')!.getBoundingClientRect()
    expect(first.left).toBeGreaterThan(second.left)
  } finally {
    mounted.dispose()
  }
})
