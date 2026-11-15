import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Module, Projection, Surface } from '../src/index.js'
import { App, Model as ModelSchema, TodoSchema } from './todoFixture.js'

type Model = typeof ModelSchema.Type

const model: Model = { todos: [{ id: 'a', title: 'A' }], selectedTodoId: 'a' }

const counted = () => {
  let runs = 0
  const titles = Projection.derive(
    [App.model.todos],
    (root: Model) => {
      runs++
      return root.todos.map(todo => todo.title)
    },
    { Model: Schema.Array(Schema.String) },
  )
  return { titles, runs: () => runs }
}

describe('a Derived in Projection.struct', () => {
  it('reads the memoized value, and works it out again only when its paths change', () => {
    const { titles, runs } = counted()
    const board = Projection.struct({ titles, selected: App.model.selectedTodoId })

    const first = board.read(model)
    expect(first).toEqual({ titles: ['A'], selected: 'a' })
    // Two transitions that leave `todos` alone: the memo hits both times.
    const second = board.read({ ...model, selectedTodoId: 'b' })
    const third = board.read({ ...model, selectedTodoId: null })
    expect(second.titles).toBe(first.titles)
    expect(third.titles).toBe(first.titles)
    expect(runs()).toBe(1)

    const added = board.read({ ...model, todos: [...model.todos, { id: 'b', title: 'B' }] })
    expect(added.titles).toEqual(['A', 'B'])
    expect(runs()).toBe(2)
  })

  it('declares the Derived’s paths and plans nothing for it', () => {
    const { titles } = counted()
    const board = Projection.struct({ titles })
    expect(board.dependencies).toEqual([['todos']])
    expect(board.metadata).toEqual(Projection.struct({ id: App.model.selectedTodoId }).metadata)
  })

  it('carries the Derived’s Schema as the struct’s Model', () => {
    const { titles } = counted()
    const board = Projection.struct({ titles })
    expect(Schema.is(board.Model)({ titles: ['A'] })).toBe(true)
    expect(Schema.is(board.Model)({ titles: [1] })).toBe(false)
  })

  it('keeps a read no path names from being skipped', () => {
    let runs = 0
    const pathless = Projection.fromReader(Schema.Number, () => 1)
    const unnamed = Projection.derive(
      [pathless, App.model.selectedTodoId],
      () => {
        runs++
        return 1
      },
      { Model: Schema.Number },
    )
    const board = Projection.struct({ unnamed })
    const outer = Projection.derive([board], (root: Model) => board.read(root))
    outer.read(model)
    outer.read(model)
    expect(runs).toBe(2)
  })

  it('refuses a Derived with no Model at run time', () => {
    const bare = Projection.derive([App.model.todos], (root: Model) => root.todos.length)
    expect(() => Projection.struct({ bare: bare as never })).toThrow(/Model/)
  })

  it('is a Surface that a Module validates', () => {
    const { titles } = counted()
    const Board = Surface.make(App, 'Board', {
      model: () => Projection.struct({ titles, todos: App.model.todos }),
      messages: [],
    })
    expect(Module.validate(Module.make(App, [Board]))).toEqual([])
    expect(
      Schema.is(Board.projection(undefined).Model)({
        titles: [],
        todos: [TodoSchema.make({ id: 'a', title: 'A' })],
      }),
    ).toBe(true)
  })
})
