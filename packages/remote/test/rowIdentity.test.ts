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

const read = (model: Model) => project.read(model)
const page = (model: Model) => list.read(model)

let written = 0
/**
 * `loaded` as a store not read before. Reads are kept per store snapshot, so a
 * test that read `loaded` itself would be handed what an earlier test read,
 * before the rows it reread since; an application's Model moves forward.
 */
const current = (): Model => Data.reduce(loaded, received('User', `x${written++}`, { name: 'X' }))

describe('A read handed out again (#384)', () => {
  it('is one Projection per Selection and id', () => {
    expect(Data.get(card, 'p1')).toBe(project)
    expect(Data.get(card, 'p2')).not.toBe(project)
  })

  it('is the same object after a write that reaches nothing it shows', () => {
    const base = current()
    const [before, beforePage] = [read(base), page(base)]
    const elsewhere = Data.reduce(base, received('User', 'u3', { name: 'Edsger' }))

    expect(read(elsewhere)).toBe(before)
    expect(read({ ...base })).toBe(before)
    expect(page(elsewhere)).toBe(beforePage)
  })

  it('is the same object after a refetch that brought equal data', () => {
    const base = current()
    const [before, beforePage] = [read(base), page(base)]
    const refetched = Data.reduce(
      base,
      received('Project', 'p1', { id: 'p1', name: 'One', owner: 'User:u1' }),
    )

    expect(read(refetched)).toBe(before)
    expect(page(refetched)).toBe(beforePage)
  })

  it('is new for the row that changed and the page holding it, and nothing else', () => {
    const base = current()
    const [before, beforePage, other] = [read(base), page(base), Data.get(card, 'p2').read(base)]
    const renamed = Data.reduce(base, received('Project', 'p1', { name: 'Uno' }))

    expect(read(renamed)).not.toBe(before)
    expect(read(renamed)).toEqual({ _tag: 'Ready', value: { ...value(base), name: 'Uno' } })
    expect(page(renamed)).not.toBe(beforePage)
    expect(Data.get(card, 'p2').read(renamed)).toBe(other)
  })

  it('is new when a target reached through a relation changed', () => {
    const base = current()
    const [before, beforePage, other] = [read(base), page(base), Data.get(card, 'p2').read(base)]
    const renamed = Data.reduce(base, received('User', 'u1', { name: 'Ada L.' }))

    expect(read(renamed)).not.toBe(before)
    expect(page(renamed)).not.toBe(beforePage)
    expect(Data.get(card, 'p2').read(renamed)).toBe(other)
  })

  it('keeps an optimistic row while the store under it changes elsewhere', () => {
    const shown = Data.overlay(current(), 'preview', [Project.patch('p1', { name: 'Previewed' })])
    const before = value(shown)
    const elsewhere = Data.reduce(shown, received('User', 'u3', { name: 'Edsger' }))

    expect(before.name).toBe('Previewed')
    expect(value(elsewhere)).toBe(before)
  })

  it('keeps its value when its row is read again after leaving the store', () => {
    const base = current()
    const before = value(base)
    const forgotten = Data.forget(base)
    expect(read(forgotten)._tag).toBe('Initial')
    const again = [
      received('User', 'u1', { name: 'Ada' }),
      received('Project', 'p1', { id: 'p1', name: 'One', owner: 'User:u1' }),
    ].reduce(Data.reduce, forgotten)

    expect(value(again)).toBe(before)
  })

  it('is one object for a read that holds no value', () => {
    const absent = Data.get(card, 'p9')

    expect(absent.read(loaded)).toBe(absent.read({ ...loaded }))
    expect(absent.read(loaded)).toEqual({ _tag: 'Initial' })
  })

  it('keeps a failure over a value while the error is the same, and drops it with the error', () => {
    const base = current()
    const before = read(base)
    const failing = Data.reduce(base, {
      _tag: 'ReadFailed',
      requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
      error: { _tag: 'Network', message: 'down' },
    })
    const failed = read(failing)
    const elsewhere = Data.reduce(failing, received('User', 'u3', { name: 'Edsger' }))

    expect(failed).toEqual({
      _tag: 'Failed',
      error: { _tag: 'Network', message: 'down' },
      previous: value(base),
    })
    expect(read(elsewhere)).toBe(failed)
    const failingAgain = Data.reduce(elsewhere, {
      _tag: 'ReadFailed',
      requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
      error: { _tag: 'Network', message: 'still down' },
    })
    expect(read(failingAgain)).toMatchObject({ error: { message: 'still down' } })
    const answered = Data.reduce(
      failing,
      received('Project', 'p1', { id: 'p1', name: 'One', owner: 'User:u1' }),
    )
    expect(read(answered)).toBe(before)
  })
})
