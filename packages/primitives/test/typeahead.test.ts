/**
 * Typeahead: the pure match (single, repeated, and multi-character queries,
 * wrapping, disabled skipping, case and leading space), the placed
 * transitions with the clear timer on TestClock and a stale timer ignored,
 * and the Behavior's key handling on the host.
 */
import { Effect, Fiber, Option, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import type { KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Attributes, Behaviors, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { Typeahead } from '../src/interaction/index.js'

const plain: KeyboardModifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
const texts = ['Apple', 'Apricot', 'Banana', ' avocado', 'Cherry']
const all = [0, 1, 2, 3, 4]

describe('Typeahead.match', () => {
  it.each<[string, string, number, ReadonlyArray<number>, number | undefined]>([
    ['one character starts after the current item', 'a', 0, all, 1],
    ['one character wraps', 'a', 3, all, 0],
    ['a repeated character cycles like one', 'aa', 1, all, 3],
    ['a longer query starts at the current item', 'ap', 0, all, 0],
    ['a longer query refines forward', 'apr', 0, all, 1],
    ['case is ignored', 'B', 0, all, 2],
    ['leading whitespace in the text is ignored', 'av', 0, all, 3],
    ['a disabled item is skipped', 'a', 0, [0, 2, 4], 0],
    ['nothing current starts at the first enabled item', 'c', -1, all, 4],
    ['no item matches', 'z', 0, all, undefined],
    ['an empty query matches nothing', '', 0, all, undefined],
  ])('%s', (_name, query, current, enabled, expected) => {
    expect(Typeahead.match(texts, enabled, query, current)).toBe(expected)
  })

  it('matches nothing with no enabled items', () => {
    expect(Typeahead.match(texts, [], 'a', -1)).toBeUndefined()
  })
})

const Search = Bundle.declare(Typeahead.bundle, 'search')
const Model = Schema.Struct({ ...Search.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Search.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Search, { args: { timeoutMs: 500 } })
const fresh: Model = { search: { query: '', generation: 0 } }
const send = (model: Model, message: Typeahead.Message) =>
  Option.getOrThrow(placed.update(model, Search.wrapper.make(message)))

describe('Typeahead placement', () => {
  it('extends the query per key and schedules one clear per keystroke', () => {
    const a = send(fresh, Typeahead.Message.Typed({ char: 'a' }))
    expect(a.model.search).toEqual({ query: 'a', generation: 1 })
    expect(a.commands).toHaveLength(1)
    const ab = send(a.model, Typeahead.Message.Typed({ char: 'b' }))
    expect(ab.model.search).toEqual({ query: 'ab', generation: 2 })
  })

  it('ignores a superseded clear and honors the current one', () => {
    const ab = send(
      send(fresh, Typeahead.Message.Typed({ char: 'a' })).model,
      Typeahead.Message.Typed({ char: 'b' }),
    ).model
    const stale = send(ab, Typeahead.Message.Expired({ generation: 1 })).model
    expect(stale.search.query).toBe('ab')
    const cleared = send(ab, Typeahead.Message.Expired({ generation: 2 })).model
    expect(cleared.search.query).toBe('')
    expect(send(ab, Typeahead.Message.Cleared()).model.search.query).toBe('')
  })

  it('the clear fires after the timeout on the clock', async () => {
    const effect = send(fresh, Typeahead.Message.Typed({ char: 'a' })).commands![0]!.effect
    const fact = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(effect)
        yield* Effect.yieldNow
        yield* TestClock.adjust('1 second')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(fact).toEqual(Search.wrapper.make(Typeahead.Message.Expired({ generation: 1 })))
  })

  it('rejects a non-positive or non-finite timeout at placement', () => {
    expect(() => Page.at(Search, { args: { timeoutMs: 0 } })).toThrow(/args do not match/)
  })
})

interface Fruit {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
}
const fruits: ReadonlyArray<Fruit> = [
  { id: 'apple', label: 'Apple' },
  { id: 'apricot', label: 'Apricot', disabled: true },
  { id: 'banana', label: 'Banana' },
]
const describeFruits = (items: ReadonlyArray<Fruit>) =>
  Behaviors.Collection.of(items, { id: f => f.id, disabled: f => f.disabled === true })

const ListSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container }),
  option: Slot.make({ capability: Capability.Focusable }),
})
interface ListInput extends Model {
  readonly fruits: ReadonlyArray<Fruit>
  readonly current: string | null
}
const h = SlotView.inertBuilder<Message>()
const Keys = Typeahead.behavior(Search)(ListSlots)<ListInput, Message>({
  host: 'list',
  items: input => describeFruits(input.fruits),
  text: (input, index) => input.fruits[index]?.label ?? '',
  current: input => input.current,
})
const handler = (input: ListInput) => {
  const attribute = Attributes.find(
    SlotView.buildersFor(ListSlots, [Keys.mixin], { input, h }).list.attrs(),
    'OnKeyDownFocus',
  )
  if (attribute === undefined) throw new Error('no OnKeyDownFocus on the host')
  return attribute.f
}
const typed = (char: string) => Search.wrapper.make(Typeahead.Message.Typed({ char }))

describe('Typeahead behavior', () => {
  const input: ListInput = { search: { query: '', generation: 0 }, fruits, current: 'apple' }

  it('focuses the matching item by id and records the key', () => {
    expect(Option.getOrThrow(handler(input)('b', plain))).toEqual({
      focusSelector: '[id="banana"]',
      message: typed('b'),
    })
  })

  it('extends the running query, skipping a disabled match', () => {
    // "a" then "p": Apricot is disabled, and Apple is current, so a multi-character
    // query starting at the current item lands on Apple itself.
    const refining = { ...input, search: { query: 'a', generation: 1 } }
    expect(Option.getOrThrow(handler(refining)('p', plain)).focusSelector).toBe('[id="apple"]')
  })

  it('records a key with no match without moving focus, keeping the current item', () => {
    expect(Option.getOrThrow(handler(input)('z', plain))).toEqual({
      focusSelector: '[id="apple"]',
      message: typed('z'),
    })
    expect(Option.getOrThrow(handler({ ...input, current: null })('z', plain)).focusSelector).toBe(
      ':not(*)',
    )
  })

  it('leaves non-printable keys, chords, and a leading space alone', () => {
    expect(Option.isNone(handler(input)('ArrowDown', plain))).toBe(true)
    expect(Option.isNone(handler(input)('b', { ...plain, ctrlKey: true }))).toBe(true)
    expect(Option.isNone(handler(input)(' ', plain))).toBe(true)
    const midQuery = { ...input, search: { query: 'a', generation: 1 } }
    expect(Option.isSome(handler(midQuery)(' ', plain))).toBe(true)
  })

  it('rejects a host slot the contract does not declare', () => {
    expect(() =>
      Typeahead.behavior(Search)(ListSlots)<ListInput, Message>({
        host: 'menu' as never,
        items: input => describeFruits(input.fruits),
        text: () => '',
        current: () => null,
      }),
    ).toThrow(/unknown slot/)
  })
})
