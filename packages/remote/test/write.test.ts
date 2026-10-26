/**
 * A mutation that is a declared `Write`: its optimistic patch is the write
 * bound to the input, and the keys an author changed travel with the request.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Mutation,
  MutationRequest,
  Refusal,
  Remote,
  RemoteClient,
  RemoteMutationError,
  patchOfWrite,
} from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const EditProjectInput = DomainEntity.input(
  Project,
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const EditProject = Mutation.write('EditProject', Write.update(EditProjectInput, { id: 'id' }))
const Summary = DomainEntity.select(Project, { id: true, name: true, status: true })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Project], mutations: [EditProject] })

const held: Model = Data.reduce(
  { remote: Remote.initial },
  {
    _tag: 'ReadReceived',
    requests: [{ entity: 'Project', id: 'p1', fields: ['id', 'name', 'status'] }],
    result: {
      settled: [],
      entities: [
        { entity: 'Project', id: 'p1', values: { id: 'p1', name: 'Apollo', status: 'active' } },
      ],
    },
    now: 0,
  },
)
const shown = (model: Model) => {
  const read = Data.get(Summary, 'p1').read(model)
  return read._tag === 'Ready' ? read.value : read._tag
}
const edit = { id: 'p1', name: 'Apollo II', status: 'archived' }

describe('Mutation.write', () => {
  it('takes the write’s input, answers nothing of its own, and may be refused as a conflict', () => {
    expect(EditProject.write?.sets.map(set => set.key)).toEqual(['name', 'status'])
    expect(Schema.decodeUnknownSync(EditProject.Input)(edit)).toEqual(edit)
    expect(Schema.decodeUnknownSync(EditProject.Output)({})).toEqual({})
    expect(
      Refusal.isConflict(Schema.decodeUnknownSync(EditProject.Refusal)({ _tag: 'Conflict' })),
    ).toBe(true)
  })
})

describe('Data.mutate of a write', () => {
  it('shows what the write writes until the server answers', () => {
    const started = Data.mutate(held, EditProject, edit)
    expect(shown(started.model)).toEqual(edit)
  })

  it('shows only the keys an author changed, when told which', () => {
    const started = Data.mutate(held, EditProject, edit, { keys: ['name'] })
    expect(shown(started.model)).toEqual({ id: 'p1', name: 'Apollo II', status: 'active' })
  })

  it('shows the optimistic operations it is given instead, when given some', () => {
    const started = Data.mutate(held, EditProject, edit, { optimistic: [] })
    expect(shown(started.model)).toEqual({ id: 'p1', name: 'Apollo', status: 'active' })
  })

  it('sends the keys with the whole input', async () => {
    const sent: Array<unknown> = []
    const client = Layer.succeed(RemoteClient, {
      read: () => Effect.die('no reads'),
      query: () => Effect.die('no queries'),
      mutate: request =>
        Effect.sync(() => {
          sent.push(request)
          return { output: {}, entities: [] }
        }),
      live: () => Stream.empty,
    })
    const started = Data.mutate(held, EditProject, edit, { keys: ['name'] })
    await Effect.runPromise(started.command.effect.pipe(Effect.provide(client)))
    expect(sent).toEqual([
      {
        requestId: started.requestId,
        operation: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        ),
        mutation: 'EditProject',
        input: edit,
        keys: ['name'],
      },
    ])
  })
})

describe('patchOfWrite', () => {
  it('patches a relation as the ref key the store holds, and none as null', () => {
    expect(
      patchOfWrite({
        entity: 'Post',
        id: 'p1',
        values: { title: 'Compilers' },
        links: {
          author: Option.some({ entity: 'Author', id: 'a1' }),
          editor: Option.none(),
        },
        increments: {},
        assignments: {},
      }),
    ).toEqual({
      entity: 'Post',
      id: 'p1',
      values: { title: 'Compilers', author: 'Author:a1', editor: null },
    })
  })
})

describe('Data.mutate of an insert or a delete', () => {
  const NewProject = Mutation.write('NewProject', Write.insert(EditProjectInput, { id: 'id' }))
  const DropProject = Mutation.write(
    'DropProject',
    Write.delete(DomainEntity.input(Project, Schema.Struct({ id: Schema.String })), { id: 'id' }),
  )
  const Writes = Remote.make({
    model: App.model.remote,
    entities: [Project],
    mutations: [NewProject, DropProject],
  })

  it('shows an inserted row before the server answers', () => {
    const started = Writes.mutate({ remote: Remote.initial }, NewProject, {
      id: 'p2',
      name: 'Gemini',
      status: 'active',
    })
    const read = Writes.get(Summary, 'p2').read(started.model)
    expect(read._tag === 'Ready' && read.value).toEqual({
      id: 'p2',
      name: 'Gemini',
      status: 'active',
    })
  })

  it('shows nothing for a delete until the server answers', () => {
    const started = Writes.mutate(held, DropProject, { id: 'p1' })
    expect(started.model.remote.optimistic).toEqual(held.remote.optimistic)
  })
})

describe('An operation id', () => {
  const edit = { id: 'p1', name: 'Apollo II', status: 'active' }
  /** A client that records what it was sent, and fails or answers as told. */
  const recording = (fails: boolean) => {
    const sent: Array<{ readonly requestId: string; readonly operation?: string | undefined }> = []
    const layer = Layer.succeed(RemoteClient, {
      read: () => Effect.die('no reads'),
      query: () => Effect.die('no queries'),
      mutate: request =>
        Effect.suspend(() => {
          sent.push(request)
          return fails
            ? Effect.fail(new RemoteMutationError({ message: 'offline' }))
            : Effect.succeed({ output: {}, entities: [] })
        }),
      live: () => Stream.empty,
    })
    return { sent, layer }
  }
  const run = async (model: Model, requestId: string | undefined, fails: boolean) => {
    const { sent, layer } = recording(fails)
    const started = Data.mutate(
      model,
      EditProject,
      edit,
      requestId === undefined ? {} : { requestId },
    )
    const message = await Effect.runPromise(started.command.effect.pipe(Effect.provide(layer)))
    return { sent, model: Data.reduce(started.model, message), requestId: started.requestId }
  }

  it('is new for each mutation, so two clients’ first ones differ', async () => {
    const first = await run(held, undefined, false)
    const other = await run(held, undefined, false)
    // Both models are fresh: their request ids agree, their operations do not.
    expect(first.requestId).toBe(other.requestId)
    expect(first.sent[0]?.operation).not.toBe(other.sent[0]?.operation)
  })

  it('is sent again by a retry of a failed request, and is new after a reload', async () => {
    const failed = await run(held, undefined, true)
    const retried = await run(failed.model, failed.requestId, false)
    expect(retried.sent[0]?.operation).toBe(failed.sent[0]?.operation)
    // A reloaded model has no record of it: the same request id is a new operation.
    const reloaded = await run(held, failed.requestId, false)
    expect(reloaded.sent[0]?.operation).not.toBe(failed.sent[0]?.operation)
  })

  it('is minted on a page served over plain HTTP, which has no randomUUID', async () => {
    const { randomUUID } = globalThis.crypto
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      const first = await run(held, undefined, false)
      const other = await run(held, undefined, false)
      expect(first.sent[0]?.operation).toMatch(/^[0-9a-f]{32}$/)
      expect(first.sent[0]?.operation).not.toBe(other.sent[0]?.operation)
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: randomUUID,
        configurable: true,
      })
    }
  })

  it('is bounded on the wire, where a server keys a record by it', () => {
    const request = (operation: string) =>
      Schema.decodeUnknownResult(MutationRequest)({
        requestId: 'r',
        operation,
        mutation: 'EditProject',
        input: {},
      })._tag
    expect(request('a1b2-c3:d4.e5_f6')).toBe('Success')
    expect(request('x'.repeat(129))).toBe('Failure')
    expect(request('a b')).toBe('Failure')
    expect(request('')).toBe('Failure')
  })
})
