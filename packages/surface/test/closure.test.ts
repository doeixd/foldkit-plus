import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Closure, Projection, Surface } from '../src/index.js'
import { Message } from './todoFixture.js'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  filter: Schema.String,
  sort: Schema.String,
  tally: Schema.Number,
})
type Model = typeof Model.Type
const initial: Model = { todos: [], filter: 'all', sort: 'new', tally: 0 }

const Application = Surface.application({ Model, Message })
const projection = Projection.pick(Application.model.todos)

// One transition per scenario; the Message only names which.
const steps: Record<string, (model: Model) => Model> = {
  // Reads `filter` to decide what to remove.
  ClearedShown: model => ({
    ...model,
    todos: model.todos.filter(todo =>
      model.filter === 'all' ? true : todo.title !== model.filter,
    ),
  }),
  // Either `filter` or `sort` alone empties the slice, so resetting one changes nothing.
  Both: model => ({
    ...model,
    todos: model.filter !== 'all' || model.sort !== 'new' ? [] : model.todos,
  }),
  // Reads `filter`, writes an equal slice either way.
  Resorted: model => ({ ...model, todos: model.filter === 'all' ? model.todos : [...model.todos] }),
  // Reads only the slice.
  Emptied: model => ({ ...model, todos: [] }),
}
const app = {
  initial,
  update: (model: Model, message: { readonly _tag: string }) => ({
    model: steps[message._tag]!(model),
  }),
}
const todos = [
  { id: 'a', title: 'x' },
  { id: 'b', title: 'y' },
]
const reads = (model: Partial<Model>, tag: string) =>
  Closure.reads(app, projection, { ...initial, todos, ...model }, { _tag: tag })

describe('Closure.reads', () => {
  it.each([
    ['names the one local field the slice depends on', { filter: 'x' }, 'ClearedShown', ['filter']],
    ['is empty when the local field is at its initial value', {}, 'ClearedShown', []],
    [
      'is empty for a Message that reads only the slice',
      { filter: 'x', sort: 'old' },
      'Emptied',
      [],
    ],
    ['is empty when the slice comes out equal', { filter: 'x' }, 'Resorted', []],
    [
      'names every field when each alone is enough',
      { filter: 'x', sort: 'old' },
      'Both',
      ['filter', 'sort'],
    ],
    [
      'skips a field the Message does not read',
      { filter: 'x', tally: 3 },
      'ClearedShown',
      ['filter'],
    ],
  ])('%s', (_name, model, tag, expected) => {
    expect(reads(model, tag)).toEqual(expected)
  })

  it('takes a read-only Projection as well as a writable one', () => {
    const readOnly = Projection.struct({ todos: Application.model.todos })
    const model = { ...initial, todos, filter: 'x' }
    expect(Closure.reads(app, readOnly, model, { _tag: 'ClearedShown' })).toEqual(['filter'])
    expect(Closure.reads(app, readOnly, model, { _tag: 'Emptied' })).toEqual([])
  })

  it('works from a Model it must not change', () => {
    const frozen = Object.freeze({ ...initial, todos, filter: 'x' })
    expect(Closure.reads(app, projection, frozen, { _tag: 'ClearedShown' })).toEqual(['filter'])
  })
})
