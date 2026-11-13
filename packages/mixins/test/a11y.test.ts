import { describe, expect, it } from 'vitest'
import {
  A11y,
  Attr,
  Behavior,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  type A11yDiagnostic,
} from '../src/index.js'
import { FieldSlots } from './fixture.js'

const codes = (diagnostics: ReadonlyArray<A11yDiagnostic>): ReadonlyArray<string> =>
  diagnostics.map(diagnostic => diagnostic.code)

describe('A11y', () => {
  const FieldPattern = A11y.pattern({
    root: { capability: Capability.Container },
    input: {
      capability: Capability.TextInput,
      events: [Event.Input, Event.Focus],
      attributes: [Attr.AriaLabel],
    },
  })

  it('accepts a contract that satisfies the pattern', () => {
    expect(A11y.validate(FieldPattern, FieldSlots)).toEqual([])
  })

  it('accepts a capability satisfied through inheritance', () => {
    const pattern = A11y.pattern({ input: { capability: Capability.Interactive } })
    expect(A11y.validate(pattern, FieldSlots)).toEqual([])
  })

  it('matches a required token by name against a published string', () => {
    const pattern = A11y.pattern({ input: { events: ['input'], attributes: ['aria-label'] } })
    expect(A11y.validate(pattern, FieldSlots)).toEqual([])
  })

  it('reports a missing slot', () => {
    const pattern = A11y.pattern({ legend: { capability: Capability.Container } })
    const diagnostics = A11y.validate(pattern, FieldSlots)
    expect(codes(diagnostics)).toEqual(['a11y:missing-slot'])
    expect(diagnostics[0]).toMatchObject({ source: 'a11y', severity: 'error', slot: 'legend' })
  })

  it('does not report an optional missing slot', () => {
    const pattern = A11y.pattern({ legend: { capability: Capability.Container, optional: true } })
    expect(A11y.validate(pattern, FieldSlots)).toEqual([])
  })

  it('still checks a present optional slot', () => {
    const pattern = A11y.pattern({ root: { capability: Capability.TextInput, optional: true } })
    expect(codes(A11y.validate(pattern, FieldSlots))).toEqual(['a11y:capability-mismatch'])
  })

  it('reports a hidden slot and stops checking it', () => {
    const pattern = A11y.pattern({
      internals: { capability: Capability.TextInput, events: [Event.Click] },
    })
    expect(codes(A11y.validate(pattern, FieldSlots))).toEqual(['a11y:hidden-slot'])
  })

  it('reports a capability mismatch with both names', () => {
    const pattern = A11y.pattern({ root: { capability: Capability.TextInput } })
    const diagnostics = A11y.validate(pattern, FieldSlots)
    expect(codes(diagnostics)).toEqual(['a11y:capability-mismatch'])
    expect(diagnostics[0]?.details).toEqual({ required: 'TextInput', actual: 'Container' })
  })

  it('reports a missing event', () => {
    const pattern = A11y.pattern({ root: { events: [Event.Click] } })
    expect(codes(A11y.validate(pattern, FieldSlots))).toEqual(['a11y:missing-event'])
  })

  it('reports a missing attribute', () => {
    const pattern = A11y.pattern({ root: { attributes: [Attr.Role] } })
    expect(codes(A11y.validate(pattern, FieldSlots))).toEqual(['a11y:missing-attribute'])
  })

  it('reports every mismatch in authored order', () => {
    const pattern = A11y.pattern({
      legend: {},
      root: {
        capability: Capability.TextInput,
        events: [Event.Input],
        attributes: [Attr.Role],
      },
    })
    expect(codes(A11y.validate(pattern, FieldSlots))).toEqual([
      'a11y:missing-slot',
      'a11y:capability-mismatch',
      'a11y:missing-event',
      'a11y:missing-attribute',
    ])
  })

  it('does not treat an inherited key as a published slot', () => {
    const plain = { ...FieldSlots }
    const pattern = A11y.pattern({ toString: {} })
    expect(codes(A11y.validate(pattern, plain))).toEqual(['a11y:missing-slot'])
  })

  it('supports __proto__ as a slot name', () => {
    const contract = Slots.define({
      ['__proto__']: Slot.make({ capability: Capability.Container }),
    })
    const pattern = A11y.pattern({ ['__proto__']: { capability: Capability.Container } })
    expect(A11y.validate(pattern, contract)).toEqual([])
  })

  const Options = Slots.define({
    items: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
    item: Slot.make({
      capability: Capability.Interactive,
      attributes: [Attr.Role, Attr.AriaSelected],
    }),
  })
  const options = A11y.pattern({
    items: { capability: Capability.Container, obligations: ['navigation'] },
    item: { capability: Capability.Interactive, obligations: ['focus'] },
  })
  const navigation = Behavior.forSlots(Options)<unknown, never>(
    {
      items: Behavior.slot({ supplies: ['navigation'] }),
      item: Behavior.slot({ supplies: ['focus'] }),
    },
    { name: 'ListNavigation' },
  )

  it('does not treat a published attribute as a supplied obligation', () => {
    expect(A11y.validate(options, Options)).toEqual([])
    const reported = A11y.validate(options, Options, [])
    expect(codes(reported)).toEqual(['a11y:unsatisfied-obligation', 'a11y:unsatisfied-obligation'])
    expect(reported.map(item => `${item.slot} ${item.details?.['obligation']}`)).toEqual([
      'items navigation',
      'item focus',
    ])
  })

  it('takes navigation from the behavior that declares it, and again after that behavior is gone', () => {
    expect(codes(A11y.validate(options, Options, A11y.suppliedBy(navigation)))).toEqual([])
    const arrows = Behavior.forSlots(Options)<unknown, never>(
      { items: Behavior.slot({ supplies: ['navigation'] }) },
      { name: 'Arrows' },
    )
    const reported = A11y.validate(options, Options, A11y.suppliedBy(arrows))
    expect(reported.map(item => `${item.slot} ${item.details?.['obligation']}`)).toEqual([
      'item focus',
    ])
  })

  it('checks a support list built at runtime', () => {
    const support: ReadonlyArray<A11y.ObligationSupport> = A11y.suppliedBy(navigation).slice(0, 1)
    expect(codes(A11y.validate(options, Options, support))).toEqual(['a11y:unsatisfied-obligation'])
  })

  it('accepts a native control and a named delegate, and refuses a delegate with no name', () => {
    const box = Slots.define({
      checkbox: Slot.make({ capability: Capability.Interactive, attributes: [Attr.Role] }),
    })
    const checks = A11y.pattern({
      checkbox: { obligations: ['checked', 'activation'] },
    })
    expect(
      codes(
        A11y.validate(
          checks,
          box,
          A11y.native({
            slot: 'checkbox',
            obligations: ['checked', 'activation'],
            provider: 'input',
          }),
        ),
      ),
    ).toEqual([])
    const state = Behaviors.ToggleState.behavior(box)<{ on: boolean }, never>({
      control: 'checkbox',
      state: input => input.on,
      as: 'checked',
    })
    expect(
      codes(
        A11y.validate(checks, box, [
          ...A11y.suppliedBy(state),
          A11y.delegated({ slot: 'checkbox', obligation: 'activation', provider: 'press' }),
        ]),
      ),
    ).toEqual([])
    const pressed = Behaviors.ToggleState.behavior(box)<{ on: boolean }, never>({
      control: 'checkbox',
      state: input => input.on,
      as: 'pressed',
    })
    expect(A11y.suppliedBy(pressed)).toEqual([])
    expect(() =>
      A11y.delegated({ slot: 'checkbox', obligation: 'activation', provider: '' }),
    ).toThrow(/names its provider/)
    const forged: A11y.ObligationSupport = {
      slot: 'checkbox',
      obligation: 'activation',
      by: 'delegated',
      provider: '',
    }
    expect(codes(A11y.validate(checks, box, [forged, ...A11y.suppliedBy(state)]))).toEqual([
      'a11y:unnamed-delegation',
    ])
  })

  it('refuses an obligation the set does not name', () => {
    expect(() => A11y.pattern({ item: { obligations: ['hover' as A11y.ObligationName] } })).toThrow(
      /Unknown obligation: hover/,
    )
    expect(() =>
      Behavior.forSlots(Options)<unknown, never>(
        { items: Behavior.slot({ supplies: ['hover' as A11y.ObligationName] }) },
        { name: 'Hover' },
      ),
    ).toThrow(/Unknown obligation: hover/)
    expect(() =>
      A11y.suppliedBy({ name: 'Hover', spec: { items: { supplies: ['hover'] } } }),
    ).toThrow(/Unknown obligation: hover/)
  })

  it('skips obligations on an absent optional slot and on a hidden slot', () => {
    const absent = A11y.pattern({
      legend: { optional: true, obligations: ['navigation'] },
    })
    expect(A11y.validate(absent, FieldSlots, [])).toEqual([])
    const hidden = A11y.pattern({ internals: { obligations: ['focus'] } })
    expect(codes(A11y.validate(hidden, FieldSlots, []))).toEqual(['a11y:hidden-slot'])
  })

  it('judges a wide support list when bound runs', () => {
    const dynamic: ReadonlyArray<A11y.ObligationSupport> = []
    expect(codes(A11y.bound(options, Options, dynamic))).toEqual([
      'a11y:unsatisfied-obligation',
      'a11y:unsatisfied-obligation',
    ])
  })
})
