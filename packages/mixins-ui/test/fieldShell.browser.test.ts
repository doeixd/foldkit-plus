/**
 * The Field shell in a real browser: a vertical field stacks the label over
 * the control, a horizontal one puts the label in a column of its own beside
 * it with the description under the control, and errors draw in the error ink.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Field, FieldSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(FieldSlots)(Recipes.Field({}))

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
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'field-shell'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container,
      init: () => ({ model: {} }),
      update: (model: {}) => ({ model }),
      view: (_: {}, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ width: '560px' })],
          (['vertical', 'horizontal'] as const).map(orientation =>
            Field.view(
              {
                id: orientation,
                label: 'Email',
                orientation,
                description: 'We reply here.',
                errors: orientation === 'vertical' ? ['Not an address'] : [],
                control: h.input([h.Id(orientation)]),
                style,
              },
              h,
            ),
          ),
        ),
    }),
  )
}

const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()

test('vertical stacks the label over the control; horizontal puts it beside, the description under the control', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('horizontal')).not.toBeNull())
    const vertical = (selector: string) => rect(`[data-orientation="vertical"] ${selector}`)
    const horizontal = (selector: string) => rect(`[data-orientation="horizontal"] ${selector}`)
    expect(vertical('label').bottom).toBeLessThanOrEqual(vertical('input').top + 1)
    expect(horizontal('label').right).toBeLessThanOrEqual(horizontal('input').left + 1)
    expect(Math.abs(horizontal('label').top - horizontal('input').top)).toBeLessThan(12)
    // The labels of several fields share one column: the control starts a label column in.
    expect(horizontal('input').left - horizontal('label').left).toBeGreaterThanOrEqual(96)
    expect(horizontal('p').top).toBeGreaterThanOrEqual(horizontal('input').bottom - 1)
    expect(horizontal('p').left).toBeGreaterThanOrEqual(horizontal('input').left - 1)
  } finally {
    handle.dispose()
  }
})

test('errors draw in the error ink, a description in the muted one', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('vertical')).not.toBeNull())
    const ink = (selector: string) => getComputedStyle(document.querySelector(selector)!).color
    const invalid = (part: string) => ink(`[data-orientation="vertical"] ${part}`)
    const valid = (part: string) => ink(`[data-orientation="horizontal"] ${part}`)
    expect(invalid('ul')).not.toBe(invalid('p'))
    // The label of a field with errors takes the error ink too; one without keeps its own.
    expect(invalid('label')).toBe(invalid('ul'))
    expect(valid('label')).not.toBe(invalid('ul'))
  } finally {
    handle.dispose()
  }
})
