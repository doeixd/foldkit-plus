/**
 * Rating as markup: a radio group named by its label, one native radio per
 * star (or per half) sharing a name, the given star checked and the stars up
 * to it filled, the choice sent from each, and a clear from the chosen one;
 * read-only, one image that says the rating, each mark filled by its share.
 * What the arrows do between radios is the browser's; Home and End are a
 * Mount's, tested in a browser.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns, Rating, RatingSlots, Recipes } from '../src/index.js'
import { h, message, sends, type TestMessage } from './fixture.js'

const Rated = defineMessageUnion({ Rated: { value: Schema.Number } })
type Rated = typeof Rated.Type

const style = Style.forSlots(RatingSlots)(Recipes.Rating({}))
const drawn = (
  value: Option.Option<number>,
  more: Partial<Rating.RatingInput<TestMessage>> = {},
  builder: HtmlBuilder<TestMessage> = h,
) =>
  Rating.view(
    {
      id: 'stay',
      label: 'Your stay',
      value,
      onChange: () => message('Clicked'),
      style,
      ...more,
    },
    builder,
  )

/** The same rating read-only: no `onChange`, which it would never send. */
const shownOnly = (value: Option.Option<number>, builder: HtmlBuilder<TestMessage> = h) =>
  Rating.view({ id: 'stay', label: 'Your stay', value, readOnly: true, style }, builder)

describe('Rating.view', () => {
  it('meets the rating pattern', () => {
    expect(A11y.validate(Patterns.Rating, RatingSlots)).toEqual([])
  })

  it('is a radio group named by its label, of one radio per star under one name', () => {
    const [group] = Inert.byRole(drawn(Option.some(3)), 'radiogroup')
    const [label] = Inert.byTag(group, 'span')
    const radios = Inert.byTag(group, 'input')
    expect(Inert.value(group, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
    expect(radios.map(radio => Inert.value(radio, 'type'))).toEqual(Array(5).fill('radio'))
    expect(new Set(radios.map(radio => Inert.value(radio, 'name')))).toEqual(new Set(['stay']))
    expect(radios.map(radio => Inert.value(radio, 'aria-label'))).toEqual([
      '1 star',
      '2 stars',
      '3 stars',
      '4 stars',
      '5 stars',
    ])
  })

  it('checks the star given and fills the ones up to it', () => {
    const radios = Inert.byTag(drawn(Option.some(3)), 'input')
    expect(radios.map(radio => Inert.value(radio, 'checked'))).toEqual([
      false,
      false,
      true,
      false,
      false,
    ])
    expect(radios.map(radio => Inert.value(radio, 'data-filled'))).toEqual([
      'true',
      'true',
      'true',
      'false',
      'false',
    ])
  })

  it('checks and fills none before anyone rates', () => {
    const radios = Inert.byTag(drawn(Option.none()), 'input')
    expect(radios.some(radio => Inert.value(radio, 'checked') === true)).toBe(false)
    expect(radios.some(radio => Inert.value(radio, 'data-filled') === 'true')).toBe(false)
  })

  it('listens for a choice on every star, each submitting its own value, and none when disabled', () => {
    const radios = Inert.byTag(drawn(Option.none()), 'input')
    expect(radios.map(radio => typeof radio.data?.on?.['change'])).toEqual(
      Array(5).fill('function'),
    )
    const [chosen] = Inert.byTag(drawn(Option.none()), 'input').slice(3)
    expect(Inert.value(chosen, 'value')).toBe('4')
    const off = Inert.byTag(drawn(Option.none(), { disabled: true }), 'input')
    expect(off.map(radio => Inert.value(radio, 'disabled'))).toEqual(Array(5).fill(true))
    expect(off.some(radio => radio.data?.on?.['change'] !== undefined)).toBe(false)
  })

  it('sends the star chosen', () => {
    sends(
      (h: HtmlBuilder<Rated>) =>
        Rating.view(
          {
            id: 'stay',
            label: 'Your stay',
            value: Option.some(2),
            onChange: value => Rated.Rated({ value }),
            style,
          },
          h,
        ),
      Scene.change(Scene.label('4 stars'), '4'),
      Scene.expectOutMessage(Rated.Rated({ value: 4 })),
    )
  })

  it('groups the radios by the id, and by a name of its own when given', () => {
    const radios = Inert.byTag(drawn(Option.none()), 'input')
    expect(radios.map(radio => Inert.value(radio, 'name'))).toEqual(Array(5).fill('stay'))
  })

  it('read-only, is one image that says the rating, with no radios', () => {
    const shown = shownOnly(Option.some(4))
    const [image] = Inert.byRole(shown, 'img')
    expect(Inert.value(image, 'aria-label')).toBe('Your stay: 4 stars of 5')
    const [label] = Inert.byTag(image, 'span')
    expect(Inert.value(label, 'aria-hidden')).toBe('true')
    expect(Inert.byTag(shown, 'input')).toEqual([])
    const [unrated] = Inert.byRole(shownOnly(Option.none()), 'img')
    expect(Inert.value(unrated, 'aria-label')).toBe('Your stay: not rated')
  })
})

const Cleared = defineMessageUnion({ Rated: { value: Schema.Number }, Cleared: {} })
type Cleared = typeof Cleared.Type

const fills = (shown: ReturnType<typeof drawn>) =>
  Inert.all(shown)
    .filter(node => Inert.style(node)['--fk-rating-fill'] !== undefined)
    .map(node => Inert.style(node)['--fk-rating-fill'])

describe('Rating, read-only and fractional', () => {
  it('fills each mark as far as the rating goes, the last by its fraction', () => {
    expect(fills(shownOnly(Option.some(4.3)))).toEqual(['1', '1', '1', '1', '0.3'])
    expect(fills(shownOnly(Option.some(2.5)))).toEqual(['1', '1', '0.5', '0', '0'])
    expect(fills(shownOnly(Option.none()))).toEqual(['0', '0', '0', '0', '0'])
  })

  it('says the fraction', () => {
    const [image] = Inert.byRole(shownOnly(Option.some(4.3)), 'img')
    expect(Inert.value(image, 'aria-label')).toBe('Your stay: 4.3 stars of 5')
  })
})

describe('Rating in halves', () => {
  const halves = (value: Option.Option<number>) =>
    Inert.byTag(drawn(value, { precision: 0.5 }), 'input')

  it('is two radios a star, each its own value, the first of each marked', () => {
    const radios = halves(Option.none())
    expect(radios.map(radio => Inert.value(radio, 'value'))).toEqual([
      '0.5',
      '1',
      '1.5',
      '2',
      '2.5',
      '3',
      '3.5',
      '4',
      '4.5',
      '5',
    ])
    expect(radios.map(radio => Inert.value(radio, 'data-half'))).toEqual(
      Array.from({ length: 10 }, (_, index) => (index % 2 === 0 ? 'start' : undefined)),
    )
    expect(Inert.value(radios[4], 'aria-label')).toBe('2.5 stars')
  })

  it('checks the half given, and fills the halves up to it', () => {
    const radios = halves(Option.some(2.5))
    expect(radios.map(radio => Inert.value(radio, 'checked'))).toEqual(
      Array.from({ length: 10 }, (_, index) => index === 4),
    )
    expect(radios.filter(radio => Inert.value(radio, 'data-filled') === 'true')).toHaveLength(5)
  })
})

describe('Rating cleared', () => {
  const clearable = (value: Option.Option<number>, h: HtmlBuilder<Cleared>) =>
    Rating.view(
      {
        id: 'stay',
        label: 'Your stay',
        value,
        onChange: rated => Cleared.Rated({ value: rated }),
        onClear: () => Cleared.Cleared(),
        style,
      },
      h,
    )

  it('sends a clear for a press on the star already chosen', () => {
    sends(
      (h: HtmlBuilder<Cleared>) => clearable(Option.some(3), h),
      Scene.click(Scene.label('3 stars')),
      Scene.expectOutMessage(Cleared.Cleared()),
    )
  })

  it('listens for a press on the chosen star alone, and only when told how to clear', () => {
    const clicks = (shown: ReturnType<typeof drawn>) =>
      Inert.byTag(shown, 'input').map(radio => radio.data?.on?.['click'] !== undefined)
    const h = SlotView.inertBuilder<Cleared>()
    expect(clicks(clearable(Option.some(3), h))).toEqual([false, false, true, false, false])
    expect(clicks(clearable(Option.none(), h))).toEqual(Array(5).fill(false))
    expect(clicks(drawn(Option.some(3)))).toEqual(Array(5).fill(false))
  })
})

describe('Rating in words', () => {
  const words = ['Poor', 'Fair', 'Good', 'Great', 'Superb']
  const worded = (value: Option.Option<number>) => drawn(value, { showValue: true, labels: words })

  it('names each star by its word, and shows the word of the rating, said once', () => {
    const shown = worded(Option.some(4))
    expect(Inert.byTag(shown, 'input').map(radio => Inert.value(radio, 'aria-label'))).toEqual(
      words,
    )
    const [said] = Inert.all(shown).filter(
      node => node.sel === 'span' && Inert.value(node, 'aria-hidden') === 'true',
    )
    expect(Inert.text(said)).toBe('Great')
  })

  it('shows no word before anyone rates', () => {
    expect(Inert.text(worded(Option.none()))).toBe('Your stay')
  })
})

describe('Rating words', () => {
  const read = (shown: ReturnType<typeof drawn>) =>
    Inert.byTag(shown, 'input').map(radio => Inert.value(radio, 'aria-label'))

  it('says one star and several as the words say them, with the number filled in', () => {
    expect(
      read(drawn(Option.none(), { words: { one: '{value} heart', other: '{value} hearts' } })),
    ).toEqual(['1 heart', '2 hearts', '3 hearts', '4 hearts', '5 hearts'])
  })

  it('a labelled star keeps its label and the rest fall back to the words', () => {
    expect(read(drawn(Option.none(), { max: 3, labels: ['Poor'] }))).toEqual([
      'Poor',
      '2 stars',
      '3 stars',
    ])
  })

  it('names a read-only rating by the words, with what is rated and out of how many', () => {
    const named = (
      value: Option.Option<number>,
      more: Partial<Rating.RatingDisplay<TestMessage>> = {},
    ) =>
      Inert.value(
        Inert.all(
          Rating.view({ id: 'stay', label: 'Your stay', value, readOnly: true, style, ...more }, h),
        ).find(node => Inert.value(node, 'role') === 'img'),
        'aria-label',
      )
    expect(named(Option.some(4.5))).toBe('Your stay: 4.5 stars of 5')
    expect(named(Option.none())).toBe('Your stay: not rated')
    expect(
      named(Option.some(2), {
        words: { rated: '{stars} sur {max} pour {label}', other: '{value} étoiles' },
      }),
    ).toBe('2 étoiles sur 5 pour Your stay')
  })
})

describe('Rating configure', () => {
  const App = Rating.configure({
    base: { max: 3, words: { other: '{value} hearts' } },
    presets: { plain: { words: { one: '{value} heart' } } },
  })
  const read = (preset?: 'plain') =>
    Inert.byTag(
      App.view(
        {
          id: 'stay',
          label: 'Your stay',
          value: Option.none(),
          onChange: () => message('Clicked'),
          style,
          ...(preset === undefined ? {} : { preset }),
        },
        h,
      ),
      'input',
    ).map(radio => Inert.value(radio, 'aria-label'))

  it('starts from the base, and a preset’s words merge over it word by word', () => {
    expect(read()).toEqual(['1 star', '2 hearts', '3 hearts'])
    expect(read('plain')).toEqual(['1 heart', '2 hearts', '3 hearts'])
  })
})

describe('Rating tones', () => {
  it('danger draws the error colour, and the old name is gone', () => {
    const css = (selection: Parameters<typeof Recipes.Rating>[0]) =>
      Style.forSlots(RatingSlots)(Recipes.Rating(selection)).css
    expect(css({ tone: 'danger' })).toContain('error')
    expect(css({ tone: 'danger' })).not.toBe(css({ tone: 'warning' }))
    // @ts-expect-error `error` was renamed `danger`.
    css({ tone: 'error' })
  })
})

describe('Rating ends', () => {
  const keyed = (shown: ReturnType<typeof drawn>) =>
    Inert.byTag(shown, 'input').map(radio => radio.data?.on?.['keydown'] !== undefined)

  it('puts a Home and End route on each star of a group that takes a choice, and none on a disabled one', () => {
    expect(keyed(drawn(Option.none()))).toEqual(Array(5).fill(true))
    expect(keyed(drawn(Option.none(), { disabled: true }))).toEqual(Array(5).fill(false))
  })

  it('gives each star an id, which the route moves focus by', () => {
    expect(
      Inert.byTag(drawn(Option.none()), 'input').map(radio => Inert.value(radio, 'id')),
    ).toEqual(['stay-1', 'stay-2', 'stay-3', 'stay-4', 'stay-5'])
  })

  it('draws no Mount on a group that takes keys, read-only or not', () => {
    sends((h: HtmlBuilder<TestMessage>) => drawn(Option.none(), {}, h), Scene.Mount.expectNone())
    sends((h: HtmlBuilder<TestMessage>) => shownOnly(Option.some(3), h), Scene.Mount.expectNone())
  })
})
