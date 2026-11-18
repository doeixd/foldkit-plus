/**
 * `Segmented.view`'s orientation and `Segmented.configure`, on a real runtime
 * with the shipped recipe's CSS: a vertical control stacks its options, and a
 * configured one starts from its base and takes a preset's changes.
 */
import { Schema } from 'effect'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Recipes, Segmented, SegmentedSlots } from '../src/index.js'

const style = Style.forSlots(SegmentedSlots)(Recipes.Segmented({}))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const Align = Segmented.configure({
  base: { style },
  presets: { stacked: { orientation: 'vertical' } },
})

const Model = Schema.Struct({ pressed: Schema.Array(Schema.String) })
type Model = typeof Model.Type
interface Pressed {
  readonly _tag: 'Pressed'
  readonly value: string
}

const mount = (use: { readonly preset?: 'stacked'; readonly orientation?: 'vertical' }) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(Theme.standard(Theme.make({})))),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'segmented-view'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { pressed: ['bold'] } }),
      update: (model: Model, message: Pressed) => ({
        model: { pressed: model.pressed.includes(message.value) ? [] : [message.value] },
      }),
      view: (model, h) =>
        Align.view(
          {
            id: 'format',
            label: 'Format',
            options: ['bold', 'italic', 'underline'].map(value => ({ value, label: value })),
            pressed: model.pressed,
            onPress: (value): Pressed => ({ _tag: 'Pressed', value }),
            ...use,
          },
          h,
        ),
    }),
  )
}

const tops = () =>
  Array.from(document.querySelectorAll('button')).map(option => option.getBoundingClientRect().top)
const lefts = () =>
  Array.from(document.querySelectorAll('button')).map(option => option.getBoundingClientRect().left)

test('options sit in a row, and a vertical control stacks them', async () => {
  for (const [use, stacked] of [
    [{}, false],
    [{ orientation: 'vertical' }, true],
  ] as const) {
    const handle = mount(use)
    try {
      await vi.waitFor(() => expect(document.querySelectorAll('button')).toHaveLength(3))
      expect(new Set(tops()).size, JSON.stringify(use)).toBe(stacked ? 3 : 1)
      expect(new Set(lefts()).size, JSON.stringify(use)).toBe(stacked ? 1 : 3)
      expect(document.querySelector('[role="radiogroup"]')?.getAttribute('data-orientation')).toBe(
        stacked ? 'vertical' : 'horizontal',
      )
    } finally {
      handle.dispose()
    }
  }
})

test('a preset stacks the options, and the base’s style still draws them', async () => {
  const handle = mount({ preset: 'stacked' })
  try {
    await vi.waitFor(() => expect(document.querySelectorAll('button')).toHaveLength(3))
    expect(new Set(tops()).size).toBe(3)
    // The base's style is applied: the tray is a box with a corner of its own.
    expect(
      Number.parseFloat(
        getComputedStyle(document.querySelector('[role="radiogroup"]')!).borderRadius,
      ),
    ).toBeGreaterThan(0)
  } finally {
    handle.dispose()
  }
})
