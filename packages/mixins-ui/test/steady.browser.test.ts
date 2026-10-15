/**
 * Weight without reflow, on a real page: a pressed segmented option turns
 * semibold, and with its text in `data-label` it is as wide pressed as not;
 * without one it widens, which is what the label's room prevents.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Recipes, SegmentedSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const segmented = Style.forSlots(SegmentedSlots)(Recipes.Segmented({}))
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
    ) + segmented.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'steady-browser'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const s = SlotView.buildersFor(SegmentedSlots, [segmented.mixin], { input: undefined, h })
    const group = (labelled: boolean) =>
      h.div(s.group.attrs([h.Role('group'), h.DataAttribute('labelled', String(labelled))]), [
        ...[true, false].map(pressed =>
          h.button(
            s.option.attrs([
              h.AriaPressed(String(pressed)),
              ...(labelled ? [h.DataAttribute('label', 'Quarterly')] : []),
            ]),
            ['Quarterly'],
          ),
        ),
      ])
    return h.div([], [group(true), group(false)])
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

const widths = (labelled: boolean) =>
  Array.from(
    document.querySelectorAll<HTMLElement>(`[data-labelled="${labelled}"] button`),
    button => button.getBoundingClientRect().width,
  )

test('a pressed option with its label in data-label is as wide as one not pressed', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(widths(true)).toHaveLength(2))
    const [pressed, resting] = widths(true)
    expect(pressed).toBe(resting)
  } finally {
    handle.dispose()
  }
})

test('without data-label the pressed option widens, which the label prevents', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(widths(false)).toHaveLength(2))
    const [pressed, resting] = widths(false)
    expect(pressed!).toBeGreaterThan(resting!)
    // And the labelled one holds the heavier width, not the lighter.
    expect(widths(true)[1]).toBe(pressed)
  } finally {
    handle.dispose()
  }
})
