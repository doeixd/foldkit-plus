/**
 * #481: what TypeScript already refuses at an async boundary, for each of the
 * three async values a Foldkit Plus application meets: Remote's `RemoteData`,
 * Foldkit's `AsyncData` and Effect's `AsyncResult`. Each `@ts-expect-error`
 * carries one defect, so an unused directive means that check failed open.
 * The design note `docs/design/481-async-composition-DESIGN.md` cites the
 * lines here.
 */
import { Cause, Option, pipe, Schema } from 'effect'
import { AsyncResult } from 'effect/reactivity'
import * as AsyncData from 'foldkit/asyncData'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { Entity, Freshness, Remote, RemoteData, type RemoteError } from '../src/index.js'

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

declare const data: RemoteData<number>

// ===========================================================================
// RemoteData.match: six cases, each required, none extra
// ===========================================================================

// @ts-expect-error `NotFound` is a required case (TS2741 names it)
RemoteData.match(data, {
  Initial: () => 0,
  Loading: () => 0,
  Ready: value => value,
  Refreshing: value => value,
  Failed: () => 0,
})

// @ts-expect-error `Ready` is a required case
RemoteData.match(data, {
  Initial: () => 0,
  Loading: () => 0,
  Refreshing: value => value,
  Failed: () => 0,
  NotFound: () => 0,
})

RemoteData.match(data, {
  Initial: () => 0,
  Loading: () => 0,
  Ready: value => value,
  Refreshing: value => value,
  Failed: () => 0,
  NotFound: () => 0,
  // @ts-expect-error a case the union does not have (TS2353)
  Stale: () => 0,
})

// A failed read hands its last value as an Option: there may be none.
RemoteData.match(data, {
  Initial: () => 0,
  Loading: () => 0,
  Ready: value => value,
  Refreshing: value => value,
  // @ts-expect-error `previous` is `Option<number>`, not a number
  Failed: (_error, previous): number => previous,
  NotFound: () => 0,
})

// Arms share one result type, inferred from the first; pin `R` to mix them.
RemoteData.match(data, {
  Initial: () => 0,
  // @ts-expect-error a second result type is not unioned in
  Loading: () => 'loading',
  Ready: value => value,
  Refreshing: value => value,
  Failed: () => 0,
  NotFound: () => 0,
})
const _mixed: number | string = RemoteData.match<number, number | string>(data, {
  Initial: () => 0,
  Loading: () => 'loading',
  Ready: value => value,
  Refreshing: value => value,
  Failed: () => 0,
  NotFound: () => 0,
})

// ===========================================================================
// RemoteData.render: four branches, the held value with its Freshness
// ===========================================================================

// @ts-expect-error `notFound` is required: an absent row is neither loading nor failed
RemoteData.render(data, {
  loading: () => 0,
  failed: () => 0,
  data: value => value,
})

// @ts-expect-error `failed` is required: a failure with nothing held must be drawn
RemoteData.render(data, {
  loading: () => 0,
  notFound: () => 0,
  data: value => value,
})

// Stale-while-refreshing and stale-on-failure reach `data`, told apart by Freshness.
RemoteData.render(data, {
  loading: () => '',
  notFound: () => '',
  failed: (error: RemoteError) => error.message,
  data: (value, freshness) =>
    // @ts-expect-error `Stale` is a required Freshness case, so a stale value cannot pass as fresh
    Freshness.match(freshness, {
      Fresh: () => `${value}`,
      Refreshing: () => `${value}…`,
    }),
})

// ===========================================================================
// No value before Ready
// ===========================================================================

// @ts-expect-error `value` is not on the union: Initial, Loading, Failed and NotFound have none
void data.value

// @ts-expect-error a failed read's raw `previous` is `number | undefined`
const _previous: number = (data as Extract<RemoteData<number>, { _tag: 'Failed' }>).previous

if (data._tag === 'Ready') {
  const _ready: number = data.value
}
if (data._tag === 'Refreshing') {
  const _held: number = data.value
}
// @ts-expect-error a misspelt tag on the closed union is TS2367
if (data._tag === 'Redy') void 0

// Outside the proof: a ternary over the tag and a cast both compile. `pnpm
// tags:check` refuses the ternary in packages' and examples' `src`; nothing
// refuses the cast.
const _ternary = data._tag === 'Ready' ? data.value : 0
const _cast = (data as { readonly value: number }).value

// ===========================================================================
// RemoteData.map keeps the state and the error; it changes only the value
// ===========================================================================

const _mapped: Equals<ReturnType<typeof RemoteData.map<number, string>>, RemoteData<string>> = true

// ===========================================================================
// A Remote read through a Surface, then through `pipe`
// ===========================================================================

const Project = Entity.make('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Model = Schema.Struct({ filter: Schema.String, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Project] })
const project = Data.get(Project.select({ name: true }), 'p1')

const Card = App.surface('Card', {
  model: () => ({ project, filter: App.model.filter }),
})
declare const model: Model
const read = Card.projection(undefined).read(model)

// The Surface keeps the read's whole union, not its value.
const _surfaceRead: Equals<typeof read.project, RemoteData<{ readonly name: string }>> = true

const label = pipe(
  read.project,
  card => RemoteData.map(card, ({ name }) => name),
  name => RemoteData.map(name, text => text.length),
)
const _piped: Equals<typeof label, RemoteData<number>> = true

// The data-first `map` is not curried: inside `pipe` it is called from a lambda.
pipe(
  read.project,
  // @ts-expect-error `RemoteData.map` takes the value first
  RemoteData.map(({ name }: { readonly name: string }) => name),
)

// ===========================================================================
// Owners: what a read's type can and cannot tell apart
// ===========================================================================

const OtherModel = Schema.Struct({ elsewhere: Remote.Model })
const OtherApp = Surface.application({
  Model: OtherModel,
  Message: defineMessageUnion({ ...Remote.messages }),
})
const OtherData = Remote.make({ model: OtherApp.model.elsewhere, entities: [Project] })
const elsewhere = OtherData.get(Project.select({ name: true }), 'p1')

// @ts-expect-error a read of another application's Model cannot join this one's struct
Projection.struct({ project, elsewhere })

App.surface('Stray', {
  // @ts-expect-error a Surface reads its own application's Model, not another's
  model: () => ({ elsewhere }),
})

// Roots are compared structurally: a read of a Model this one extends joins it.
const NarrowModel = Schema.Struct({ remote: Remote.Model })
const NarrowApp = Surface.application({ Model: NarrowModel, Message })
const narrow = Remote.make({ model: NarrowApp.model.remote, entities: [Project] }).get(
  Project.select({ name: true }),
  'p1',
)
Projection.struct({ project, narrow })

// Two bindings over one application Model make reads of one type: which
// binding planned a read is not in its type.
const TwinModel = Schema.Struct({ a: Remote.Model, b: Remote.Model })
const Twin = Surface.application({ Model: TwinModel, Message })
const fromA = Remote.make({ model: Twin.model.a, entities: [Project] }).get(
  Project.select({ name: true }),
  'p1',
)
const fromB = Remote.make({ model: Twin.model.b, entities: [Project] }).get(
  Project.select({ name: true }),
  'p1',
)
const _twins: Equals<typeof fromA, typeof fromB> = true

// ===========================================================================
// Foldkit's AsyncData.match: the same guarantees, with typed `E`
// ===========================================================================

declare const notes: AsyncData.AsyncData<ReadonlyArray<string>, 'Offline'>

// @ts-expect-error `onStale` is required: a failure over held data is its own case
AsyncData.match(notes, {
  onIdle: () => 0,
  onLoading: () => 0,
  onRefreshing: rows => rows.length,
  onFailure: () => 0,
  onSuccess: rows => rows.length,
})

AsyncData.match(notes, {
  onIdle: () => 0,
  onLoading: () => 0,
  onRefreshing: rows => rows.length,
  onFailure: () => 0,
  onStale: ({ data: rows }) => rows.length,
  onSuccess: rows => rows.length,
  // @ts-expect-error a case the union does not have
  onNotFound: () => 0,
})

// Each arm has its own result type, unioned.
const _arms: number | string = AsyncData.match(notes, {
  onIdle: () => 'idle',
  onLoading: () => 0,
  onRefreshing: rows => rows.length,
  onFailure: (error: 'Offline') => error,
  onStale: ({ data: rows }) => rows.length,
  onSuccess: rows => rows.length,
})

// @ts-expect-error `data` is not on the union
void notes.data

// ===========================================================================
// Effect's AsyncResult.builder: `exhaustive` exists only once every case is handled
// ===========================================================================

declare const result: AsyncResult.AsyncResult<number, 'Offline'>

AsyncResult.builder(result)
  .onInitial(() => 0)
  .onSuccess(value => value)
  .onFailure((cause: Cause.Cause<'Offline'>) => (Cause.hasDies(cause) ? 1 : 2))
  .exhaustive()

AsyncResult.builder(result)
  .onInitial(() => 0)
  .onSuccess(value => value)
  .onError(() => 0)
  .onDefect(() => 0)
  .onInterrupt(() => 0)
  .exhaustive()

AsyncResult.builder(result)
  .onInitial(() => 0)
  .onSuccess(value => value)
  .onError(() => 0)
  .onDefect(() => 0)
  // @ts-expect-error an interruption is still unhandled (TS2339; the case shows only in `Builder<…, Interrupt>`)
  .exhaustive()

AsyncResult.builder(result)
  .onInitial(() => 0)
  .onSuccess(value => value)
  .onError(() => 0)
  .onInterrupt(() => 0)
  // @ts-expect-error a defect is still unhandled
  .exhaustive()

AsyncResult.builder(result)
  .onSuccess(value => value)
  .onFailure(() => 0)
  // @ts-expect-error `Initial` is still unhandled
  .exhaustive()

// `render` is the non-exhaustive way out: what is unhandled draws `null`.
const _partial: number | null = AsyncResult.builder(result)
  .onSuccess(value => value)
  .render()

// Its value is an Option before success, never a bare read.
const _value: Option.Option<number> = AsyncResult.value(result)
