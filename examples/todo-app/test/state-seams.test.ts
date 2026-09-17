/**
 * The four write paths through one application, each asserting the seam it
 * claims: local transitions evolve the Model, the URL restores linked
 * fields, and durable facts replay through the same `update` the UI uses.
 * (Remote submodel reduction lives in kitchen-sink's `remote-seam.test.ts`,
 * the app that embeds Remote.)
 */
import { Effect, Option } from 'effect'
import { fromString } from 'foldkit/url'
import { describe, expect, it } from 'vitest'
import { initialModel, Message } from '../src/app.js'
import { update } from '../src/surface.js'

const url = (path: string) => Option.getOrThrow(fromString(path))

describe('state seams', () => {
  it('local transitions evolve the Model', () => {
    const changed = update(initialModel, Message.FilterSelected({ filter: 'active' }))
    expect(changed.model.filter).toBe('active')
    expect(changed.model.todos).toEqual([])
  })

  it('URL navigation restores only the linked fields', () => {
    const changed = update(
      initialModel,
      Message.UrlChanged({ url: url('http://localhost/todos?filter=completed') }),
    )
    expect(changed.model.filter).toBe('completed')
    // Nothing else moves: restoration writes the declared slice, not the Model.
    expect(changed.model).toEqual({ ...initialModel, filter: 'completed' })
  })

  it('durable facts replay through the same update', () => {
    const fact = Message.SubmittedTodo({ id: 'a', title: 'Milk', createdAt: 1 })
    const once = update(initialModel, fact).model
    expect(once.todos).toEqual([
      { id: 'a', title: 'Milk', completed: false, priority: 'normal', createdAt: 1 },
    ])
    // Replay is idempotent: delivering the fact twice changes nothing.
    expect(update(once, fact).model.todos).toEqual(once.todos)
  })

  it('a durable fact that touches local fields is refused at submit, not at replay', async () => {
    const { openReplica, closeStorages } = await import('./helpers.js')
    const replica = await openReplica('seams')
    try {
      // DraftChanged is local-only: the contract refuses to durably journal it.
      await expect(
        Effect.runPromise(replica.submit(Message.DraftChanged({ value: 'x' }) as never)),
      ).rejects.toThrow()
    } finally {
      await Effect.runPromise(replica.close)
      await closeStorages()
    }
  })
})
