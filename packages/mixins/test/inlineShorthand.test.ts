/**
 * An inline shorthand beside a conditional longhand of it is refused when the
 * style is defined. The renderer drops a property by clearing it, so clearing
 * `borderColor` took the color `border` had set, and a pill that had been
 * selected kept a `currentColor` border.
 */
import { describe, expect, test } from 'vitest'
import { Style, type StyleValue } from '../src/index.js'

const selected = (input: { readonly selected: boolean }) => input.selected
type Declarations = Parameters<typeof Style.inline>[0]
const inlineBeside = (always: Declarations, sometimes: Declarations) => () =>
  Style.compose(Style.inline(always), Style.whenInput(selected, Style.inline(sometimes)))

describe('an inline shorthand beside a conditional longhand', () => {
  test.each<[string, Declarations, Declarations]>([
    [
      'a longhand of an inline shorthand',
      { border: '1px solid transparent' },
      { borderColor: 'red' },
    ],
    ['a shorthand over an inline longhand', { borderColor: 'red' }, { border: '1px solid blue' }],
    ['padding and a side of it', { padding: '1rem' }, { paddingInline: '2rem' }],
    ['background and its color', { background: 'white' }, { backgroundColor: 'blue' }],
  ])('refuses %s', (_, always, sometimes) => {
    expect(inlineBeside(always, sometimes)).toThrow(/renderer clears/)
  })

  test.each<[string, Declarations, Declarations]>([
    [
      'a radius beside a border, which does not set it',
      { border: '1px solid' },
      { borderRadius: '50%' },
    ],
    [
      'an offset beside an outline, which does not set it',
      { outline: '2px solid' },
      { outlineOffset: '2px' },
    ],
    ['a corner radius beside a side', { borderTop: '1px solid' }, { borderTopLeftRadius: '4px' }],
    ['two unrelated properties', { margin: '0' }, { color: 'red' }],
  ])('allows %s', (_, always, sometimes) => {
    expect(inlineBeside(always, sometimes)).not.toThrow()
  })

  test.each<[string, () => StyleValue]>([
    [
      'as rules',
      () =>
        Style.compose(
          Style.self({ border: '1px solid transparent' }),
          Style.whenInput(selected, Style.self({ borderColor: 'red' })),
        ),
    ],
    [
      'with the longhand always set',
      () =>
        Style.compose(
          Style.inline({ border: '1px solid transparent', borderColor: 'transparent' }),
          Style.whenInput(selected, Style.inline({ color: 'red' })),
        ),
    ],
  ])('allows a state written %s', (_, make) => {
    expect(make).not.toThrow()
  })
})
