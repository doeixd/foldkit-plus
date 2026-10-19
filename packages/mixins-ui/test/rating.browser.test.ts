/**
 * Rating in a real browser: Home and End take the focus and the choice to
 * the ends, a press on the chosen star clears it, a half star is half a
 * star wide and a press on a star's first half gives its half, a read-only
 * fraction fills its last star part way (from the right, right to left),
 * and the glyph and size axes reach the drawing.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
// From the modules, not the index: the test reads nothing else.
import * as Rating from '../src/rating.js'
import { RatingSlots, type RatingInput } from '../src/rating.js'
import * as Recipes from '../src/recipes/rating.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const Model = Schema.Struct({ value: Schema.Option(Schema.Number) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Rated: { value: Schema.Number }, Cleared: {} })
type Message = typeof Message.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (
  value: Option.Option<number>,
  selection: Parameters<typeof Recipes.Rating>[0] = {},
  options: Partial<RatingInput<Message>> & { readonly shownOnly?: boolean } = {},
  direction: 'ltr' | 'rtl' = 'ltr',
) => {
  const style = Style.forSlots(RatingSlots)(Recipes.Rating(selection))
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
  container.id = 'rating'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { value } }),
      update: (model: Model, message: Message) => ({
        model: Message.match(message, {
          Rated: ({ value: rated }) => modifyFields(model, { value: () => Option.some(rated) }),
          Cleared: () => modifyFields(model, { value: () => Option.none() }),
        }),
      }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Dir(direction)],
          [
            options.shownOnly === true
              ? Rating.view(
                  { id: 'stay', label: 'Your stay', value: model.value, readOnly: true, style },
                  h,
                )
              : Rating.view(
                  {
                    id: 'stay',
                    label: 'Your stay',
                    value: model.value,
                    onChange: rated => Message.Rated({ value: rated }),
                    onClear: () => Message.Cleared(),
                    style,
                    ...options,
                  },
                  h,
                ),
          ],
        ),
    }),
  )
}

const radios = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
const checked = () => radios().find(radio => radio.checked)?.value

test('Home and End take the focus and the choice to the first star and the last', async () => {
  const mounted = mount(Option.some(3))
  try {
    await vi.waitFor(() => expect(radios()).toHaveLength(5))
    radios()[2]!.focus()
    await userEvent.keyboard('{End}')
    await vi.waitFor(() => expect(checked()).toBe('5'))
    expect(document.activeElement).toBe(radios()[4])
    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(checked()).toBe('1'))
    expect(document.activeElement).toBe(radios()[0])
    // The arrows, the browser's own, still go from where the focus went.
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(checked()).toBe('2'))
  } finally {
    mounted.dispose()
  }
})

test('a press on the chosen star clears the rating, and a press on another chooses it', async () => {
  const mounted = mount(Option.some(3))
  try {
    await vi.waitFor(() => expect(checked()).toBe('3'))
    await userEvent.click(radios()[2]!)
    await vi.waitFor(() => expect(checked()).toBeUndefined())
    await userEvent.click(radios()[1]!)
    await vi.waitFor(() => expect(checked()).toBe('2'))
  } finally {
    mounted.dispose()
  }
})

test('a half star is half as wide, and a press on a star’s first half gives its half', async () => {
  const mounted = mount(Option.none(), { size: 'lg' }, { precision: 0.5 })
  try {
    await vi.waitFor(() => expect(radios()).toHaveLength(10))
    const [first, second, third] = radios() as [
      HTMLInputElement,
      HTMLInputElement,
      HTMLInputElement,
    ]
    const half = first.getBoundingClientRect()
    const whole = half.width + second.getBoundingClientRect().width
    expect(half.height).toBeCloseTo(whole, 0)
    // The halves of a star touch; the next star stands a gap away.
    expect(second.getBoundingClientRect().left).toBeCloseTo(half.right, 0)
    expect(third.getBoundingClientRect().left).toBeGreaterThan(
      second.getBoundingClientRect().right + 1,
    )
    // The end half shows the glyph's end: its drawing starts half a star before it.
    expect(getComputedStyle(second, '::before').marginInlineStart).toBe(`${-half.width}px`)
    await userEvent.click(third, { position: { x: 2, y: half.height / 2 } })
    await vi.waitFor(() => expect(checked()).toBe('1.5'))
  } finally {
    mounted.dispose()
  }
})

const gradient = (element: Element) => getComputedStyle(element, '::before').backgroundImage

test('read-only, a fraction fills its last star part way, from the right right to left', async () => {
  let mounted = mount(Option.some(4.3), {}, { shownOnly: true })
  try {
    await vi.waitFor(() => expect(document.querySelector('[role="img"]')).not.toBeNull())
    const marks = Array.from(document.querySelectorAll('[role="img"] > span')).slice(1)
    expect(marks).toHaveLength(5)
    expect(gradient(marks[4]!)).toMatch(/to right.* 30%/)
    expect(gradient(marks[3]!)).toMatch(/ 100%/)
  } finally {
    mounted.dispose()
  }
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  mounted = mount(Option.some(4.3), {}, { shownOnly: true }, 'rtl')
  try {
    await vi.waitFor(() => expect(document.querySelector('[role="img"]')).not.toBeNull())
    const last = document.querySelectorAll('[role="img"] > span')[5]!
    expect(gradient(last)).toMatch(/to left.* 30%/)
  } finally {
    mounted.dispose()
  }
})

test('the stars up to the rating are full, and pointing at one previews its rating', async () => {
  const mounted = mount(Option.some(4))
  try {
    await vi.waitFor(() => expect(radios()).toHaveLength(5))
    const fill = (radio: Element) => getComputedStyle(radio).getPropertyValue('--fk-rating-fill')
    // At rest, the stars up to the rating are full.
    await userEvent.hover(document.body, { position: { x: 600, y: 400 } })
    await vi.waitFor(() => expect(radios().map(fill)).toEqual(['1', '1', '1', '1', '0']))
    await userEvent.hover(radios()[1]!)
    await vi.waitFor(() => expect(radios().map(fill)).toEqual(['1', '1', '0', '0', '0']))
  } finally {
    await userEvent.hover(document.body, { position: { x: 600, y: 400 } })
    mounted.dispose()
  }
})

test('a heart is not a star, and a large glyph is larger', async () => {
  const shapeOf = async (selection: Parameters<typeof Recipes.Rating>[0]) => {
    const mounted = mount(Option.none(), selection)
    try {
      await vi.waitFor(() => expect(radios()).toHaveLength(5))
      const [radio] = radios()
      return {
        clip: getComputedStyle(radio!, '::before').clipPath,
        width: radio!.getBoundingClientRect().width,
      }
    } finally {
      mounted.dispose()
      document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
      document.body.replaceChildren()
    }
  }
  const star = await shapeOf({})
  const heart = await shapeOf({ glyph: 'heart' })
  expect(star.clip).toContain('polygon')
  expect(heart.clip).toContain('polygon')
  expect(heart.clip).not.toBe(star.clip)
  const small = await shapeOf({ size: 'sm' })
  const large = await shapeOf({ size: 'lg' })
  expect(large.width).toBeGreaterThan(small.width)
})
