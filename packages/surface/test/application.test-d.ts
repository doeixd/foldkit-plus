/**
 * `Surface.application` inference contract. Type-checked but not executed.
 */
import { Effect, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from '../src/index.js'

const Model = Schema.Struct({ count: Schema.Number })
const Message = defineMessageUnion({ Incremented: {} })
const App = Surface.application({
  Model,
  Message,
  initial: { count: 0 },
  update: model => ({ model }),
})

const _initial: { readonly count: number } = App.initial
const _field = App.model.count
const _value: number = Projection.pick(App.model.count).get({ count: 1 }).count

// References only: an agent-only application needs no `initial` or `update`.
const RefsOnly = Surface.application({ Model, Message })
const _refsOnlyKey: 'count' = RefsOnly.model.count.key

// An update whose Commands need a resource is accepted.
declare const serviceEffect: Effect.Effect<Schema.Schema.Type<typeof Message>, never, 'Service'>
const _runnable = Surface.application({
  Model,
  Message,
  initial: { count: 0 },
  update: () => ({
    model: { count: 1 },
    commands: [{ name: 'Load', effect: serviceEffect }],
  }),
})

// @ts-expect-error `missing` is not a Model field
App.model.missing

// @ts-expect-error the initial Model must match the Model schema
Surface.application({
  Model,
  Message,
  initial: { count: 'zero' },
  update: (model: { readonly count: number }) => ({ model }),
})

// Made runnable later: the update is typed by the application, and its
// resources carried through; an initial Model of another shape is refused.
const Later = RefsOnly.runnable({
  initial: { count: 0 },
  update: (model, message) => {
    const _incremented: { readonly _tag: 'Incremented' } = message
    return { model: { count: model.count + 1 } }
  },
})
const _laterInitial: { readonly count: number } = Later.initial
const _laterResources = RefsOnly.runnable<'Service'>({
  initial: { count: 0 },
  update: model => ({
    model,
    commands: [{ name: 'serviced', effect: serviceEffect }],
  }),
})
// @ts-expect-error the initial Model is the application's
RefsOnly.runnable({ initial: { total: 0 }, update: model => ({ model }) })
