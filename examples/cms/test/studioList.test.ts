// @vitest-environment jsdom
/**
 * The posts list as drawn: a list whose read failed says so and offers to ask
 * again, rather than dead-ending. The failure is driven through `update` with
 * the Message the runtime sends for a failed query.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { connectionsOf } from 'foldkit-remote'
import { Inert } from 'foldkit-mixins/testing'
import { initial, Message, update, Worklist, type Model } from '../src/apps/app.js'
import { Studio } from '../src/views/view.js'

const step = (model: Model, message: Message): Model => update(model, message).model

/** The identity of the worklist's connection as `model` asks for it. */
const worklistIdentity = (model: Model): string => {
  const active = Worklist.active.projectionOf(model)
  const connections = Option.isSome(active) ? connectionsOf(active.value as never) : []
  return (connections[0] as { readonly identity?: string } | undefined)?.identity ?? ''
}

/** The worklist as it stands after its query read failed. */
const failedList = (model: Model): Model => {
  const connection = worklistIdentity(model)
  return step(
    model,
    Message.QueryFailed({ connection, error: { _tag: 'ReadFailed', message: 'unreachable' } }),
  )
}

describe('the posts list', () => {
  it('offers to ask a failed read again, and the retry re-asks', () => {
    const failed = failedList(initial)
    expect(Worklist.page(failed)._tag).toBe('Failed')
    const tree = Inert.draw(Studio, failed)
    expect(Inert.text(tree)).toContain('Try again')
    // The retry asks the list again: it is no longer a failure.
    const retried = step(failed, Message.RetriedList())
    expect(Worklist.page(retried)._tag).not.toBe('Failed')
  })
})

describe('an entry saved for the first time', () => {
  it('joins the worklist: the save’s answer marks the list to be asked again', () => {
    const identity = worklistIdentity(initial)
    const entry = (id: string, label: string) => ({
      entity: 'CmsEntry',
      id,
      values: { id, type: 'posts', label, createdAt: '2026-01-01', archivedAt: null },
    })
    const loaded = step(
      step(
        initial,
        Message.ConnectionMerged({
          connection: identity,
          page: {
            edges: [{ key: 'CmsEntry:e1', ref: { entity: 'CmsEntry', id: 'e1' } }],
            start: { _tag: 'Terminal' },
            end: { _tag: 'Terminal' },
          },
        }),
      ),
      Message.ReadReceived({
        requests: [
          {
            entity: 'CmsEntry',
            id: 'e1',
            fields: ['id', 'type', 'label', 'createdAt', 'archivedAt'],
          },
        ],
        result: { settled: [], entities: [entry('e1', 'First')] },
        now: 0,
      }),
    )
    expect(loaded.remote.connections[identity]?.stale).toBe(false)

    // No code in the application asks for the list again; the answer does.
    const saved = step(
      loaded,
      Message.MutationSucceeded({
        requestId: 'save-e9',
        entities: [entry('e9', 'Second')],
        now: 1,
      }),
    )
    expect(saved.remote.connections[identity]?.stale).toBe(true)
  })
})
