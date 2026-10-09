/**
 * A mutation that is a declared `Write`: its optimistic patch is the write
 * bound to the input, and the keys an author changed travel with the request.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Refusal, Remote, RemoteClient } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const EditProjectInput = DomainEntity.input(
  Project,
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const EditProject = Mutation.update('EditProject', Write.update(EditProjectInput, { id: 'id' }))
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

describe('Mutation.update', () => {
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
      { requestId: started.requestId, mutation: 'EditProject', input: edit, keys: ['name'] },
    ])
  })
})
