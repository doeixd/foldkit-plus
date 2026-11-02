/**
 * Which reads a server may share between whoever asks, and the tags a store
 * keeps them under (#428).
 *
 * A read is public only where the server can prove nothing about it depends
 * on who asks: every source it passes through has no `authorize`, no
 * `filter`, no `visible` rule (a guard's, a binding's, `memory`'s
 * `readable`) and no member answered per viewer, and every one declares how
 * long it stays fresh. Those rules are functions of the principal this
 * module cannot read, so it does not try: a source with one is private,
 * even where its rule happens to read only the row. A public read is then
 * answered as the visitor, whoever asks, so even a source's own `read` that
 * looks at the principal gives everyone one answer, never someone's own.
 */
import { Effect, Option, Schema } from 'effect'
import {
  CachedRead,
  MutationResult,
  PageReads,
  QueryResult,
  ReadBatchResult,
  listTag,
  rowTag,
  shorterPolicy,
  type CachePolicy,
  type ReadBatch,
  type QueryRequest,
  type RelationRequirement,
  type RemoteRpcClient,
} from 'foldkit-remote'
import type { EntitySource, ServerDefinition } from './index.js'

type Batch = Schema.Schema.Type<typeof ReadBatch>
type QueryAsked = Schema.Schema.Type<typeof QueryRequest>

/** A source's freshness, where nothing it runs is a rule about who asks. */
const sourcePolicy = <P, R>(source: EntitySource<P, R> | undefined): Option.Option<CachePolicy> =>
  source === undefined ||
  source.authorize !== undefined ||
  source.filter !== undefined ||
  source.visible !== undefined ||
  (source.perViewer ?? []).length > 0
    ? Option.none()
    : Option.fromUndefinedOr(source.cache)

/** Two policies' shorter, none when either is none. */
const both = (a: Option.Option<CachePolicy>, b: Option.Option<CachePolicy>) =>
  Option.flatMap(a, left => Option.map(b, right => shorterPolicy(left, right)))

/** A slice's policy: its entity's, and every relation's it reaches. */
const slicePolicy = <P, R>(
  server: ServerDefinition<P, R>,
  slice: RelationRequirement,
): Option.Option<CachePolicy> =>
  Object.values(slice.relations ?? {}).reduce(
    (policy, relation) => both(policy, slicePolicy(server, relation)),
    sourcePolicy(server.entities.get(slice.entity)),
  )

/** A read batch's policy: none for an empty one, which keeps nothing worth a key. */
export const readPolicy = <P, R>(
  server: ServerDefinition<P, R>,
  batch: Batch,
): Option.Option<CachePolicy> =>
  batch.requests.length === 0
    ? Option.none()
    : batch.requests.map(request => slicePolicy(server, request)).reduce(both)

/** A query's policy: its own, its rows' and what its `select` reaches. */
export const queryPolicy = <P, R>(
  server: ServerDefinition<P, R>,
  request: QueryAsked,
): Option.Option<CachePolicy> => {
  const source = server.queries.get(request.query)
  if (source === undefined || source.visible !== undefined) return Option.none()
  const own = both(
    Option.fromUndefinedOr(source.cache),
    sourcePolicy(server.entities.get(source.entity)),
  )
  return request.select === undefined ? own : both(own, slicePolicy(server, request.select))
}

type Row = { readonly entity: string; readonly id: string }

const rowTags = (rows: ReadonlyArray<Row>): ReadonlyArray<string> =>
  rows.map(row => rowTag(row.entity, row.id))

/** What a read's answer holds: each row asked for, found or not, and each it reached. */
export const readTags = (
  batch: Batch,
  result: Schema.Schema.Type<typeof ReadBatchResult>,
): ReadonlyArray<string> => [
  ...new Set([...rowTags(batch.requests), ...rowTags(result.entities), ...rowTags(result.settled)]),
]

/** What a query's answer holds: every list of its entity, and each row on the page. */
export const queryTags = <P, R>(
  server: ServerDefinition<P, R>,
  request: QueryAsked,
  result: Schema.Schema.Type<typeof QueryResult>,
): ReadonlyArray<string> => [
  ...new Set([
    ...Option.toArray(
      Option.map(Option.fromUndefinedOr(server.queries.get(request.query)), source =>
        listTag(source.entity),
      ),
    ),
    ...rowTags(result.edges),
    ...rowTags(result.entities ?? []),
  ]),
]

const decodeMutationResult = Schema.decodeUnknownOption(MutationResult)

/**
 * What a write's answer names, as tags to purge: each row it wrote, deleted,
 * moved in a list or read back, and every list of each of their entities,
 * which a changed row can join or leave. A write naming nothing purges nothing.
 */
export const writeTags = (result: unknown): ReadonlyArray<string> =>
  Option.match(decodeMutationResult(result), {
    onNone: () => [],
    onSome: answer => {
      const rows: ReadonlyArray<Row> = [
        ...answer.entities,
        ...(answer.deleted ?? []),
        ...(answer.connections ?? []).map(change => change.edge),
        ...(answer.read?.result.entities ?? []),
        ...(answer.lists ?? []).flatMap(list => [
          ...list.result.edges,
          ...(list.result.entities ?? []),
        ]),
      ]
      return [...new Set([...rowTags(rows), ...rows.map(row => listTag(row.entity))])]
    },
  })

/** An answer as anyone may be given it: without whom it was for. */
const unaddressed = <A extends { readonly principal?: unknown }>(
  answer: A,
): Omit<A, 'principal'> => {
  const { principal: _, ...rest } = answer
  return rest
}

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')

/**
 * The key a request's answer is kept under: the SHA-256 of `text` (the
 * request as stable JSON), under the request's own origin, since the Workers
 * Cache API keys by URL.
 */
export const cacheKey = (url: string, kind: string, text: string): Effect.Effect<string> =>
  Effect.promise(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).pipe(
    Effect.map(digest => `${new URL(url).origin}/__foldkit/cache/${kind}/${hex(digest)}`),
  )

/**
 * Handlers that answer every read and query proved public as `visitor`, and
 * note each read in the render's `PageReads`: public with its policy and
 * tags, or private. Without a visitor every read is private, and so is one
 * that fails, since a page drawn without its read is no page to keep.
 */
export const notingHandlers = <P, R>(
  server: ServerDefinition<P, R>,
  own: RemoteRpcClient<R>,
  visitor: Option.Option<RemoteRpcClient<R>>,
): RemoteRpcClient<R> => {
  const note = (read: CachedRead) =>
    Effect.flatMap(Effect.service(PageReads), noted =>
      Effect.sync(() => Option.map(noted, add => add(read))),
    )
  return {
    ...own,
    FoldkitRemoteRead: batch =>
      Option.match(
        Option.flatMap(visitor, handlers =>
          Option.map(readPolicy(server, batch), policy => ({ handlers, policy })),
        ),
        {
          onNone: () => Effect.ensuring(own.FoldkitRemoteRead(batch), note(CachedRead.Private())),
          onSome: ({ handlers, policy }) =>
            Effect.flatMap(handlers.FoldkitRemoteRead(batch), result =>
              Effect.as(
                note(CachedRead.Public({ policy, tags: readTags(batch, result) })),
                unaddressed(result),
              ),
            ).pipe(Effect.onError(() => note(CachedRead.Private()))),
        },
      ),
    FoldkitRemoteQuery: request =>
      Option.match(
        Option.flatMap(visitor, handlers =>
          Option.map(queryPolicy(server, request), policy => ({ handlers, policy })),
        ),
        {
          onNone: () =>
            Effect.ensuring(own.FoldkitRemoteQuery(request), note(CachedRead.Private())),
          onSome: ({ handlers, policy }) =>
            Effect.flatMap(handlers.FoldkitRemoteQuery(request), result =>
              Effect.as(
                note(CachedRead.Public({ policy, tags: queryTags(server, request, result) })),
                unaddressed(result),
              ),
            ).pipe(Effect.onError(() => note(CachedRead.Private()))),
        },
      ),
  }
}
