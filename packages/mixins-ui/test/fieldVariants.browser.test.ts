/**
 * Every Input and Textarea variant shows an invalid field's edge: a variant
 * sets `borderColor`, and the invalid rule sat in the base layer beneath it.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Input, InputSlots, Recipes, Textarea, TextareaSlots } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const sheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('theme', Theme.root(theme)),
)

const variants = ['outline', 'filled'] as const
const inputs = {
  outline: Style.forSlots(InputSlots)(Recipes.Input({ variant: 'outline' })),
  filled: Style.forSlots(InputSlots)(Recipes.Input({ variant: 'filled' })),
}
const areas = {
  outline: Style.forSlots(TextareaSlots)(Recipes.Textarea({ variant: 'outline' })),
  filled: Style.forSlots(TextareaSlots)(Recipes.Textarea({ variant: 'filled' })),
}

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (draw: (h: HtmlBuilder<never>) => ReadonlyArray<Html>) => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent =
    sheet + [...Object.values(inputs), ...Object.values(areas)].map(each => each.css).join('')
  document.head.append(style)
  const container = document.createElement('div')
  container.id = 'field-variants'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container,
      init: () => ({ model: {} }),
      update: (model: {}) => ({ model }),
      view: (_: {}, h: HtmlBuilder<never>) =>
        h.div([h.Style({ display: 'grid', gap: '1rem', width: '320px' })], draw(h)),
    }),
  )
}

const edge = (element: Element) => getComputedStyle(element).borderTopColor

test('an invalid field shows the error edge in every variant, a valid one does not', async () => {
  const handle = mount(h =>
    variants.flatMap(variant =>
      (['rest', 'invalid', 'disabled'] as const).flatMap(state => [
        Input.view(
          {
            id: `input-${variant}-${state}`,
            invalid: state === 'invalid',
            disabled: state === 'disabled',
            style: inputs[variant],
            draw: ({ input }, h) => h.input(input),
          },
          h,
        ),
        Textarea.view(
          {
            id: `area-${variant}-${state}`,
            invalid: state === 'invalid',
            disabled: state === 'disabled',
            style: areas[variant],
            draw: ({ textarea }, h) => h.textarea(textarea),
          },
          h,
        ),
        Textarea.view(
          {
            id: `framed-${variant}-${state}`,
            invalid: state === 'invalid',
            disabled: state === 'disabled',
            style: areas[variant],
            draw: ({ textarea, frame, footer }, h) =>
              h.div(frame, [h.textarea(textarea), h.div(footer, [])]),
          },
          h,
        ),
      ]),
    ),
  )
  try {
    await vi.waitFor(() => expect(document.getElementById('framed-filled-rest')).not.toBeNull())
    const at = (prefix: string, variant: string, state: string) => {
      const control = document.getElementById(`${prefix}-${variant}-${state}`)!
      return edge(prefix === 'framed' ? control.parentElement! : control)
    }
    for (const prefix of ['input', 'area', 'framed']) {
      const error = at(prefix, 'outline', 'invalid')
      expect(error).not.toBe(at(prefix, 'outline', 'rest'))
      for (const variant of variants) {
        expect(at(prefix, variant, 'invalid'), `${prefix} ${variant}`).toBe(error)
        expect(at(prefix, variant, 'rest')).not.toBe(error)
        expect(at(prefix, variant, 'disabled')).not.toBe(error)
      }
    }
  } finally {
    handle.dispose()
  }
})
