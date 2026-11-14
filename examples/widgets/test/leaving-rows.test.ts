import { Effect, Fiber } from 'effect'
import { TestClock } from 'effect/testing'
import { expect, test } from 'vitest'
import { Motion } from 'foldkit-primitives/motion'
import {
  DURATION_MS,
  Message,
  closePopup,
  initial,
  isLeaving,
  openPopup,
  update,
  type Model,
} from '../src/leaving-rows/app.js'

const model = initial.model
const ids = (current: Model) => current.tags.map(tag => tag.id)

/** What a row's exit yields once its time is up, with the clock moved past it. */
const finished = (command: { readonly effect: Effect.Effect<Message> }) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(command.effect)
      yield* Effect.yieldNow
      yield* TestClock.adjust(`${DURATION_MS + 50} millis`)
      return yield* Fiber.join(fiber)
    }).pipe(Effect.provide(TestClock.layer())),
  )

const dismiss = (current: Model, id: string) => {
  const result = update(current, Message.Dismissed({ id }))
  return { model: result.model, command: result.commands![0]! }
}

test('rows exit one at a time or together, each on its own presence', async () => {
  const design = dismiss(model, 'design')
  const release = dismiss(design.model, 'release')
  expect(release.model.exits['design']).toEqual({ phase: 'hiding', generation: 2 })
  expect(release.model.exits['release']).toEqual({ phase: 'hiding', generation: 2 })
  expect(release.model.exits['backlog']).toEqual({ phase: 'shown', generation: 1 })
  expect(ids(release.model)).toEqual(['design', 'release', 'backlog'])
  expect(isLeaving(release.model, 'design')).toBe(true)
  expect(isLeaving(release.model, 'backlog')).toBe(false)

  // The second row's exit ends first: the first stays until its own Hidden.
  const releaseGone = update(release.model, await finished(release.command)).model
  expect(ids(releaseGone)).toEqual(['design', 'backlog'])
  expect(releaseGone.exits['design']?.phase).toBe('hiding')
  expect(Object.keys(releaseGone.exits)).toEqual(['design', 'backlog'])
  const designGone = update(releaseGone, await finished(design.command)).model
  expect(ids(designGone)).toEqual(['backlog'])
})

test('Keep on one row does not touch the other, and its late Hidden drops nothing', async () => {
  const design = dismiss(model, 'design')
  const release = dismiss(design.model, 'release')
  const kept = update(release.model, Message.Kept({ id: 'design' }))
  expect(kept.model.exits['design']).toEqual({ phase: 'shown', generation: 3 })
  expect(kept.model.exits['release']).toEqual({ phase: 'hiding', generation: 2 })

  const late = update(kept.model, await finished(design.command)).model
  expect(ids(late)).toEqual(['design', 'release', 'backlog'])
  expect(late.exits['design']?.phase).toBe('shown')

  const done = update(late, await finished(release.command)).model
  expect(ids(done)).toEqual(['design', 'backlog'])
  // Dismissed again, a kept row exits on a fresh generation.
  expect(dismiss(done, 'design').model.exits['design']).toEqual({ phase: 'hiding', generation: 4 })
})

test('reduced motion completes an exit without waiting', async () => {
  const { model: hiding, command } = dismiss(model, 'design')
  const fact = await Effect.runPromise(
    command.effect.pipe(Effect.provide(Motion.reduced), Effect.timeout('30 millis')),
  )
  expect(ids(update(hiding, fact).model)).toEqual(['release', 'backlog'])
})

test('a message that changes nothing returns the model it was given', () => {
  const hiding = dismiss(model, 'design').model
  expect(update(model, Message.Typed({ value: '' })).model).toBe(model)
  expect(update(model, Message.Dismissed({ id: 'missing' })).model).toBe(model)
  expect(update(model, Message.Dismissed({ id: 'constructor' })).model).toBe(model)
  expect(update(hiding, Message.Dismissed({ id: 'design' })).model).toBe(hiding)
  expect(update(model, Message.Kept({ id: 'design' })).model).toBe(model)
  expect(update(model, Message.RemovedChild({ id: 'missing' })).model).toBe(model)
  const emptied = update(
    { ...model, tags: model.tags.map(tag => ({ ...tag, children: [] })) },
    Message.RemovedChild({ id: 'draft' }),
  ).model
  expect(emptied.tags.every(tag => tag.children.length === 0)).toBe(true)
})

test('a branch leaves by its own id, and the popup opens and shuts on its own placement', async () => {
  const withoutDraft = update(model, Message.RemovedChild({ id: 'draft' })).model
  expect(withoutDraft.tags.map(tag => tag.children.map(child => child.id))).toEqual([[], [], []])
  expect(withoutDraft.exits).toBe(model.exits)

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
