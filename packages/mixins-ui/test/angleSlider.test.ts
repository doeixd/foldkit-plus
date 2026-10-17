/**
 * The angle slider as markup and as a Model. The markup: a group named by its
 * label, one thumb that is the APG's slider saying the angle, markers placed
 * and stated against the value, a hidden input for a form, and nothing
 * listening when disabled or read-only. The Model: each key stepped from the
 * value `update` holds, round the dial past its ends, a point snapped to the
 * step or to the nearest mark, and the same Model when nothing moves.
 */
import { describe, expect, it } from 'vitest'
import { A11y, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import { AngleSlider, AngleSliderSlots, Patterns } from '../src/index.js'
import { AngleSlider as Recipe } from '../src/recipes/angleSlider.js'
import { message, type TestMessage } from './fixture.js'

const style = Style.forSlots(AngleSliderSlots)(Recipe({}))
const marks = [{ value: 0, label: 'N' }, { value: 90, label: 'E' }, { value: 180 }, { value: 270 }]
const model = AngleSlider.init({ id: 'heading', value: 90 })

type More = Partial<AngleSlider.AngleSliderView<TestMessage>>

const Dial = SlotView.forMessages<TestMessage>().define(AngleSliderSlots, (more: More, _, h) =>
  AngleSlider.view(
    { model, label: 'Heading', onMessage: () => message('Clicked'), marks, style, ...more },
    h,
  ),
)
const drawn = (more: More = {}) => Inert.draw(Dial, more)
const thumbOf = (more: More = {}) => Inert.bySlot(drawn(more), 'thumb')[0]

describe('AngleSlider.view', () => {
  it('meets the angle slider pattern', () => {
    expect(A11y.validate(Patterns.AngleSlider, AngleSliderSlots)).toEqual([])
  })

  it('is a group named by its label around one slider saying the angle', () => {
    const dial = drawn()
    const [group] = Inert.byRole(dial, 'group')
    const [label] = Inert.bySlot(dial, 'label')
    expect(Inert.value(group, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
    const [thumb, ...more] = Inert.byRole(dial, 'slider')
    expect(more).toEqual([])
    expect(Inert.value(thumb, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
    expect(
      ['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'tabindex'].map(name =>
        Inert.value(thumb, name),
      ),
    ).toEqual(['0', '359', '90', '90 degrees', 0])
    expect(typeof thumb?.data?.on?.['keydown']).toBe('function')
  })

  it('ends its range a step before a full turn, and says the angle as asked', () => {
    const thumb = thumbOf({ step: 15, valueText: value => `${value} degrees east of north` })
    expect(Inert.value(thumb, 'aria-valuemax')).toBe('345')
    expect(Inert.value(thumbOf({ step: 7 }), 'aria-valuemax')).toBe('357')
    expect(Inert.value(thumb, 'aria-valuetext')).toBe('90 degrees east of north')
  })

  it('sets the angle on the root, and shows it for the eye only', () => {
    const dial = drawn({ format: value => `${value}deg` })
    const [group] = Inert.byRole(dial, 'group')
    expect(Inert.style(group)['--fk-angle']).toBe('90deg')
    const [shown] = Inert.bySlot(dial, 'value')
    expect(Inert.text(shown)).toBe('90deg')
    expect(Inert.value(shown, 'aria-hidden')).toBe('true')
    expect(Inert.bySlot(drawn({ showValue: false }), 'value')).toEqual([])
  })

  it('places each marker at its angle, stated against the value', () => {
    const markers = Inert.bySlot(
      drawn({ model: AngleSlider.init({ id: 'h', value: 180 }) }),
      'marker',
    )
    expect(markers.map(marker => Inert.style(marker)['--fk-angle-marker'])).toEqual([
      '0deg',
      '90deg',
      '180deg',
      '270deg',
    ])
    expect(markers.map(marker => Inert.value(marker, 'data-state'))).toEqual([
      'under',
      'under',
      'at',
      'over',
    ])
    expect(Inert.bySlot(drawn(), 'markerLabel').map(label => Inert.text(label))).toEqual(['N', 'E'])
  })

  it('draws nothing outside a Slot', () => {
    expect(Inert.unslotted(drawn({ name: 'heading' }))).toEqual([])
  })

  it('holds the angle in a hidden input only when named', () => {
    const [input] = Inert.bySlot(drawn({ name: 'heading' }), 'input')
    expect([
      Inert.value(input, 'type'),
      Inert.value(input, 'name'),
      Inert.value(input, 'value'),
    ]).toEqual(['hidden', 'heading', '90'])
    expect(Inert.bySlot(drawn(), 'input')).toEqual([])
  })

  it('takes no keys and no pointer when disabled, and no keys but the focus when read-only', () => {
    const disabled = thumbOf({ disabled: true })
    expect(Inert.value(disabled, 'aria-disabled')).toBe('true')
    expect(Inert.value(disabled, 'tabindex')).toBeUndefined()
    expect(disabled?.data?.on).toBeUndefined()
    const readOnly = thumbOf({ readOnly: true })
    expect(Inert.value(readOnly, 'aria-readonly')).toBe('true')
    expect(Inert.value(readOnly, 'tabindex')).toBe(0)
    expect(readOnly?.data?.on).toBeUndefined()
    // The control's Mount is its only hook: none is drawn where nothing may change.
    for (const more of [{ disabled: true }, { readOnly: true }]) {
      const [control] = Inert.bySlot(drawn(more), 'control')
      expect(control?.data?.hook).toBeUndefined()
    }
    const [control] = Inert.bySlot(drawn(), 'control')
    expect(control?.data?.hook).toBeDefined()
  })

  it('marks an invalid angle for the recipe and for assistive technology', () => {
    const dial = drawn({ invalid: true })
    expect(Inert.value(Inert.byRole(dial, 'group')[0], 'data-invalid')).toBe('')
    expect(Inert.value(Inert.byRole(dial, 'slider')[0], 'aria-invalid')).toBe('true')
  })

  it('reads only tokens the theme declares', () => {
    const theme = Theme.compose(
      Theme.tokens,
      Theme.oklch({ accent: { h: 260, c: 0.15, l: '55%' } }),
    )
    expect(Inert.missingTokens(drawn(), Style.stylesheet(Theme.root(theme)))).toEqual([])
  })
})

describe('AngleSlider.update', () => {
  const at = (value: number) => AngleSlider.init({ id: 'a', value })
  const step = (layout: AngleSlider.AngleSliderLayout = {}) => {
    const fold = AngleSlider.update(layout)
    return (from: AngleSlider.Model, sent: AngleSlider.Message) => fold(from, sent).model
  }
  const key = (name: string, shift = false) => AngleSlider.Message.PressedKey({ key: name, shift })

  it.each([
    ['ArrowRight', false, 91],
    ['ArrowUp', false, 91],
    ['ArrowLeft', false, 89],
    ['ArrowDown', false, 89],
    ['ArrowRight', true, 105],
    ['ArrowDown', true, 75],
    ['PageUp', false, 105],
    ['PageDown', false, 75],
    ['Home', false, 0],
    ['End', false, 359],
  ] as const)('%s (shift %s) turns the dial to %s', (name, shift, value) => {
    expect(step()(at(90), key(name, shift)).value).toBe(value)
  })

  it('goes round past either end of a turn', () => {
    expect(step()(at(359), key('ArrowRight')).value).toBe(0)
    expect(step()(at(0), key('ArrowLeft')).value).toBe(359)
    expect(step({ step: 45 })(at(315), key('ArrowUp')).value).toBe(0)
    // Seven does not divide a turn: End and a step back from 0 land on 357.
    expect(step({ step: 7 })(at(14), key('End')).value).toBe(357)
    expect(step({ step: 7 })(at(0), key('ArrowLeft')).value).toBe(357)
  })

  it('steps each key from the value before it, as keys faster than a frame arrive', () => {
    expect(Array(3).fill(key('ArrowRight')).reduce(step(), at(10)).value).toBe(13)
  })

  it('takes the large step as a multiple of the step, or as given', () => {
    expect(step({ step: 10 })(at(0), key('PageUp')).value).toBe(20)
    expect(step({ step: 10, largeStep: 90 })(at(0), key('PageUp')).value).toBe(90)
    expect(step({ step: 0.1 })(at(0), key('ArrowRight')).value).toBe(0.1)
  })

  it('snaps a point to the step, round into one turn, and marks the drag', () => {
    const pointed = step({ step: 5 })(at(0), AngleSlider.Message.Pointed({ angle: 358.1 }))
    expect([pointed.value, pointed.dragging]).toEqual([0, true])
    expect(step({ step: 5 })(at(0), AngleSlider.Message.Pointed({ angle: 47.4 })).value).toBe(45)
    // By sevens, 359.9 is nearer 0, across the top, than the last step at 357.
    const sevens = step({ step: 7 })
    expect(sevens(at(90), AngleSlider.Message.Pointed({ angle: 359.9 })).value).toBe(0)
    expect(sevens(at(90), AngleSlider.Message.Pointed({ angle: 358 })).value).toBe(357)
    const released = step()(pointed, AngleSlider.Message.Released())
    expect([released.value, released.dragging]).toEqual([0, false])
  })

  it('keeps to the marks when restricted, by the pointer and by the keys', () => {
    const marked = step({ marks, restrictToMarks: true })
    expect(marked(at(0), AngleSlider.Message.Pointed({ angle: 100 })).value).toBe(90)
    // The nearest the short way round: 350 is nearer 0 than 270.
    expect(marked(at(90), AngleSlider.Message.Pointed({ angle: 350 })).value).toBe(0)
    expect(marked(at(90), key('ArrowRight')).value).toBe(180)
    expect(marked(at(0), key('ArrowLeft')).value).toBe(270)
    expect(marked(at(90), key('End')).value).toBe(270)
    expect(marked(at(90), AngleSlider.Message.Set({ value: 200 })).value).toBe(180)
  })

  it('keeps its Model when nothing changes', () => {
    const top = at(0)
    expect(AngleSlider.update()(top, key('Home')).model).toBe(top)
    expect(AngleSlider.update()(top, key('Tab')).model).toBe(top)
    expect(AngleSlider.update()(top, AngleSlider.Message.Released()).model).toBe(top)
    expect(AngleSlider.update()(top, AngleSlider.Message.Set({ value: 360 })).model).toBe(top)
  })

  it('refuses a step that is no step at all, and marks to keep to that are none', () => {
    expect(() => AngleSlider.update({ step: 0 })).toThrow(/step must be above 0/)
    expect(() => AngleSlider.update({ restrictToMarks: true })).toThrow(/needs marks/)
  })

  it('takes an initial value round into one turn', () => {
    expect([at(-90).value, at(720).value]).toEqual([270, 0])
  })
})
