/**
 * Presence: show/hide transitions, the generation guard against a late
 * Hidden, duration validation, and placement through a real assembly. Time
 * runs on TestClock: no waiting.
 */
import { Effect, Fiber, Option, Schema } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { isVisible, Presence, PresenceMessage } from '../src/motion/index.js'

const Overlay = Bundle.declare(Presence, 'overlay')
const Model = Schema.Struct({ ...Overlay.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Overlay.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args = { durationMs: 300 }
const placed = Page.at(Overlay, { args })

const fold = (model: Model, message: Parameters<typeof Overlay.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, Overlay.wrapper.make(message))).model.overlay
const hidden: Model = { overlay: { phase: 'hidden', generation: 0 } }

describe('Presence transitions', () => {
  it('shows immediately and hides through a timed phase', async () => {
    expect(placed.init(hidden).model.overlay).toEqual({ phase: 'hidden', generation: 0 })
    const shown = fold(hidden, PresenceMessage.Show())
    expect(shown).toEqual({ phase: 'shown', generation: 1 })
    expect(isVisible(shown)).toBe(true)
    const hiding = fold({ overlay: shown }, PresenceMessage.Hide())
    expect(hiding).toEqual({ phase: 'hiding', generation: 2 })
    const step = Option.getOrThrow(
      placed.update({ overlay: shown }, Overlay.wrapper.make(PresenceMessage.Hide())),
    )
    expect(step.commands).toHaveLength(1)
    const fact = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(step.commands![0]!.effect)
        // Let the fiber reach its sleep before advancing virtual time past it.
        yield* Effect.yieldNow
        yield* TestClock.adjust('1 second')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    // The placed command lifts to the parent variant, as all placement Commands do.
    expect(fact).toEqual(Overlay.wrapper.make(PresenceMessage.Hidden({ generation: 2 })))
    expect(fold({ overlay: hiding }, PresenceMessage.Hidden({ generation: 2 }))).toEqual({
      phase: 'hidden',
      generation: 2,
    })
    expect(isVisible({ phase: 'hidden', generation: 2 })).toBe(false)
  })

  it('a Show in between wins over the late Hidden', () => {
    const hiding = fold({ overlay: { phase: 'shown', generation: 1 } }, PresenceMessage.Hide())
    expect(hiding.generation).toBe(2)
    const shown = fold({ overlay: hiding }, PresenceMessage.Show())
    expect(shown).toEqual({ phase: 'shown', generation: 3 })
    expect(fold({ overlay: shown }, PresenceMessage.Hidden({ generation: 2 }))).toEqual(shown)
  })

  it('rejects a non-positive or non-finite duration at placement', () => {
    expect(() => Page.at(Overlay, { args: { durationMs: 0 } })).toThrow(/args do not match/)
    expect(() => Page.at(Overlay, { args: { durationMs: Number.POSITIVE_INFINITY } })).toThrow(
      /args do not match/,
    )
  })
})

describe('Presence in an assembly', () => {
  it('routes its Messages', () => {
    const assembly = Page.assemble(Page.at(Overlay, { args }))
    const update = assembly.update(model => ({ model }))
    const shown = update(hidden, Overlay.wrapper.make(PresenceMessage.Show()))
    expect(shown.model.overlay.phase).toBe('shown')
  })
})
