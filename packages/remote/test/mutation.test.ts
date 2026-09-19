import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Mutation,
  Remote,
  RemoteClient,
  beginMutation,
  emptyMutationState,
  emptyStore,
  entityKey,
  failMutation,
  isTombstone,
  mutationStatus,
  readField,
  reconcileMutation,
  writeEntity,
  type NormalizedPatch,
} from '../src/index.js'

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const RenameUser = Mutation.make('RenameUser', {
  Input: Schema.Struct({ id: Schema.String, name: Schema.String }),
  Output: Schema.Struct({ id: Schema.String }),
})

const requests: Array<unknown> = []
const FakeClient = Layer.succeed(RemoteClient, {
  read: () => Effect.die('unused'),
  query: () => Effect.die('unused'),
  mutate: request =>
    Effect.sync(() => {
      requests.push(request)
      const input = request.input as { readonly id: string; readonly name: string }
      return {
        output: { id: input.id },
        entities: [{ entity: 'User', id: input.id, values: { name: input.name } }],
      }
    }),
  live: () => Stream.empty,
})

describe('Remote mutations', () => {
  it('runs a mutation, decoding its typed Output and returning its patches', async () => {
    requests.length = 0
    const { output, entities } = await Effect.runPromise(
      Remote.mutate(RenameUser, { id: 'u1', name: 'ada' }, 'req-1').pipe(
        Effect.provide(FakeClient),
      ),
    )
    expect(output).toEqual({ id: 'u1' })
    expect(entities).toEqual([{ entity: 'User', id: 'u1', values: { name: 'ada' } }])
    expect(requests).toEqual([
      { requestId: 'req-1', mutation: 'RenameUser', input: { id: 'u1', name: 'ada' } },
    ])
  })

  it('reconciles a result at most once per requestId (retry-safe)', () => {
    const patches: NormalizedPatch[] = [{ entity: 'User', id: 'u1', values: { name: 'ada' } }]

    const first = reconcileMutation(emptyStore, emptyMutationState, 'req-1', patches)
    const second = reconcileMutation(first.store, first.state, 'req-1', patches)

    expect(second.store).toEqual(first.store)
    expect(second.state.applied.size).toBe(1)
    expect(readField(second.store, entityKey('User', 'u1'), 'name')).toEqual(Option.some('ada'))
  })

  it('a mutation result and a live write for the same entity agree', () => {
    const patches: NormalizedPatch[] = [{ entity: 'User', id: 'u1', values: { name: 'ada' } }]
    const byMutation = reconcileMutation(emptyStore, emptyMutationState, 'req-1', patches).store
    const byLive = writeEntity(emptyStore, entityKey('User', 'u1'), { name: 'ada' })
    expect(byMutation).toEqual(byLive)
  })

  const offline = { _tag: 'TransportError', message: 'offline' }

  it('tracks pending and failed status, and keeps why it failed', () => {
    const pending = beginMutation(emptyMutationState, 'req-1')
    expect(pending.pending.has('req-1')).toBe(true)
    expect(mutationStatus(pending, 'req-1')).toEqual({ _tag: 'Pending' })

    const failed = failMutation(pending, 'req-1', offline)
    expect(failed.pending.has('req-1')).toBe(false)
    expect(failed.failed.has('req-1')).toBe(true)
    expect(mutationStatus(failed, 'req-1')).toEqual({ _tag: 'Failed', error: offline })
  })

  it('reads an applied request, and one it has never seen', () => {
    const started = beginMutation(emptyMutationState, 'req-1')
    const applied = reconcileMutation(emptyStore, started, 'req-1', []).state

    expect(mutationStatus(applied, 'req-1')).toEqual({ _tag: 'Applied' })
    expect(mutationStatus(applied, 'req-2')).toEqual({ _tag: 'Unknown' })
  })

  it('reads a retry by its latest outcome: in flight, then applied', () => {
    const retried = beginMutation(failMutation(emptyMutationState, 'req-1', offline), 'req-1')
    expect(mutationStatus(retried, 'req-1')).toEqual({ _tag: 'Pending' })

    const applied = reconcileMutation(emptyStore, retried, 'req-1', []).state
    expect(mutationStatus(applied, 'req-1')).toEqual({ _tag: 'Applied' })
  })

  it('tombstones what a mutation deleted, once, after its patches', () => {
    const held = writeEntity(emptyStore, entityKey('User', 'u1'), { name: 'ada' })
    const started = beginMutation(emptyMutationState, 'req-1')
    const gone = reconcileMutation(
      held,
      started,
      'req-1',
      // Named both ways: the deletion wins.
      [{ entity: 'User', id: 'u1', values: { name: 'late' } }],
      [{ entity: 'User', id: 'u1' }],
    )
    expect(isTombstone(gone.store, entityKey('User', 'u1'))).toBe(true)

    // A retry of the same request does not delete again what has since come back.
    const back = writeEntity(gone.store, entityKey('User', 'u1'), { name: 'new' })
    const retried = reconcileMutation(back, gone.state, 'req-1', [], [{ entity: 'User', id: 'u1' }])
    expect(isTombstone(retried.store, entityKey('User', 'u1'))).toBe(false)
  })

  it('bounds the settled-request ledger', () => {
    let state = emptyMutationState
    for (let index = 0; index < 4096; index += 1) {
      state = reconcileMutation(emptyStore, state, `req-${index}`, []).state
    }

    expect(state.applied.size).toBeLessThan(4096)
    expect(state.applied.has('req-0')).toBe(false)
    expect(state.applied.has('req-4095')).toBe(true)
  })

  it('bounds the failed-request ledger', () => {
    let state = emptyMutationState
    for (let index = 0; index < 4096; index += 1) {
      state = failMutation(state, `req-${index}`, offline)
    }

    expect(state.failed.size).toBeLessThan(4096)
    expect(state.failed.has('req-4095')).toBe(true)
    // An error is kept exactly as long as its id is.
    expect([...state.errors.keys()]).toEqual([...state.failed])
  })

  it('clears pending even when a request is re-begun and reconciled again', () => {
    const started = beginMutation(emptyMutationState, 'req-1')
    const first = reconcileMutation(emptyStore, started, 'req-1', [
      { entity: 'User', id: 'u1', values: { name: 'ada' } },
    ])
    expect(first.state.pending.has('req-1')).toBe(false)

    // A retry re-begins the same request; settling it must not leave it pending,
    // and must not re-apply the older entities.
    const retried = beginMutation(first.state, 'req-1')
    expect(retried.pending.has('req-1')).toBe(true)
    const second = reconcileMutation(first.store, retried, 'req-1', [
      { entity: 'User', id: 'u1', values: { name: 'grace' } },
    ])
    expect(second.state.pending.has('req-1')).toBe(false)
    expect(readField(second.store, entityKey('User', 'u1'), 'name')).toEqual(Option.some('ada'))
  })

  it('maps an input encode failure onto RemoteMutationError', async () => {
    const result = await Effect.runPromise(
      Effect.result(
        Remote.mutate(RenameUser, { id: 1 as unknown as string, name: 'ada' }, 'req-1').pipe(
          Effect.provide(FakeClient),
        ),
      ),
    )

    expect(result._tag).toBe('Failure')
    if (result._tag !== 'Failure') return
    expect(result.failure._tag).toBe('RemoteMutationError')
  })

  it('maps an output decode failure onto RemoteMutationError', async () => {
    const badOutput = Layer.succeed(RemoteClient, {
      read: () => Effect.die('unused'),
      query: () => Effect.die('unused'),
      mutate: () => Effect.succeed({ output: { id: 123 }, entities: [] }),
      live: () => Stream.empty,
    })

    const result = await Effect.runPromise(
      Effect.result(
        Remote.mutate(RenameUser, { id: 'u1', name: 'ada' }, 'req-1').pipe(
          Effect.provide(badOutput),
        ),
      ),
    )

    expect(result._tag).toBe('Failure')
    if (result._tag !== 'Failure') return
    expect(result.failure._tag).toBe('RemoteMutationError')
  })
})
