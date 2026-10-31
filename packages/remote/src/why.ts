/**
 * `foldkit-remote/why`: development tools that say why a read shows what it
 * shows — every fact the Model holds about what the read reads, by typed
 * reference rather than by the store's marks (#248) — and what a query read
 * is. An entry of its own, so a page that never explains a read keeps none of
 * it (#378).
 */
import { Match, Option, Schema } from 'effect'
import { Query, type Dependencies } from 'foldkit-entity'
import type { ActiveSurface, Projection, SurfaceSource } from 'foldkit-surface'
import { askedOf, covers, resolvedOf } from './active.js'
import type { ModelOfDomain, QueryProjection, RemoteDomain } from './index.js'
import { innerOf } from './inner.js'
import type { QueryWindow } from './query.js'
import type { RemoteData } from './remoteData.js'
import { connectionsOf, RemoteConnections, type RelationRequirement } from './requirement.js'
import { failedReasons, reasonsOf } from './whyReasons.js'
import { readWhy, regressed, Why, type ReadStep, type ReadWhy } from './whyTerms.js'

export { ReadWhy, ShownBy, Why, WhyTerm, type ReadStep } from './whyTerms.js'

/** A query body's `Dependencies` as plain data: each field by its Entity's name and key. */
export interface ExplainedDependencies {
  readonly fields: ReadonlyArray<{ readonly entity: string; readonly key: string }>
  readonly inputs: Dependencies['inputs']
  readonly operations: Dependencies['operations']
  /** Each operator it calls, by its id and version. */
  readonly operators: ReadonlyArray<{ readonly id: string; readonly version: number }>
}

/**
 * What one query read is, and what it currently is — data-query-DESIGN §29.1.
 *
 * Every member is gathered from something that already existed: the read was
 * always this many pieces, and nothing had ever been asked to put them in one
 * place. It is plain serializable data, so a DevTools panel, a log line and a
 * test assert on the same value.
 *
 * Two members of §29.1's sketch are **not** here, and their absence is the
 * finding rather than an omission:
 *
 * - **Surface.** A Projection does not know which Surface reads it, and often
 *   several do — so it is not a property of the read, and `explain` cannot
 *   recover it alone. Given the active Surfaces (the same record
 *   `subscriptions` takes), it reports **every** Surface reading the connection
 *   rather than guessing one, and omits the member entirely when it was not
 *   given them.
 * - **Executor.** The thing that answers a query is a `RemoteClient` Layer in
 *   the runtime, not a value in the Model, and a pure read of the Model cannot
 *   see it. That is the same boundary that makes this function pure and
 *   replayable, so it is worth more than the line of text.
 *
 * And one that the design proposed and this does not want: *expectation*
 * (required versus optional). §11 left it unbuilt for want of a consumer, and
 * the explanation was the likeliest consumer. It turns out not to need it — a
 * query's result is a connection, so the shape is a `Page`, decided by the
 * definition rather than by the read. Nothing here has an opinion about whether
 * an empty one is an error, because nothing here has to have one.
 */
export interface QueryExplanation {
  /** The bound Remote domain that answers it. */
  readonly domain: string
  /** The definition's name. */
  readonly query: string
  /** The input as encoded, which is what the identity is built from. */
  readonly input: unknown
  /** The connection identity: definition plus canonical input, excluding the window. */
  readonly identity: string
  /** How much of the connection this read asks for. */
  readonly window: QueryWindow
  /** What it reads of each item, as the slice asked of the server. */
  readonly select: RelationRequirement
  /**
   * What the query means, as readable text — `Query.show`, and so neither SQL
   * nor whatever the backend compiled. Absent for a definition made with
   * `Query.make`, whose meaning lives on the server that answers it.
   */
  readonly body?: string | undefined
  /**
   * The fields, inputs and operations the body reads; absent with the body.
   * Plain data, so it serializes: a field is its Entity's name and key, which
   * is unambiguous because a query reads one Entity.
   */
  readonly dependencies?: ExplainedDependencies | undefined
  /** What the read answers from this Model right now. */
  readonly state: RemoteData<unknown>['_tag']
  /**
   * The active Surfaces reading this connection at this Model, if the active
   * record was supplied. Plural because several may, which is why a Projection
   * cannot carry the answer itself.
   */
  readonly surfaces?: ReadonlyArray<string> | undefined
  /**
   * Why each of those Surfaces is active, where it was placed with
   * `Surface.when` — the Model path and the tag, without running anything. A
   * Surface placed with `Surface.at` has no entry: a callback cannot be read.
   */
  readonly activation?:
    | ReadonlyArray<{
        readonly surface: string
        readonly path: readonly string[]
        readonly tag: string
      }>
    | undefined
}

/** A body's dependencies as an explanation carries them: without the owner identity, which holds a symbol. */
const explainedDependencies = (dependencies: Dependencies): ExplainedDependencies => ({
  fields: dependencies.fields.map(({ entity, key }) => ({ entity, key })),
  inputs: dependencies.inputs,
  operations: dependencies.operations,
  operators: dependencies.operators.map(({ id, version }) => ({ id, version })),
})

/** The active record a read is explained against: the one `subscriptions` takes. */
export interface ExplainOptions<AppModel> {
  readonly surfaces?:
    | Readonly<Record<string, ActiveSurface<AppModel> | SurfaceSource<AppModel>>>
    | undefined
}

type AnyDomain = RemoteDomain<any, any, any, any, any>

/**
 * What a query read is and what it currently is, as one serializable value —
 * data-query-DESIGN §29.1: the domain, the definition and its input, the
 * connection identity, the window, the Selection, the body as readable text
 * with what it depends on, and what the read answers from this Model.
 *
 * Pure, so a DevTools panel showing it shows something the Model can be
 * replayed to.
 *
 * Given `surfaces` — the same active record `subscriptions` takes — it also
 * reports which of them read this connection, and why each is active where
 * that is a readable fact (`Surface.when`) rather than a callback
 * (`Surface.at`). A Projection cannot carry this itself: several Surfaces may
 * read one connection, so it is not a property of the read.
 */
export const explain = <Domain extends AnyDomain, Name extends string, Input>(
  domain: Domain,
  model: ModelOfDomain<Domain>,
  projection: QueryProjection<ModelOfDomain<Domain>, any, Name, Input>,
  options?: ExplainOptions<ModelOfDomain<Domain>>,
): QueryExplanation => {
  const { ref } = projection
  // Which active Surfaces read this connection, asked of the Model rather
  // than of the projection: a Surface's projection is rebuilt per Model, so
  // the only honest comparison is by connection identity. A family names
  // each reading instance (`Grid[all]`), not just the Surface.
  const reading = Object.values(options?.surfaces ?? {}).flatMap(source => {
    const matched = resolvedOf(source, model).filter(({ projection: shown }) =>
      connectionsOf(shown).some(connection => connection.identity === ref.identity),
    )
    // An inactive Surface reads nothing, which is not the same as reading
    // something else.
    if (matched.length === 0) return []
    return [{ source, names: matched.map(({ name }) => name) }]
  })
  // The body lives on the descriptor, and a projection keeps only its
  // `QueryRef`, so the explanation looks the definition back up by name in
  // the domain that registered it.
  const body = domain.definition.registry.queries.get(ref.query)?.body
  const [connection] = RemoteConnections.get(projection.metadata)
  return {
    domain: domain.contract.name,
    query: ref.query,
    input: Schema.encodeSync(ref.Input)(ref.input),
    identity: ref.identity,
    window: ref.window,
    select: connection!.select,
    ...(body === undefined
      ? {}
      : {
          body: Query.show(body),
          dependencies: explainedDependencies(Query.dependencies(body)),
        }),
    state: projection.read(model)._tag,
    ...(options?.surfaces === undefined
      ? {}
      : {
          surfaces: reading.flatMap(read => read.names),
          activation: reading.flatMap(read => {
            const activation = 'activation' in read.source ? read.source.activation : undefined
            return activation === undefined ? [] : [{ surface: read.source.name, ...activation }]
          }),
        }),
  }
}

/**
 * Why a read shows what it shows. Any Remote read: `Data.get`, `Data.live`
 * or `Data.query`, or a projection made of them.
 *
 * `because` is every fact the Model holds about what it reads, as typed
 * references: a list or a row's fields missing, stale, in flight or
 * failed; a pending write showing a value, and which `where` term put a row
 * in a list or took it out. The reason that decides the state comes first,
 * and `message` says it, with what restarts it. For `Initial`, given
 * `surfaces` (the record `subscriptions` takes), it tells the two wiring
 * mistakes apart: no active Surface reads it, or one does and Remote's
 * Subscriptions are not running. Pure: it reads the Model and plans nothing.
 */
export const why = <Domain extends AnyDomain>(
  domain: Domain,
  model: ModelOfDomain<Domain>,
  projection: Projection<ModelOfDomain<Domain>, RemoteData<unknown>>,
  options?: ExplainOptions<ModelOfDomain<Domain>>,
): ReadWhy => {
  const data = projection.read(model)
  const asked = askedOf(projection)
  const entries = options?.surfaces === undefined ? [] : Object.values(options.surfaces)
  // Each active entry whose reads ask for all of this one: one that reads
  // part of it cannot be why it is fetched.
  const reading = entries.flatMap(entry => {
    const names = resolvedOf(entry, model)
      .filter(({ projection: shown }) => covers(askedOf(shown), asked))
      .map(({ name }) => name)
    return names.length === 0 ? [] : [{ entry, names }]
  })
  const surfaces =
    options?.surfaces === undefined
      ? Option.none()
      : Option.some(reading.flatMap(read => read.names))
  const initial: ReadonlyArray<Why> =
    data._tag !== 'Initial'
      ? []
      : [
          Option.match(surfaces, {
            onNone: () => Why.NoActiveRecord(),
            onSome: names =>
              names.length === 0 ? Why.NotObserved() : Why.NotFetching({ surfaces: names }),
          }),
        ]
  const live =
    asked.requirements.some(requirement => requirement.live === true) ||
    asked.connections.some(connection => connection.live === true)
  const streams: ReadonlyArray<Why> = live
    ? reading.flatMap(({ entry }): ReadonlyArray<Why> =>
        Match.valueTags(domain.liveStatus(model, entry), {
          Idle: () => [],
          Live: () => [],
          Reconnecting: ({ attempt, error }) => [
            Why.LiveReconnecting({ surface: entry.name, attempt, error }),
          ],
          Refused: ({ error }) => [Why.LiveRefused({ surface: entry.name, error })],
        }),
      )
    : []
  return readWhy(
    data._tag,
    [
      ...initial,
      ...failedReasons(data),
      ...reasonsOf(innerOf<ModelOfDomain<Domain>>(domain).why(model), asked),
      ...streams,
    ],
    surfaces,
  )
}

/**
 * Each change of each read's tag across a recorded history (the Messages
 * `update` handled, each with the Model it left, as Foldkit's devtools
 * records them), with the Message that made it and `why` at the Model it
 * changed to. `regression` marks a read that showed a value and stopped
 * with no reason a reader can see (#234).
 */
export const timeline = <Domain extends AnyDomain, Message>(
  domain: Domain,
  start: ModelOfDomain<Domain>,
  history: ReadonlyArray<{ readonly message: Message; readonly model: ModelOfDomain<Domain> }>,
  reads: Readonly<Record<string, Projection<ModelOfDomain<Domain>, RemoteData<unknown>>>>,
  options?: ExplainOptions<ModelOfDomain<Domain>>,
): ReadonlyArray<ReadStep<Message>> => {
  let before = start
  return history.flatMap((entry, index) => {
    const from = before
    before = entry.model
    return Object.entries(reads).flatMap(([read, projection]): ReadonlyArray<ReadStep<Message>> => {
      const was = projection.read(from)
      const is = projection.read(entry.model)
      if (was._tag === is._tag) return []
      return [
        {
          read,
          index,
          message: entry.message,
          from: was._tag,
          to: is._tag,
          why: why(domain, entry.model, projection, options),
          regression: regressed(was, is),
        },
      ]
    })
  })
}
