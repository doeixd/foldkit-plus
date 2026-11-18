/**
 * The helpers every widget's `configure`, words and choice share: the merge
 * of base, preset and call; the filling of a word's blanks; the three
 * shipped choices.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { ChoiceChange } from '../src/choice.js'
import { many } from '../src/choice/many.js'
import { one } from '../src/choice/one.js'
import { text } from '../src/choice/text.js'
import { layered } from '../src/configure.js'
import { fill, wordsOf } from '../src/words.js'

interface Options {
  readonly label?: string | undefined
  readonly size?: string | undefined
  readonly preset?: string | undefined
  readonly mixins?: ReadonlyArray<string> | undefined
  readonly words?: { readonly close?: string | undefined; readonly open?: string | undefined }
}

describe('layered', () => {
  const config = {
    base: { size: 'md', label: 'Base', mixins: ['base'], words: { close: 'Close', open: 'Open' } },
    presets: {
      loud: { size: 'lg', mixins: ['loud'], words: { close: 'Shut' } },
      plain: {},
    },
  }

  it('takes the base, then the named preset, then the call, per option', () => {
    expect(layered<Options>(config, {})).toEqual({
      size: 'md',
      label: 'Base',
      mixins: ['base'],
      words: { close: 'Close', open: 'Open' },
    })
    expect(layered<Options>(config, { preset: 'loud' }).size).toBe('lg')
    expect(layered<Options>(config, { preset: 'loud', size: 'sm' }).size).toBe('sm')
    expect(layered<Options>(config, { preset: 'loud' }).label).toBe('Base')
  })

  it('concatenates mixins in that order and merges words key by key', () => {
    const drawn = layered<Options>(config, {
      preset: 'loud',
      mixins: ['call'],
      words: { open: 'Show' },
    })
    expect(drawn.mixins).toEqual(['base', 'loud', 'call'])
    expect(drawn.words).toEqual({ close: 'Shut', open: 'Show' })
  })

  it('takes `preset` off what the view is given', () => {
    expect(Object.hasOwn(layered<Options>(config, { preset: 'plain' }), 'preset')).toBe(false)
  })

  it('reads an option given as undefined as not given', () => {
    const drawn = layered<Options>(config, {
      preset: 'loud',
      size: undefined,
      words: { close: undefined },
    })
    expect(drawn.size).toBe('lg')
    expect(drawn.words).toEqual({ close: 'Shut', open: 'Open' })
  })

  it('adds no words and no mixins where none were given', () => {
    expect(Object.keys(layered<Options>({}, { label: 'Only' }))).toEqual(['label'])
  })

  it('refuses a preset that was not declared, a member of Object included', () => {
    expect(() => layered<Options>(config, { preset: 'quiet' })).toThrow(
      'no preset named "quiet"; declared: loud, plain',
    )
    expect(() => layered<Options>(config, { preset: 'constructor' })).toThrow('"constructor"')
    expect(() => layered<Options>({}, { preset: 'loud' })).toThrow('declared: none')
  })
})

describe('fill', () => {
  it('fills each blank the values name, a number included', () => {
    expect(fill('{count} of {max}', { count: 2, max: 3 })).toBe('2 of 3')
  })

  it('leaves a blank it has no value for as written', () => {
    expect(fill('Remove {name}', { tag: 'x' })).toBe('Remove {name}')
    expect(fill('{constructor}', {})).toBe('{constructor}')
  })

  it('fills once: a value holding a blank is not filled again', () => {
    expect(fill('{a} {b}', { a: '{b}', b: 'B' })).toBe('{b} B')
  })
})

describe('wordsOf', () => {
  const defaults = { clear: 'Clear', remove: 'Remove {label}' }

  it('is the defaults themselves with nothing given', () => {
    expect(wordsOf(defaults, undefined)).toBe(defaults)
  })

  it('takes each word given, and keeps the default of one given as undefined', () => {
    expect(wordsOf(defaults, { clear: 'Effacer', remove: undefined })).toEqual({
      clear: 'Effacer',
      remove: 'Remove {label}',
    })
    expect(defaults.clear).toBe('Clear')
  })
})

const cities = ['Lisbon', 'Porto', 'Faro'] as const
const selected = (value: string) => ChoiceChange.Selected({ value })

describe('one', () => {
  const City = one(cities)

  it('stores the item a reported value names, and nothing for a value that is no item', () => {
    expect(City.picked(City.empty, selected('Porto'))).toEqual(Option.some('Porto'))
    const porto = Option.some<(typeof cities)[number]>('Porto')
    expect(City.picked(porto, selected('Madrid'))).toBe(porto)
  })

  it('returns the value it was given when the change does not move it', () => {
    const porto = Option.some<(typeof cities)[number]>('Porto')
    expect(City.picked(porto, selected('Porto'))).toBe(porto)
    expect(City.picked(porto, ChoiceChange.Typed({ text: 'Lis' }))).toBe(porto)
    expect(City.picked(City.empty, ChoiceChange.ClearedSelection())).toBe(City.empty)
  })

  it('clears, marks the chosen item, and rests on its label', () => {
    const porto = City.picked(City.empty, selected('Porto'))
    expect(City.picked(porto, ChoiceChange.ClearedSelection())).toEqual(Option.none())
    expect(City.chosen(porto)).toEqual(['Porto'])
    expect(City.chosen(City.empty)).toEqual([])
    expect(City.resting(porto, item => item.toUpperCase())).toBe('PORTO')
    expect(City.resting(City.empty, item => item)).toBe('')
    expect(City.multiple).toBe(false)
  })
})

describe('many', () => {
  const Cities = many(cities)

  it('flips the item a reported value names, in the order chosen', () => {
    const two = Cities.picked(Cities.picked(Cities.empty, selected('Porto')), selected('Faro'))
    expect(two).toEqual(['Porto', 'Faro'])
    expect(Cities.picked(two, selected('Porto'))).toEqual(['Faro'])
    expect(Cities.picked(two, selected('Madrid'))).toBe(two)
    expect(Cities.picked(two, ChoiceChange.Typed({ text: 'x' }))).toBe(two)
  })

  it('clears, marks every chosen item, and rests empty', () => {
    const two = Cities.picked(Cities.picked(Cities.empty, selected('Porto')), selected('Faro'))
    expect(Cities.picked(two, ChoiceChange.ClearedSelection())).toEqual([])
    expect(Cities.picked(Cities.empty, ChoiceChange.ClearedSelection())).toBe(Cities.empty)
    expect(Cities.chosen(two)).toEqual(['Porto', 'Faro'])
    expect(Cities.resting(two, item => item)).toBe('')
    expect(Cities.multiple).toBe(true)
  })
})

describe('text', () => {
  const Suggest = text(cities)

  it('is the typed text, an item or not, and a chosen item', () => {
    expect(Suggest.picked('', ChoiceChange.Typed({ text: 'Lis' }))).toBe('Lis')
    expect(Suggest.picked('Lis', selected('Lisbon'))).toBe('Lisbon')
    expect(Suggest.picked('Lisbon', ChoiceChange.ClearedSelection())).toBe('')
  })

  it('marks the item the text is, and rests on the text', () => {
    expect(Suggest.chosen('Lisbon')).toEqual(['Lisbon'])
    expect(Suggest.chosen('Lis')).toEqual([])
    expect(Suggest.resting('Lis', item => item.toUpperCase())).toBe('Lis')
    expect(Suggest.multiple).toBe(false)
  })
})
