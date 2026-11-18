/**
 * A slider of a list of thumbs on a real runtime, its values in the Model:
 * each thumb is named by its place, spans only where it may travel, and stops
 * at its neighbours; the fill runs from the first thumb to the last. And the
 * words of a range, and `Slider.configure`.
 */
import { Schema } from 'effect'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Slider as Recipe } from '../src/recipes/slider.js'
import * as Slider from '../src/slider.js'
import { SliderSlots } from '../src/slider.js'

const style = Style.forSlots(SliderSlots)(Recipe({}))
const Model = Schema.Struct({ values: Schema.Array(Schema.Number) })
type Model = typeof Model.Type
interface Moved {
  readonly _tag: 'Moved'
  readonly values: ReadonlyArray<number>
}
const moved = (values: ReadonlyArray<number>): Moved => ({ _tag: 'Moved', values })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const App = Slider.configure({ base: { style, words: { thumb: 'Stop {index}' } } })

const mount = (configured = false) => {
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
  container.id = 'slider-list'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { values: [20, 50, 80] } }),
      update: (_: Model, message: Moved) => ({ model: { values: message.values } }),
      view: (model, h) =>
        h.div(
          [h.Style({ inlineSize: '400px', padding: '24px' })],
          [
            (configured ? App.view : Slider.view)(
              {
                id: 'stops',
                label: 'Stops',
                value: model.values,
                onChange: moved,
                ...(configured ? {} : { style }),
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const thumbs = () => Array.from(document.querySelectorAll<HTMLInputElement>('input[type="range"]'))
const values = () => thumbs().map(thumb => Number(thumb.value))

test('each thumb is named by its place and bounded by its neighbours', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(thumbs()).toHaveLength(3))
    expect(thumbs().map(thumb => thumb.getAttribute('aria-label'))).toEqual([
      'Thumb 1 of 3',
      'Thumb 2 of 3',
      'Thumb 3 of 3',
    ])
    expect(thumbs().map(thumb => [thumb.min, thumb.max])).toEqual([
      ['0', '50'],
      ['20', '80'],
      ['50', '100'],
    ])
  } finally {
    handle.dispose()
  }
})

test('End on a thumb stops at its upper neighbour, and the others keep their values', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(thumbs()).toHaveLength(3))
    thumbs()[0]!.focus()
    await userEvent.keyboard('{End}')
    await vi.waitFor(() => expect(values()).toEqual([50, 50, 80]))
    thumbs()[1]!.focus()
    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(values()).toEqual([50, 50, 80]))
  } finally {
    handle.dispose()
  }
})

test('each thumb’s input spans only where it may travel', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(thumbs()).toHaveLength(3))
    const track = thumbs()[0]!.parentElement!.getBoundingClientRect()
    const [first, second, third] = thumbs().map(thumb => thumb.getBoundingClientRect())
    // From the track's start to the second thumb, and from the first thumb to the third.
    expect(first!.left).toBeCloseTo(track.left, 0)
    expect(first!.width).toBeLessThan(track.width * 0.7)
    expect(second!.left).toBeGreaterThan(track.left + track.width * 0.1)
    expect(third!.right).toBeCloseTo(track.right, 0)
  } finally {
    handle.dispose()
  }
})

test('the fill runs from the first thumb to the last', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(thumbs()).toHaveLength(3))
    const track = thumbs()[0]!.parentElement!
    const bar = track.querySelector(':scope > div > div')!.getBoundingClientRect()
    const control = track.getBoundingClientRect()
    // 20 to 80 of 100, within a thumb's width of the track's ends.
    expect(bar.left - control.left).toBeGreaterThan(control.width * 0.1)
    expect(control.right - bar.right).toBeGreaterThan(control.width * 0.1)
  } finally {
    handle.dispose()
  }
})

test('a configured slider takes the base’s words and style', async () => {
  const handle = mount(true)
  try {
    await vi.waitFor(() => expect(thumbs()).toHaveLength(3))
    expect(thumbs().map(thumb => thumb.getAttribute('aria-label'))).toEqual([
      'Stop 1',
      'Stop 2',
      'Stop 3',
    ])
    expect(thumbs()[0]!.parentElement!.getBoundingClientRect().height).toBeGreaterThan(0)
  } finally {
    handle.dispose()
  }
})
