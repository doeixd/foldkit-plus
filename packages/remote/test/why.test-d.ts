import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Surface, type Projection } from 'foldkit-surface'
import { expectTypeOf } from 'vitest'
import { Remote, Why, type ReadStep, type ReadWhy } from '../src/index.js'

const Project = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Project] })
const project = Data.get(Entity.select(Project, { name: true }), 'p1')
declare const model: Model

expectTypeOf(Data.why(model, project)).toEqualTypeOf<ReadWhy>()

// Every reason is handled, or `match` says which is missing.
const words = Why.match(Data.why(model, project).because[0]!, {
  NotObserved: () => 'a',
  NotFetching: ({ surfaces }) => surfaces.join(),
  NoActiveRecord: () => 'a',
  List: ({ list }) => list.query,
  Fields: ({ row, fields }) => `${row.id}${fields.join()}`,
  ListFailed: ({ error }) => error.message,
  FieldsFailed: ({ error }) => error.message,
  Unavailable: ({ fields }) => fields.join(),
  Undecodable: ({ message }) => message,
  OverlayOnly: ({ message }) => message,
  Deleted: ({ row }) => row.entity,
  LiveReconnecting: ({ surface }) => surface,
  LiveRefused: ({ surface }) => surface,
  Pending: ({ by }) => by._tag,
  Joined: ({ terms }) => terms.map(term => term.truth).join(),
  Left: ({ terms }) => terms.map(term => term.term).join(),
})
expectTypeOf(words).toEqualTypeOf<string>()

// @ts-expect-error — `Left` is not handled.
Why.match(Data.why(model, project).because[0]!, {
  NotObserved: () => 'a',
  NotFetching: () => 'a',
  NoActiveRecord: () => 'a',
  List: () => 'a',
  Fields: () => 'a',
  ListFailed: () => 'a',
  FieldsFailed: () => 'a',
  Unavailable: () => 'a',
  Undecodable: () => 'a',
  OverlayOnly: () => 'a',
  Deleted: () => 'a',
  LiveReconnecting: () => 'a',
  LiveRefused: () => 'a',
  Pending: () => 'a',
  Joined: () => 'a',
})

// The timeline's Message is the history's.
type Clicked = { readonly _tag: 'Clicked' }
declare const history: ReadonlyArray<{ readonly message: Clicked; readonly model: Model }>
expectTypeOf(Data.timeline(model, history, { project })).toEqualTypeOf<
  ReadonlyArray<ReadStep<Clicked>>
>()

declare const count: Projection<Model, number>
// @ts-expect-error — a read of something other than RemoteData has no reasons.
Data.why(model, count)
// @ts-expect-error — the same, among a timeline's reads.
Data.timeline(model, history, { count })

type Other = { readonly other: true }
declare const elsewhere: Projection<
  Other,
  typeof project extends Projection<Model, infer V> ? V : never
>
// @ts-expect-error — a read of another application's Model.
Data.why(model, elsewhere)
declare const strayHistory: ReadonlyArray<{ readonly message: Clicked; readonly model: Other }>
// @ts-expect-error — a history of another application's Models.
Data.timeline(model, strayHistory, { project })
