/**
 * LiveAnnounce: a burst reads once (the last), the read lands in the right
 * region and clears later, superseded timers change nothing, the same text
 * twice toggles a no-break space so it is read again, both timers run on
 * TestClock, `say` builds the parent Message, and `view` renders two regions.
 */
import { Effect, Fiber, Option, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { LiveAnnounce } from '../src/interaction/index.js'

const Live = Bundle.declare(LiveAnnounce.bundle, 'live')
const Model = Schema.Struct({ ...Live.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Live.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Live, { args: { debounceMs: 100, clearAfterMs: 1000 } })
const fresh: Model = { live: { polite: '', assertive: '', pending: null, generation: 0 } }
const M = LiveAnnounce.Message
const send = (model: Model, ...messages: ReadonlyArray<LiveAnnounce.Message>) => {
  let last = {
    model,
    commands: undefined as ReadonlyArray<{ readonly effect: unknown }> | undefined,
  }
  for (const message of messages) {
    const next = Option.getOrThrow(placed.update(last.model, Live.wrapper.make(message)))
    last = { model: next.model, commands: next.commands }
  }
  return last
}

describe('LiveAnnounce.reread', () => {
  it('toggles a trailing no-break space when the text repeats', () => {
    expect(LiveAnnounce.reread('', 'Saved')).toBe('Saved')
    expect(LiveAnnounce.reread('Saved', 'Saved')).toBe('Saved ')
    expect(LiveAnnounce.reread('Saved ', 'Saved')).toBe('Saved')
    expect(LiveAnnounce.reread('Saved', 'Failed')).toBe('Failed')
  })
})

describe('LiveAnnounce placement', () => {
  it('a burst reads once, the last text, into its region, and clears later', () => {
    const burst = send(
      fresh,
      M.Announced({ message: 'one', politeness: 'polite' }),
      M.Announced({ message: 'two', politeness: 'assertive' }),
    )
    expect(burst.model.live).toMatchObject({ polite: '', assertive: '', generation: 2 })
    expect(burst.model.live.pending).toEqual({ message: 'two', politeness: 'assertive' })
    const stale = send(burst.model, M.Read({ generation: 1 })).model
    expect(stale.live.assertive).toBe('')
    const read = send(burst.model, M.Read({ generation: 2 }))
    expect(read.model.live).toMatchObject({ assertive: 'two', polite: '', pending: null })
    expect(read.commands).toHaveLength(1)
    expect(send(read.model, M.Cleared({ generation: 1 })).model.live.assertive).toBe('two')
    expect(send(read.model, M.Cleared({ generation: 2 })).model.live.assertive).toBe('')
  })

  it('the same text twice is read twice', () => {
    const first = send(
      fresh,
      M.Announced({ message: 'Saved', politeness: 'polite' }),
      M.Read({ generation: 1 }),
    ).model
    const second = send(
      first,
      M.Announced({ message: 'Saved', politeness: 'polite' }),
      M.Read({ generation: 2 }),
    ).model
    expect(first.live.polite).toBe('Saved')
    expect(second.live.polite).toBe('Saved ')
  })

  it('both timers run on the clock', async () => {
    const announced = send(fresh, M.Announced({ message: 'x', politeness: 'polite' }))
    const readEffect = (announced.commands![0] as { readonly effect: Effect.Effect<Message> })
      .effect
    const fact = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(readEffect)
        yield* Effect.yieldNow
        yield* TestClock.adjust('1 second')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(fact).toEqual(Live.wrapper.make(M.Read({ generation: 1 })))
  })

  it('say builds the placement Message', () => {
    expect(LiveAnnounce.say(Live)<Message>('Done', 'assertive')).toEqual(
      Live.wrapper.make(M.Announced({ message: 'Done', politeness: 'assertive' })),
    )
    expect(LiveAnnounce.say(Live)<Message>('Done')).toEqual(
      Live.wrapper.make(M.Announced({ message: 'Done', politeness: 'polite' })),
    )
  })
})

describe('LiveAnnounce.view', () => {
  it('renders a polite and an assertive region carrying the text', () => {
    const h = SlotView.inertBuilder<Message>()
    const vnode = LiveAnnounce.view({ ...fresh.live, polite: 'hello', assertive: '' }, h) as {
      readonly children?: ReadonlyArray<{
        readonly data?: { readonly attrs?: Record<string, unknown> }
        readonly children?: ReadonlyArray<{ readonly text?: string }>
      }>
    }
    const regions = vnode.children ?? []
    expect(regions.map(r => r.data?.attrs?.['aria-live'])).toEqual(['polite', 'assertive'])
    expect(regions.map(r => r.data?.attrs?.['aria-atomic'])).toEqual(['true', 'true'])
    expect(regions[0]?.children?.[0]?.text).toBe('hello')
  })
})
