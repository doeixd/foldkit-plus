/**
 * Lists (#544, WP8): a Remote `Query` answered by a paged Domain Query. The
 * Domain Query decides which rows are listed and in what order; each listed
 * row is then read through its Entity's View, so a list never names a row
 * the View's `validate` hides, and every row it carries holds its revision.
 *
 *   edges   = the Domain page's entries, by `id`, less the rows their View hides
 *   entities = those rows as the View answers them, with what `select` asks
 *
 * Domain pages forward only (`after`, `take`), so a window from a list's end
 * (`last`, `before`) is refused. A Query has no watch: a live list is
 * invalidated as its stream starts, asked again whenever a row it holds
 * changes, and answers `ConnectionInvalidate` when what it lists moved.
 */
import type * as Domain from '@alchemy.run/domain'
import type { QueriesOf } from '@alchemy.run/domain/Api'
import { Duration, Effect, Match, Option, Schema, Stream, SubscriptionRef } from 'effect'
import {
  entityKey,
  queryIdentity,
  QueryRequest,
  RemoteLiveError,
  RemoteQueryError,
  RemoteUnauthenticated,
  RemoteUnreachable,
  type ConnectionSpec,
  type LiveEvent,
  type QueryDescriptor,
  type QueryResult,
} from 'foldkit-remote'
import type { Receipt } from '../index.js'
import type { AnyApi } from './binding.js'
import { failureOf, keyOf, readRows, type Codec, type Rows, type Snapshot } from './relations.js'

/** The Queries an Api serves that answer a page at a time. */
type PagedQueriesOf<A extends AnyApi> = Extract<
  QueriesOf<A>,
  { readonly definition: { readonly paged?: true } }
>

/** The name of a paged Query an Api serves. */
export type PagedQueryNameOf<A extends AnyApi> = PagedQueriesOf<A>['queryName']

/** The Query an Api serves under `Name`. */
export type DomainQueryOf<A extends AnyApi, Name extends PagedQueryNameOf<A>> = Extract<
  PagedQueriesOf<A>,
  { readonly queryName: Name }
>

/** A Remote query whose result is a list of one Entity's rows. */
export type AnyListQuery = QueryDescriptor<string, any, ConnectionSpec>

type InputOfQuery<D extends AnyListQuery> =
  D extends QueryDescriptor<string, infer Input, any> ? Input : never

/** One entry of a paged Domain Query's pages. */
export type EntryOf<Q extends Domain.Query.Any> =
  Domain.Query.ResultOf<Q> extends Domain.Query.Page<infer Row> ? Row : never

/** What `DomainRemote.query` takes besides the Remote query, the Api and the Domain Query's name. */
export interface QueryConfig<D extends AnyListQuery, Q extends Domain.Query.Any> {
  /** The Domain Query's input, from the Remote query's. */
  readonly input: (input: InputOfQuery<D>) => Domain.Query.InputOf<Q>
  /** The id of the row an entry of the Domain page lists. */
  readonly id: (entry: EntryOf<Q>) => string
}

/** A Remote query bound to the Domain Query that answers it. */
export interface QueryBinding<D extends AnyListQuery = AnyListQuery, A extends AnyApi = AnyApi> {
  readonly descriptor: D
  readonly api: A
  readonly query: PagedQueryNameOf<A>
  /** The Entity the list's rows are, which must have a View bound in the same layer. */
  readonly entity: string
  readonly input: (input: unknown) => unknown
  readonly id: (entry: unknown) => string
  readonly rejections: ReadonlyArray<Domain.Rejection.Any>
}

/**
 * Binds a Remote query to the paged Domain Query that answers it. Throws,
 * naming it, for a Query the Api does not serve or one that is not paged.
 */
export const query = <
  D extends AnyListQuery,
  A extends AnyApi,
  const Name extends PagedQueryNameOf<A>,
>(
  descriptor: D,
  api: A,
  name: Name,
  config: QueryConfig<D, DomainQueryOf<A, Name>>,
): QueryBinding<D, A> => {
  const served = api.serves.find(
    (each): each is Domain.Query.Any => each.kind === 'Query' && each.queryName === name,
  )
  if (served === undefined)
    throw new Error(`[foldkit-remote-domain] ${api.apiName} serves no Query named ${name}`)
  if (served.definition.paged !== true)
    throw new Error(
      `[foldkit-remote-domain] ${name} answers no pages, so it cannot answer ${descriptor.name}`,
    )
  return Object.freeze({
    descriptor,
    api,
    query: name,
    entity: descriptor.Result.entity,
    input: config.input as (input: unknown) => unknown,
    id: config.id as (entry: unknown) => string,
    rejections: served.definition.rejects ?? [],
  })
}

/** The longest cursor the adapter sends back to a Domain Query: the store chooses its encoding. */
export const MAX_CURSOR = 1024

/** What answering a list needs of the layer. */
export interface Lists extends Rows {
  readonly queries: ReadonlyMap<string, QueryBinding>
  readonly client: Readonly<Record<string, unknown>>
  readonly confirmWithin: Duration.Duration
  readonly principal: Effect.Effect<string | null>
  readonly watch: (entity: string, id: string) => Stream.Stream<Snapshot, unknown>
}

type Request = typeof QueryRequest.Type
type Result = typeof QueryResult.Type

interface Page {
  readonly entries: ReadonlyArray<unknown>
  readonly cursor: string | null
}

type QueryClient = (
  input: unknown,
  options: {
    readonly after?: string
    readonly take?: number
    readonly atLeast?: Receipt
  },
) => Effect.Effect<Page, unknown>

const refused = (message: string) => Effect.fail(new RemoteQueryError({ message }))

/** The request decoded and its window checked against what a Domain Query can page. */
const admitted = (lists: Lists, request: unknown) =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(QueryRequest)(request).pipe(
      Effect.mapError(() => new RemoteQueryError({ message: 'The query request did not decode' })),
    )
    const binding = lists.queries.get(decoded.query)
    if (binding === undefined) return yield* refused(`No Domain Query is bound to ${decoded.query}`)
    const { first, last, after, before } = decoded.window
    if (last !== undefined || before !== undefined)
      return yield* refused(
        `${binding.query} pages forward only: ${decoded.query} cannot be read from its end`,
      )
    // Domain answers a take below one with one row: asking for none is refused here instead.
    if (first !== undefined && first < 1)
      return yield* refused(`A page of ${decoded.query} must ask for at least one row`)
    if (after !== undefined && after.length > MAX_CURSOR)
      return yield* refused(`The cursor of ${decoded.query} is longer than ${MAX_CURSOR}`)
    const input = yield* Schema.decodeUnknownEffect(binding.descriptor.Input as Codec)(
      decoded.input,
    ).pipe(
      Effect.mapError(
        () => new RemoteQueryError({ message: `${decoded.query}'s input did not decode` }),
      ),
    )
    return { request: decoded, binding, input }
  })

/** What the page carries of `select`: nothing unasked, nothing of another Entity. */
const payloadOf = (
  asked: Request,
  entity: string,
  read: { readonly entities: Result['entities']; readonly settled: Result['settled'] },
) => {
  if (asked.select === undefined) return {}
  return asked.select.entity === entity
    ? { entities: read.entities, settled: read.settled }
    : { entities: [], settled: [] }
}

/**
 * One page of the list, at the receipt when one is given. A Domain Query that
 * does not answer within `confirmWithin` is unreachable.
 */
const page = (lists: Lists, request: unknown, atLeast: Option.Option<Receipt>) =>
  Effect.gen(function* () {
    const { request: asked, binding, input } = yield* admitted(lists, request)
    const { first, after } = asked.window
    const call = lists.client[binding.query] as QueryClient
    const answered = yield* call(binding.input(input), {
      ...(after === undefined ? {} : { after }),
      ...(first === undefined ? {} : { take: first }),
      ...Option.match(atLeast, { onNone: () => ({}), onSome: receipt => ({ atLeast: receipt }) }),
    }).pipe(
      Effect.timeoutOption(lists.confirmWithin),
      Effect.catch(error =>
        Match.valueTags(failureOf(binding.rejections)(error), {
          Rejected: () => refused(`${binding.query} refused who asks`),
          Behind: () => Effect.succeedNone,
          Unreachable: ({ message }) => Effect.fail(new RemoteUnreachable({ message })),
          Denied: () =>
            Effect.fail(new RemoteUnauthenticated({ message: 'The Domain Api refused who asks' })),
        }),
      ),
    )
    if (Option.isNone(answered))
      return yield* new RemoteUnreachable({ message: `${binding.query} did not answer in time` })
    const ids = [...new Set(answered.value.entries.map(binding.id))]
    const select = asked.select?.entity === binding.entity ? asked.select : undefined
    // Every listed row is read through its View, which alone says who sees it.
    const read = yield* readRows(
      lists,
      ids.map(id => ({ ...select, entity: binding.entity, id, fields: select?.fields ?? [] })),
      new Map(),
    ).pipe(Effect.mapError(({ message }) => new RemoteQueryError({ message })))
    const result: Result = {
      edges: ids
        .filter(id => !read.absent.has(keyOf(binding.entity, id)))
        .map(id => ({ entity: binding.entity, id, key: entityKey(binding.entity, id) })),
      start: after === undefined ? { _tag: 'Terminal' } : { _tag: 'Cursor', cursor: after },
      end:
        answered.value.cursor === null
          ? { _tag: 'Terminal' }
          : { _tag: 'Cursor', cursor: answered.value.cursor },
      ...payloadOf(asked, binding.entity, read),
      principal: yield* lists.principal,
    }
    return result
  })

/** A list's page, as `RemoteClient.query` answers it. */
export const answerQuery = (lists: Lists, request: Request) => page(lists, request, Option.none())

/**
 * The lists a write's answer carries (`MutationResult.lists`): each bound one
 * the request asks back, read at the write's receipt. One whose Query has not
 * caught up, or that fails, is left out, and the client asks for it again.
 */
export const answerLists = (
  lists: Lists,
  requests: ReadonlyArray<Request>,
  receipt: Receipt,
): Effect.Effect<ReadonlyArray<{ readonly request: Request; readonly result: Result }>> =>
  Effect.map(
    Effect.forEach(requests, request =>
      page(lists, request, Option.some(receipt)).pipe(
        Effect.option,
        Effect.map(result => Option.toArray(Option.map(result, result => ({ request, result })))),
      ),
    ),
    answered => answered.flat(),
  )

/** A list's failure as a live stream's: a refusal or no answer ends the stream with `RemoteLiveError`. */
const asLive = <A, R>(
  effect: Effect.Effect<
    A,
    RemoteQueryError | RemoteUnreachable | RemoteUnauthenticated | RemoteLiveError,
    R
  >,
): Effect.Effect<A, RemoteLiveError | RemoteUnauthenticated, R> =>
  effect.pipe(
    Effect.catchTag('RemoteQueryError', ({ message }) =>
      Effect.fail(new RemoteLiveError({ message })),
    ),
    Effect.catchTag('Unreachable', ({ message }) => Effect.fail(new RemoteLiveError({ message }))),
  )

const sameIds = (left: ReadonlyArray<string>, right: ReadonlyArray<string>) =>
  left.length === right.length && left.every((id, index) => id === right[index])

/**
 * A list read live: `ConnectionInvalidate` once as the stream starts, then
 * asked again whenever a row it lists changes, and `ConnectionInvalidate` when
 * what it lists moved, so the client reads it again. The first is for what
 * moved before the stream opened: the client's list may be a server render's,
 * or one read before a break, and Remote's restart re-reads its rows, not its
 * lists. After that, a row that joins the list without a change to a row it
 * holds is not seen until the list is read again: a Domain Query has no watch.
 */
export const liveQuery = (
  lists: Lists,
  request: Request,
  next: Effect.Effect<number>,
): Stream.Stream<LiveEvent, RemoteLiveError | RemoteUnauthenticated> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const { binding } = yield* admitted(lists, request)
      // Only what it lists is compared: the rows' fields reach the page through their own reads.
      const { select: _selected, ...bare } = request
      const listed = asLive(
        Effect.map(answerQuery(lists, bare), result => result.edges.map(edge => edge.id)),
      )
      const held = yield* SubscriptionRef.make(yield* listed)
      const connection = queryIdentity(request.query, request.input)
      const invalidate = Effect.map(next, (cursor): LiveEvent => ({
        _tag: 'ConnectionInvalidate',
        connection,
        cursor,
      }))
      // A frame of any listed row, after the first each watch sends of the row as it is.
      const changed = SubscriptionRef.changes(held).pipe(
        Stream.switchMap(ids =>
          Stream.mergeAll(
            ids.map(id =>
              lists.watch(binding.entity, id).pipe(
                Stream.drop(1),
                Stream.as(undefined),
                Stream.catch(error =>
                  Match.valueTags(failureOf(lists.views.get(binding.entity)!.rejections)(error), {
                    // Its View stopped letting who asks see it: the list moved.
                    Rejected: () => Stream.make(undefined),
                    Behind: ({ message }) => Stream.fail(new RemoteLiveError({ message })),
                    Unreachable: ({ message }) => Stream.fail(new RemoteLiveError({ message })),
                    Denied: () =>
                      Stream.fail(
                        new RemoteUnauthenticated({ message: 'The Domain Api refused who asks' }),
                      ),
                  }),
                ),
              ),
            ),
            { concurrency: 'unbounded' },
          ),
        ),
      )
      const moved = changed.pipe(
        Stream.mapEffect(() =>
          Effect.gen(function* () {
            const ids = yield* listed
            if (sameIds(ids, yield* SubscriptionRef.get(held))) return Option.none<LiveEvent>()
            yield* SubscriptionRef.set(held, ids)
            return Option.some(yield* invalidate)
          }),
        ),
        Stream.flatMap(event => Stream.fromIterable(Option.toArray(event))),
      )
      return Stream.concat(Stream.fromEffect(invalidate), moved)
    }).pipe(asLive),
  )
