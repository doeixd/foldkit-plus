import { Effect, Fiber, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { expect, test } from 'vitest'
import { Motion } from 'foldkit-primitives/motion'
import {
  Message,
  DURATION_MS,
  closePopup,
  initial,
  openPopup,
  update,
  type Model,
} from '../src/ui-sdk-leaving.js'

const model = initial.model

const run = (effect: Effect.Effect<Message, unknown, never> | Effect.Effect<Message>) =>
  Effect.runPromise(effect)

const hide = async (current: Model) => {
  const dismissed = update(current, Message.Dismissed({ id: 'design' }))
  const hiding = update(dismissed.model, await run(dismissed.commands![0]!.effect))
  return hiding
}

test('a dismissed row stays until its own Hidden, and a Show in between keeps it', async () => {
  const hiding = await hide(model)
  expect(hiding.model.tags.map(tag => tag.id)).toEqual(['design', 'release', 'backlog'])
  expect(hiding.model.rowExit).toEqual({ phase: 'hiding', generation: 2 })
  expect(hiding.model.closing).toEqual(Option.some('design'))

  const fact = await Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(hiding.commands![0]!.effect)
      yield* Effect.yieldNow
      yield* TestClock.adjust(`${DURATION_MS + 50} millis`)
      return yield* Fiber.join(fiber)
    }).pipe(Effect.provide(TestClock.layer())),
  )
  const gone = update(hiding.model, fact)
  expect(gone.model.tags.map(tag => tag.id)).toEqual(['release', 'backlog'])
  expect(gone.model.closing).toEqual(Option.none())

  const again = await hide(model)
  const kept = update(again.model, Message.Kept())
  const shown = update(kept.model, await run(kept.commands![0]!.effect))
  expect(shown.model.rowExit.phase).toBe('shown')
  expect(Option.isNone(shown.model.closing)).toBe(true)
  expect(shown.model.tags.map(tag => tag.id)).toContain('design')
  expect(update(shown.model, Message.Dismissed({ id: 'release' })).model.closing).toEqual(
    Option.some('release'),
  )
  // Shown again, with the exit's id still recorded: the late Hidden must not drop it.
  const reopened = {
    ...again.model,
    rowExit: { phase: 'shown' as const, generation: 3 },
  }
  const stale = update(reopened, fact)
  expect(stale.model.rowExit.phase).toBe('shown')
  expect(stale.model.tags.map(tag => tag.id)).toContain('design')
})

test('a finished exit can hide the next row', async () => {
  const hiding = await hide(model)
  const fact = await Effect.runPromise(
    hiding.commands![0]!.effect.pipe(Effect.provide(Motion.reduced), Effect.timeout('30 millis')),
  )
  const gone = update(hiding.model, fact)
  expect(gone.model.rowExit.phase).toBe('hidden')
  const next = update(gone.model, Message.Dismissed({ id: 'release' }))
  expect(next.model.closing).toEqual(Option.some('release'))
  const armed = update(next.model, await run(next.commands![0]!.effect))
  expect(armed.model.rowExit.phase).toBe('shown')
  const leaving = update(armed.model, await run(armed.commands![0]!.effect))
  expect(leaving.model.rowExit).toEqual({
    phase: 'hiding',
    generation: gone.model.rowExit.generation + 2,
  })
  expect(leaving.model.tags.map(tag => tag.id)).toContain('release')
})

test('reduced motion completes the exit without waiting', async () => {
  const hiding = await hide(model)
  const fact = await Effect.runPromise(
    hiding.commands![0]!.effect.pipe(Effect.provide(Motion.reduced), Effect.timeout('30 millis')),
  )
  const gone = update(hiding.model, fact)
  expect(gone.model.tags.map(tag => tag.id)).toEqual(['release', 'backlog'])
})

test('a message that changes nothing returns the model it was given', () => {
  expect(update(model, Message.Typed({ value: '' })).model).toBe(model)
  expect(update(model, Message.Dismissed({ id: 'missing' })).model).toBe(model)
  expect(update(model, Message.Kept()).model).toBe(model)
  expect(update(model, Message.RemovedChild({ id: 'missing' })).model).toBe(model)
  const emptied = update(
    { ...model, tags: model.tags.map(tag => ({ ...tag, children: [] })) },
    Message.RemovedChild({ id: 'draft' }),
  ).model
  expect(emptied).not.toBe(model)
  const noChild = { ...model, tags: [] }
  expect(update(noChild, Message.RemovedChild({ id: 'draft' })).model).toBe(noChild)
})

test('a branch leaves by its own id, and the popup opens and shuts on its own placement', async () => {
  const withoutDraft = update(model, Message.RemovedChild({ id: 'draft' })).model
  expect(withoutDraft.tags.map(tag => tag.children.map(child => child.id))).toEqual([[], [], []])
  expect(withoutDraft.rowExit).toBe(model.rowExit)

  const opened = update(model, openPopup).model
  expect(opened.popup).toEqual({ phase: 'shown', generation: 1 })
  expect(opened.tags).toBe(model.tags)
  const closing = update(opened, closePopup)
  expect(closing.model.popup.phase).toBe('hiding')
  const hidden = await Effect.runPromise(
    closing.commands![0]!.effect.pipe(Effect.provide(Motion.reduced), Effect.timeout('30 millis')),
  )
  expect(update(closing.model, hidden).model.popup.phase).toBe('hidden')
})
