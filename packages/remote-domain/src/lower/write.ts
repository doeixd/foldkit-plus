/**
 * `Lower.write`: a declared write as one Domain aggregate's command. Its
 * `decide` restates no rule: it lands the write through the same chain a
 * server runs (`RemoteServer.write` over `GuardServer.writer` over
 * `RemoteServer.memoryWriter`), over the one row the aggregate holds.
 */
import * as Domain from '@alchemy.run/domain'
import type { DecideContext, Envelope } from '@alchemy.run/domain/Aggregate'
import type { CommandClass, CommandRpc } from '@alchemy.run/domain/Command'
import type { RejectionClass } from '@alchemy.run/domain/Rejection'
import type { Context } from 'effect'
import { DateTime, Effect, Match, Option, Result, Schema, SchemaAST } from 'effect'
import { Write, type AnyEntity, type MemoryOperators } from 'foldkit-entity'
import type { Policy } from 'foldkit-guard'
import { GuardServer } from 'foldkit-guard/server'
import type { MutationDescriptor } from 'foldkit-remote'
import { RemoteServer, type MemoryStore } from 'foldkit-remote-server'
import {
  command as bindCommand,
  fail,
  forbid,
  refuse,
  view as bindView,
  type AnyApi,
  type CommandBinding,
  type CommandNameOf,
  type RefusalOfMutation,
  type RevisionKey,
  type ViewBinding,
  type ViewNameOf,
} from '../adapter/binding.js'
import { check } from './check.js'

/** A declared update, as `Mutation.write` returns it: what `Lower.write` lowers. */
export type LowerableMutation = MutationDescriptor<string, any, {}, any> & {
  readonly write: Write<AnyEntity, any, 'Update'>
}

type EntityOf<M extends LowerableMutation> = M['write']['input']['entity']

/** A row of the Entity, decoded: what the aggregate holds, its events carry and its View serves. */
export type RowOf<E extends AnyEntity> = E['schema']['Type']

type InputOf<M extends LowerableMutation> =
  M extends MutationDescriptor<string, infer Input, any, any> ? Input : never

/** The command's fields: the write's input, less the `id` its target is. */
export type CommandInputOf<M extends LowerableMutation> = Omit<InputOf<M>, 'id'>

/** Schema fields for a value of type `T`, each by the type it decodes to. */
type FieldsFor<T> = { readonly [K in keyof T]-?: Schema.Codec<T[K], unknown> }

/** A Rejection class whose instance is `Value`, as the client fails with it. */
export type RejectionFor<Tag extends string, Value> = RejectionClass<
  Tag,
  FieldsFor<Omit<Value, '_tag'>>
>

/** The Rejections a lowered command may answer: one per member of its mutation's `Refusal`, and three of its own. */
export type RejectionsOf<M extends LowerableMutation> = {
  readonly [Tag in RefusalOfMutation<M>['_tag']]: RejectionFor<
    Tag,
    Extract<RefusalOfMutation<M>, { readonly _tag: Tag }>
  >
} & {
  /** The guard refused who asks, a visitor included. */
  readonly Forbidden: RejectionFor<'Forbidden', { readonly _tag: 'Forbidden' }>
  /** The aggregate holds no row yet: nothing listed it. */
  readonly NotFound: RejectionFor<'NotFound', { readonly _tag: 'NotFound' }>
  /** The operation was decided before with another request. */
  readonly Reused: RejectionFor<'Reused', { readonly _tag: 'Reused'; readonly operation: string }>
}

type RejectionClassOf<M extends LowerableMutation> = RejectionsOf<M>[keyof RejectionsOf<M>]

type ReplyFieldsOf<M extends LowerableMutation> = {
  readonly [K in keyof RowOf<EntityOf<M>>]: Schema.optionalKey<
    Schema.Codec<RowOf<EntityOf<M>>[K], unknown>
  >
}

/**
 * The command a lowered write becomes, as `Domain.Command` types one: its
 * instance is the write's input less its `id`, its reply the fields it sets
 * and the revision.
 */
export type LoweredCommand<
  M extends LowerableMutation,
  Ev extends Domain.Event.Any,
  Ms extends Domain.Middleware.List,
> = CommandClass<
  M['name'],
  typeof Schema.String,
  FieldsFor<CommandInputOf<M>>,
  readonly [Ev],
  ReadonlyArray<RejectionClassOf<M>>,
  Schema.Struct<ReplyFieldsOf<M>>,
  Ms,
  Domain.Middleware.Apply<
    CommandRpc<
      M['name'],
      typeof Schema.String,
      FieldsFor<CommandInputOf<M>>,
      ReadonlyArray<RejectionClassOf<M>>,
      Schema.Struct<ReplyFieldsOf<M>>
    >,
    Ms
  >
>

/** An event that carries a whole row of the Entity. */
export type ListedEvent<E extends AnyEntity> = Domain.Event.Any &
  (new (...args: any[]) => { readonly _tag: string; readonly row: RowOf<E> })

/** One operation the aggregate decided, and the digest of the request it came with. */
interface Decided {
  readonly operation: string
  readonly digest: string
}

/** The aggregate's state: its row, none until listed, and the operations it last decided. */
export interface LoweredState<E extends AnyEntity> {
  readonly row: Option.Option<RowOf<E>>
  readonly operations: ReadonlyArray<Decided>
}

/** How many operations the aggregate remembers, to refuse one reused with another request. */
const REMEMBERED = 256

/** What `Lower.write` is given besides the mutation: what it cannot derive. */
export interface LowerConfig<
  M extends LowerableMutation,
  User,
  PrincipalId,
  Ms extends Domain.Middleware.List,
  Listed extends ListedEvent<EntityOf<M>>,
  Ev extends Domain.Event.Any,
> {
  /** The rules' implementations: the guard judges the write with them. */
  readonly policy: Policy<User, never>
  /** The field every event moves, which `expect` reads. */
  readonly revision: RevisionKey<EntityOf<M>>
  /** Who asks, as the command's middleware provides it: none for a visitor. */
  readonly principal: Context.Key<PrincipalId, Option.Option<User>>
  /** The middleware the command runs behind, which provides `principal`. */
  readonly middleware: Ms
  /** The event that makes a row exist, carrying the whole row. */
  readonly listed: Listed
  /** The event the command records. */
  readonly event: Ev
  /** The event recorded for a write that landed: which outcome it carries. */
  readonly record: (
    after: RowOf<EntityOf<M>>,
    before: RowOf<EntityOf<M>>,
    input: InputOf<M>,
  ) => Domain.Aggregate.InstanceOf<Ev>
  /** The row after the event: copies the outcome it carries, and decides nothing. */
  readonly apply: (
    row: RowOf<EntityOf<M>>,
    event: Domain.Aggregate.InstanceOf<Ev>,
  ) => RowOf<EntityOf<M>>
  /** The memory table the rules and invariants are judged by. `Operators.kernel` when not given. */
  readonly operators?: MemoryOperators | undefined
}

/** What a lowered write hands the aggregate, its View and the adapter. */
export interface Lowered<
  M extends LowerableMutation,
  PrincipalId,
  Ms extends Domain.Middleware.List,
  Listed extends Domain.Event.Any,
  Ev extends Domain.Event.Any,
> {
  readonly command: LoweredCommand<M, Ev, Ms>
  readonly rejections: RejectionsOf<M>
  /** The aggregate's state schema and the state of one never listed. */
  readonly state: Schema.Codec<LoweredState<EntityOf<M>>, unknown>
  readonly initial: LoweredState<EntityOf<M>>
  /** The command's handler: the write landed through the server's chain, then the `Reused` check. */
  readonly decide: (
    state: LoweredState<EntityOf<M>>,
    command: Domain.Aggregate.InstanceOf<LoweredCommand<M, Ev, Ms>>,
    ctx: DecideContext<string>,
  ) => Effect.Effect<
    ReadonlyArray<Domain.Aggregate.InstanceOf<Ev>>,
    Domain.Aggregate.InstanceOf<RejectionClassOf<M>>,
    PrincipalId
  >
  /** How each event folds into the aggregate's state. */
  readonly evolve: { readonly [Tag in Listed['tag'] | Ev['tag']]: EvolveOf<M, Listed, Ev, Tag> }
  /** The command's reply: the fields the write sets, and the revision. */
  readonly reply: (state: LoweredState<EntityOf<M>>) => Partial<RowOf<EntityOf<M>>>
  /** The by-id View's state and `evolve`, the aggregate's row field for field. */
  readonly view: {
    readonly state: EntityOf<M>['schema']
    readonly evolve: {
      readonly [Tag in Listed['tag'] | Ev['tag']]: ViewEvolveOf<M, Listed, Ev, Tag>
    }
  }
  /** The adapter's binding of the command, for the Api that serves it. */
  readonly binding: <A extends AnyApi>(api: A) => CommandBinding<M, A>
  /** The adapter's binding of the by-id View, for the Api that serves it under `name`. */
  readonly reads: <A extends AnyApi, const Name extends ViewNameOf<A>>(
    api: A,
    name: Name,
  ) => ViewBinding<EntityOf<M>, A>
}

type EventOfTag<
  Listed extends Domain.Event.Any,
  Ev extends Domain.Event.Any,
  Tag,
> = Domain.Aggregate.InstanceOf<Extract<Listed | Ev, { readonly tag: Tag }>>

type EvolveOf<
  M extends LowerableMutation,
  Listed extends Domain.Event.Any,
  Ev extends Domain.Event.Any,
  Tag,
> = (
  state: LoweredState<EntityOf<M>>,
  event: EventOfTag<Listed, Ev, Tag>,
  envelope: Envelope<string>,
) => LoweredState<EntityOf<M>>

type ViewEvolveOf<
  M extends LowerableMutation,
  Listed extends Domain.Event.Any,
  Ev extends Domain.Event.Any,
  Tag,
> = (row: RowOf<EntityOf<M>>, event: EventOfTag<Listed, Ev, Tag>) => RowOf<EntityOf<M>>

const fail_ = (message: string): never => {
  throw new Error(`[foldkit-remote-domain] ${message}`)
}

/** The input key a lowered write names its row by, which is the command's target. */
const ID = 'id'

/**
 * The operation and request digest a `commandId` names, when the adapter made
 * it (`${mutation}:${operation}:${digest}`); none for an id made otherwise,
 * such as Domain's own for a command sent without one.
 */
const decidedOf = (mutation: string, commandId: string): Option.Option<Decided> => {
  if (!commandId.startsWith(`${mutation}:`)) return Option.none()
  const rest = commandId.slice(mutation.length + 1)
  const at = rest.lastIndexOf(':')
  const digest = rest.slice(at + 1)
  return at > 0 && /^[0-9a-f]{32}$/.test(digest)
    ? Option.some({ operation: rest.slice(0, at), digest })
    : Option.none()
}

/** A store of the one row the aggregate holds, encoded as a memory backend holds it. */
const storeOf = (entity: string, row: Readonly<Record<string, unknown>>) => {
  let held = row
  const store: MemoryStore = {
    rows: name => (name === entity ? [held] : []),
    write: (name, _id, values) => {
      if (name === entity) held = { ...held, ...values }
    },
    remove: () => fail_(`a lowered update removed ${entity}'s row`),
  }
  return { store, row: () => held }
}

/**
 * Lowers a declared update into one Domain aggregate's command. Throws,
 * listing each, where `Lower.check` finds what keeps it out of one
 * aggregate, and where the write's id key is not `id`.
 *
 * The aggregate's state is its row (none until `listed` is recorded) and the
 * operations it last decided. `decide` lands the write through
 * `RemoteServer.write(mutation, GuardServer.writer(entity, policy,
 * RemoteServer.memoryWriter(store, entity), { revision }))` over that row and
 * records `record(after, before, input)`. Each refusal is the Rejection of the
 * same tag; a guard's refusal is `Forbidden`. To who the guard lets write, an
 * operation decided before with another request (another `commandId` digest)
 * is `Reused`, whatever the write would have answered: a retry is never a
 * second, different write. That holds only for `commandId`s the adapter made
 * (`${mutation}:${operation}:${digest}`); Domain answers a resent `commandId`
 * from its own record without calling `decide` at all.
 */
export const write = <
  M extends LowerableMutation,
  User,
  PrincipalId extends Domain.Middleware.Provides<Ms>,
  const Ms extends Domain.Middleware.List,
  Listed extends ListedEvent<EntityOf<M>>,
  Ev extends Domain.Event.Any,
>(
  mutation: M,
  config: LowerConfig<M, User, PrincipalId, Ms, Listed, Ev>,
): Lowered<M, PrincipalId, Ms, Listed, Ev> => {
  type E = EntityOf<M>
  type Row = RowOf<E>
  type Input = InputOf<M>
  const { write: declared } = mutation
  const entity: E = declared.input.entity
  const findings = check(declared)
  if (findings.length > 0)
    fail_(
      `${mutation.name} cannot be lowered into one aggregate: ${findings
        .map(finding =>
          Match.valueTags(finding, {
            OutsideBoundary: ({ source, name, reaches }) =>
              `its ${source} ${name} reads ${reaches.join(', ')}`,
            NotPersisted: ({ member }) => `it reads or sets ${member}, which the row does not hold`,
          }),
        )
        .join('; ')}`,
    )
  if (declared.id.key !== ID)
    fail_(`${mutation.name} names its row by ${declared.id.key}; a lowered write names it by ${ID}`)

  const Row = entity.schema as unknown as Schema.Codec<Row, Readonly<Record<string, unknown>>>
  const encodeRow = Schema.encodeSync(Row)
  const decodeRow = Schema.decodeUnknownSync(Row)
  const inputFields: Readonly<Record<string, Schema.Top>> = declared.input.schema.fields
  const commandFields = Object.fromEntries(
    Object.entries(inputFields).filter(([key]) => key !== ID),
  )
  const revision = config.revision as string
  const expected = Option.fromUndefinedOr(declared.expect)
  const replyKeys = [...new Set([...Write.writes(declared).map(member => member.key), revision])]
  const entityFields: Readonly<Record<string, Schema.Top>> = entity.schema.fields
  const replyFields = Object.fromEntries(replyKeys.map(key => [key, entityFields[key]!]))

  // ---------------------------------------------------------------- rejections

  // `Mutation.write` declares an update's `Refusal` as a union of tagged structs.
  const Refusal = mutation.Refusal as unknown as Schema.Union<
    ReadonlyArray<Schema.Struct<{ readonly _tag: Schema.tag<string> } & Schema.Struct.Fields>>
  >
  const rejectionByTag = new Map<string, Domain.Rejection.Any>()
  const refusalFields = new Map<string, ReadonlyArray<string>>()
  for (const member of Refusal.members) {
    const { _tag, ...fields } = member.fields
    const tag = SchemaAST.isLiteral(_tag.ast)
      ? String(_tag.ast.literal)
      : fail_(`${mutation.name}'s Refusal has a member with no literal tag`)
    rejectionByTag.set(tag, Domain.Rejection(tag, fields))
    refusalFields.set(tag, Object.keys(fields))
  }
  const Forbidden = Domain.Rejection('Forbidden')
  const NotFound = Domain.Rejection('NotFound')
  const Reused = Domain.Rejection('Reused', { operation: Schema.String })
  rejectionByTag.set('Forbidden', Forbidden)
  rejectionByTag.set('NotFound', NotFound)
  rejectionByTag.set('Reused', Reused)
  const rejections = Object.fromEntries(rejectionByTag) as unknown as RejectionsOf<M>
  type Rejected = Domain.Aggregate.InstanceOf<RejectionClassOf<M>>
  const reject = (tag: string, fields: object = {}): Rejected =>
    new (rejectionByTag.get(tag) as unknown as new (fields: object) => Rejected)(fields)

  const command = Domain.Command(mutation.name, {
    target: entityFields[ID] as Schema.Top & { readonly Type: string; readonly Encoded: string },
    input: commandFields,
    middleware: config.middleware,
    events: [config.event],
    rejects: [...rejectionByTag.values()],
    reply: replyFields,
  }) as unknown as LoweredCommand<M, Ev, Ms>

  // ---------------------------------------------------------------- the chain

  // Built for each command, over a copy of its row; built once here too, so a
  // writer or a guard that refuses the write does so where it is lowered.
  const chainOver = (store: MemoryStore) =>
    RemoteServer.write(
      mutation,
      GuardServer.writer(
        entity,
        config.policy,
        RemoteServer.memoryWriter<Option.Option<User>>(store, entity, {
          operators: config.operators,
        }),
        { revision: config.revision },
      ),
    )
  chainOver(storeOf(entity.name, {}).store)

  const remembered = (
    operations: ReadonlyArray<Decided>,
    commandId: string,
  ): ReadonlyArray<Decided> =>
    Option.match(decidedOf(mutation.name, commandId), {
      onNone: () => operations,
      onSome: decided =>
        [...operations.filter(each => each.operation !== decided.operation), decided].slice(
          -REMEMBERED,
        ),
    })

  const decide: Lowered<M, PrincipalId, Ms, Listed, Ev>['decide'] = (state, given, ctx) =>
    Effect.gen(function* () {
      const row = yield* Option.match(state.row, {
        onNone: () => Effect.fail(reject('NotFound')),
        onSome: row => Effect.succeed(row),
      })
      const principal = yield* config.principal
      const fields = given as unknown as Readonly<Record<string, unknown>>
      const input = {
        ...Object.fromEntries(Object.keys(commandFields).map(key => [key, fields[key]])),
        [ID]: ctx.id,
      } as Input
      /** The write landed over a copy of the row, which only a success keeps. */
      const land = (input: Input) => {
        const held = storeOf(entity.name, encodeRow(row))
        return chainOver(held.store)
          .run({
            input,
            principal,
            viewer: Option.none(),
            requestId: ctx.commandId,
            operation: Option.none(),
            now: DateTime.toEpochMillis(ctx.now),
            read: () => Effect.succeedNone,
          })
          .pipe(
            Effect.map(() => decodeRow(held.row())),
            Effect.catchTags({
              MutationRefused: ({ refusal }) =>
                Schema.is(Refusal)(refusal)
                  ? Effect.fail(
                      reject(
                        refusal._tag,
                        Object.fromEntries(
                          (refusalFields.get(refusal._tag) ?? []).map(key => [
                            key,
                            (refusal as unknown as Readonly<Record<string, unknown>>)[key],
                          ]),
                        ),
                      ),
                    )
                  : Effect.die(
                      new Error(`${mutation.name} was refused with what it does not declare`),
                    ),
              Forbidden: () => Effect.fail(reject('Forbidden')),
              Unauthenticated: () => Effect.fail(reject('Forbidden')),
              RemoteServerError: error => Effect.die(error),
            }),
          )
      }
      const asked = decidedOf(mutation.name, ctx.commandId)
      const reused = Option.filter(asked, ({ operation, digest }) =>
        state.operations.some(each => each.operation === operation && each.digest !== digest),
      )
      if (Option.isSome(reused)) {
        // Only who the guard lets write the row learns the operation was used:
        // judged at the row's own revision, since a stale one is a conflict
        // decided before any rule.
        const judged = yield* Effect.result(
          land(
            Option.match(expected, {
              onNone: () => input,
              onSome: ({ key, field }) => ({
                ...input,
                [key]: (row as Readonly<Record<string, unknown>>)[field.key],
              }),
            }),
          ),
        )
        return yield* Effect.fail(
          Result.isFailure(judged) && Schema.is(Forbidden)(judged.failure)
            ? judged.failure
            : reject('Reused', { operation: reused.value.operation }),
        )
      }
      const after = yield* land(input)
      return [config.record(after, row, input)]
    })

  // ---------------------------------------------------------------- evolve, reply, View

  const listedTag = config.listed.tag
  const eventTag = config.event.tag
  const evolve = {
    [listedTag]: (state: LoweredState<E>, event: { readonly row: Row }) => ({
      ...state,
      row: Option.some(event.row),
    }),
    [eventTag]: (
      state: LoweredState<E>,
      event: Domain.Aggregate.InstanceOf<Ev>,
      envelope: Envelope<string>,
    ) => ({
      row: Option.map(state.row, row => config.apply(row, event)),
      operations: remembered(state.operations, envelope.commandId),
    }),
  } as unknown as Lowered<M, PrincipalId, Ms, Listed, Ev>['evolve']

  const reply = (state: LoweredState<E>): Partial<Row> =>
    Option.match(state.row, {
      onNone: () => fail_(`${mutation.name} replied for a row the aggregate does not hold`),
      onSome: row =>
        Object.fromEntries(
          replyKeys.map(key => [key, (row as Readonly<Record<string, unknown>>)[key]]),
        ) as Partial<Row>,
    })

  const view = {
    state: entity.schema,
    evolve: {
      [listedTag]: (_: Row, event: { readonly row: Row }) => event.row,
      [eventTag]: (row: Row, event: Domain.Aggregate.InstanceOf<Ev>) => config.apply(row, event),
    } as unknown as Lowered<M, PrincipalId, Ms, Listed, Ev>['view']['evolve'],
  }

  // ---------------------------------------------------------------- the adapter's bindings

  const refusalOf =
    (tag: string) =>
    (rejection: unknown): ReturnType<typeof refuse<RefusalOfMutation<M>>> =>
      refuse({
        _tag: tag,
        ...Object.fromEntries(
          (refusalFields.get(tag) ?? []).map(key => [
            key,
            (rejection as Readonly<Record<string, unknown>>)[key],
          ]),
        ),
      } as RefusalOfMutation<M>)
  const refusals = {
    ...Object.fromEntries([...refusalFields.keys()].map(tag => [tag, refusalOf(tag)])),
    Forbidden: () => forbid(),
    NotFound: () => fail(`no such ${entity.name}`),
    Reused: () => fail('this operation was sent before with another request'),
  }
  const binding = <A extends AnyApi>(api: A): CommandBinding<M, A> =>
    bindCommand(
      mutation,
      api,
      mutation.name as CommandNameOf<A>,
      {
        target: (input: Readonly<Record<string, unknown>>) => input[ID] as string,
        input: (input: Readonly<Record<string, unknown>>) =>
          Object.fromEntries(Object.keys(commandFields).map(key => [key, input[key]])),
        refusals,
        written: (reply: Partial<Row>) => reply,
      } as never,
    )
  const reads = <A extends AnyApi, const Name extends ViewNameOf<A>>(
    api: A,
    name: Name,
  ): ViewBinding<E, A> => bindView(entity, api, name, { revision: config.revision })

  return {
    command,
    rejections,
    state: Schema.Struct({
      row: Schema.OptionFromNullOr(entity.schema),
      operations: Schema.Array(Schema.Struct({ operation: Schema.String, digest: Schema.String })),
    }) as unknown as Schema.Codec<LoweredState<E>, unknown>,
    initial: { row: Option.none(), operations: [] },
    decide,
    evolve,
    reply,
    view,
    binding,
    reads,
  }
}
