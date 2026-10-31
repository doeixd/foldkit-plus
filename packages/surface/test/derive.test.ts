import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Projection } from '../src/index.js'
import { App, Model as ModelSchema } from './todoFixture.js'

type Model = typeof ModelSchema.Type

const model: Model = { todos: [{ id: 'a', title: 'A' }], selectedTodoId: 'a' }

/** A derivation over the todos alone, counting how often it is worked out. */
const counted = () => {
  let runs = 0
  const titles = Projection.derive([App.model.todos], (root: Model) => {
    runs++
    return root.todos.map(todo => todo.title)
  })
  return { titles, runs: () => runs }
}

describe('Projection.derive', () => {
  it('declares the paths it reads', () => {
    const both = Projection.derive(
      [App.model.todos, Projection.struct({ id: App.model.selectedTodoId })],
      (root: Model) => root,
    )
    expect(both.dependencies).toEqual([['todos'], ['selectedTodoId']])
  })

  it('is not worked out again while every path it reads holds the same object', () => {
    const { titles, runs } = counted()
    const first = titles.read(model)
    const elsewhere = { ...model, selectedTodoId: 'b' }

    expect(titles.read(elsewhere)).toBe(first)
    expect(titles.read({ ...elsewhere })).toBe(first)
    expect(runs()).toBe(1)
  })

  it('is worked out again each time a path it reads holds a new object', () => {
    const { titles, runs } = counted()
    titles.read(model)
    const added = { ...model, todos: [...model.todos, { id: 'b', title: 'B' }] }
    const renamed = { ...added, todos: [{ id: 'a', title: 'Z' }] }

    expect(titles.read(added)).toEqual(['A', 'B'])
    expect(titles.read(renamed)).toEqual(['Z'])
    expect(runs()).toBe(3)
  })

  it('gives the last value back when a new one holds the same fields', () => {
    const { titles, runs } = counted()
    const first = titles.read(model)
    const copied = { ...model, todos: [{ id: 'a', title: 'A' }] }

    expect(titles.read(copied)).toBe(first)
    expect(runs()).toBe(2)
  })

  it('refuses to derive from what it could not notice change', () => {
    // As a Remote read is: its data is named by its metadata, not by a path.
    const pathless = Projection.fromReader(Schema.Number, (root: Model) => root.todos.length)

    expect(() => Projection.derive([], () => 1)).toThrow(/declares no Model paths/)
    expect(() => Projection.derive([App.model.todos, pathless], pathless.read)).toThrow(
      /name its store's field/,
    )
  })
})
