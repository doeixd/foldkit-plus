/**
 * Rule pieces inside `whenInput`: the class is static and its presence
 * follows the input; the CSS is emitted once whether or not the condition
 * holds; nested conditions compile too. And the new pieces: states,
 * responsive, vars, enter, allowDiscrete, viewTransitionName, Selector.
 */
import { describe, expect, it } from 'vitest'
import { Attributes, Selector, SlotView, Style, type SlotAttributes } from '../src/index.js'
import { FieldSlots } from './fixture.js'
import { h, type TestMessage } from './resolverFixture.js'

interface Input {
  readonly open: boolean
  readonly busy: boolean
}

const classOf = (attributes: SlotAttributes<TestMessage>): string =>
  Attributes.find(attributes, 'Class')?.value ?? ''
const styleOf = (attributes: SlotAttributes<TestMessage>): Readonly<Record<string, string>> =>
  Attributes.find(attributes, 'Style')?.value ?? {}

describe('rule pieces under whenInput', () => {
  const hover = Style.pseudo(':hover', { color: 'red' })
  const wide = Style.media('(min-width: 40rem)', { display: 'flex' })
  const Field = Style.forSlots(FieldSlots)({
    root: Style.compose(
      Style.class('field'),
      Style.whenInput<Input>(input => input.open, Style.compose(hover, Style.class('is-open'))),
      Style.whenInput<Input>(
        input => input.open,
        Style.whenInput<Input>(input => input.busy, wide),
      ),
    ),
  })
  const attrs = (input: Input) =>
    SlotView.buildersFor(FieldSlots, [Field.mixin], { input, h }).root.attrs()

  it('emits the rule CSS once, whether or not the condition holds', () => {
    expect(Field.rules.map(rule => rule.className)).toHaveLength(2)
    expect(Field.css).toContain(':hover{color:red}')
    expect(Field.css).toContain('@media (min-width: 40rem)')
    expect(Style.stylesheet(Field)).toBe(Field.css)
  })

  it('adds a rule class only while its condition holds', () => {
    const closed = classOf(attrs({ open: false, busy: false }))
    expect(closed).toBe('field')
    const open = classOf(attrs({ open: true, busy: false }))
    expect(open).toContain('is-open')
    expect(open).toMatch(/style-[a-z0-9]+/)
    expect(open.split(' ')).toHaveLength(3)
    const openBusy = classOf(attrs({ open: true, busy: true }))
    expect(openBusy.split(' ')).toHaveLength(4)
  })
})

describe('new pieces', () => {
  it('states compiles to data-state attribute rules', () => {
    const piece = Style.states({ open: { opacity: '1' }, closed: { opacity: '0' } })
    expect(piece.rules?.map(rule => rule.selector)).toEqual([
      '&[data-state="open"]',
      '&[data-state="closed"]',
    ])
    expect(Style.states({ on: { color: 'red' } }, 'data-on').rules?.[0]?.selector).toBe(
      '&[data-on="on"]',
    )
  })

  it('responsive compiles named breakpoints to media rules', () => {
    const breakpoints = { md: '(min-width: 48rem)', lg: '(min-width: 64rem)' } as const
    const piece = Style.responsive(breakpoints, { lg: { display: 'grid' } })
    expect(piece.rules).toEqual([
      { selector: '&', at: '@media (min-width: 64rem)', declarations: { display: 'grid' } },
    ])
  })

  it('vars, enter, allowDiscrete, and viewTransitionName are declarations', () => {
    expect(Style.vars({ '--gap': '1rem' }).style).toEqual({ '--gap': '1rem' })
    expect(Style.enter({ opacity: '0' }).rules).toEqual([
      { selector: '&', at: '@starting-style', declarations: { opacity: '0' } },
    ])
    expect(Style.allowDiscrete.style).toEqual({ transitionBehavior: 'allow-discrete' })
    expect(Style.viewTransitionName('hero').style).toEqual({ viewTransitionName: 'hero' })
  })

  it('an enter rule compiles to a starting-style block', () => {
    const Field = Style.forSlots(FieldSlots)({
      root: Style.compose(
        Style.inline({ transition: 'opacity 200ms' }),
        Style.enter({ opacity: '0' }),
      ),
    })
    expect(Field.css).toMatch(/@starting-style\{\.style-[a-z0-9]+\{opacity:0\}\}/)
    expect(
      styleOf(SlotView.buildersFor(FieldSlots, [Field.mixin], { input: {}, h }).root.attrs()),
    ).toEqual({
      transition: 'opacity 200ms',
    })
  })

  it('Selector builds the strings pseudo and nest take', () => {
    expect(Selector.attr('aria-disabled', 'true')).toBe('[aria-disabled="true"]')
    expect(Selector.attr('hidden')).toBe('[hidden]')
    expect(Selector.attr('title', 'a"b')).toBe('[title="a\\"b"]')
    expect(Selector.not(Selector.attr('aria-disabled', 'true'))).toBe(
      ':not([aria-disabled="true"])',
    )
    expect(Selector.is('.a', '.b')).toBe(':is(.a, .b)')
    expect(Selector.child('span')).toBe('> span')
    expect(Selector.sibling('p')).toBe('+ p')
    expect(Selector.siblings('p')).toBe('~ p')
    const piece = Style.pseudo(Selector.not(Selector.attr('aria-disabled', 'true')), {
      cursor: 'pointer',
    })
    expect(piece.rules?.[0]?.selector).toBe('&:not([aria-disabled="true"])')
  })
})
