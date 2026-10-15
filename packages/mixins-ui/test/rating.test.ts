/**
 * Rating as markup: a radio group named by its label, one native radio per
 * star sharing a name, the given star checked and the stars up to it filled,
 * the choice sent from each; read-only, one image that says the rating.
 * What the arrows do between radios is the browser's.
 */
import { Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns, Rating, RatingSlots, Recipes } from '../src/index.js'
import { h, message, sends } from './fixture.js'

type Rated = { readonly _tag: 'Rated'; readonly value: number }

const style = Style.forSlots(RatingSlots)(Recipes.Rating({}))
const drawn = (
  value: Option.Option<number>,
  more: { readonly readOnly?: boolean; readonly disabled?: boolean } = {},
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
    h,
  )

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
            onChange: value => ({ _tag: 'Rated', value }),
            style,
          },
          h,
        ),
      Scene.change(Scene.label('4 stars'), '4'),
      Scene.expectOutMessage<Rated>({ _tag: 'Rated', value: 4 }),
    )
  })

  it('groups the radios by an attribute, so server markup groups them too', () => {
    const radios = Inert.byTag(drawn(Option.none()), 'input')
    expect(radios.map(radio => radio.data?.attrs?.['name'])).toEqual(Array(5).fill('stay'))
  })

  it('read-only, is one image that says the rating, with no radios', () => {
    const shown = drawn(Option.some(4), { readOnly: true })
    const [image] = Inert.byRole(shown, 'img')
    expect(Inert.value(image, 'aria-label')).toBe('Your stay: 4 stars of 5')
    const [label] = Inert.byTag(image, 'span')
    expect(Inert.value(label, 'aria-hidden')).toBe('true')
    expect(Inert.byTag(shown, 'input')).toEqual([])
    const [unrated] = Inert.byRole(drawn(Option.none(), { readOnly: true }), 'img')
    expect(Inert.value(unrated, 'aria-label')).toBe('Your stay: not rated')
  })
})
