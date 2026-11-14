/**
 * `DomainRemote.layer`: a `RemoteClient` answered from a Domain Api's typed
 * client (#544). It holds nothing of what it read or wrote: Remote's Model
 * keeps both, on Remote's wire.
 *
 *   a row's revision    = its View state's revision field, sent with the row
 *   a write's token     = its receipt, `stream@version` (`MutationResult.after`)
 *
 * Remote drops a row of a lower revision than the one it holds, and reads a
 * row it holds to a token with that token, which the adapter asks as
 * `snapshot(key, { atLeast: receipt })`; a View still behind is named in
 * `behind`. The adapter keeps only the commands it sent, so a retry is
 * answered without sending one.
 */
import type * as Domain from '@alchemy.run/domain'
import { type Context, Duration, Effect, Layer, Match, Option, Ref, Schema, Stream } from 'effect'
import {
  REMOTE_PROTOCOL_VERSION,
  RemoteClient,
  RemoteForbidden,
  RemoteLiveError,
  RemoteMutationError,
  RemotePrincipalChanged,
  RemoteProtocolError,
  RemoteReadError,
  RemoteUnauthenticated,
  RemoteUnreachable,
  ReadAfterToken,
  type LiveEvent,
} from 'foldkit-remote'
import { commandIdOf } from '../commandId.js'
import type { Receipt } from '../index.js'
import {
  fail,
  type AnyApi,
  type CommandBinding,
  type Outcome,
  type ViewBinding,
  type ViewsOf,
} from './binding.js'
import { answerLists, answerQuery, liveQuery, type Lists, type QueryBinding } from './query.js'
import {
  encodeRow,
  failureOf,
  keyOf,
  readRows,
  revisionOf,
  type Codec,
  type Snapshot,
} from './relations.js'

type MiddlewareOf<A extends AnyApi> =
  | Domain.Api.CommandsOf<A>['middleware']
  | NonNullable<ViewsOf<A>['definition']['middleware']>

/** What the middleware of the Api's commands and Views fail a request with. */
export type DeniedOf<A extends AnyApi> = Domain.Middleware.Errors<MiddlewareOf<A>>

/** How `DomainRemote.layer` answers Remote. */
export interface LayerConfig<A extends AnyApi> {
  readonly views: ReadonlyArray<ViewBinding<any, A>>
  readonly commands: ReadonlyArray<CommandBinding<any, A>>
  /** The lists, each a Remote query answered by a paged Domain Query (`DomainRemote.query`). */
  readonly queries?: ReadonlyArray<QueryBinding<any, A>>
  /** The key of who the Domain session is: what results name as their `principal`. */
  readonly principal: Effect.Effect<Option.Option<string>>
  /** What a middleware's refusal of a write means to Remote; a read's is always `Unauthenticated`. */
  readonly denied: (error: DeniedOf<A>) => 'Unauthenticated' | 'Forbidden'
  /** How long a read waits for its View, the Api's client giving no deadline. 2 seconds by default. */
  readonly confirmWithin?: Duration.Input
}

type ClientIdentifier<A extends AnyApi> =
  A['Client'] extends Context.Key<infer Identifier, any> ? Identifier : never

type AtLeast = { readonly atLeast: Receipt } | undefined

/** A View's client as the adapter calls it, by the names its bindings were checked for. */
interface ViewClient {
  readonly snapshot: (key: string, options: AtLeast) => Effect.Effect<Snapshot, unknown>
  readonly watch: (key: string) => Stream.Stream<Snapshot, unknown>
}

type CommandClient = (
  target: string,
  input: unknown,
  options: { readonly commandId: string },
) => Effect.Effect<{ readonly reply: unknown } & Receipt, unknown>

const isToken = Schema.is(ReadAfterToken)

/**
 * A receipt as Remote carries it, a read-after token: `stream@version`. None
 * for a stream too long for the wire, whose token every later read would
 * carry and the server refuse with the whole batch.
 */
const tokenOf = (receipt: Receipt): Option.Option<string> =>
  Option.liftPredicate(`${receipt.stream}@${receipt.version}`, isToken)

/** The receipt a token names, none for a token this adapter did not write. */
const receiptOf = (token: string): Option.Option<Receipt> => {
  if (!isToken(token)) return Option.none()
  const at = token.lastIndexOf('@')
  const version = Number(token.slice(at + 1))
  return at <= 0 || !Number.isSafeInteger(version) || version < 0 || token.slice(at + 1) === ''
    ? Option.none()
    : Option.some({ stream: token.slice(0, at), version })
}

/** How many commands' receipts the adapter keeps to answer a retry without sending it. */
const MAX_COMMITTED = 1024

/** A short hash of the text, hex: SHA-256, cut to 128 bits. */
const digest = (text: string): Effect.Effect<string> =>
  Effect.promise(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).pipe(
    Effect.map(hash =>
      Array.from(new Uint8Array(hash).subarray(0, 16), byte =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
    ),
  )

/** The tokens of a batch or a stream, by row key, each read back as its receipt. */
const receiptsOf = <E>(
  rows: ReadonlyArray<{ readonly entity: string; readonly id: string; readonly token: string }>,
  refused: (message: string) => E,
) =>
  Effect.forEach(rows, ({ entity, id, token }) =>
    Option.match(receiptOf(token), {
      onNone: () => Effect.fail(refused(`${entity} ${id}'s token is not a Domain receipt`)),
      onSome: receipt => Effect.succeed([keyOf(entity, id), receipt] as const),
    }),
  ).pipe(Effect.map(entries => new Map(entries)))

/**
 * A `RemoteClient` answered from the Api's client. Reads and live reads go to
 * the bound Views; writes to the bound commands, each under a `commandId`
 * derived from who asks and what, so a retry is the same command and nothing
 * else is.
 */
export const layer = <A extends AnyApi>(
  api: A,
  config: LayerConfig<A>,
): Layer.Layer<RemoteClient, never, ClientIdentifier<A>> =>
  Layer.effect(
    RemoteClient,
    Effect.gen(function* () {
      const client = (yield* api.Client) as Readonly<Record<string, unknown>>
      const confirmWithin = Duration.fromInputUnsafe(config.confirmWithin ?? '2 seconds')
      const views = new Map(config.views.map(binding => [binding.entity.name, binding]))
      const commands = new Map(config.commands.map(binding => [binding.mutation.name, binding]))
      const queries = new Map(
        (config.queries ?? []).map(binding => [binding.descriptor.name, binding]),
      )
      for (const binding of [...config.views, ...config.commands, ...queries.values()]) {
        if (binding.api !== api)
          throw new Error(
            `[foldkit-remote-domain] a binding of ${binding.api.apiName} given to ${api.apiName}'s layer`,
          )
      }
      for (const binding of queries.values()) {
        if (!views.has(binding.entity))
          throw new Error(
            `[foldkit-remote-domain] ${binding.descriptor.name} lists ${binding.entity}, which no View given to the layer serves`,
          )
      }

      const committed = new Map<string, { readonly receipt: Receipt; readonly reply: unknown }>()

      const viewClient = (binding: ViewBinding) => client[binding.view] as ViewClient
      const principalKey = Effect.map(config.principal, Option.getOrNull)

      /** The key's snapshot, at the receipt when one is given, within `confirmWithin`. */
      const snapshotAt = (binding: ViewBinding, id: string, receipt: Option.Option<Receipt>) =>
        viewClient(binding)
          .snapshot(
            id,
            Option.match(receipt, {
              onNone: () => undefined,
              onSome: atLeast => ({ atLeast }),
            }),
          )
          .pipe(Effect.timeoutOption(confirmWithin))

      const viewOf = (entity: string) =>
        Option.fromUndefinedOr(views.get(entity)).pipe(
          Effect.fromOption,
          Effect.mapError(() => `No View is bound to ${entity}`),
        )

      const lists: Lists = {
        views,
        snapshotAt,
        queries,
        client,
        confirmWithin,
        principal: principalKey,
        watch: (entity, id) => viewClient(views.get(entity)!).watch(id),
      }

      const read: RemoteClient['Service']['read'] = batch =>
        Effect.gen(function* () {
          if (batch.version !== REMOTE_PROTOCOL_VERSION)
            return yield* new RemoteProtocolError({
              message: 'Another protocol version',
              expected: REMOTE_PROTOCOL_VERSION,
              received: batch.version,
            })
          const asking = yield* principalKey
          const receipts = yield* receiptsOf(
            batch.after ?? [],
            message => new RemoteReadError({ message }),
          )
          const { entities, settled, behind } = yield* readRows(lists, batch.requests, receipts)
          return {
            entities,
            settled,
            principal: asking,
            ...(behind.length === 0 ? {} : { behind }),
          }
        })

      const query: RemoteClient['Service']['query'] = request => answerQuery(lists, request)

      /** A Rejection answered as its binding says. */
      const outcomeError = (binding: CommandBinding, rejection: { readonly _tag: string }) => {
        const mapped = binding.refusals.get(rejection._tag)
        const outcome: Outcome<unknown> =
          mapped === undefined ? fail(`${binding.command} refused it`) : mapped(rejection)
        return Match.valueTags(outcome, {
          Refuse: ({ refusal }) =>
            Schema.encodeUnknownEffect(binding.mutation.Refusal as Codec)(refusal).pipe(
              Effect.mapError(
                () => new RemoteMutationError({ message: 'Invalid mutation refusal' }),
              ),
              Effect.flatMap(encoded =>
                Effect.fail(
                  new RemoteMutationError({
                    message: `${binding.command} refused it`,
                    refusal: encoded,
                  }),
                ),
              ),
            ),
          Forbid: ({ reason }) =>
            Effect.fail(
              new RemoteForbidden({
                message: `${binding.command} was refused to who asks`,
                ...Option.match(reason, { onNone: () => ({}), onSome: reason => ({ reason }) }),
              }),
            ),
          Unauthenticated: ({ reason }) =>
            Effect.fail(
              new RemoteUnauthenticated({
                message: `Sign in to send ${binding.command}`,
                ...Option.match(reason, { onNone: () => ({}), onSome: reason => ({ reason }) }),
              }),
            ),
          Fail: ({ message }) => Effect.fail(new RemoteMutationError({ message })),
        })
      }

      /** Sends the command once per `commandId`: a retry answers from the record. */
      const send = (
        binding: CommandBinding,
        commandId: string,
        target: string,
        input: unknown,
      ): Effect.Effect<{ readonly receipt: Receipt; readonly reply: unknown }, unknown> =>
        Option.match(Option.fromUndefinedOr(committed.get(commandId)), {
          onSome: Effect.succeed,
          onNone: () =>
            (client[binding.command] as CommandClient)(target, binding.input(input), {
              commandId,
            }).pipe(
              Effect.map(({ reply, stream, version }) => {
                const record = { receipt: { stream, version }, reply }
                committed.set(commandId, record)
                // The oldest goes first: Domain answers a resent commandId from its own record (P7).
                if (committed.size > MAX_COMMITTED) committed.delete(committed.keys().next().value!)
                return record
              }),
            ),
        })

      const mutate: RemoteClient['Service']['mutate'] = request =>
        Effect.gen(function* () {
          const binding = yield* Option.fromUndefinedOr(commands.get(request.mutation)).pipe(
            Effect.fromOption,
            Effect.mapError(
              () =>
                new RemoteMutationError({ message: `No command is bound to ${request.mutation}` }),
            ),
          )
          if (request.operation === undefined)
            return yield* new RemoteMutationError({
              message: `${request.mutation} was sent with no operation id: a retry of it would be a second write`,
            })
          const operation = request.operation
          const asking = yield* principalKey
          if (request.principal !== undefined && request.principal !== asking)
            return yield* asking === null
              ? new RemoteUnauthenticated({ message: 'Sign in to send this write' })
              : new RemotePrincipalChanged({
                  message: 'The write was made for someone other than who is signed in now',
                })
          const Input = binding.mutation.Input as Codec
          const input = yield* Schema.decodeUnknownEffect(Input)(request.input).pipe(
            Effect.mapError(
              () =>
                new RemoteMutationError({ message: `${request.mutation}'s input did not decode` }),
            ),
          )
          const encoded = yield* Schema.encodeUnknownEffect(Input)(input).pipe(Effect.orDie)
          const target = binding.target(input)
          const commandId = commandIdOf(request.mutation, {
            operation,
            digest: yield* digest(JSON.stringify([asking, target, request.keys ?? null, encoded])),
          })

          const { receipt, reply } = yield* send(binding, commandId, target, input).pipe(
            Effect.catch(error =>
              Match.valueTags(failureOf(binding.rejections)(error), {
                Rejected: ({ rejection }) => outcomeError(binding, rejection),
                Behind: ({ message }) => Effect.fail(new RemoteUnreachable({ message })),
                Unreachable: ({ message }) => Effect.fail(new RemoteUnreachable({ message })),
                Denied: ({ error }) =>
                  Effect.fail(
                    config.denied(error as DeniedOf<A>) === 'Forbidden'
                      ? new RemoteForbidden({
                          message: `${binding.command} was refused to who asks`,
                        })
                      : new RemoteUnauthenticated({ message: 'The Domain Api refused who asks' }),
                  ),
              }),
            ),
            Effect.catchDefect(() =>
              Effect.fail(new RemoteUnreachable({ message: 'The Domain Api did not answer' })),
            ),
          )

          const entity = binding.entity
          const bound = Option.fromUndefinedOr(views.get(entity.name))
          // The View read at the receipt: none while it is behind, or failed.
          const confirmation = yield* Option.match(bound, {
            onNone: () => Effect.succeedNone,
            onSome: view =>
              snapshotAt(view, target, Option.some(receipt)).pipe(
                Effect.map(Option.map(snapshot => ({ view, snapshot }))),
                Effect.orElseSucceed(() => Option.none()),
              ),
          })
          // The write committed and its View is behind: what it wrote is what the reply says (D6).
          const row = Option.match(confirmation, {
            onSome: ({ view, snapshot }) =>
              Option.map(Option.fromNullOr(snapshot.state), state => ({
                state,
                fields: Object.keys(entity.fields).filter(field => field !== 'id'),
                revision: revisionOf(view, state),
              })),
            onNone: () =>
              Option.map(binding.written, written => {
                const state = written(reply, input)
                return { state, fields: Object.keys(state), revision: {} }
              }),
          })
          const entities = yield* Option.match(row, {
            onNone: () => Effect.succeed([]),
            onSome: ({ state, fields, revision }) =>
              encodeRow(entity, target, state, fields).pipe(
                Effect.mapError(({ message }) => new RemoteMutationError({ message })),
                Effect.flatMap(({ values, lacking }) =>
                  lacking.length === 0
                    ? Effect.succeed([{ entity: entity.name, id: target, values, ...revision }])
                    : Effect.die(
                        new Error(
                          `[foldkit-remote-domain] ${binding.command} wrote ${lacking.join(', ')}, which ${entity.name} does not declare`,
                        ),
                      ),
                ),
              ),
          })
          const output = yield* Schema.encodeUnknownEffect(binding.mutation.Output as Codec)(
            reply ?? {},
          ).pipe(
            Effect.mapError(
              () =>
                new RemoteMutationError({
                  message: `${binding.command}'s reply is not ${request.mutation}'s output`,
                }),
            ),
          )
          // Until a read at the receipt answers, Remote keeps what it holds of the row.
          const after = Option.match(
            Option.isSome(bound) && Option.isNone(confirmation) ? tokenOf(receipt) : Option.none(),
            {
              onNone: () => ({}),
              onSome: token => ({ after: { token, rows: [{ entity: entity.name, id: target }] } }),
            },
          )
          const answered =
            request.lists === undefined ? [] : yield* answerLists(lists, request.lists, receipt)
          return {
            output,
            entities,
            principal: asking,
            ...after,
            ...(answered.length === 0 ? {} : { lists: answered }),
          }
        })

      const live: RemoteClient['Service']['live'] = request =>
        Stream.unwrap(
          Effect.gen(function* () {
            const receipts = yield* receiptsOf(
              request.floors ?? [],
              message => new RemoteLiveError({ message }),
            )
            const watched = yield* Effect.forEach(request.requirements, requirement =>
              Effect.gen(function* () {
                const binding = yield* viewOf(requirement.entity).pipe(
                  Effect.mapError(message => new RemoteLiveError({ message })),
                )
                if (requirement.relations !== undefined || requirement.windows !== undefined)
                  return yield* new RemoteLiveError({
                    message: `${requirement.entity} is read through ${binding.view}, which serves no relations yet`,
                  })
                return { binding, requirement }
              }),
            )
            // Remote's own cursor: Domain's does not move on a state-only change (P5),
            // and Remote drops an event at or before the last one's.
            const cursor = yield* Ref.make(request.after)
            const next = Ref.updateAndGet(cursor, at => at + 1)

            const eventOf = (
              binding: ViewBinding,
              id: string,
              fields: ReadonlyArray<string>,
              snapshot: Snapshot,
            ) =>
              Effect.gen(function* () {
                const ref = { entity: binding.entity.name, id }
                if (snapshot.state === null)
                  return { _tag: 'EntityDeleted', ref, cursor: yield* next } satisfies LiveEvent
                const { values } = yield* encodeRow(binding.entity, id, snapshot.state, fields)
                return {
                  _tag: 'EntityPatched',
                  ref,
                  values,
                  changed: Object.keys(values),
                  cursor: yield* next,
                  ...revisionOf(binding, snapshot.state),
                } satisfies LiveEvent
              })

            return Stream.mergeAll(
              [
                ...request.queries.map(asked => liveQuery(lists, asked, next)),
                ...watched.map(({ binding, requirement }) => {
                  const receipt = Option.fromUndefinedOr(
                    receipts.get(keyOf(requirement.entity, requirement.id)),
                  )
                  return viewClient(binding)
                    .watch(requirement.id)
                    .pipe(
                      Stream.mapEffect(snapshot =>
                        Option.match(receipt, {
                          onNone: () => Effect.succeedSome(snapshot),
                          // Held to a write's receipt, a frame is only a signal: read at it.
                          onSome: () =>
                            snapshotAt(binding, requirement.id, receipt).pipe(
                              Effect.orElseSucceed(() => Option.none<Snapshot>()),
                            ),
                        }),
                      ),
                      Stream.flatMap(snapshot => Stream.fromIterable(Option.toArray(snapshot))),
                      Stream.mapEffect(snapshot =>
                        eventOf(binding, requirement.id, requirement.fields, snapshot),
                      ),
                      Stream.catch(error =>
                        Match.valueTags(failureOf(binding.rejections)(error), {
                          // `validate` stopped allowing the key: absent to who asks from here on.
                          Rejected: () =>
                            Stream.fromEffect(
                              Effect.map(next, (at): LiveEvent => ({
                                _tag: 'EntityDeleted',
                                ref: { entity: binding.entity.name, id: requirement.id },
                                cursor: at,
                              })),
                            ),
                          Behind: ({ message }) => Stream.fail(new RemoteLiveError({ message })),
                          Unreachable: ({ message }) =>
                            Stream.fail(new RemoteLiveError({ message })),
                          Denied: () =>
                            Stream.fail(
                              new RemoteUnauthenticated({
                                message: 'The Domain Api refused who asks',
                              }),
                            ),
                        }),
                      ),
                    )
                }),
              ],
              // One watch a row, and one stream a list, each open for the stream's life.
              { concurrency: 'unbounded' },
            )
          }),
        )

      return RemoteClient.of({ read, query, mutate, live })
    }),
  ) as Layer.Layer<RemoteClient, never, ClientIdentifier<A>>
