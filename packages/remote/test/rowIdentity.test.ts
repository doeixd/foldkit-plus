/**
 * A read hands a view the object it already rendered while the data under it is
 * the same, so a keyed row's lazy view is not re-run by a refetch or a live
 * patch that changed nothing it shows.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Query,
  Remote,
  Selection,
  entityKey,
  terminal,
  type RemoteMessage,
} from '../src/index.js'

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Project = Entity.make(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, owner: Entity.ref(User) }),
)
const Projects = Query.make('Projects', { Input: {}, Result: Project })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Project],
  queries: [Projects],
})

const card = Selection.make(Project, {
  id: true,
  name: true,
  owner: Selection.make(User, { name: true }),
})
const list = Data.query(Projects, {}, { select: card, first: 10 })
const project = Data.get(card, 'p1')

const received = (entity: string, id: string, values: Record<string, unknown>): RemoteMessage => ({
  _tag: 'ReadReceived',
  requests: [{ entity, id, fields: Object.keys(values) }],
  result: { settled: [], entities: [{ entity, id, values }] },
  // A later write than the first: equal data, but not an equal entry.
  now: 1,
})

const loaded: Model = [
  received('User', 'u1', { name: 'Ada' }),
  received('User', 'u2', { name: 'Grace' }),
  received('Project', 'p1', { id: 'p1', name: 'One', owner: 'User:u1' }),
  received('Project', 'p2', { id: 'p2', name: 'Two', owner: 'User:u2' }),
  {
    _tag: 'ConnectionMerged',
    connection: list.ref.identity,
    page: {
      edges: ['p1', 'p2'].map(id => ({
        key: entityKey('Project', id),
        ref: { entity: 'Project', id },
      })),
      start: terminal,
      end: terminal,
    },
  },
].reduce<Model>((model, message) => Data.reduce(model, message as RemoteMessage), {
  remote: Remote.initial,
})

const rows = (model: Model) => {
  const page = list.read(model)
  if (page._tag !== 'Ready') throw new Error(`the list reads ${page._tag}`)
  return page.value.items
}
const value = (model: Model) => {
  const read = project.read(model)
  if (read._tag !== 'Ready') throw new Error(`the project reads ${read._tag}`)
  return read.value
}

describe('A row read again', () => {
  it('is the same object after a refetch that brought equal data', () => {
    const [one, two] = rows(loaded)
    const refetched = Data.reduce(
      loaded,
      received('Project', 'p1', { id: 'p1', name: 'One', owner: 'User:u1' }),
    )

    expect(refetched).not.toBe(loaded)
    expect(rows(refetched)[0]).toBe(one)
    expect(rows(refetched)[1]).toBe(two)
    expect(value(refetched)).toBe(value(loaded))
  })

  it('is new when its own data changed, and only it is', () => {
    const [one, two] = rows(loaded)
    const renamed = Data.reduce(
      loaded,
      received('Project', 'p2', { id: 'p2', name: 'Deux', owner: 'User:u2' }),
    )

    expect(rows(renamed)[0]).toBe(one)
    expect(rows(renamed)[1]).toEqual({ ...two, name: 'Deux' })
  })

  it('is new when a relation target it shows changed', () => {
    const [one, two] = rows(loaded)
    const renamed = Data.reduce(loaded, received('User', 'u1', { name: 'Ada L.' }))

    expect(rows(renamed)[0]).toEqual({ ...one, owner: { name: 'Ada L.' } })
    expect(rows(renamed)[1]).toBe(two)
    expect(value(renamed)).toEqual({ ...one, owner: { name: 'Ada L.' } })
  })
})
