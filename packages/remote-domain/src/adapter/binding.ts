/**
 * The bindings that tie a Domain Api to Remote's declarations: a View to the
 * Entity it serves, a command to the mutation it lands. Every name and key is
 * checked against the Api's and the Entity's own, by type where it is written
 * and again where the binding is made.
 */
import type * as Domain from '@alchemy.run/domain'
import { Option, Schema, SchemaAST } from 'effect'
import type { AnyEntity, AnyWrite } from 'foldkit-entity'
import { Guards, type AnyRule } from 'foldkit-guard'
import type { MutationDescriptor } from 'foldkit-remote'

/** Any Domain Api, by the parts the adapter reads. */
export type AnyApi = Domain.Api.Any

type Served<A extends AnyApi> = A['serves'][number]

/** The Views an Api serves. */
export type ViewsOf<A extends AnyApi> = Extract<Served<A>, Domain.View.Any>

/** The name of a View an Api serves. */
export type ViewNameOf<A extends AnyApi> = ViewsOf<A>['viewName']

/** The tag of a command an Api serves. */
export type CommandNameOf<A extends AnyApi> = Domain.Api.CommandsOf<A>['tag']

/** The command an Api serves under `Name`. */
export type CommandOf<A extends AnyApi, Name extends CommandNameOf<A>> = Extract<
  Domain.Api.CommandsOf<A>,
  { readonly tag: Name }
>

/** The Rejections a command declares, as the client fails with them: class instances. */
export type RejectionOf<C extends Domain.Command.Any> = Domain.Aggregate.InstanceOf<
  C['rejects'][number]
>

/** The tag of each Rejection a command declares. */
export type RejectionTagOf<C extends Domain.Command.Any> =
  RejectionOf<C> extends { readonly _tag: infer Tag extends string } ? Tag : never

/** What a command answers besides its receipt. */
export type ReplyOf<C extends Domain.Command.Any> = C['reply'] extends Schema.Top
  ? C['reply']['Type']
  : void

/** What a command takes after its target. */
export type CommandInputOf<C extends Domain.Command.Any> = Omit<C['Type'], '_tag'>

/** The Entity fields stored as a number, which alone can order two snapshots. */
export type RevisionKey<E extends AnyEntity> = {
  readonly [K in keyof E['fields']]: E['fields'][K]['schema']['Type'] extends number ? K : never
}[keyof E['fields']] &
  string

/** Some of an Entity's field values, decoded. */
export type FieldValues<E extends AnyEntity> = {
  readonly [K in keyof E['fields']]?: E['fields'][K]['schema']['Type']
}

/** Any mutation an application declares. */
export type AnyMutation = MutationDescriptor<string, any, any, any>

type InputOfMutation<M extends AnyMutation> =
  M extends MutationDescriptor<string, infer Input, any, any> ? Input : never

/** What a mutation's server may refuse it with, decoded. */
export type RefusalOfMutation<M extends AnyMutation> =
  M extends MutationDescriptor<string, any, any, infer Refused> ? Refused : never

/** The Entity a declared write lands on. */
type WrittenEntity<M extends AnyMutation> = M extends { readonly write: infer W extends AnyWrite }
  ? W['input']['entity']
  : never

/** A Rejection answered as the mutation's own `Refusal`. */
export interface Refuse<R> {
  readonly _tag: 'Refuse'
  readonly refusal: R
}

/** A Rejection answered as `RemoteForbidden`: who asks may not, with their reason when given. */
export interface Forbid {
  readonly _tag: 'Forbid'
  readonly reason: Option.Option<string>
}

/** A Rejection answered as `RemoteUnauthenticated`: nobody is signed in, with a reason when given. */
export interface Unauthenticated {
  readonly _tag: 'Unauthenticated'
  readonly reason: Option.Option<string>
}

/** A Rejection answered as a `RemoteMutationError` with no refusal: a message, nothing to match on. */
export interface Fail {
  readonly _tag: 'Fail'
  readonly message: string
}

/** How one Rejection reaches Remote. */
export type Outcome<R> = Refuse<R> | Forbid | Unauthenticated | Fail

/** A View bound to the Entity whose rows it serves. */
export interface ViewBinding<E extends AnyEntity = AnyEntity, A extends AnyApi = AnyApi> {
  readonly entity: E
  readonly api: A
  readonly view: ViewNameOf<A>
  /** The field every event moves: the order of two snapshots of one key. */
  readonly revision: RevisionKey<E>
  /** What the View's `validate` refuses a read with: the row is absent to who asks. */
  readonly rejections: ReadonlyArray<Domain.Rejection.Any>
}

/** What `DomainRemote.view` takes besides the Entity, the Api and the View's name. */
export interface ViewConfig<E extends AnyEntity> {
  /**
   * The field every event moves: the order of two snapshots of one key. It
   * must rise across the stream's whole life, deletion included: a key
   * created again at a revision no higher than the one it was deleted or
   * hidden at stays absent to who saw that, until a later revision.
   */
  readonly revision: RevisionKey<E>
}

/** One mapper per Rejection the command declares, each named by its tag. */
export type Refusals<C extends Domain.Command.Any, M extends AnyMutation> = {
  readonly [Tag in RejectionTagOf<C>]: (
    rejection: Extract<RejectionOf<C>, { readonly _tag: Tag }>,
  ) => Outcome<RefusalOfMutation<M>>
}

/** The row's values a command wrote, from its reply and the mutation's input. */
export type Written<M extends AnyMutation, C extends Domain.Command.Any, E extends AnyEntity> = (
  reply: ReplyOf<C>,
  input: InputOfMutation<M>,
) => FieldValues<E>

/** What `DomainRemote.command` takes besides the mutation, the Api and the command's name. */
export type CommandConfig<
  M extends AnyMutation,
  C extends Domain.Command.Any,
  E extends AnyEntity,
> = {
  /** The aggregate the command is sent to, which is also the View key a write raises the floor of. */
  readonly target: (input: InputOfMutation<M>) => string
  /** The command's input, from the mutation's. */
  readonly input: (input: InputOfMutation<M>) => CommandInputOf<C>
} & ([RejectionOf<C>] extends [never]
  ? { readonly refusals?: {} }
  : { readonly refusals: Refusals<C, M> }) &
  ([WrittenEntity<M>] extends [never]
    ? {
        /** The Entity whose View key the command writes: a declared write names its own. */
        readonly entity: E
        /** The row's values the command wrote; without it, the write answers no row until its View catches up. */
        readonly written?: Written<M, C, E>
      }
    : {
        /**
         * The row's values the command wrote, from its reply: what the write
         * answers when the View has not caught up.
         */
        readonly written: Written<M, C, E>
      })

/** A command bound to the mutation it lands. */
export interface CommandBinding<M extends AnyMutation = AnyMutation, A extends AnyApi = AnyApi> {
  readonly mutation: M
  readonly api: A
  readonly command: CommandNameOf<A>
  /** The Entity whose View key the command writes. */
  readonly entity: AnyEntity
  readonly target: (input: unknown) => string
  readonly input: (input: unknown) => unknown
  /** Each Rejection the command declares, and how it reaches Remote, by tag. */
  readonly rejections: ReadonlyArray<Domain.Rejection.Any>
  readonly refusals: ReadonlyMap<string, (rejection: unknown) => Outcome<unknown>>
  readonly written: Option.Option<
    (reply: unknown, input: unknown) => Readonly<Record<string, unknown>>
  >
}

/** The Entity a mutation's `CommandConfig` writes: its write's, or the one named. */
export type EntityOfMutation<M extends AnyMutation, Given extends AnyEntity> = [
  WrittenEntity<M>,
] extends [never]
  ? Given
  : WrittenEntity<M>

// ---------------------------------------------------------------- constructors

const fail_ = (message: string): never => {
  throw new Error(`[foldkit-remote-domain] ${message}`)
}

/** The Entity's own id field, which a View keys rather than holds. */
const ID = 'id'

/** The fields a View's state declares, or none when its state is no struct. */
const stateFieldsOf = (view: Domain.View.Any): Option.Option<ReadonlySet<PropertyKey>> => {
  const state = view.definition.state
  return state !== undefined && SchemaAST.isObjects(state.ast)
    ? Option.some(new Set(state.ast.propertySignatures.map(each => each.name)))
    : Option.none()
}

/**
 * Binds a View to the Entity whose rows it serves. Throws, naming it, for a
 * View the Api does not serve, an Entity field its state lacks, or a
 * `revision` the Entity does not store as a number.
 */
export const view = <E extends AnyEntity, A extends AnyApi, const Name extends ViewNameOf<A>>(
  entity: E,
  api: A,
  name: Name,
  config: ViewConfig<E>,
): ViewBinding<E, A> => {
  const served = api.serves.find(
    (each): each is Domain.View.Any => each.kind === 'View' && each.viewName === name,
  )
  if (served === undefined) return fail_(`${api.apiName} serves no View named ${name}`)
  const state = Option.getOrElse(stateFieldsOf(served), () =>
    fail_(`${name} has no state of fields to read ${entity.name} from`),
  )
  for (const field of Object.keys(entity.fields)) {
    if (field !== ID && !state.has(field))
      fail_(`${name}'s state has no field ${field}, which ${entity.name} declares`)
  }
  const revision = config.revision as string
  const field: { readonly schema: Schema.Top } | undefined = Object.hasOwn(entity.fields, revision)
    ? entity.fields[revision]
    : undefined
  const stored = field === undefined ? undefined : Schema.toEncoded(field.schema).ast
  if (stored === undefined || !SchemaAST.isNumber(stored))
    fail_(`${entity.name}'s revision ${revision} is not a field stored as a number`)
  return Object.freeze({
    entity,
    api,
    view: name,
    revision: config.revision,
    rejections: served.definition.rejects ?? [],
  })
}

/** The rules a surface of the row carries, where they restrict who passes. */
const rowRules = (entity: AnyEntity, interaction: string): Option.Option<ReadonlyArray<AnyRule>> =>
  Option.flatMap(Guards.attached(entity), attachment =>
    Option.filter(
      Option.fromUndefinedOr(attachment.row[interaction]?.rules),
      rules => !rules.some(rule => rule._tag === 'All' && rule.rules.length === 0),
    ),
  )

/**
 * Refuses `written` where a reply could show who may write a row what they
 * may not read: a Read rule of the row the Update rules do not imply (each
 * Update rule is one of the Read rules), or a Read rule on a member.
 */
const checkWritten = (entity: AnyEntity, mutation: string): void => {
  const refuse = (why: string) =>
    fail_(`${mutation} cannot answer with its reply: ${why}. Read ${entity.name} through its View`)
  const read = rowRules(entity, 'Read')
  if (Option.isSome(read)) {
    const update = Option.getOrElse(rowRules(entity, 'Update'), () => [])
    if (update.length === 0 || !update.every(rule => read.value.includes(rule)))
      refuse(`${entity.name} has a Read rule its Update rules do not imply`)
  }
  const attachment = Guards.attached(entity)
  if (Option.isSome(attachment)) {
    for (const [member, surfaces] of Object.entries(attachment.value.members)) {
      if (surfaces['Read'] !== undefined) refuse(`${entity.name}.${member} has a Read rule`)
    }
  }
}

/**
 * Binds a command to the mutation it lands. Throws, naming it, for a command
 * the Api does not serve, and for `written` on an Entity whose reader may not
 * be every writer.
 */
export const command = <
  M extends AnyMutation,
  A extends AnyApi,
  const Name extends CommandNameOf<A>,
  Given extends AnyEntity = never,
>(
  mutation: M,
  api: A,
  name: Name,
  config: CommandConfig<M, CommandOf<A, Name>, EntityOfMutation<M, Given>>,
): CommandBinding<M, A> => {
  const served = api.commands.find(each => each.tag === name)
  if (served === undefined) return fail_(`${api.apiName} serves no command named ${name}`)
  const given = config as {
    readonly entity?: AnyEntity
    readonly refusals?: Readonly<Record<string, (rejection: unknown) => Outcome<unknown>>>
    readonly written?: (reply: unknown, input: unknown) => Readonly<Record<string, unknown>>
  }
  const entity =
    mutation.write?.input.entity ??
    given.entity ??
    fail_(`${mutation.name} is no declared write, so its binding names the Entity it writes`)
  if (given.written !== undefined) checkWritten(entity, mutation.name)
  return Object.freeze({
    mutation,
    api,
    command: name,
    entity,
    target: config.target as (input: unknown) => string,
    input: config.input as (input: unknown) => unknown,
    rejections: served.rejects,
    refusals: new Map(Object.entries(given.refusals ?? {})),
    written: Option.fromUndefinedOr(given.written),
  })
}

/** Answers a Rejection as the mutation's own `Refusal`. */
export const refuse = <const R>(refusal: R): Refuse<R> => ({ _tag: 'Refuse', refusal })

/** Answers a Rejection as `RemoteForbidden`, with words for who asked when given. */
export const forbid = (reason?: string): Forbid => ({
  _tag: 'Forbid',
  reason: Option.fromUndefinedOr(reason),
})

/** Answers a Rejection as `RemoteUnauthenticated`: who asks must sign in first. */
export const unauthenticated = (reason?: string): Unauthenticated => ({
  _tag: 'Unauthenticated',
  reason: Option.fromUndefinedOr(reason),
})

/** Answers a Rejection as a `RemoteMutationError` with no refusal to match on. */
export const fail = (message: string): Fail => ({ _tag: 'Fail', message })
