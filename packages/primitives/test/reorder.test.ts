/**
 * Reorder: the draft's transitions and the facts they report, the places a
 * held item can go in a list and a tree, a flat list's move, the tree's
 * descendant guard, the key route's answers (RTL included) and the words an
 * announcement reads.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { KeyboardModifiers } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Behaviors } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { ListNavigation, Reorder } from '../src/interaction/index.js'

const { Keys } = Behaviors
const { Message, OutMessage } = Reorder
type Model = Reorder.Model

const plain: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
const idle: Model = { held: Option.none(), over: Option.none() }
const step = (model: Model, message: Reorder.Message) =>
  Reorder.bundle.update(model, message, undefined)
const before = (id: string): Reorder.Place => ({ id, zone: 'before' })
const after = (id: string): Reorder.Place => ({ id, zone: 'after' })
const inside = (id: string): Reorder.Place => ({ id, zone: 'inside' })
const heldBy = (
  id: string,
  by: Reorder.By,
  over: Option.Option<Reorder.Place> = Option.none(),
): Model => ({
  held: Option.some({ id, by }),
  over,
})

describe('Reorder transitions', () => {
  it('picks up, walks, and drops where the item is over, reporting each', () => {
    const grabbed = step(
      idle,
      Message.Grabbed({ id: 'b', by: 'keys', at: Option.some(before('c')) }),
    )
    expect(grabbed.model).toEqual(heldBy('b', 'keys', Option.some(before('c'))))
    expect(grabbed.outMessage).toEqual(OutMessage.PickedUp({ id: 'b', by: 'keys' }))
    const places = [before('a'), before('c'), before('d'), after('d')]
    const down = step(grabbed.model, Message.Stepped({ step: 'next', places }))
    expect(down.model.over).toEqual(Option.some(before('d')))
    expect(down.outMessage).toEqual(
      OutMessage.PassedOver({ id: 'b', by: 'keys', over: Option.some(before('d')) }),
    )
    const dropped = step(down.model, Message.Dropped())
    expect(dropped.model).toEqual(idle)
    expect(dropped.outMessage).toEqual(OutMessage.Moved({ id: 'b', by: 'keys', to: before('d') }))
  })

  it('takes each step from the Model, so two presses inside one frame move two places', () => {
    const places = [before('a'), before('c'), before('d'), after('d')]
    const start = heldBy('b', 'keys', Option.some(before('c')))
    const once = step(start, Message.Stepped({ step: 'next', places })).model
    const twice = step(once, Message.Stepped({ step: 'next', places })).model
    expect(twice.over).toEqual(Option.some(after('d')))
  })

  it('stops at either end, and Home and End go to the first and last place', () => {
    const places = [before('a'), before('c'), after('c')]
    const atEnd = heldBy('b', 'keys', Option.some(after('c')))
    const stuck = step(atEnd, Message.Stepped({ step: 'next', places }))
    expect(stuck.model).toBe(atEnd)
    expect(stuck.outMessage).toBeUndefined()
    expect(step(atEnd, Message.Stepped({ step: 'first', places })).model.over).toEqual(
      Option.some(before('a')),
    )
    const atStart = heldBy('b', 'keys', Option.some(before('a')))
    expect(step(atStart, Message.Stepped({ step: 'previous', places })).model).toBe(atStart)
    expect(step(atStart, Message.Stepped({ step: 'last', places })).model.over).toEqual(
      Option.some(after('c')),
    )
  })

  it('walks from the first place forward and from the last back when over none', () => {
    const places = [before('a'), after('a')]
    expect(step(heldBy('b', 'keys'), Message.Stepped({ step: 'next', places })).model.over).toEqual(
      Option.some(before('a')),
    )
    expect(
      step(heldBy('b', 'keys'), Message.Stepped({ step: 'previous', places })).model.over,
    ).toEqual(Option.some(after('a')))
  })

  it('puts back on Escape and on a drop over no place, and moves nothing', () => {
    const held = heldBy('b', 'keys', Option.some(before('c')))
    const cancelled = step(held, Message.Cancelled())
    expect(cancelled.model).toEqual(idle)
    expect(cancelled.outMessage).toEqual(OutMessage.PutBack({ id: 'b', by: 'keys' }))
    const nowhere = step(heldBy('b', 'keys'), Message.Dropped())
    expect(nowhere.outMessage).toEqual(OutMessage.PutBack({ id: 'b', by: 'keys' }))
  })

  it('drops a pointer drag where it is let go, not where it was last seen', () => {
    const held = heldBy('b', 'pointer', Option.some(before('c')))
    const released = step(held, Message.Released({ over: Option.some(after('d')) }))
    expect(released.outMessage).toEqual(
      OutMessage.Moved({ id: 'b', by: 'pointer', to: after('d') }),
    )
    const over = step(held, Message.Released({ over: Option.none() }))
    expect(over.outMessage).toEqual(OutMessage.PutBack({ id: 'b', by: 'pointer' }))
  })

  it('puts back a key grab when focus leaves the held item, and nothing else', () => {
    const keys = heldBy('b', 'keys')
    expect(step(keys, Message.Left({ id: 'b' })).outMessage).toEqual(
      OutMessage.PutBack({ id: 'b', by: 'keys' }),
    )
    expect(step(keys, Message.Left({ id: 'a' })).model).toBe(keys)
    const pointer = heldBy('b', 'pointer')
    expect(step(pointer, Message.Left({ id: 'b' })).model).toBe(pointer)
  })

  it('returns the Model it was given when nothing changes, and reports nothing', () => {
    const cases: ReadonlyArray<[Model, Reorder.Message]> = [
      [idle, Message.Dropped()],
      [idle, Message.Cancelled()],
      [idle, Message.Released({ over: Option.some(before('a')) })],
      [idle, Message.PointedAt({ over: Option.some(before('a')) })],
      [idle, Message.Stepped({ step: 'next', places: [before('a')] })],
      [heldBy('b', 'keys'), Message.Stepped({ step: 'next', places: [] })],
      [
        heldBy('b', 'pointer', Option.some(before('a'))),
        Message.PointedAt({ over: Option.some(before('a')) }),
      ],
      [heldBy('b', 'pointer'), Message.Grabbed({ id: 'b', by: 'pointer', at: Option.none() })],
    ]
    for (const [model, message] of cases) {
      const result = step(model, message)
      expect(result.model).toBe(model)
      expect(result.outMessage).toBeUndefined()
    }
  })

  it('reports a pointer moving off every place as over none', () => {
    const held = heldBy('b', 'pointer', Option.some(before('a')))
    const off = step(held, Message.PointedAt({ over: Option.none() }))
    expect(off.model.over).toEqual(Option.none())
    expect(off.outMessage).toEqual(
      OutMessage.PassedOver({ id: 'b', by: 'pointer', over: Option.none() }),
    )
  })

  it('cancels through the helper a parent calls, and the placement hears it put back', () => {
    const Rows = Bundle.declare(Reorder.bundle, 'rows')
    const Page = Bundle.parent({
      Model: Schema.Struct({ ...Rows.fields, heard: Schema.Array(Schema.String) }),
      Message: defineMessageUnion({ ...Rows.cases }),
    })
    const placed = Page.at(Rows, {
      onOut: (fact: Reorder.OutMessage) => model => ({
        model: { ...model, heard: [...model.heard, fact._tag] },
      }),
    })
    const result = placed.helpers.cancel()({ rows: heldBy('b', 'keys'), heard: [] })
    expect(result.model).toEqual({ rows: idle, heard: ['PutBack'] })
  })
})

describe('Reorder.places', () => {
  it('offers the gaps around the other rows of a list, starting where the item is', () => {
    expect(Reorder.places({ items: ['a', 'b', 'c', 'd'], held: 'b' })).toEqual({
      places: [before('a'), before('c'), before('d'), after('d')],
      origin: Option.some(before('c')),
    })
    expect(Reorder.places({ items: ['a', 'b', 'c'], held: 'c' }).origin).toEqual(
      Option.some(after('b')),
    )
    expect(Reorder.places({ items: ['a'], held: 'a' })).toEqual({
      places: [],
      origin: Option.none(),
    })
  })

  // docs ─ intro, guide ─ step ; notes
  const parents: Readonly<Record<string, string>> = {
    intro: 'docs',
    guide: 'docs',
    step: 'guide',
  }
  const parent = (id: string) =>
    Option.fromNullishOr(Object.hasOwn(parents, id) ? parents[id] : undefined)
  const tree = ['docs', 'intro', 'guide', 'step', 'notes']
  const folders = new Set(['docs', 'guide', 'notes', 'step'])

  it('walks a tree, inside a folder that shows nothing of its own and after each level that ends', () => {
    expect(
      Reorder.places({ items: tree, held: 'intro', parent, accepts: id => folders.has(id) }),
    ).toEqual({
      places: [
        before('docs'),
        before('guide'),
        before('step'),
        inside('step'),
        after('step'),
        after('guide'),
        before('notes'),
        inside('notes'),
        after('notes'),
      ],
      origin: Option.some(before('guide')),
    })
  })

  it('leaves the held row and its own rows out, and starts inside its parent when it was the only child', () => {
    const { places, origin } = Reorder.places({
      items: tree,
      held: 'guide',
      parent,
      accepts: id => folders.has(id),
    })
    expect(places.map(place => place.id)).not.toContain('step')
    expect(places).toEqual([
      before('docs'),
      before('intro'),
      after('intro'),
      before('notes'),
      inside('notes'),
      after('notes'),
    ])
    expect(origin).toEqual(Option.some(after('intro')))
    expect(
      Reorder.places({ items: tree, held: 'step', parent, accepts: id => folders.has(id) }).origin,
    ).toEqual(Option.some(inside('guide')))
  })
})

describe('Reorder.apply', () => {
  const ids = ['a', 'b', 'c', 'd']
  it.each([
    ['before a later row', { id: 'a', to: before('c') }, ['b', 'a', 'c', 'd']],
    ['after a later row', { id: 'a', to: after('c') }, ['b', 'c', 'a', 'd']],
    ['before an earlier row', { id: 'd', to: before('b') }, ['a', 'd', 'b', 'c']],
    ['after the last row', { id: 'b', to: after('d') }, ['a', 'c', 'd', 'b']],
    ['inside a later row, as its slot', { id: 'a', to: inside('c') }, ['b', 'c', 'a', 'd']],
    ['inside an earlier row, as its slot', { id: 'd', to: inside('b') }, ['a', 'd', 'b', 'c']],
  ] as const)('moves %s', (_, moved, expected) => {
    expect(Reorder.apply(ids, moved)).toEqual(expected)
  })
  it('returns the list it was given when nothing moves', () => {
    expect(Reorder.apply(ids, { id: 'b', to: before('c') })).toBe(ids)
    expect(Reorder.apply(ids, { id: 'b', to: after('b') })).toBe(ids)
    expect(Reorder.apply(ids, { id: 'x', to: before('c') })).toBe(ids)
    expect(Reorder.apply(ids, { id: 'b', to: before('x') })).toBe(ids)
  })
})

describe('Reorder.movesIntoItself', () => {
  const parents = new Map([
    ['child', 'node'],
    ['grandchild', 'child'],
  ])
  const parent = (id: string) => Option.fromNullishOr(parents.get(id))
  it('refuses a place on the item or below it, and allows the rest', () => {
    expect(Reorder.movesIntoItself({ id: 'node', to: inside('grandchild'), parent })).toBe(true)
    expect(Reorder.movesIntoItself({ id: 'node', to: before('child'), parent })).toBe(true)
    expect(Reorder.movesIntoItself({ id: 'node', to: after('node'), parent })).toBe(true)
    expect(Reorder.movesIntoItself({ id: 'child', to: before('node'), parent })).toBe(false)
    expect(Reorder.movesIntoItself({ id: 'grandchild', to: inside('node'), parent })).toBe(false)
  })
  it('ends on a cycle in the parents it is given', () => {
    const cyclic = (id: string) => Option.some(id === 'a' ? 'b' : 'a')
    expect(Reorder.movesIntoItself({ id: 'x', to: before('a'), parent: cyclic })).toBe(false)
  })
})

describe('Reorder.keys', () => {
  const Rows = Bundle.declare(Reorder.bundle, 'rows')
  interface Input {
    readonly rows: Model
    readonly ids: ReadonlyArray<string>
    readonly focused: string
    readonly dir: 'ltr' | 'rtl'
  }
  const route = (orientation?: 'vertical' | 'horizontal') =>
    Reorder.keys(Rows)<Input, unknown>({
      items: input => input.ids,
      current: input => Option.some(input.focused),
      direction: input => input.dir,
      ...(orientation === undefined ? {} : { orientation }),
    })
  const ask = (input: Input, key: string, orientation?: 'vertical' | 'horizontal') =>
    Keys.answer([route(orientation)])({ key, modifiers: plain, input })
  const base: Input = { rows: idle, ids: ['a', 'b', 'c'], focused: 'b', dir: 'ltr' }
  const wrapped = (message: Reorder.Message) => Option.some(Rows.wrapper.make(message))

  it('picks up the current item on Space or Enter, at the place it holds', () => {
    const grab = wrapped(Message.Grabbed({ id: 'b', by: 'keys', at: Option.some(before('c')) }))
    expect(ask(base, ' ')).toEqual(grab)
    expect(ask(base, 'Enter')).toEqual(grab)
  })

  it('leaves the arrows, Home, End and Escape alone until something is held', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape']) {
      expect(ask(base, key)).toEqual(Option.none())
    }
  })

  it('walks, drops and cancels while an item is held', () => {
    const held: Input = { ...base, rows: heldBy('b', 'keys', Option.some(before('c'))) }
    const places = [before('a'), before('c'), after('c')]
    expect(ask(held, 'ArrowDown')).toEqual(wrapped(Message.Stepped({ step: 'next', places })))
    expect(ask(held, 'ArrowUp')).toEqual(wrapped(Message.Stepped({ step: 'previous', places })))
    expect(ask(held, 'Home')).toEqual(wrapped(Message.Stepped({ step: 'first', places })))
    expect(ask(held, 'End')).toEqual(wrapped(Message.Stepped({ step: 'last', places })))
    expect(ask(held, ' ')).toEqual(wrapped(Message.Dropped()))
    expect(ask(held, 'Enter')).toEqual(wrapped(Message.Dropped()))
    expect(ask(held, 'Escape')).toEqual(wrapped(Message.Cancelled()))
    expect(ask(held, 'ArrowRight')).toEqual(Option.none())
  })

  it('swaps Left and Right under RTL in a horizontal list', () => {
    const held: Input = { ...base, rows: heldBy('b', 'keys', Option.some(before('c'))) }
    const places = [before('a'), before('c'), after('c')]
    const next = wrapped(Message.Stepped({ step: 'next', places }))
    const previous = wrapped(Message.Stepped({ step: 'previous', places }))
    expect(ask(held, 'ArrowRight', 'horizontal')).toEqual(next)
    expect(ask(held, 'ArrowLeft', 'horizontal')).toEqual(previous)
    expect(ask({ ...held, dir: 'rtl' }, 'ArrowLeft', 'horizontal')).toEqual(next)
    expect(ask({ ...held, dir: 'rtl' }, 'ArrowRight', 'horizontal')).toEqual(previous)
    expect(ask(held, 'ArrowDown', 'horizontal')).toEqual(Option.none())
  })

  it('takes every arrow in both directions', () => {
    expect(Reorder.stepOf('ArrowDown', 'both', 'ltr')).toEqual(Option.some('next'))
    expect(Reorder.stepOf('ArrowLeft', 'both', 'ltr')).toEqual(Option.some('previous'))
    expect(Reorder.stepOf('ArrowLeft', 'both', 'rtl')).toEqual(Option.some('next'))
  })

  it('shares the arrows with ListNavigation only through Keys.first, which asks it first', () => {
    const Nav = Bundle.declare(ListNavigation.bundle, 'nav')
    type Both = Input & { readonly nav: ListNavigation.Model }
    const navArgs = {
      orientation: 'vertical',
      loop: false,
      virtual: false,
      timeoutMs: 500,
      page: 3,
    } as const
    const navigation = ListNavigation.keys(
      Nav,
      navArgs,
    )<Both, unknown>({
      items: input => Behaviors.Collection.of(input.ids, { id: id => id }),
      text: (input, index) => input.ids[index] ?? '',
    })
    const reorder = Reorder.keys(Rows)<Both, unknown>({
      items: input => input.ids,
      current: input => Option.fromNullishOr(input.nav.current),
    })
    expect(() => Keys.answer([reorder, navigation])).toThrow(/Keys\.first/)
    const routes = Keys.answer([Keys.first(reorder, navigation)])
    const free: Both = { ...base, nav: { current: 'b', query: '', generation: 0 } }
    // Nothing held: the arrow is navigation's.
    expect(routes({ key: 'ArrowDown', modifiers: plain, input: free })).toEqual(
      Option.some(Keys.focus('c', Nav.wrapper.make(ListNavigation.Message.Focused({ id: 'c' })))),
    )
    const held: Both = { ...free, rows: heldBy('b', 'keys', Option.some(before('c'))) }
    expect(routes({ key: 'ArrowDown', modifiers: plain, input: held })).toEqual(
      wrapped(Message.Stepped({ step: 'next', places: [before('a'), before('c'), after('c')] })),
    )
  })
})

describe('Reorder.announcement', () => {
  const label = (id: string) => id.toUpperCase()
  it.each([
    [OutMessage.PickedUp({ id: 'b', by: 'pointer' }), 'Picked up B.'],
    [
      OutMessage.PassedOver({ id: 'b', by: 'keys', over: Option.some(before('c')) }),
      'B: before C.',
    ],
    [
      OutMessage.PassedOver({ id: 'b', by: 'keys', over: Option.some(inside('c')) }),
      'B: inside C.',
    ],
    [OutMessage.PassedOver({ id: 'b', by: 'keys', over: Option.some(after('c')) }), 'B: after C.'],
    [OutMessage.PassedOver({ id: 'b', by: 'pointer', over: Option.none() }), 'B: over no place.'],
    [OutMessage.Moved({ id: 'b', by: 'keys', to: before('c') }), 'Dropped B before C.'],
    [OutMessage.Moved({ id: 'b', by: 'keys', to: inside('c') }), 'Dropped B inside C.'],
    [OutMessage.Moved({ id: 'b', by: 'keys', to: after('c') }), 'Dropped B after C.'],
    [OutMessage.PutBack({ id: 'b', by: 'keys' }), 'B put back where it was.'],
  ])('reads %o as %s', (fact, text) => {
    expect(Reorder.announcement(fact, { label })).toBe(text)
  })
  it('tells a key grab how to go on, and takes words of the caller', () => {
    expect(Reorder.announcement(OutMessage.PickedUp({ id: 'b', by: 'keys' }), { label })).toMatch(
      /^Picked up B\. Use the arrow keys/,
    )
    expect(
      Reorder.announcement(OutMessage.PutBack({ id: 'b', by: 'keys' }), {
        label,
        words: { putBack: '{item} est revenu.' },
      }),
    ).toBe('B est revenu.')
  })
})
