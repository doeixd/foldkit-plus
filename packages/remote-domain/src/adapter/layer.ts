/**
 * `DomainRemote.layer`: a `RemoteClient` answered from a Domain Api's typed
 * client, keeping each write's receipt until a read of its View key confirms
 * it (#544). What the adapter holds, it holds per principal and View key:
 *
 *   accepted(key) = the newest row of that key let through, by revision
 *   floor(key)    = the newest receipt of a write to that key whose read is not yet confirmed
 *
 * A row reaches Remote only if its revision is at least accepted(key)'s; a read
 * of a floored key asks `snapshot(key, { atLeast: floor })`, and the floor
 * clears when such a read answers. It keeps the last `MAX_PRINCIPALS` to ask:
 * one who asks again after more than that starts with nothing held.
 */
import * as Domain from '@alchemy.run/domain'
import { Context, Duration, Effect, Equal, Layer, Match, Option, Ref, Schema, Stream } from 'effect'
import { RpcClientError } from 'effect/rpc/RpcClientError'
import type { AnyEntity } from 'foldkit-entity'
import {
  REMOTE_PROTOCOL_VERSION,
  RemoteClient,
  RemoteForbidden,
  RemoteLiveError,
  RemoteMutationError,
  RemotePrincipalChanged,
  RemoteProtocolError,
  RemoteQueryError,
  RemoteReadError,
  RemoteUnauthenticated,
  RemoteUnreachable,
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

/** A write that committed whose View read is not yet confirmed. */
export interface PendingRead {
  readonly entity: string
  readonly id: string
  /** The Remote operation that wrote it. */
  readonly operation: string
  readonly receipt: Receipt
}

/** What the adapter holds of the writes it sent, for a page or a test to ask. */
export class DomainReads extends Context.Service<
  DomainReads,
  {
    /** The writes of who asks now that committed and whose View read is not yet confirmed. */
    readonly pending: Effect.Effect<ReadonlyArray<PendingRead>>
    /** Reads the key again at its floor: `true` once the View has the write, or when none is pending. */
    readonly confirm: (entity: AnyEntity, id: string) => Effect.Effect<boolean>
  }
>()('foldkit-remote-domain/DomainReads') {}

type MiddlewareOf<A extends AnyApi> =
  | Domain.Api.CommandsOf<A>['middleware']
  | NonNullable<ViewsOf<A>['definition']['middleware']>

/** What the middleware of the Api's commands and Views fail a request with. */
export type DeniedOf<A extends AnyApi> = Domain.Middleware.Errors<MiddlewareOf<A>>

/** How `DomainRemote.layer` answers Remote. */
export interface LayerConfig<A extends AnyApi> {
  readonly views: ReadonlyArray<ViewBinding<any, A>>
  readonly commands: ReadonlyArray<CommandBinding<any, A>>
  /** The key of who the Domain session is: what results name as their `principal`. */
  readonly principal: Effect.Effect<Option.Option<string>>
  /** What a middleware's refusal of a write means to Remote; a read's is always `Unauthenticated`. */
  readonly denied: (error: DeniedOf<A>) => 'Unauthenticated' | 'Forbidden'
  /** How long a read waits for its View, the Api's client giving no deadline. 2 seconds by default. */
  readonly confirmWithin?: Duration.Input
}

type ClientIdentifier<A extends AnyApi> =
  A['Client'] extends Context.Key<infer Identifier, any> ? Identifier : never

interface Snapshot {
  readonly state: Readonly<Record<string, unknown>> | null
  readonly cursor: number
}

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

/** What a call failed with, as the adapter answers it. */
type Failure =
  | { readonly _tag: 'Rejected'; readonly rejection: { readonly _tag: string } }
  | { readonly _tag: 'Unreachable'; readonly message: string }
  | { readonly _tag: 'Denied'; readonly error: unknown }

const failureOf =
  (rejections: ReadonlyArray<Domain.Rejection.Any>) =>
  (error: unknown): Failure => {
    const rejection = rejections.find(each => Schema.is(each)(error))
    if (rejection !== undefined)
      return { _tag: 'Rejected', rejection: error as { readonly _tag: string } }
    if (Schema.is(RpcClientError)(error))
      return { _tag: 'Unreachable', message: 'The Domain Api did not answer' }
    if (Schema.is(Domain.ConsistencyTimeout)(error))
      return { _tag: 'Unreachable', message: 'The View did not catch up with the write' }
    return { _tag: 'Denied', error }
  }

const keyOf = (entity: string, id: string) => JSON.stringify([entity, id])

/** How many commands' receipts the adapter keeps to answer a retry without sending it. */
const MAX_COMMITTED = 1024

/** Who asks, as results name them: their key, `null` for a visitor. */
type Principal = string | null

/** How many principals' rows and floors the adapter keeps; the one who asked longest ago goes first. */
const MAX_PRINCIPALS = 4

/**
 * What the adapter holds for one principal: a row one was let through is no
 * answer to another, whom the View may no longer let read it, and one's write
 * is not pending for another.
 */
interface Held {
  readonly accepted: Map<string, { readonly revision: number; readonly snapshot: Snapshot }>
  readonly floors: Map<string, PendingRead>
}

/** A codec as the adapter runs it: the mutation's and the Entity's need no services. */
type Codec = Schema.Codec<unknown, unknown>

/** A short hash of the text, hex: SHA-256, cut to 128 bits. */
const digest = (text: string): Effect.Effect<string> =>
  Effect.promise(() => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))).pipe(
    Effect.map(hash =>
      Array.from(new Uint8Array(hash).subarray(0, 16), byte =>
        byte.toString(16).padStart(2, '0'),
      ).join(''),
    ),
  )

/**
 * A `RemoteClient`, and `DomainReads`, answered from the Api's client. Reads
 * and live reads go to the bound Views; writes to the bound commands, each
 * under a `commandId` derived from who asks and what, so a retry is the same
 * command and nothing else is.
 */
export const layer = <A extends AnyApi>(
  api: A,
  config: LayerConfig<A>,
): Layer.Layer<RemoteClient | DomainReads, never, ClientIdentifier<A>> =>
  Layer.effectContext(
    Effect.gen(function* () {
      const client = (yield* api.Client) as Readonly<Record<string, unknown>>
      const confirmWithin = Duration.fromInputUnsafe(config.confirmWithin ?? '2 seconds')
      const views = new Map(config.views.map(binding => [binding.entity.name, binding]))
      const commands = new Map(config.commands.map(binding => [binding.mutation.name, binding]))
      for (const binding of [...config.views, ...config.commands]) {
        if (binding.api !== api)
          throw new Error(
            `[foldkit-remote-domain] a binding of ${binding.api.apiName} given to ${api.apiName}'s layer`,
          )
      }

      const principals = new Map<Principal, Held>()
      const committed = new Map<string, { readonly receipt: Receipt; readonly reply: unknown }>()

      const viewClient = (binding: ViewBinding) => client[binding.view] as ViewClient
      const principalKey = Effect.map(config.principal, Option.getOrNull)

      /** What is held for who asks, who becomes the latest to ask. */
      const heldFor = (asking: Principal): Held => {
        const held = principals.get(asking) ?? { accepted: new Map(), floors: new Map() }
        principals.delete(asking)
        principals.set(asking, held)
        for (const oldest of principals.keys()) {
          if (principals.size <= MAX_PRINCIPALS) break
          principals.delete(oldest)
        }
        return held
      }

      /** The key's snapshot, at the floor when one is set, within `confirmWithin`. */
      const snapshotAt = (binding: ViewBinding, id: string, floor: Option.Option<Receipt>) =>
        viewClient(binding)
          .snapshot(
            id,
            Option.match(floor, {
              onNone: () => undefined,
              onSome: receipt => ({ atLeast: receipt }),
            }),
          )
          .pipe(Effect.timeoutOption(confirmWithin))

      const orderOf = (
        binding: ViewBinding,
        snapshot: { readonly state: Readonly<Record<string, unknown>>; readonly cursor: number },
      ) => snapshot.state[binding.revision] as number

      /**
       * Lets a snapshot through if its revision is at least the accepted
       * one's, and answers what the key holds then with what it held before.
       * A deleted row carries no revision: it is let through, and only a row
       * of a later revision than the one it was deleted at comes after it.
       */
      const admit = (binding: ViewBinding, id: string, snapshot: Snapshot, asking: Principal) =>
        Effect.gen(function* () {
          const { accepted } = heldFor(asking)
          const key = keyOf(binding.entity.name, id)
          const held = Option.fromUndefinedOr(accepted.get(key))
          if (snapshot.state === null) {
            const revision = Option.match(held, {
              onNone: () => -Infinity,
              onSome: ({ revision }) => revision,
            })
            accepted.set(key, { revision, snapshot })
            return { admitted: true, row: null, before: held }
          }
          const order = orderOf(binding, { state: snapshot.state, cursor: snapshot.cursor })
          if (Option.isSome(held)) {
            // A row at the revision it was deleted at is from before the deletion.
            const tombstone = held.value.snapshot.state === null
            if (tombstone ? order <= held.value.revision : order < held.value.revision)
              return { admitted: false, row: held.value.snapshot.state, before: held }
            if (
              order === held.value.revision &&
              !Equal.equals(snapshot.state, held.value.snapshot.state)
            )
              yield* Effect.logWarning(
                `[foldkit-remote-domain] ${binding.view} sent two rows of ${id} at revision ${order}: an event did not move ${binding.revision}`,
              )
          }
          accepted.set(key, { revision: order, snapshot })
          return { admitted: true, row: snapshot.state, before: held }
        })

      /** Clears the floor a read at `receipt` confirmed, unless a newer write raised it since. */
      const confirmed = (binding: ViewBinding, id: string, receipt: Receipt, asking: Principal) => {
        const { floors } = heldFor(asking)
        const key = keyOf(binding.entity.name, id)
        const floor = floors.get(key)
        if (floor !== undefined && floor.receipt.version <= receipt.version) floors.delete(key)
      }

      /**
       * Reads the key at its floor, admits what answers and clears the floor.
       * None when the View has not caught up, or the read failed.
       */
      const confirm = (binding: ViewBinding, id: string, floor: PendingRead, asking: Principal) =>
        snapshotAt(binding, id, Option.some(floor.receipt)).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.succeedNone,
              onSome: snapshot =>
                Effect.map(admit(binding, id, snapshot, asking), admission => {
                  confirmed(binding, id, floor.receipt, asking)
                  return Option.some(admission)
                }),
            }),
          ),
          Effect.orElseSucceed(() => Option.none()),
        )

      /** A row's values for `fields`, encoded as the Entity stores them, and the fields it lacks. */
      const encodeRow = (
        entity: AnyEntity,
        id: string,
        state: Readonly<Record<string, unknown>>,
        fields: ReadonlyArray<string>,
      ) =>
        Effect.gen(function* () {
          const values: Record<string, unknown> = Object.create(null)
          const lacking: Array<string> = []
          for (const field of fields) {
            const member: { readonly schema: Codec } | undefined = Object.hasOwn(
              entity.fields,
              field,
            )
              ? entity.fields[field]
              : undefined
            if (field === 'id') values[field] = id
            else if (member === undefined || !Object.hasOwn(state, field)) lacking.push(field)
            else
              values[field] = yield* Schema.encodeUnknownEffect(member.schema)(state[field]).pipe(
                Effect.mapError(
                  () =>
                    new RemoteReadError({
                      message: `${field} of ${entity.name} ${id} does not encode as ${entity.name} declares it`,
                    }),
                ),
              )
          }
          return { values, lacking }
        })

      const viewOf = (entity: string) =>
        Option.fromUndefinedOr(views.get(entity)).pipe(
          Effect.fromOption,
          Effect.mapError(() => `No View is bound to ${entity}`),
        )

      const read: RemoteClient['Service']['read'] = batch =>
        Effect.gen(function* () {
          if (batch.version !== REMOTE_PROTOCOL_VERSION)
            return yield* new RemoteProtocolError({
              message: 'Another protocol version',
              expected: REMOTE_PROTOCOL_VERSION,
              received: batch.version,
            })
          const asking = yield* principalKey
          const answers = yield* Effect.forEach(
            batch.requests,
            request =>
              Effect.gen(function* () {
                const binding = yield* viewOf(request.entity).pipe(
                  Effect.mapError(message => new RemoteReadError({ message })),
                )
                if (request.relations !== undefined || request.windows !== undefined)
                  return yield* new RemoteReadError({
                    message: `${request.entity} is read through ${binding.view}, which serves no relations yet`,
                  })
                const floor = Option.fromUndefinedOr(
                  heldFor(asking).floors.get(keyOf(request.entity, request.id)),
                )
                const answered = yield* snapshotAt(
                  binding,
                  request.id,
                  Option.map(floor, ({ receipt }) => receipt),
                ).pipe(
                  Effect.catch(error =>
                    Match.valueTags(failureOf(binding.rejections)(error), {
                      // Hidden reads as missing, as a guarded Source's does.
                      Rejected: () => Effect.succeed(Option.some({ state: null, cursor: 0 })),
                      Unreachable: ({ message }) => Effect.fail(new RemoteUnreachable({ message })),
                      Denied: () =>
                        Effect.fail(
                          new RemoteUnauthenticated({ message: 'The Domain Api refused who asks' }),
                        ),
                    }),
                  ),
                )
                const snapshot = yield* Option.match(answered, {
                  onNone: () =>
                    Effect.fail(
                      new RemoteUnreachable({ message: `${binding.view} did not answer in time` }),
                    ),
                  onSome: Effect.succeed,
                })
                const { row } = yield* admit(binding, request.id, snapshot, asking)
                if (Option.isSome(floor))
                  confirmed(binding, request.id, floor.value.receipt, asking)
                if (row === null) return Option.none()
                return Option.some(
                  Object.assign(yield* encodeRow(binding.entity, request.id, row, request.fields), {
                    request,
                  }),
                )
              }),
            { concurrency: 'unbounded' },
          )
          const found = answers.flatMap(Option.toArray)
          return {
            entities: found.map(({ request, values }) => ({
              entity: request.entity,
              id: request.id,
              values,
            })),
            settled: found
              .filter(({ lacking }) => lacking.length > 0)
              .map(({ request, lacking }) => ({
                entity: request.entity,
                id: request.id,
                fields: lacking,
              })),
            principal: asking,
          }
        })

      const query: RemoteClient['Service']['query'] = request =>
        Effect.fail(
          new RemoteQueryError({
            message: `${request.query} is not served: a Domain Api's queries are not bound yet`,
          }),
        )

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

          const key = keyOf(binding.entity.name, target)
          const floor: PendingRead = { entity: binding.entity.name, id: target, operation, receipt }
          const { floors } = heldFor(asking)
          const raised = floors.get(key)
          if (raised === undefined || raised.receipt.version < receipt.version)
            floors.set(key, floor)

          const bound = Option.fromUndefinedOr(views.get(binding.entity.name))
          const confirmation = yield* Option.match(bound, {
            onNone: () => Effect.succeedNone,
            onSome: view => confirm(view, target, floor, asking),
          })
          const entity = binding.entity
          // The write committed and its View is behind: what it wrote is what the reply says (D6).
          const row = Option.match(confirmation, {
            onSome: ({ row }) =>
              Option.map(Option.fromNullOr(row), state => ({
                state,
                fields: Object.keys(entity.fields).filter(field => field !== 'id'),
              })),
            onNone: () =>
              Option.map(binding.written, written => {
                const state = written(reply, input)
                return { state, fields: Object.keys(state) }
              }),
          })
          const entities = yield* Option.match(row, {
            onNone: () => Effect.succeed([]),
            onSome: ({ state, fields }) =>
              encodeRow(entity, target, state, fields).pipe(
                Effect.mapError(({ message }) => new RemoteMutationError({ message })),
                Effect.flatMap(({ values, lacking }) =>
                  lacking.length === 0
                    ? Effect.succeed([{ entity: entity.name, id: target, values }])
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
          return { output, entities, principal: asking }
        })

      const live: RemoteClient['Service']['live'] = request =>
        Stream.unwrap(
          Effect.gen(function* () {
            if (request.queries.length > 0)
              return yield* new RemoteLiveError({
                message: 'A Domain Api serves no live lists yet',
              })
            const asking = yield* principalKey
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
              admission: Effect.Success<ReturnType<typeof admit>>,
            ) =>
              Effect.gen(function* () {
                if (!admission.admitted) return Option.none<LiveEvent>()
                const ref = { entity: binding.entity.name, id }
                if (admission.row === null) {
                  if (Option.isNone(admission.before)) return Option.none<LiveEvent>()
                  return Option.some<LiveEvent>({ _tag: 'EntityDeleted', ref, cursor: yield* next })
                }
                const { values } = yield* encodeRow(binding.entity, id, admission.row, fields)
                const before = Option.flatMap(admission.before, ({ snapshot }) =>
                  Option.fromNullOr(snapshot.state),
                )
                const changed = fields.filter(field =>
                  Option.match(before, {
                    onNone: () => true,
                    onSome: state => !Equal.equals(state[field], (admission.row ?? {})[field]),
                  }),
                )
                if (Option.isSome(before) && changed.length === 0) return Option.none<LiveEvent>()
                return Option.some<LiveEvent>({
                  _tag: 'EntityPatched',
                  ref,
                  values,
                  changed,
                  cursor: yield* next,
                })
              })

            return Stream.mergeAll(
              watched.map(({ binding, requirement }) =>
                viewClient(binding)
                  .watch(requirement.id)
                  .pipe(
                    Stream.mapEffect(snapshot =>
                      Effect.gen(function* () {
                        const floor = heldFor(asking).floors.get(
                          keyOf(binding.entity.name, requirement.id),
                        )
                        // While a write is unconfirmed a frame is only a signal: read at its floor.
                        const admission =
                          floor === undefined
                            ? Option.some(yield* admit(binding, requirement.id, snapshot, asking))
                            : yield* confirm(binding, requirement.id, floor, asking)
                        return yield* Option.match(admission, {
                          onNone: () => Effect.succeedNone,
                          onSome: admitted =>
                            eventOf(binding, requirement.id, requirement.fields, admitted),
                        })
                      }),
                    ),
                    Stream.flatMap(event => Stream.fromIterable(Option.toArray(event))),
                    Stream.catch(error =>
                      Match.valueTags(failureOf(binding.rejections)(error), {
                        // `validate` stopped allowing the key: absent to who asks from here on.
                        Rejected: () =>
                          Stream.fromEffect(
                            admit(binding, requirement.id, { state: null, cursor: 0 }, asking).pipe(
                              Effect.andThen(next),
                              Effect.map((at): LiveEvent => ({
                                _tag: 'EntityDeleted',
                                ref: { entity: binding.entity.name, id: requirement.id },
                                cursor: at,
                              })),
                            ),
                          ),
                        Unreachable: ({ message }) => Stream.fail(new RemoteLiveError({ message })),
                        Denied: () =>
                          Stream.fail(
                            new RemoteUnauthenticated({
                              message: 'The Domain Api refused who asks',
                            }),
                          ),
                      }),
                    ),
                  ),
              ),
              { concurrency: 'unbounded' },
            )
          }),
        )

      const reads = DomainReads.of({
        pending: Effect.map(principalKey, asking => [...heldFor(asking).floors.values()]),
        confirm: (entity, id) =>
          Effect.gen(function* () {
            const asking = yield* principalKey
            const floor = heldFor(asking).floors.get(keyOf(entity.name, id))
            if (floor === undefined) return true
            const binding = views.get(entity.name)
            if (binding === undefined) return false
            return Option.isSome(yield* confirm(binding, id, floor, asking))
          }),
      })

      return Context.make(RemoteClient, RemoteClient.of({ read, query, mutate, live })).pipe(
        Context.add(DomainReads, reads),
      )
    }),
  ) as Layer.Layer<RemoteClient | DomainReads, never, ClientIdentifier<A>>
