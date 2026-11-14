import { describe, expect, it } from 'vitest'
import {
  A11y,
  Attr,
  Behavior,
  Capability,
  Diagnostics,
  Event,
  Mixin,
  Slot,
  Slots,
  SlotView,
  type A11yDiagnostic,
} from '../src/index.js'
import {
  Clears,
  List,
  ListSlots,
  Listbox,
  Named,
  Nav,
  Picks,
  bare,
  type ListInput,
} from './a11y.fixture.js'
import { FieldSlots } from './fixture.js'
import type { TestMessage } from './resolverFixture.js'

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
})

const thrown = (run: () => unknown): Diagnostics.Diagnostic => {
  try {
    run()
  } catch (error) {
    if (error instanceof Diagnostics.DiagnosticError) return error.diagnostic
    throw error
  }
  throw new Error('expected a DiagnosticError')
}

const owing = (diagnostics: ReadonlyArray<A11yDiagnostic>) =>
  diagnostics.map(({ code, slot, details }) => ({ code, slot, details }))

describe('A11y obligations', () => {
  const complete = bare.pipe(Behavior.attach(Nav), Behavior.attach(Picks), SlotView.attach(Named))

  it('a contract that publishes what a pattern asks still owes what nothing does (A1, A2)', () => {
    expect(A11y.validate(Listbox, ListSlots)).toEqual([])
    expect(owing(A11y.check(Listbox, bare))).toEqual([
      {
        code: 'a11y:unsatisfied-obligation',
        slot: 'listbox',
        details: { obligation: 'navigation' },
      },
      { code: 'a11y:unsatisfied-obligation', slot: 'listbox', details: { obligation: 'name' } },
      {
        code: 'a11y:unsatisfied-obligation',
        slot: 'option',
        details: { obligation: 'focus-strategy' },
      },
      {
        code: 'a11y:unsatisfied-obligation',
        slot: 'option',
        details: { obligation: 'activation' },
      },
      {
        code: 'a11y:unsatisfied-obligation',
        slot: 'option',
        details: { obligation: 'state:aria-selected' },
      },
    ])
  })

  it('is met by what attached Behaviors provide and the view says of itself', () => {
    expect(A11y.check(Listbox, complete)).toEqual([])
  })

  it('compares obligations by name, so two State tokens of one attribute are one', () => {
    expect(A11y.State(Attr.AriaSelected)).not.toBe(A11y.State(Attr.AriaSelected))
    expect(A11y.check(Listbox, complete)).toEqual([])
  })

  it('reports exactly what is left when one supplier is missing', () => {
    const noNav = bare.pipe(Behavior.attach(Picks), SlotView.attach(Named))
    expect(owing(A11y.check(Listbox, noNav))).toEqual([
      {
        code: 'a11y:unsatisfied-obligation',
        slot: 'listbox',
        details: { obligation: 'navigation' },
      },
      {
        code: 'a11y:unsatisfied-obligation',
        slot: 'option',
        details: { obligation: 'focus-strategy' },
      },
    ])
  })

  it('does not count what is provided on another slot', () => {
    const elsewhere = List.behavior(
      { clear: Behavior.slot({ provides: [A11y.Navigation, A11y.FocusStrategy] }) },
      { name: 'Elsewhere' },
    )
    const view = bare.pipe(
      Behavior.attach(elsewhere),
      Behavior.attach(Picks),
      SlotView.attach(Named),
    )
    expect(owing(A11y.check(Listbox, view)).map(({ slot }) => slot)).toEqual(['listbox', 'option'])
  })

  it('owes nothing on an optional slot the contract leaves out', () => {
    const pattern = A11y.pattern({
      legend: { optional: true, obligations: [A11y.Name] },
      listbox: { obligations: [A11y.Navigation] },
    })
    expect(A11y.check(pattern, bare.pipe(Behavior.attach(Nav)))).toEqual([])
  })

  it('reports what validate reports, beside the obligations', () => {
    const pattern = A11y.pattern({ legend: { obligations: [A11y.Name] } })
    expect(codes(A11y.check(pattern, bare))).toEqual(['a11y:missing-slot'])
  })

  it('reads a Behavior composed with others', () => {
    const view = bare.pipe(
      SlotView.attach(Mixin.compose(Nav.mixin, Picks.mixin)),
      SlotView.attach(Named),
    )
    expect(A11y.check(Listbox, view)).toEqual([])
  })

  it('a native element supplies what it says', () => {
    const view = bare.pipe(
      Behavior.attach(Nav),
      SlotView.attach(
        A11y.native(
          { option: [A11y.Activation, A11y.State(Attr.AriaSelected)] },
          { element: 'option' },
        ),
      ),
      SlotView.attach(Named),
    )
    expect(A11y.check(Listbox, view)).toEqual([])
    expect(view.mixins.map(mixin => mixin.name)).toContain('A11y.native(option)')
  })

  describe('a delegation', () => {
    const OnList: Behavior.NamedBehavior<
      typeof ListSlots,
      ListInput,
      TestMessage,
      'listbox/navigation'
    > = List.behavior(
      { listbox: Behavior.slot({ provides: [A11y.Navigation] }) },
      { name: 'OnList' },
    )
    const pattern = A11y.pattern({ clear: { obligations: [A11y.Navigation] } })
    const toList = A11y.delegated({ clear: [A11y.Navigation] }, { to: 'listbox', provider: OnList })

    it('is met when its provider is attached and supplies it on the slot named', () => {
      expect(
        A11y.check(pattern, bare.pipe(Behavior.attach(OnList), SlotView.attach(toList))),
      ).toEqual([])
    })

    it('names its provider when the view does not hold it', () => {
      const [unmet, ...rest] = A11y.check(pattern, bare.pipe(SlotView.attach(toList)))
      expect(rest).toEqual([])
      expect(unmet).toMatchObject({
        code: 'a11y:delegation-unmet',
        slot: 'clear',
        details: { obligation: 'navigation', provider: 'OnList', to: 'listbox' },
      })
      expect(unmet?.message).toContain('"OnList"')
    })

    it('asks for the provider itself, not an attachment of its name', () => {
      const wrongSlot = A11y.delegated(
        { clear: [A11y.FocusStrategy] },
        { to: 'option', provider: Nav },
      )
      const focusPattern = A11y.pattern({ clear: { obligations: [A11y.FocusStrategy] } })
      const blank = List.behavior({ listbox: {} }, { name: 'Nav' })
      expect(
        codes(
          A11y.check(focusPattern, bare.pipe(Behavior.attach(blank), SlotView.attach(wrongSlot))),
        ),
      ).toEqual(['a11y:delegation-unmet'])
      expect(
        A11y.check(focusPattern, bare.pipe(Behavior.attach(Nav), SlotView.attach(wrongSlot))),
      ).toEqual([])
    })

    it('is unmet when its attached provider claims in its type what its value does not supply', () => {
      const Liar: Behavior.NamedBehavior<
        typeof ListSlots,
        ListInput,
        TestMessage,
        'listbox/navigation'
      > = List.behavior({ listbox: {} }, { name: 'Liar' })
      const toLiar = A11y.delegated({ clear: [A11y.Navigation] }, { to: 'listbox', provider: Liar })
      const [unmet] = A11y.check(pattern, bare.pipe(Behavior.attach(Liar), SlotView.attach(toLiar)))
      expect(unmet).toMatchObject({ code: 'a11y:delegation-unmet', slot: 'clear' })
      expect(unmet?.message).toContain('which does not supply it there')
    })

    it('supplies nothing once composed into another Mixin', () => {
      const view = bare.pipe(
        Behavior.attach(OnList),
        SlotView.attach(Mixin.compose<TestMessage>(toList, Clears.mixin)),
      )
      expect(codes(A11y.check(pattern, view))).toEqual(['a11y:unsatisfied-obligation'])
    })
  })

  describe('conform', () => {
    it('hands back a new view with the same attachments when it conforms', () => {
      const view = A11y.conform(Listbox)(complete)
      expect(view).not.toBe(complete)
      expect(view.mixins).toEqual(complete.mixins)
      expect(view.render).toBe(complete.render)
      expect(view.slots).toBe(complete.slots)
    })

    it('throws the first finding where the module loads, every finding in details', () => {
      const diagnostic = thrown(() =>
        // A contract whose slot names are not known is judged here, not by the type checker.
        A11y.conform(Listbox)(
          SlotView.forMessages<TestMessage>().define(
            Slots.define(
              Object.fromEntries(
                ['listbox', 'option'].map(name => [name, { capability: Capability.Focusable }]),
              ),
            ),
            (_input: unknown, slots, h) => h.ul(slots['listbox']!.attrs(), []),
          ),
        ),
      )
      expect(diagnostic).toMatchObject({
        source: 'a11y',
        code: 'a11y:unsatisfied-obligation',
        slot: 'listbox',
      })
      expect(diagnostic.message).toBe(
        'slot "listbox" owes navigation, which nothing attached supplies (and 4 more)',
      )
      expect(
        (diagnostic.details?.['diagnostics'] as ReadonlyArray<A11yDiagnostic>).map(
          ({ slot, details }) => `${slot}/${String(details?.['obligation'])}`,
        ),
      ).toEqual([
        'listbox/navigation',
        'listbox/name',
        'option/focus-strategy',
        'option/activation',
        'option/state:aria-selected',
      ])
    })

    // Made in each test, so a mutation that breaks `conform` fails the test, not the file.
    const conformedView = () => A11y.conform(Listbox)(complete.pipe(Behavior.attach(Clears)))

    it('refuses a detach that takes away what the pattern needs', () => {
      expect(thrown(() => conformedView().pipe(SlotView.detach('Nav')))).toMatchObject({
        code: 'a11y:unsatisfied-obligation',
        slot: 'listbox',
      })
    })

    it('lets a detach through that takes away nothing it needs', () => {
      expect(() => conformedView().pipe(SlotView.detach('Clears'))).not.toThrow()
    })

    it('refuses a replace whose Mixin supplies less', () => {
      expect(
        thrown(() => conformedView().pipe(SlotView.replace('Picks', Clears.mixin))),
      ).toMatchObject({
        code: 'a11y:unsatisfied-obligation',
        slot: 'option',
      })
    })

    it('still checks after another attachment and a detach that was let through', () => {
      const later = conformedView().pipe(
        Behavior.attach(List.behavior({ clear: {} }, { name: 'Later' })),
        SlotView.detach('Later'),
      )
      expect(() => later.pipe(SlotView.detach('Picks'))).toThrow(Diagnostics.DiagnosticError)
    })

    it('leaves a view never conformed free to lose anything', () => {
      expect(() => complete.pipe(SlotView.detach('Nav'))).not.toThrow()
    })
  })
})
