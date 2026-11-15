/**
 * An inline declaration sits outside every layer and beats every rule, so a
 * conditional rule (a media query, a pseudo-class, a nested selector) for the
 * same property in the same composition never applies. It shipped that way in
 * the todo app for months; composing the two now refuses.
 */
import { describe, expect, test } from 'vitest'
import { Style, type StyleValue } from '../src/index.js'

type Declarations = Parameters<typeof Style.inline>[0]

const input = (input: { readonly on: boolean }) => input.on

describe('an inline declaration beside a conditional rule for the same property', () => {
  test.each<[string, () => StyleValue]>([
    [
      'a media query',
      () =>
        Style.compose(
          Style.inline({ padding: '1.75rem' }),
          Style.media('(max-width: 30rem)', { padding: '1rem' }),
        ),
    ],
    [
      'a media query written before the inline',
      () =>
        Style.compose(
          Style.media('(max-width: 30rem)', { padding: '1rem' }),
          Style.inline({ padding: '1.75rem' }),
        ),
    ],
    [
      'a pseudo-class',
      () =>
        Style.compose(Style.inline({ color: 'red' }), Style.pseudo(':hover', { color: 'blue' })),
    ],
    [
      'a nested selector',
      () => Style.compose(Style.inline({ gap: '1rem' }), Style.nest('> li', { gap: '2rem' })),
    ],
    [
      'a state rule',
      () =>
        Style.compose(Style.inline({ opacity: '0.5' }), Style.states({ open: { opacity: '1' } })),
    ],
    [
      'a container query',
      () =>
        Style.compose(
          Style.inline({ display: 'block' }),
          Style.container('(min-width: 30rem)', { display: 'grid' }),
        ),
    ],
    [
      'a supports rule',
      () =>
        Style.compose(
          Style.inline({ display: 'block' }),
          Style.supports('(display: grid)', { display: 'grid' }),
        ),
    ],
    [
      'a responsive rule',
      () =>
        Style.compose(
          Style.inline({ display: 'block' }),
          Style.responsive({ md: '(min-width: 48rem)' }, { md: { display: 'flex' } }),
        ),
    ],
    [
      'a rule placed in an at-rule by Style.at',
      () =>
        Style.compose(
          Style.inline({ display: 'block' }),
          Style.at('@media print', Style.inline({ display: 'none' })),
        ),
    ],
    [
      'a custom property',
      () =>
        Style.compose(
          Style.inline({ '--fk-pad': '1rem' }),
          Style.media('(max-width: 30rem)', { '--fk-pad': '0.5rem' }),
        ),
    ],
    [
      'a rule chosen by the input',
      () =>
        Style.compose(
          Style.inline({ color: 'red' }),
          Style.whenInput(input, Style.self({ color: 'blue' })),
        ),
    ],
    [
      'a composition nested inside another',
      () =>
        Style.compose(Style.compose(Style.inline({ padding: '1rem' })), [
          Style.media('(max-width: 30rem)', { padding: '2rem' }),
        ]),
    ],
  ])('refuses %s', (_, make) => {
    expect(make).toThrow(/never applies/)
  })

  test('names the property, the condition and the fix', () => {
    const make = () =>
      Style.compose(
        Style.inline({ padding: '1.75rem' }),
        Style.media('(max-width: 30rem)', { padding: '1rem' }),
      )
    let caught: unknown
    try {
      make()
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({
      name: 'DiagnosticError',
      diagnostic: {
        code: 'mixins:dead-conditional-rule',
        details: { property: 'padding', condition: '@media (max-width: 30rem)' },
      },
    })
    expect((caught as Error).message).toMatch(/padding/)
    expect((caught as Error).message).toMatch(/@media \(max-width: 30rem\)/)
    expect((caught as Error).message).toMatch(/Style\.self/)
  })

  test('names a pseudo-class by its selector', () => {
    expect(() =>
      Style.compose(Style.inline({ color: 'red' }), Style.pseudo(':hover', { color: 'blue' })),
    ).toThrow(/&:hover/)
  })

  test.each<[string, Declarations, Declarations]>([
    ['an inline shorthand over a rule longhand', { padding: '1rem' }, { paddingInline: '2rem' }],
    [
      'an inline shorthand over a rule border colour',
      { border: '1px solid' },
      { borderColor: 'red' },
    ],
    ['an inline longhand under a rule shorthand', { paddingInline: '1rem' }, { padding: '2rem' }],
  ])('refuses %s', (_, always, sometimes) => {
    expect(() =>
      Style.compose(Style.inline(always), Style.media('(max-width: 30rem)', sometimes)),
    ).toThrow(/never applies/)
  })

  test.each<[string, Declarations, Declarations]>([
    ['unrelated properties', { padding: '1rem' }, { color: 'red' }],
    [
      'a radius beside a border, which does not set it',
      { border: '1px solid' },
      { borderRadius: '4px' },
    ],
  ])('allows %s', (_, always, sometimes) => {
    expect(() =>
      Style.compose(Style.inline(always), Style.media('(max-width: 30rem)', sometimes)),
    ).not.toThrow()
  })

  test('allows a rule marked !important, which beats an inline declaration', () => {
    expect(() =>
      Style.compose(
        Style.inline({ padding: '1.75rem' }),
        Style.media('(max-width: 30rem)', { padding: '1rem !important' }),
      ),
    ).not.toThrow()
  })

  test.each<[string, () => StyleValue]>([
    [
      'a base rule, which inline overrides by design',
      () => Style.compose(Style.inline({ padding: '1rem' }), Style.self({ padding: '2rem' })),
    ],
    [
      'the base in Style.self',
      () =>
        Style.compose(
          Style.self({ padding: '1.75rem' }),
          Style.media('(max-width: 30rem)', { padding: '1rem' }),
        ),
    ],
    [
      'a conditional inline over a rule, the state overriding its base',
      () =>
        Style.compose(
          Style.media('(max-width: 30rem)', { padding: '1rem' }),
          Style.whenInput(input, Style.inline({ padding: '3rem' })),
        ),
    ],
    [
      'a per-item inline, which cannot be known when defined',
      () =>
        Style.compose(
          Style.perItem(() => Style.inline({ padding: '1rem' })),
          Style.media('(max-width: 30rem)', { padding: '2rem' }),
        ),
    ],
    [
      'an inline property the conditional rule leaves alone',
      () =>
        Style.compose(
          Style.inline({ padding: '1rem' }),
          Style.media('(max-width: 30rem)', { margin: '2rem' }),
        ),
    ],
  ])('allows %s', (_, make) => {
    expect(make).not.toThrow()
  })
})
