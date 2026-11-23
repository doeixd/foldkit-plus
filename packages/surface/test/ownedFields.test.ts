import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Closure, ownedFields, type ClosureProjection } from '../src/closure.js'

const Todo = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  completed: Schema.Boolean,
})
const Model = Schema.Struct({
  todos: Schema.Array(Todo),
  count: Schema.Int,
  filter: Schema.String,
})
type Model = typeof Model.Type

describe('ownedFields and partial-path Closure.reads (Bout 2.3)', () => {
  it('partitions whole-field vs partial-path dependencies consistently', () => {
    const partial = ownedFields([['todos', '*', 'title'], ['count']])
    expect([...partial.whole]).toEqual(['count'])
    expect([...partial.partial]).toEqual(['todos'])

    // A whole-field dependency subsumes any sub-path on the same top-level key.
    const subsumed = ownedFields([['todos', '*', 'title'], ['todos']])
    expect([...subsumed.whole]).toEqual(['todos'])
    expect([...subsumed.partial]).toEqual([])
  })

  it('detects when a Message reads a sub-path outside a partial WritableProjection (todos.*.completed)', () => {
    const initial: Model = {
      todos: [{ id: '1', title: 'first', completed: false }],
      count: 0,
      filter: 'all',
    }
    type Msg = { readonly _tag: 'SyncTitleFromCompleted' }

    const projection: ClosureProjection<Model, ReadonlyArray<string>> = {
      schema: Schema.Array(Schema.String),
      dependencies: [['todos', '*', 'title']],
      get: root => root.todos.map(t => t.title),
      set: (root, titles) => ({
        ...root,
        todos: root.todos.map((t, i) => ({ ...t, title: titles[i] ?? t.title })),
      }),
    }

    const app = {
      initial,
      update: (model: Model, _msg: Msg) => ({
        model: {
          ...model,
          todos: model.todos.map(t => ({
            ...t,
            // Reads `t.completed`, which is outside `todos.*.title`.
            title: t.completed ? `${t.title} [done]` : t.title,
          })),
        },
      }),
    }

    const live: Model = {
      ...initial,
      todos: [{ id: '1', title: 'first', completed: true }],
    }
    expect(Closure.reads(app, projection, live, { _tag: 'SyncTitleFromCompleted' })).toEqual([
      'todos',
    ])
  })
})
