/**
 * The Textarea recipe in a real browser: `resize: 'auto'` grows with the
 * text from `rows` lines to `maxRows` and then scrolls, the fixed ones stay
 * `rows` lines tall, a framed field draws one box with the focus ring on the
 * frame, and the count turns to the warning's and the error's ink near and
 * at its limit.
 */
import { Schema } from 'effect'
import { FieldValidation } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Recipes, Textarea, TextareaSlots } from '../src/index.js'

const Message = defineMessageUnion({ Typed: { id: Schema.String, value: Schema.String } })
type Message = typeof Message.Type

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const auto = Style.forSlots(TextareaSlots)(Recipes.Textarea({}))
const vertical = Style.forSlots(TextareaSlots)(Recipes.Textarea({ resize: 'vertical' }))
const none = Style.forSlots(TextareaSlots)(Recipes.Textarea({ resize: 'none' }))
const filled = Style.forSlots(TextareaSlots)(Recipes.Textarea({ variant: 'filled' }))

// The reset's `border-box` too, as an application installs it: the recipe sizes the border box.
const sheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('theme', Theme.root(theme)),
)

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const lines = (count: number) =>
  Array.from({ length: count }, (_, line) => `Line ${line}`).join('\n')

const mount = (draw: (h: HtmlBuilder<Message>) => ReadonlyArray<Html>) => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = sheet + [auto, vertical, none, filled].map(each => each.css).join('')
  document.head.append(style)
  const container = document.createElement('div')
  container.id = 'textarea-browser'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container,
      init: () => ({ model: {} }),
      update: (model: {}) => ({ model }),
      view: (_: {}, h: HtmlBuilder<Message>) =>
        h.div([h.Style({ display: 'grid', gap: '1rem', width: '320px' })], draw(h)),
    }),
  )
}

const area = (id: string) => document.getElementById(id) as HTMLTextAreaElement
const height = (id: string) => area(id).getBoundingClientRect().height
const lineHeight = (id: string) => parseFloat(getComputedStyle(area(id)).lineHeight)

const control = (
  h: HtmlBuilder<Message>,
  id: string,
  value: string,
  style: typeof auto,
  rows?: number,
  maxRows?: number,
) =>
  Textarea.view(
    {
      id,
      value,
      ...(rows === undefined ? {} : { rows }),
      ...(maxRows === undefined ? {} : { maxRows }),
      style,
      draw: ({ textarea }, h) => h.textarea(textarea),
    },
    h,
  )

test('auto grows with its text from rows lines to maxRows, then scrolls', async () => {
  const handle = mount(h => [
    control(h, 'empty', '', auto, 2, 4),
    control(h, 'fewest', '', auto, 3, 4),
    control(h, 'three', lines(3), auto, 2, 4),
    control(h, 'ten', lines(10), auto, 2, 4),
    control(h, 'unbounded', lines(10), auto, 2),
  ])
  try {
    await vi.waitFor(() => expect(area('ten')).not.toBeNull())
    const line = lineHeight('empty')
    // Empty, it is `rows` lines tall.
    expect(height('fewest') - height('empty')).toBeCloseTo(line, 0)
    expect(height('three') - height('empty')).toBeCloseTo(line, 0)
    expect(height('ten') - height('empty')).toBeCloseTo(2 * line, 0)
    expect(area('ten').scrollHeight).toBeGreaterThan(area('ten').clientHeight)
    // With no maxRows it takes every line.
    expect(height('unbounded') - height('empty')).toBeCloseTo(8 * line, 0)
    expect(getComputedStyle(area('empty')).resize).toBe('none')
  } finally {
    handle.dispose()
  }
})

test('vertical and none stay rows lines tall whatever the text, and only vertical drags', async () => {
  const handle = mount(h => [
    control(h, 'short', '', vertical, 4),
    control(h, 'long', lines(10), vertical, 4),
    control(h, 'still', lines(10), none, 4),
  ])
  try {
    await vi.waitFor(() => expect(area('still')).not.toBeNull())
    expect(height('long')).toBe(height('short'))
    expect(height('still')).toBe(height('short'))
    expect(height('short')).toBeGreaterThan(4 * lineHeight('short'))
    expect(getComputedStyle(area('long')).resize).toBe('vertical')
    expect(getComputedStyle(area('still')).resize).toBe('none')
  } finally {
    handle.dispose()
  }
})

test('a framed field is one box, ringed while its text has focus', async () => {
  const Model = Schema.Struct({ value: Schema.String })
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent = sheet + filled.css
  document.head.append(style)
  const container = document.createElement('div')
  container.id = 'textarea-frame-browser'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { value: '' } }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (model: typeof Model.Type, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Style({ width: '320px' })],
          [
            Textarea.field(
              {
                id: 'composer',
                label: 'Reply',
                field: FieldValidation.NotValidated({ value: model.value }),
                changed: value => Message.Typed({ id: 'composer', value }),
                footer: [h.button([h.Type('button')], ['Send'])],
                style: filled,
              },
              h,
            ),
          ],
        ),
    }),
  )
  try {
    await vi.waitFor(() => expect(area('composer')).not.toBeNull())
    const frame = area('composer').parentElement!
    const text = getComputedStyle(area('composer'))
    // The filled variant's well is the frame's, not the text's.
    expect(text.borderTopWidth).toBe('0px')
    expect(text.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(frame).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    await userEvent.click(area('composer'))
    await vi.waitFor(() => expect(document.activeElement).toBe(area('composer')))
    expect(getComputedStyle(frame).outlineStyle).toBe('solid')
    expect(getComputedStyle(area('composer')).outlineStyle).toBe('none')
  } finally {
    handle.dispose()
  }
})

test("a count turns to the warning's ink near its limit and the error's at it", async () => {
  const handle = mount(h =>
    (['12345678', '123456789', '1234567890'] as const).map(value =>
      Textarea.view(
        {
          id: `count-${value.length}`,
          value,
          maxLength: 10,
          count: true,
          style: auto,
          draw: ({ textarea, count }, h) =>
            h.div([], [h.textarea(textarea), h.span(count, [Textarea.countOf(value, 10)])]),
        },
        h,
      ),
    ),
  )
  const ink = (length: number) =>
    getComputedStyle(document.getElementById(`count-${length}-count`)!).color
  try {
    await vi.waitFor(() => expect(document.getElementById('count-10-count')).not.toBeNull())
    expect(new Set([ink(8), ink(9), ink(10)]).size).toBe(3)
  } finally {
    handle.dispose()
  }
})
