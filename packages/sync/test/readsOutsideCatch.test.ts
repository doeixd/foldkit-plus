// @vitest-environment jsdom
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Closure, MessageSet, Projection, Surface } from 'foldkit-surface'
import { Transition } from 'metakit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { documentId, forApplication, mount, replicaId } from '../src/index.js'
import { SyncDeclared } from '../src/metakit.js'
import { memoryStorage } from './memoryStorage.js'

const ModelSchema = Schema.Struct({
  count: Schema.Int,
  localFlag: Schema.Boolean,
})
type Model = typeof ModelSchema.Type

const Message = defineMessageUnion({
  UndeclaredBoom: {},
  DeclaredBump: {},
})
type Message = typeof Message.Type

describe('Sync.mount readsOutside throw handling (Bout 2.3)', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refuses with explicit error when Closure.reads throws for an undeclared durable Message, and never calls it for declared ones', async () => {
    const initial: Model = { count: 0, localFlag: false }
    const app = Surface.application({
      Model: ModelSchema,
      Message,
      initial,
      update: (model: Model, message: Message): Update.Return<Model, Message> =>
        Message.match<Update.Return<Model, Message>>(message, {
          UndeclaredBoom: () => ({ model: { ...model, count: model.count + 1 } }),
          DeclaredBump: () => ({ model: { ...model, count: model.count + 1 } }),
        }),
    })

    const shared = Projection.pick(app.model.count)
    const bumpTransition = Transition.make({
      state: Schema.Struct({ model: Schema.Struct({ count: Schema.Int }) }),
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.add(state.model.count, 1)],
    })

    const sync = forApplication(app).make({
      documentId: documentId('reads-outside-test'),
      shared,
      durable: MessageSet.make(app, [Message.UndeclaredBoom, Message.DeclaredBump]),
      transitions: {
        DeclaredBump: SyncDeclared.transition(bumpTransition),
      },
    })

    const storage = memoryStorage()
    const replica = await Effect.runPromise(
      sync.openReplica(storage, { replicaId: replicaId('a') }),
    )

    const failures: Array<string> = []
    const container = document.createElement('div')
    container.id = 'sync-root'
    document.body.appendChild(container)

    const spy = vi.spyOn(Closure, 'reads')
    const mounted = mount(app, sync, {
      replica,
      container,
      view: (model, h) => ({
        title: 'test',
        body: h.div([], [String(model.count)]),
      }),
      onPersistenceFailure: (model, err) => {
        failures.push(err.message)
        return model
      },
    })

    try {
      // 1. Declared durable Message never calls Closure.reads.
      mounted.dispatch(Message.DeclaredBump())
      await mounted.settled()
      expect(spy).not.toHaveBeenCalled()

      // 2. When Closure.reads throws for an undeclared durable Message, mount refuses explicitly.
      spy.mockImplementationOnce(() => {
        throw new Error('simulated Closure.reads failure')
      })
      mounted.dispatch(Message.UndeclaredBoom())
      await mounted.settled()

      expect(
        failures.some(msg =>
          msg.includes(
            '[foldkit-sync] Closure.reads threw for Message "UndeclaredBoom"; its reads outside the slice are unknown, so the replica treats every outside field as read. Declare a transition for "UndeclaredBoom" to remove the guess.',
          ),
        ),
      ).toBe(true)
    } finally {
      spy.mockRestore()
      await mounted.dispose()
      await Effect.runPromise(replica.close)
      container.remove()
    }
  })
})
