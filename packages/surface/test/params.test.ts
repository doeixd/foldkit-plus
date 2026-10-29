import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Projection, Surface } from '../src/index.js'
import { App, Model } from './todoFixture.js'

const root: typeof Model.Type = { todos: [{ id: 't1', title: 'Read' }], selectedTodoId: null }

const Board = App.surface('Board', {
  model: ({ model }) => ({ todos: model.todos }),
})

const Card = App.surface('Card', {
  params: { id: Schema.String },
  model: ({ params }) => ({
    id: Projection.fromReader(Schema.String, () => params.id, { dependencies: [] }),
  }),
})

const Maybe = Surface.make(App, 'Maybe', {
  Params: Schema.UndefinedOr(Schema.String),
  model: ({ params }) =>
    Projection.fromReader(Schema.String, () => params ?? 'none', { dependencies: [] }),
})

describe('a Surface read without the params it declares (#268)', () => {
  it('is refused by name, not by a TypeError from inside its model', () => {
    // @ts-expect-error: the untyped caller this refusal is for
    expect(() => Surface.read(Card, root)).toThrow(
      'Surface "Card" declares params, and was given none',
    )
    // @ts-expect-error: as above
    expect(() => Surface.contract(Card)).toThrow('Surface "Card" declares params')
  })

  it('reads a Surface with params when given them', () => {
    expect(Surface.read(Card, root, { id: 't1' })).toEqual({ id: 't1' })
  })

  it('reads a Surface without params, given none', () => {
    expect(Surface.read(Board, root)).toEqual({ todos: root.todos })
  })

  it('reads a Surface whose params may be undefined, given none', () => {
    expect(Surface.read(Maybe, root)).toBe('none')
  })
})
