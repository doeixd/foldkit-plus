import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { SSR } from '../src/index.js'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ title: Schema.String })),
})
type Model = typeof Model.Type

const Message = defineMessageUnion({
  Noop: {},
})

const App = Surface.application({ Model, Message })
const initial: Model = { todos: [] }
const runnable = App.runnable({ initial, update: model => ({ model }) })

const WildcardTitles = Surface.make(App, 'WildcardTitles', {
  model: () =>
    Projection.fromReader(Schema.Array(Schema.String), (m: Model) => m.todos.map(t => t.title), {
      dependencies: [['todos', '*', 'title']],
    }),
})

describe('SSR.inspect coverOf wildcard soundness (Bout 2.6 H1)', () => {
  it('does not treat a concrete index path as covering a wildcard read', () => {
    const narrowState = {
      schema: Schema.Struct({ first: Schema.String }),
      dependencies: [['todos', '0']] as const,
      get: (m: Model) => ({ first: m.todos[0]?.title ?? '' }),
      set: (m: Model) => m,
    }
    const plan = SSR.plan(runnable, {
      id: 'narrow-todos',
      state: narrowState,
      surfaces: [Surface.at(WildcardTitles, undefined)],
    })
    const report = SSR.inspect(plan, { todos: [{ title: 'a' }, { title: 'b' }] })
    expect(report.surfaces[0]?.reads).toEqual([{ path: 'todos.*.title', cover: 'missing' }])
  })

  it('treats a parent path as covering a wildcard read beneath it', () => {
    const plan = SSR.plan(runnable, {
      id: 'whole-todos',
      state: Projection.pick(App.model.todos),
      surfaces: [Surface.at(WildcardTitles, undefined)],
    })
    const report = SSR.inspect(plan, { todos: [{ title: 'a' }] })
    expect(report.surfaces[0]?.reads).toEqual([{ path: 'todos.*.title', cover: 'state' }])
  })
})
