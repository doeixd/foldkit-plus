/**
 * `Behaviors.Keys` at definition and as a press is answered: chords refuse a
 * key no press reports, routes declaring one press are refused unless
 * `Keys.first` orders them, and a press asks the declared route that takes it
 * before any `where` route. Real presses on a page are `keys.browser.test.ts`.
 */
import { Option } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import {
  Behavior,
  Behaviors,
  Capability,
  Event,
  Slot,
  SlotView,
  Slots,
  type Diagnostic,
} from '../src/index.js'
import { DiagnosticError } from '../src/diagnostics.js'

const { Keys } = Behaviors

type Message = { readonly _tag: 'Heard'; readonly by: string }
const heard = (by: string): Message => ({ _tag: 'Heard', by })

const KeySlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput, events: [Event.KeyDown] }),
  quiet: Slot.make({ capability: Capability.TextInput }),
})
const h = SlotView.inertBuilder<Message>()
const Bound = SlotView.over(KeySlots)<{ readonly query: string }, Message>()

const diagnosticOf = (run: () => unknown): Diagnostic => {
  try {
    run()
  } catch (error) {
    if (error instanceof DiagnosticError) return error.diagnostic
    throw error
  }
  throw new Error('expected a DiagnosticError')
}

const none: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
const press = (key: string, modifiers: Partial<KeyboardModifiers> = {}) => ({
  key,
  modifiers: { ...none, ...modifiers },
  input: { query: 'q' },
})

/** A route answering with its own name, recording each time it is asked. */
const routeOf = (
  name: string,
  on: readonly [Behaviors.Keys.Gesture, ...ReadonlyArray<Behaviors.Keys.Gesture>],
  asked: Array<string> = [],
  answers = true,
) =>
  Keys.route<{ readonly query: string }, Message>(name, {
    on,
    handle: () => {
      asked.push(name)
      return answers ? Option.some(heard(name)) : Option.none()
    },
  })

const answered = (
  routes: ReadonlyArray<Behaviors.Keys.Route<{ readonly query: string }, Message>>,
  key: string,
  modifiers?: Partial<KeyboardModifiers>,
) =>
  Option.map(Keys.answer(routes)(press(key, modifiers)), given =>
    'by' in given ? given.by : given.message.by,
  ).pipe(Option.getOrNull)

describe('a chord', () => {
  it.each([
    [
      'Esc',
      '"Esc" is neither one character nor a named key of the UI Events specification; did you mean "Escape"?',
    ],
    [
      'arrowdown',
      '"arrowdown" is neither one character nor a named key of the UI Events specification; did you mean "ArrowDown"?',
    ],
    ['ab', '"ab" is neither one character nor a named key of the UI Events specification'],
    ['', '"" is neither one character nor a named key of the UI Events specification'],
    [
      'Control',
      `"Control" is a modifier: give it as the chord's option, as in Keys.chord('a', { ctrl: true })`,
    ],
  ])('refuses %j where it is written', (key, message) => {
    const diagnostic = diagnosticOf(() => Keys.chord(key))
    expect(diagnostic).toMatchObject({ code: 'mixins:unknown-key', details: { key } })
    expect(diagnostic.message).toBe(message)
  })

  it('takes one character, astral ones included, and a named key', () => {
    expect([Keys.chord('a'), Keys.chord('😀'), Keys.chord('Escape')].map(Keys.describe)).toEqual([
      'a',
      '😀',
      'Escape',
    ])
  })

  it.each([
    ['Escape', {}, 'Escape', {}, true],
    ['Escape', {}, 'Escape', { altKey: true }, false],
    ['ArrowDown', { alt: true }, 'ArrowDown', { altKey: true }, true],
    ['ArrowDown', { alt: true }, 'ArrowDown', { altKey: true, ctrlKey: true }, false],
    ['Tab', {}, 'Tab', { shiftKey: true }, false],
    ['Tab', { shift: true }, 'Tab', { shiftKey: true }, true],
    ['?', {}, '?', { shiftKey: true }, true],
    ['?', {}, '?', {}, true],
    ['a', { shift: false }, 'a', { shiftKey: true }, false],
    ['a', {}, 'a', { metaKey: true }, false],
    ['a', {}, 'A', { shiftKey: true }, false],
  ] as const)('chord(%j, %j) on %j with %j: %s', (key, modifiers, pressed, held, takes) => {
    const routes = [routeOf('R', [Keys.chord(key, modifiers)])]
    expect(answered(routes, pressed, held)).toBe(takes ? 'R' : null)
  })
})

describe('printable', () => {
  it.each([
    ['a', {}, true],
    ['A', { shiftKey: true }, true],
    ['é', {}, true],
    ['😀', {}, true],
    [' ', {}, true],
    ['a', { ctrlKey: true }, false],
    ['a', { altKey: true }, false],
    ['a', { metaKey: true }, false],
    ['Enter', {}, false],
  ] as const)('takes %j with %j: %s', (key, held, takes) => {
    expect(answered([routeOf('P', [Keys.printable])], key, held)).toBe(takes ? 'P' : null)
  })
})

describe('two routes declaring one press', () => {
  const conflict = (a: Behaviors.Keys.Gesture, b: Behaviors.Keys.Gesture) =>
    diagnosticOf(() =>
      Keys.behavior(Bound)({ slot: 'input', routes: [routeOf('A', [a]), routeOf('B', [b])] }),
    )

  it('are refused when the Behavior is defined, naming the slot and both', () => {
    const diagnostic = conflict(Keys.chord('Escape'), Keys.chord('Escape'))
    expect(diagnostic).toMatchObject({
      code: 'mixins:key-conflict',
      slot: 'input',
      details: { slot: 'input', event: 'keydown', chord: 'Escape', contributors: ['A', 'B'] },
    })
    expect(diagnostic.message).toBe(
      'two routes take "Escape" on slot "input": "A" and "B"; wrap them in Keys.first(a, b) to give one precedence',
    )
  })

  it.each([
    [
      'a shifted character and the same unstated',
      Keys.chord('?', { shift: true }),
      Keys.chord('?'),
      'Shift+?',
    ],
    ['a character and printable', Keys.chord('a'), Keys.printable, 'a'],
    ['printable and a character', Keys.printable, Keys.chord('b'), 'b'],
    ['printable twice', Keys.printable, Keys.printable, 'printable'],
    [
      'a chord with modifiers twice',
      Keys.chord('k', { ctrl: true, meta: true }),
      Keys.chord('k', { ctrl: true, meta: true }),
      'Ctrl+Meta+k',
    ],
  ])('%s overlap', (_, a, b, chord) => {
    expect(conflict(a, b)).toMatchObject({ code: 'mixins:key-conflict', details: { chord } })
  })

  it.each([
    ['a held Ctrl and printable', Keys.chord('a', { ctrl: true }), Keys.printable],
    ['a named key and printable', Keys.chord('Escape'), Keys.printable],
    ['one key under other modifiers', Keys.chord('Escape'), Keys.chord('Escape', { alt: true })],
    [
      'a character shifted and not',
      Keys.chord('a', { shift: false }),
      Keys.chord('a', { shift: true }),
    ],
    ['two predicates', Keys.where(() => true), Keys.where(() => true)],
  ])('%s do not', (_, a, b) => {
    expect(() =>
      Keys.behavior(Bound)({ slot: 'input', routes: [routeOf('A', [a]), routeOf('B', [b])] }),
    ).not.toThrow()
  })

  it('are refused by answer too, with no slot to name', () => {
    const diagnostic = diagnosticOf(() =>
      Keys.answer([routeOf('A', [Keys.chord('x')]), routeOf('B', [Keys.printable])]),
    )
    expect(diagnostic.message).toBe(
      'two routes take "x": "A" and "B"; wrap them in Keys.first(a, b) to give one precedence',
    )
    expect(diagnostic.slot).toBeUndefined()
  })
})

describe('Keys.first', () => {
  it('lets two routes declare one press, asking the first before the second', () => {
    const asked: Array<string> = []
    const ordered = Keys.first(
      routeOf('A', [Keys.chord('Escape')], asked, false),
      routeOf('B', [Keys.chord('Escape')], asked),
    )
    expect(ordered.name).toBe('A>B')
    expect(answered([ordered], 'Escape')).toBe('B')
    expect(asked).toEqual(['A', 'B'])
  })

  it('stops at the first answer', () => {
    const asked: Array<string> = []
    const ordered = Keys.first(
      routeOf('A', [Keys.chord('Escape')], asked),
      routeOf('B', [Keys.chord('Escape')], asked),
    )
    expect(answered([ordered], 'Escape')).toBe('A')
    expect(asked).toEqual(['A'])
  })

  it('asks each only for the presses it takes', () => {
    const asked: Array<string> = []
    const ordered = Keys.first(
      routeOf('A', [Keys.chord('Escape')], asked),
      routeOf('B', [Keys.chord('Enter')], asked),
    )
    expect(answered([ordered], 'Enter')).toBe('B')
    expect(asked).toEqual(['B'])
  })
})

describe('a press', () => {
  it('asks the declared route before any where route listed ahead of it', () => {
    const asked: Array<string> = []
    const routes = [
      routeOf('Anything', [Keys.where(() => true)], asked),
      routeOf('Escape', [Keys.chord('Escape')], asked),
    ]
    expect(answered(routes, 'Escape')).toBe('Escape')
    expect(asked).toEqual(['Escape'])
  })

  it('asks the where routes in list order once the declared one declines, and stops at an answer', () => {
    const asked: Array<string> = []
    const routes = [
      routeOf('Declines', [Keys.chord('Escape')], asked, false),
      routeOf('First', [Keys.where(key => key === 'Escape')], asked, false),
      routeOf('Second', [Keys.where(() => true)], asked),
      routeOf('Third', [Keys.where(() => true)], asked),
    ]
    expect(answered(routes, 'Escape')).toBe('Second')
    expect(asked).toEqual(['Declines', 'First', 'Second'])
  })

  it('does not ask a declined route again for its own where', () => {
    const asked: Array<string> = []
    const routes = [routeOf('Both', [Keys.chord('x'), Keys.where(() => true)], asked, false)]
    expect(answered(routes, 'x')).toBeNull()
    expect(asked).toEqual(['Both'])
  })

  it('asks no route that takes nothing of it', () => {
    const asked: Array<string> = []
    const routes = [
      routeOf('Escape', [Keys.chord('Escape')], asked),
      routeOf('Digits', [Keys.where(key => /^[0-9]$/.test(key))], asked),
    ]
    expect(answered(routes, 'a')).toBeNull()
    expect(asked).toEqual([])
  })

  it('hands the route its key, modifiers, input and item', () => {
    const seen: Array<unknown> = []
    const route = Keys.route<{ readonly query: string }, Message>('Sees', {
      on: [Keys.chord('Enter')],
      handle: given => {
        seen.push(given)
        return Option.none()
      },
    })
    const given = { ...press('Enter'), item: { index: 2, id: 'row-2' } }
    Keys.answer([route])(given)
    expect(seen).toEqual([given])
  })
})

describe('the Behavior', () => {
  it('requires the slot to publish keydown', () => {
    expect(diagnosticOf(() => Keys.behavior(Bound)({ slot: 'quiet', routes: [] }))).toMatchObject({
      code: 'mixins:unsupported-event',
      details: { event: 'keydown' },
    })
  })

  it('is named Keys unless named, so it can be detached', () => {
    expect(Keys.behavior(Bound)({ slot: 'input', routes: [] }).mixin.name).toBe('Keys')
    expect(Keys.behavior(Bound)({ slot: 'input', routes: [], name: 'SearchKeys' }).mixin.name).toBe(
      'SearchKeys',
    )
  })

  it('beside another keydown owner, conflicts naming both and pointing at Keys', () => {
    const view = Bound.define((input, slots, h) =>
      h.input(slots.input.attrs([h.Value(input.query)])),
    ).pipe(
      Behavior.attach(Keys.behavior(Bound)({ slot: 'input', routes: [], name: 'Mine' })),
      Behavior.attach(Keys.behavior(Bound)({ slot: 'input', routes: [], name: 'Theirs' })),
    )
    const diagnostic = diagnosticOf(() =>
      SlotView.buildersFor(view.slots, view.mixins, { input: { query: '' }, h }).input.attrs(),
    )
    expect(diagnostic).toMatchObject({
      code: 'mixins:event-conflict',
      details: { event: 'keydown', contributors: ['Mine', 'Theirs'] },
    })
    expect(diagnostic.message).toContain('fold their keys into one Behaviors.Keys.behavior')
  })

  it('is refused by a slot that protects keydown', () => {
    const Guarded = Slots.define({
      input: Slot.make({
        capability: Capability.TextInput,
        events: [Event.KeyDown],
        protected: { events: [Event.KeyDown] },
      }),
    })
    const bound = SlotView.over(Guarded)<{ readonly query: string }, Message>()
    const view = bound
      .define((input, slots, h) => h.input(slots.input.attrs([h.Value(input.query)])))
      .pipe(Behavior.attach(Keys.behavior(bound)({ slot: 'input', routes: [] })))
    expect(
      diagnosticOf(() =>
        SlotView.buildersFor(view.slots, view.mixins, { input: { query: '' }, h }).input.attrs(),
      ),
    ).toMatchObject({ code: 'mixins:protected-event', details: { event: 'keydown' } })
  })
})
