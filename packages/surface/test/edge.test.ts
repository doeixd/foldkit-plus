import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Metadata, Projection, Surface } from '../src/index.js'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  selectedTodoId: Schema.NullOr(Schema.String),
})
const App = Surface.application({ Model, Message: defineMessageUnion({ Ping: {} }) })

const example = { todos: [{ id: 'a', title: 'A' }], selectedTodoId: null }

describe('Surface edge cases', () => {
  it('Projection.fromReader carries no dependencies or metadata by default', () => {
    const reader = Projection.fromReader(
      Schema.Struct({ doubled: Schema.Number }),
      (model: { readonly n: number }) => ({ doubled: model.n * 2 }),
    )

    expect(reader.read({ n: 2 })).toEqual({ doubled: 4 })
    expect(reader.dependencies).toEqual([])
    expect(Metadata.summarize(reader.metadata)).toEqual([])
  })

  it('Projection.array over an empty array is an empty projection', () => {
    const summary = Projection.of(Todo)({ title: true })
    expect(Projection.array(summary).read([])).toEqual([])
  })

  it('an out-of-range index reads as absence and setting it is a no-op', () => {
    const ref = App.model.todos.index(5)
    expect(Option.isNone(ref.get(example))).toBe(true)
    expect(ref.set(example, Option.some({ id: 'x', title: 'X' }))).toEqual(example)
  })

  it('a missing record key reads as absence; setting Some inserts it', () => {
    const model = { projects: {} as Record<string, { id: string; name: string }> }
    const ref = Surface.application({
      Model: Schema.Struct({
        projects: Schema.Record(
          Schema.String,
          Schema.Struct({ id: Schema.String, name: Schema.String }),
        ),
      }),
      Message: defineMessageUnion({ Ping: {} }),
    }).model.projects.at('p1')

    expect(Option.isNone(ref.get(model))).toBe(true)
    expect(ref.set(model, Option.some({ id: 'p1', name: 'Apollo' }))).toEqual({
      projects: { p1: { id: 'p1', name: 'Apollo' } },
    })
  })

  it('Projection.struct de-duplicates two entries on the same path', () => {
    const projection = Projection.struct({
      a: App.model.todos,
      b: App.model.todos,
    })
    expect(projection.dependencies).toEqual([['todos']])
  })

  it('modify transforms through a top-level field ref', () => {
    const next = App.model.todos.modify(example, todos => [...todos, { id: 'b', title: 'B' }])
    expect(next).toEqual({
      todos: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
      selectedTodoId: null,
    })
  })

  it('modify transforms through a nested struct ref', () => {
    const ref = App.model.todos
    const next = ref.modify(example, todos =>
      todos.map(todo => (todo.id === 'a' ? { ...todo, title: 'B' } : todo)),
    )
    expect(next).toEqual({ todos: [{ id: 'a', title: 'B' }], selectedTodoId: null })
  })

  it('modify inserts through an absent record key where set would', () => {
    const model = { projects: {} as Record<string, { id: string; name: string }> }
    const ref = Surface.application({
      Model: Schema.Struct({
        projects: Schema.Record(
          Schema.String,
          Schema.Struct({ id: Schema.String, name: Schema.String }),
        ),
      }),
      Message: defineMessageUnion({ Ping: {} }),
    }).model.projects.at('p1')

    // A bare optic replace would no-op on the absent key; modify must go
    // through the ref's container-aware set and insert.
    const next = ref.modify(model, () => Option.some({ id: 'p1', name: 'Apollo' }))
    expect(next).toEqual({ projects: { p1: { id: 'p1', name: 'Apollo' } } })
  })

  it('modify removes through a present record key', () => {
    const model = { projects: { p1: { id: 'p1', name: 'Apollo' } } }
    const ref = Surface.application({
      Model: Schema.Struct({
        projects: Schema.Record(
          Schema.String,
          Schema.Struct({ id: Schema.String, name: Schema.String }),
        ),
      }),
      Message: defineMessageUnion({ Ping: {} }),
    }).model.projects.at('p1')

    expect(ref.modify(model, () => Option.none())).toEqual({ projects: {} })
  })

  it('modify preserves unrelated fields and round-trips through get', () => {
    const ref = App.model.todos
    const next = ref.modify(example, todos => [...todos])
    expect(ref.get(next)).toEqual(example.todos)
    expect(next.selectedTodoId).toBe(null)
  })
})
