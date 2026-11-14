import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Closure, ClosureViolation, Surface } from '../src/index.js'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.String),
  filter: Schema.String,
  tally: Schema.Number,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ClearedShown: {},
  Emptied: {},
  Sneaked: {},
  Counted: {},
})
type Message = typeof Message.Type
const initial: Model = { todos: [], filter: 'all', tally: 0 }

const update = (model: Model, message: Message): { readonly model: Model } => ({
  model: Message.match(message, {
    // Reads the local `filter` to decide what to remove.
    ClearedShown: () => ({ ...model, todos: model.todos.filter(todo => todo !== model.filter) }),
    Emptied: () => ({ ...model, todos: [] }),
    // Outside the Surface's set, yet writes its slice.
    Sneaked: () => ({ ...model, todos: [...model.todos, 'sneaked'] }),
    Counted: () => ({ ...model, tally: model.tally + 1 }),
  }),
})

const App = Surface.application({ Model, Message, initial, update })
const shown = (closed: boolean) =>
  App.surface('Shown', {
    model: ({ model }) => ({ todos: model.todos }),
    messages: [Message.ClearedShown, Message.Emptied],
    closed,
  })

const violations = (surface: ReturnType<typeof shown>, model: Model, message: Message) =>
  Closure.violations(App, [surface])(model, message, update(model, message).model)

const model: Model = { todos: ['a', 'x'], filter: 'x', tally: 0 }

describe('Closure.violations', () => {
  it.each([
    [
      'a Message in the set that reads outside the Surface, naming the field',
      model,
      Message.ClearedShown(),
      [ClosureViolation.Reads({ surface: 'Shown', fields: ['filter'] })],
    ],
    [
      'a Message outside the set that changes the projection',
      model,
      Message.Sneaked(),
      [ClosureViolation.Outside({ surface: 'Shown' })],
    ],
    ['nothing for a Message in the set that reads only the Surface', model, Message.Emptied(), []],
    [
      'nothing for a Message outside the set that leaves the projection alone',
      model,
      Message.Counted(),
      [],
    ],
    [
      'nothing when the outside field is at its initial value',
      { ...model, filter: 'all' },
      Message.ClearedShown(),
      [],
    ],
  ])('finds %s', (_name, from, message, expected) => {
    expect(violations(shown(true), from, message)).toEqual(expected)
  })

  it('never tests a Surface not declared closed', () => {
    const open = shown(false)
    expect(violations(open, model, Message.ClearedShown())).toEqual([])
    expect(violations(open, model, Message.Sneaked())).toEqual([])
  })

  it('reports each closed Surface the step broke, and only those', () => {
    const calm = App.surface('Calm', {
      model: ({ model }) => ({ tally: model.tally }),
      messages: [Message.Counted],
      closed: true,
    })
    const check = Closure.violations(App, [shown(true), calm])
    const sneaked = Message.Sneaked()
    const named = check(model, sneaked, update(model, sneaked).model).map(
      ClosureViolation.$match({
        Reads: ({ surface, fields }) => `${surface} reads ${fields.join(', ')}`,
        Outside: ({ surface }) => `${surface} moved by a Message outside it`,
      }),
    )
    expect(named).toEqual(['Shown moved by a Message outside it'])
  })

  it('refuses a closed Surface with params, which has no one projection', () => {
    const byKey = App.surface('ByKey', {
      params: { key: Schema.String },
      model: ({ model }) => ({ todos: model.todos }),
      closed: true,
    })
    expect(() => Closure.violations(App, [byKey])).toThrow('declares params')
  })

  it('takes Surfaces of the application’s Model only', () => {
    const other = {
      initial: { count: 0 },
      update: (model: { readonly count: number }) => ({ model }),
    }
    // @ts-expect-error `Shown` reads another Model
    expect(() => Closure.violations(other, [shown(true)])).not.toThrow()
  })

  it('carries the flag on the Surface and its contract', () => {
    expect(shown(true).closed).toBe(true)
    expect(shown(false).closed).toBe(false)
    expect(Surface.contract(shown(true)).closed).toBe(true)
    expect('closed' in Surface.contract(shown(false))).toBe(false)
  })
})
