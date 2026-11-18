// @vitest-environment jsdom
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Style, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { AngleSlider, AngleSliderSlots, Bundles } from '../src/index.js'
import { AngleSlider as Recipe } from '../src/recipes/angleSlider.js'
import { message, type TestMessage } from './fixture.js'

const Layout = {
  step: 15,
  marks: [{ value: 0, label: 'N' }, { value: 90, label: 'E' }, { value: 180 }, { value: 270 }],
} as const

const App = Bundle.compose({}).pipe(
  Bundle.withChild('heading', Bundles.AngleSlider.with({ id: 'heading', value: 90, ...Layout })),
)
const update = App.placements.update(model => ({ model }))
const send = (
  model: ReturnType<typeof App.placements.initial>['model'],
  sent: AngleSlider.Message,
) => update(model, App.Message.GotHeadingMessage({ message: sent })).model

describe('Bundles.AngleSlider', () => {
  it('starts from its args, in the field the application named', () => {
    const start = App.placements.initial({}).model
    expect(start.heading).toEqual(AngleSlider.init({ id: 'heading', value: 90 }))
  })

  it('folds a drag with the layout it was placed with', () => {
    const start = App.placements.initial({}).model
    const dragged = send(start, AngleSlider.Message.Pointed({ angle: 47 }))
    expect(dragged.heading).toEqual({ id: 'heading', value: 45, dragging: true })
  })

  it('goes mark to mark when the layout restricts to marks', () => {
    const Marked = Bundle.compose({}).pipe(
      Bundle.withChild(
        'heading',
        Bundles.AngleSlider.with({ id: 'heading', value: 0, ...Layout, restrictToMarks: true }),
      ),
    )
    const step = Marked.placements.update(model => ({ model }))
    const start = Marked.placements.initial({}).model
    const next = step(
      start,
      Marked.Message.GotHeadingMessage({
        message: AngleSlider.Message.PressedKey({ key: 'ArrowRight', shift: false }),
      }),
    ).model
    expect(next.heading.value).toBe(90)
  })

  it('refuses a layout update would refuse, when it is placed', () => {
    const Bad = Bundle.compose({}).pipe(
      Bundle.withChild('heading', Bundles.AngleSlider.with({ id: 'heading', step: 400 })),
    )
    expect(() => Bad.placements.initial({})).toThrow('step must be above 0')
  })

  it('returns the Model it was given for a no-op', () => {
    const start = App.placements.initial({}).model
    expect(send(start, AngleSlider.Message.Released())).toBe(start)
  })
})

describe('AngleSlider words and configure', () => {
  const style = Style.forSlots(AngleSliderSlots)(Recipe({}))
  const Mine = AngleSlider.configure({
    base: { style, words: { degrees: '{value} grad' } },
    presets: { east: { step: 90 } },
  })
  const Dial = SlotView.forMessages<TestMessage>().define(
    AngleSliderSlots,
    (more: { readonly preset?: 'east' }, _, h) =>
      Mine.view(
        {
          model: AngleSlider.init({ id: 'h', value: 90 }),
          label: 'Heading',
          onMessage: () => message('Clicked'),
          ...more,
        },
        h,
      ),
  )
  const read = (more: { readonly preset?: 'east' } = {}) => {
    const [thumb] = Inert.byRole(Inert.draw(Dial, more), 'slider')
    return [Inert.value(thumb, 'aria-valuetext'), Inert.value(thumb, 'aria-valuemax')]
  }

  it('says the angle by the words, and a preset changes only what it names', () => {
    expect(read()).toEqual(['90 grad', '359'])
    expect(read({ preset: 'east' })).toEqual(['90 grad', '270'])
  })

  it('says the angle in degrees when no words are given', () => {
    const Plain = SlotView.forMessages<TestMessage>().define(AngleSliderSlots, (_: object, __, h) =>
      AngleSlider.view(
        {
          model: AngleSlider.init({ id: 'h', value: 12 }),
          label: 'Heading',
          onMessage: () => message('Clicked'),
        },
        h,
      ),
    )
    expect(Inert.value(Inert.byRole(Inert.draw(Plain, {}), 'slider')[0], 'aria-valuetext')).toBe(
      '12 degrees',
    )
  })
})
