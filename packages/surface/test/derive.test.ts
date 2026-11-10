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

  it('works out a sparse array of a new length again', () => {
    const lengths = Projection.derive([App.model.todos], (root: Model) => Array(root.todos.length))
    expect(lengths.read(model).length).toBe(1)
    const three = {
      ...model,
      todos: [...model.todos, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }],
    }
    expect(lengths.read(three).length).toBe(3)
  })

  describe('verify', () => {
    /** The selected todo's title, naming the todos alone: it reads the selection too. */
    const underNamed = (verify: boolean) =>
      Projection.derive(
        [App.model.todos],
        (root: Model) => root.todos.find(todo => todo.id === root.selectedTodoId)?.title ?? '',
        { verify },
      )
    const twoTodos: Model = {
      todos: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
      selectedTodoId: 'a',
    }
    const otherSelected = { ...twoTodos, selectedTodoId: 'b' }

    it('without it, a read `on` does not name shows what it read last', () => {
      const selected = underNamed(false)
      expect(selected.read(twoTodos)).toBe('A')
      expect(selected.read(otherSelected)).toBe('A')
    })

    it('throws where the memo would show what it read last, naming what `on` reads', () => {
      const selected = underNamed(true)
      expect(selected.read(twoTodos)).toBe('A')
      expect(() => selected.read(otherSelected)).toThrow(/nothing it names changed \(todos\)/)
    })

    it('hands back the memoized value where it agrees, working it out again to check', () => {
      let runs = 0
      const titles = Projection.derive(
        [App.model.todos],
        (root: Model) => {
          runs++
          return root.todos.map(todo => todo.title)
        },
        { verify: true },
      )
      const first = titles.read(model)
      expect(titles.read({ ...model, selectedTodoId: 'b' })).toBe(first)
      expect(runs).toBe(2)
    })
  })

  it('refuses to derive from nothing it names', () => {
    expect(() => Projection.derive([], () => 1)).toThrow(/names nothing it reads/)
  })

  // As a Remote read is: its data is named by its metadata, not by a path.
  const store = { count: 1 }
  const pathless = Projection.fromReader(Schema.Number, (_: Model) => store.count)

  it.each([
    ['alone', () => pathless],
    [
      'inside a struct beside a field',
      () => Projection.struct({ n: pathless, todos: App.model.todos }),
    ],
    [
      'picked by an of beside a field with a path',
      () =>
        Projection.of(ModelSchema)({
          todos: true,
          selectedTodoId: Projection.fromReader(
            Schema.NullOr(Schema.String),
            (id: string | null) => id,
            {
              dependencies: [['selectedTodoId']],
            },
          ),
        }),
    ],
    [
      'inside an array',
      () => Projection.array(Projection.struct({ n: pathless, id: App.model.selectedTodoId })),
    ],
    [
      'inside an option',
      () => Projection.option(Projection.struct({ n: pathless, id: App.model.selectedTodoId })),
    ],
    [
      'inside another derivation',
      () =>
        Projection.derive(
          [Projection.struct({ n: pathless, todos: App.model.todos })],
          (root: Model) => root,
        ),
    ],
  ])('works out on every read a value over a read no path names, %s', (_, reads) => {
    let runs = 0
    store.count = 1
    const counted = Projection.derive([reads(), App.model.todos], (root: Model) => {
      runs++
      return { count: store.count, todos: root.todos }
    })
    const first = counted.read(model)

    expect(counted.read(model)).toBe(first)
    store.count = 2
    expect(counted.read(model)).toEqual({ count: 2, todos: model.todos })
    store.count = 3
    expect(counted.read(model)).toEqual({ count: 3, todos: model.todos })
    expect(runs).toBe(4)
  })
})
