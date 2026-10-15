/**
 * Toggle buttons on a real page: a ghost, outline or solid button that is on
 * (`aria-pressed="true"`) shows it, and a segmented control with several
 * options pressed, a toggle group, fills each of them.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Button, ButtonSlots, Recipes, Segmented, SegmentedSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const variants = ['ghost', 'outline', 'solid'] as const
const buttons = variants.map(variant => Style.forSlots(ButtonSlots)(Recipes.Button({ variant })))
const segmented = Style.forSlots(SegmentedSlots)(Recipes.Segmented({}))
const Model = Schema.Struct({})
type Message = { readonly _tag: 'Pressed' }
const Pressed: Message = { _tag: 'Pressed' }

afterEach(async () => {
  await userEvent.hover(document.body, { position: { x: 1, y: 1 } })
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
    ) +
    buttons.map(each => each.css).join('') +
    segmented.css +
    ':root{--fk-knob-motion:0}'
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'toggle-buttons'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<Message>) =>
    h.div(
      [h.Style({ padding: '40px' })],
      [
        ...variants.flatMap((variant, index) =>
          [true, false].map(pressed =>
            h.div(
              [h.DataAttribute('case', `${variant} ${pressed}`)],
              [Button.view({ label: 'Bold', pressed, style: buttons[index]! }, h)],
            ),
          ),
        ),
        Segmented.view(
          {
            label: 'Text style',
            options: ['Bold', 'Italic', 'Strike'].map(value => ({ value, label: value })),
            pressed: ['Bold', 'Italic'],
            onPress: () => Pressed,
            style: segmented,
          },
          h,
        ),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type, _: Message) => ({ model }),
      view,
    }),
  )
}

const fill = (selector: string) =>
  getComputedStyle(document.querySelector(selector)!).backgroundColor

test.each(variants)('a %s button that is on looks it', async variant => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-case] button')).not.toBeNull())
    expect(fill(`[data-case="${variant} true"] button`)).not.toBe(
      fill(`[data-case="${variant} false"] button`),
    )
  } finally {
    handle.dispose()
  }
})

test('a toggle group fills every pressed option, and not the others', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() =>
      expect(document.querySelectorAll('[role="group"] button')).toHaveLength(3),
    )
    const [bold, italic, strike] = Array.from(
      document.querySelectorAll<HTMLElement>('[role="group"] button'),
      button => getComputedStyle(button).backgroundColor,
    )
    expect(bold).toBe(italic)
    expect(bold).not.toBe(strike)
  } finally {
    handle.dispose()
  }
})
