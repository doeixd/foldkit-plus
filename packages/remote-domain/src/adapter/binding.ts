/**
 * The bindings that tie a Domain Api to Remote's declarations: a View to the
 * Entity it serves, a command to the mutation it lands. Only types: every name
 * and key is checked against the Api's and the Entity's own.
 */
import type * as Domain from '@alchemy.run/domain'
import type { Option, Schema } from 'effect'
import type { AnyEntity, AnyWrite } from 'foldkit-entity'
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

/** A Rejection answered as a `RemoteMutationError` with no refusal: a message, nothing to match on. */
export interface Fail {
  readonly _tag: 'Fail'
  readonly message: string
}

/** How one Rejection reaches Remote. */
export type Outcome<R> = Refuse<R> | Forbid | Fail

/** A View bound to the Entity whose rows it serves. */
export interface ViewBinding<E extends AnyEntity = AnyEntity, A extends AnyApi = AnyApi> {
  readonly entity: E
  readonly api: A
  readonly view: ViewNameOf<A>
  /** The field every event moves: the order of two snapshots of one key. */
  readonly revision: RevisionKey<E>
}

/** What `DomainRemote.view` takes besides the Entity, the Api and the View's name. */
export interface ViewConfig<E extends AnyEntity> {
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
  /** Each Rejection the command declares, by tag. */
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
