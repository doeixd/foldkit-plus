import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Projection, Surface } from '../src/index.js'
import { App, Message } from './todoFixture.js'
const Board = App.surface('Board', {
  model: ({ model }) => Projection.struct({ todos: model.todos }),
  messages: [],
})

const Card = App.surface('Card', {
  params: { id: Schema.String },
  model: ({ model, params }) => ({
    todo: model.todos,
    // The instance's own identity, so a test reads which params it got.
    id: Projection.fromReader(Schema.String, () => params.id, { dependencies: [] }),
  }),
  messages: [Message.RenamedTodo],
})

const root = {
  todos: [
    { id: 't1', title: 'one' },
    { id: 't2', title: 'two' },
  ],
  selectedTodoId: null,
}

const boardAt = Surface.at(Board, undefined)

const cardsOf = (from: typeof boardAt) =>
  Surface.each(Card, {
    from,
    instances: ({ todos }) => todos.map(todo => ({ key: todo.id, params: { id: todo.id } })),
  })

describe('Surface.each', () => {
  it('resolves one keyed instance per item, each reading its own params', () => {
    const instances = Surface.instances(cardsOf(boardAt), root)
    expect(instances.map(instance => instance.key)).toEqual(['t1', 't2'])
    expect(instances.map(instance => instance.projection.read(root))).toEqual([
      { todo: root.todos, id: 't1' },
      { todo: root.todos, id: 't2' },
    ])
    for (const instance of instances) {
      expect(instance.surface).toBe(Card)
      expect(instance.params).toEqual({ id: instance.key })
    }
  })

  it('follows the parent Model: fewer todos, fewer instances', () => {
    const family = cardsOf(boardAt)
    const one = { ...root, todos: root.todos.slice(0, 1) }
    expect(Surface.instances(family, one).map(instance => instance.key)).toEqual(['t1'])
    expect(Surface.instances(family, { ...root, todos: [] })).toEqual([])
  })

  it('resolves none while the parent is inactive, without asking for instances', () => {
    const off = Surface.at(Board, () => Option.none())
    const family = Surface.each(Card, {
      from: off,
      instances: () => {
        throw new Error('must not run while the parent is inactive')
      },
    })
    expect(Surface.instances(family, root)).toEqual([])
  })

  it('refuses duplicate keys: two instances cannot share an identity', () => {
    const family = Surface.each(Card, {
      from: boardAt,
      instances: () => [
        { key: 't1', params: { id: 't1' } },
        { key: 't1', params: { id: 't2' } },
      ],
    })
    expect(() => Surface.instances(family, root)).toThrow('two instances keyed "t1"')
  })

  it('refuses an empty key and "__proto__"', () => {
    for (const key of ['', '__proto__']) {
      const family = Surface.each(Card, {
        from: boardAt,
        instances: () => [{ key, params: { id: 't1' } }],
      })
      expect(() => Surface.instances(family, root)).toThrow()
    }
  })

  it('names itself after the child, with the child owner and message tags', () => {
    const family = cardsOf(boardAt)
    expect(family.name).toBe('Card')
    expect(family.owner).toBe(App.owner)
    expect(family.child).toBe(Card)
    expect(family.from).toBe(boardAt)
    expect(family.messages).toEqual(['RenamedTodo'])
  })
})

describe('Surface.at as a source', () => {
  it('resolves its lone instance keyed by Surface name', () => {
    const instances = Surface.instances(boardAt, root)
    expect(instances).toHaveLength(1)
    expect(instances.map(instance => instance.key)).toEqual(['Board'])
    expect(instances[0]!.surface).toBe(Board)
    expect(instances[0]!.projection.read(root)).toEqual({ todos: root.todos })
  })

  it('resolves none while inactive', () => {
    expect(
      Surface.instances(
        Surface.at(Board, () => Option.none()),
        root,
      ),
    ).toEqual([])
  })
})

describe('Surface.when as a source', () => {
  const Lamp = App.surface('Lamp', {
    model: ({ model }) => Projection.struct({ todos: model.todos }),
    messages: [],
  })
  // A tagged value beside the Model standing in for a route.
  const lampPlace = {
    dependency: ['mode'],
    get: (root: unknown) => (root as { readonly mode?: unknown }).mode,
  }
  const LampOn = Surface.when(Lamp, lampPlace, Message.CreatedTodo, () => undefined)
  const lit = (mode: unknown) => ({ ...root, mode })

  it('records where the tag lives, and resolves its lone instance on the tag', () => {
    expect(LampOn.activation).toEqual({ path: ['mode'], tag: 'CreatedTodo' })
    const instances = Surface.instances(
      LampOn,
      lit(Message.CreatedTodo({ id: 't1', title: 'one' })),
    )
    expect(instances).toHaveLength(1)
    expect(instances[0]!.key).toBe('Lamp')
    expect(instances[0]!.surface).toBe(Lamp)
  })

  it('resolves none on another tag', () => {
    expect(Surface.instances(LampOn, lit(Message.RenamedTodo({ id: 't1', title: 'one' })))).toEqual(
      [],
    )
  })
})
