// @vitest-environment jsdom
/**
 * `Presence.behavior` draws the phase a placed `Presence` holds: the attributes
 * a server render carries, the generation that keeps a late `Hidden` from
 * removing a row shown again, and the exit that is immediate under reduced
 * motion.
 */
import { Effect, Fiber, Layer, Option, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Behavior, Capability, Slot, SlotView, Slots } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { Presence } from '../src/interaction/index.js'
import { Motion, PresenceMessage } from '../src/motion/index.js'

const RowSlots = Slots.define({
  list: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Focusable }),
})
interface Input {
  readonly rows: ReadonlyArray<{ readonly id: string; readonly phase: Presence.Phase }>
}
const Rows = SlotView.over(RowSlots)<Input, never>()
const Leaves = Presence.behavior(Rows)({
  content: 'row',
  phase: (input, item) => input.rows.find(row => row.id === item?.id)?.phase ?? 'hidden',
})
const rows = Rows.define((input, slots, h) =>
  h.ul(
    slots.list.attrs([]),
    input.rows.map(row =>
      h.li(slots.row.attrs([h.Key(row.id), h.Id(`row-${row.id}`)], { index: 0, id: row.id }), [
        row.id,
      ]),
    ),
  ),
).pipe(Behavior.attach(Leaves))

const served = async (input: Input) => {
  const html = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: input }),
        view: (model: Input, h: HtmlBuilder<never>) => ({ title: 'Rows', body: rows(model, h) }),
      },
      { buildId: 'b' },
    ),
  )
  return new DOMParser().parseFromString(
    injectIntoTemplate(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      html,
    ),
    'text/html',
  )
}

describe('server markup', () => {
  it('draws a shown row without inert and a hiding row with it, read back from the parse', async () => {
    const page = await served({
      rows: [
        { id: 'a', phase: 'shown' },
        { id: 'b', phase: 'hiding' },
      ],
    })
    const a = page.getElementById('row-a')!
    const b = page.getElementById('row-b')!
    expect(a.getAttribute('data-presence')).toBe('shown')
    expect(a.hasAttribute('inert')).toBe(false)
    expect(b.getAttribute('data-presence')).toBe('hiding')
    expect(b.hasAttribute('inert')).toBe(true)
    // Not aria-hidden: that would leave focus inside the exiting row.
    expect(b.hasAttribute('aria-hidden')).toBe(false)
  })
})

const Overlay = Bundle.declare(Presence.bundle, 'overlay')
const Model = Schema.Struct({ ...Overlay.fields })
const Message = defineMessageUnion({ ...Overlay.cases })
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Overlay, { args: { durationMs: 300 } })
type Page = typeof Model.Type

const send = (model: Page, message: PresenceMessage) =>
  Option.getOrThrow(placed.update(model, Overlay.wrapper.make(message)))
const exit = (step: ReturnType<typeof send>) =>
  step.commands![0]!.effect as Effect.Effect<typeof Message.Type>

const run = <A>(effect: Effect.Effect<A>, motion: typeof Motion.reduced) =>
  Effect.runPromise(effect.pipe(Effect.provide(Layer.mergeAll(TestClock.layer(), motion))))

describe('the generation', () => {
  it('a Hidden scheduled before a Show is refused, so the row stays', async () => {
    const hiding = send({ overlay: { phase: 'shown', generation: 1 } }, PresenceMessage.Hide())
    const back = send(hiding.model, PresenceMessage.Show())
    expect(back.model.overlay).toEqual({ phase: 'shown', generation: 3 })

    const late = await run(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(exit(hiding))
        yield* Effect.yieldNow
        yield* TestClock.adjust('300 millis')
        return yield* Fiber.join(fiber)
      }),
      Motion.full,
    )
    expect(late).toEqual(Overlay.wrapper.make(PresenceMessage.Hidden({ generation: 2 })))
    const after = Option.getOrThrow(placed.update(back.model, late))
    expect(after.model).toBe(back.model)
  })

  it('the Hidden of the latest Hide removes it', async () => {
    const hiding = send({ overlay: { phase: 'shown', generation: 1 } }, PresenceMessage.Hide())
    const done = send(hiding.model, PresenceMessage.Hidden({ generation: 2 }))
    expect(done.model.overlay.phase).toBe('hidden')
  })

  it('under reduced motion the exit yields Hidden at once, with no clock moved', async () => {
    const hiding = send({ overlay: { phase: 'shown', generation: 1 } }, PresenceMessage.Hide())
    const hidden = await run(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(exit(hiding))
        yield* Effect.yieldNow
        return yield* Fiber.join(fiber)
      }),
      Motion.reduced,
    )
    expect(hidden).toEqual(Overlay.wrapper.make(PresenceMessage.Hidden({ generation: 2 })))
  })
})
