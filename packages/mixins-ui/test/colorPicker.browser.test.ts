/**
 * The color picker's tracks in a real browser: a native range puts its
 * minimum at the inline start, so each track runs from that side, the right
 * one right to left, and a thumb sits on the color it stands for.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { ColorPicker, ColorPickerSlots, Recipes } from '../src/index.js'
import { message, type TestMessage } from './fixture.js'

const style = Style.forSlots(ColorPickerSlots)(Recipes.ColorPicker({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

const mount = (direction: 'ltr' | 'rtl') => {
  document.documentElement.dir = direction
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.tokens)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'color-picker-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type, _: TestMessage) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<TestMessage>) =>
        ColorPicker.view(
          {
            id: 'accent',
            label: 'Accent',
            value: { l: 62.5, c: 0.15, h: 190 },
            onChange: () => message('Clicked'),
            style,
          },
          h,
        ),
    }),
  )
}

const tracks = () =>
  Array.from(document.querySelectorAll<HTMLElement>('input[type="range"]'), input =>
    getComputedStyle(input).backgroundImage.slice(0, 'linear-gradient(to right'.length),
  )

test.each([
  ['ltr', 'linear-gradient(to right'],
  ['rtl', 'linear-gradient(to left '],
] as const)('%s: every track runs from its minimum’s side', async (direction, start) => {
  const handle = mount(direction)
  try {
    await vi.waitFor(() => expect(tracks()).toHaveLength(3))
    expect(tracks()).toEqual([start, start, start])
  } finally {
    handle.dispose()
  }
})
