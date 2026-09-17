/**
 * Debounce: Changed restarts the timer, only the latest value settles as an
 * OutMessage, stale timers emit nothing, and placement requires onOut. Time
 * runs on TestClock: no waiting.
 */
import { Effect, Fiber, Option, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { debounce } from '../src/time/index.js'

const SearchInput = debounce({ name: 'SearchInput', value: Schema.String })
const Search = Bundle.declare(SearchInput, 'search')
const Model = Schema.Struct({ ...Search.fields, fired: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Search.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args = { delayMs: 300 }
const onOut: (out: { readonly value: string }) => (model: Model) => { readonly model: Model } =
  out => model => ({ model: { ...model, fired: [...model.fired, out.value] } })
const placed = Page.at(Search, { args, onOut })
const fresh: Model = { search: { latest: null, generation: 0 }, fired: [] }

const settleEffect = (model: Model) =>
  Option.getOrThrow(
    placed.update(model, Search.wrapper.make(SearchInput.Message.Changed({ value: 'x' }))),
  ).commands![0]!.effect

describe('Debounce transitions', () => {
  it('restarts the timer on Changed and settles only the latest', async () => {
    expect(placed.init(fresh).model.search).toEqual({ latest: null, generation: 0 })
    const first = Option.getOrThrow(
      placed.update(fresh, Search.wrapper.make(SearchInput.Message.Changed({ value: 'a' }))),
    )
    expect(first.model.search).toEqual({ latest: 'a', generation: 1 })
    expect(first.commands).toHaveLength(1)
    const second = Option.getOrThrow(
      placed.update(first.model, Search.wrapper.make(SearchInput.Message.Changed({ value: 'b' }))),
    )
    expect(second.model.search).toEqual({ latest: 'b', generation: 2 })

    // The superseded timer's fact emits no OutMessage: fired stays empty.
    const stale = Option.getOrThrow(
      placed.update(
        second.model,
        Search.wrapper.make(SearchInput.Message.Settled({ value: 'a', generation: 1 })),
      ),
    )
    expect(stale.model).toEqual(second.model)

    // The current timer's fact surfaces the value upward.
    const settled = Option.getOrThrow(
      placed.update(
        second.model,
        Search.wrapper.make(SearchInput.Message.Settled({ value: 'b', generation: 2 })),
      ),
    )
    expect(settled.model.fired).toEqual(['b'])
  })

  it('the scheduled command yields Settled with its generation', async () => {
    const fact = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(settleEffect(fresh))
        yield* Effect.yieldNow
        yield* TestClock.adjust('1 second')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(fact).toEqual(
      Search.wrapper.make(SearchInput.Message.Settled({ value: 'x', generation: 1 })),
    )
  })

  it('rejects a non-positive delay at placement', () => {
    expect(() => Page.at(Search, { args: { delayMs: 0 }, onOut })).toThrow(/args do not match/)
  })
})

describe('Debounce in an assembly', () => {
  it('routes its Messages and carries init', () => {
    const assembly = Page.assemble(Page.at(Search, { args, onOut }))
    const update = assembly.update(model => ({ model }))
    const changed = update(fresh, Search.wrapper.make(SearchInput.Message.Changed({ value: 'a' })))
    expect(changed.model.search).toEqual({ latest: 'a', generation: 1 })
    expect(Object.keys(assembly.subscriptions())).toEqual([])
  })
})
