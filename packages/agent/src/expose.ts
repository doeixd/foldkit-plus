import type { Duration } from 'effect'
import { Predicate, Schema } from 'effect'
import type { MessageUnion } from 'foldkit/message'
import type { Action, MessageSet } from 'foldkit-surface'
import { toJsonSchema } from './jsonSchema.js'
import { messageTag } from './tag.js'
import { type CompiledCompletion, compileCompletion } from './completion.js'
import { type SnakeCase, assertValidName, defaultName } from './naming.js'
import type {
  AnyCompletion,
  AnyMessage,
  CompletionOutcome,
  Correlation,
  InvocationContext,
  MessageConstructor,
  MessageOutcome,
  StateCompletion,
  StateOutcome,
  VariantConfig,
} from './types.js'

type Fields = Schema.Struct.Fields

/** The variant-name-to-fields map a `defineMessageUnion` was declared with. */
export type Cases = Record<string, Fields>

/** The literal tag a Message constructor produces. */
type TagOfConstructor<C> = C extends (...args: never[]) => infer M
  ? M extends { readonly _tag: infer Tag extends string }
    ? Tag
    : never
  : never

/** The subset of a union's cases that a constructor tuple selects. */
export type SubsetCases<AllCases extends Cases, Ms extends readonly unknown[]> = Pick<
  AllCases,
  TagOfConstructor<Ms[number]> & keyof AllCases
>

/**
 * The callable constructor for one variant of a Message union.
 *
 * Extracted with `infer` rather than `Parameters<...>` of an intersection: an
 * intersection with `(input: any) => AnyMessage` resolves to that last
 * signature and silently widens every payload to `any`.
 */
type ConstructorFor<C extends Cases, Tag extends keyof C & string> = MessageUnion<C>[Tag]

/** The payload an internal Message constructor accepts, e.g. `{ id: string }`. */
export type MessageInputOf<C extends Cases, Tag extends keyof C & string> =
  ConstructorFor<C, Tag> extends (value: infer Input) => any ? Input : never

/**
 * The external input of one variant: its `input` codec's decoded type, or the
 * Message payload when it declares no `input`.
 *
 * `Ext` is inferred per tag by `expose`, from the `input` codec sitting beside
 * the callbacks. A variant without `input` leaves the inference with no
 * candidate, which resolves to `unknown`; that is the direct form, whose
 * external input *is* the payload.
 */
type ExternalOr<Ext, MessageInput> = unknown extends Ext ? MessageInput : Ext

/** A variant that exposes its internal Message payload directly. */
type DirectVariant<MessageInput, Ext, Model, Principal> = VariantConfig<
  MessageInput,
  ExternalOr<Ext, MessageInput>,
  Model,
  Principal,
  MessageInput,
  any,
  any
> & {
  readonly input?: undefined
  readonly toMessage?: undefined
}

/** A variant that maps a distinct external input onto its internal Message. */
type MappedVariant<MessageInput, Ext, Model, Principal> = VariantConfig<
  MessageInput,
  ExternalOr<Ext, MessageInput>,
  Model,
  Principal,
  MessageInput,
  any,
  any
> & {
  // The one place `Ext` appears bare: this is the site `expose` infers it from.
  readonly input: Schema.Codec<Ext, any, never, never>
  readonly toMessage: (
    input: ExternalOr<Ext, MessageInput>,
    context: InvocationContext<Model, Principal>,
  ) => MessageInput
}

/**
 * Constrains each key of the supplied variants object.
 *
 * Keys must be tags of the union. A variant is a bare description string, or
 * exposes its Message payload directly, or supplies both `input` and
 * `toMessage`; an object with `input` alone matches no member and is rejected.
 *
 * This is mapped over `keyof Ext`, not `keyof C`, which makes it a reverse
 * mapped type: `expose` infers one `Ext[Tag]` per declared variant, from that
 * variant's own `input` codec, before it contextually types the callbacks
 * beside it. That is what lets `authorize` and `toMessage` see a real input
 * type instead of `any`. The tag check moves into the template, because an
 * intersection is not subject to excess property checking.
 *
 * The direct and mapped members must agree on the type of every field a nested
 * object literal is written into. A nested literal whose contextual type
 * differs between union members gets no contextual type at all, and
 * `correlate`'s parameters then fail `noImplicitAny` -- so `completion`'s
 * request is the Message payload in both, and `Agent.variant` remains where a
 * mapped input and the named Messages are checked together.
 */
export type ValidateVariants<C extends Cases, Ext, Model, Principal> = {
  readonly [Tag in keyof Ext]: Tag extends keyof C & string
    ?
        | DirectVariant<MessageInputOf<C, Tag>, Ext[Tag], Model, Principal>
        | (MappedVariant<MessageInputOf<C, Tag>, Ext[Tag], Model, Principal> & {
            // Set by `Agent.action`: the Message it makes must be this tag's.
            readonly messageTag?: Tag
          })
        | string
    : never
}

/** The tags of the union that this variants object exposes. */
type ExposedTags<C extends Cases, V> = Extract<keyof V, keyof C & string>

/**
 * What an agent puts on the wire for a variant.
 *
 * Dispatch decodes, so this is the schema's **encoded** side, not its decoded
 * one. A payload of `Schema.NumberFromString` is sent as a string and reaches
 * `update` as a number; typing the call site with the decoded type would reject
 * the input that actually works.
 */
type ExternalInputFor<C extends Cases, V, Tag extends keyof C & string> = V[Tag & keyof V] extends {
  readonly input: Schema.Codec<any, infer Encoded, any, any>
}
  ? Encoded
  : Schema.Struct.Encoded<C[Tag]>

/** The protocol-facing name of a variant: its override, or the normalized tag. */
type NameFor<Config, Tag extends string> = Config extends {
  readonly name: infer Name extends string
}
  ? Name
  : SnakeCase<Tag>

/**
 * What the capability maps read of each declared variant: its `name`, its
 * `input`, and its completion as the outcome a dispatch returns, and nothing
 * else a contract's type would then carry, such as a completion's `success`
 * constructor: its type lives in `foldkit/schema`, and a project emitting
 * declarations without importing that cannot name it (TS2883,
 * `examples/todo`). The outcome holds Messages, which a declaration can write.
 *
 * The conditional is load-bearing: a resolved branch keeps no alias, so a
 * declaration writes the reduced object rather than `DeclaredVariants<…>`
 * around the whole variants object.
 */
export type DeclaredVariants<V> = V extends unknown
  ? {
      readonly [Tag in keyof V]: {
        readonly [
          Key in keyof V[Tag] as Key & ('name' | 'input' | 'completion')
        ]: Key extends 'completion' ? DeclaredOutcome<V[Tag]> : V[Tag][Key]
      }
    }
  : never

/**
 * The outcome of a variant's completion: carried by `Agent.variant`, which
 * erases the contract itself, or read off an inline contract.
 */
type DeclaredOutcome<Config> = '~outcome' extends keyof Config
  ? Config[keyof Config & '~outcome']
  : OutcomeOf<Config[keyof Config & 'completion']>

/** The outcome an inline completion contract resolves with. */
type OutcomeOf<Contract> = Contract extends { readonly _tag: 'StateCompletion' }
  ? StateOutcome
  : Contract extends { readonly success: infer Success extends Constructors }
    ? MessageOutcome<
        MessageOf<Success>,
        Contract extends { readonly failure: infer Failure extends Constructors }
          ? MessageOf<Failure>
          : never
      >
    : never

/** Capability input types keyed by protocol name, for dispatching by name. */
export type CapabilitiesByName<C extends Cases, V> = {
  readonly [Tag in ExposedTags<C, V> as NameFor<V[Tag], Tag>]: ExternalInputFor<C, V, Tag>
}

/**
 * Capability types keyed by Message tag.
 *
 * Each entry carries the agent-facing input and the Message the capability
 * constructs, so a host can be required to accept what the contract produces.
 */
export type CapabilitiesByTag<C extends Cases, V> = {
  readonly [Tag in ExposedTags<C, V>]: {
    readonly input: ExternalInputFor<C, V, Tag>
    readonly message: MessageFor<C, Tag>
    /** How a dispatch of it finishes; `undefined` without a completion contract. */
    readonly completion: 'completion' extends keyof V[Tag]
      ? V[Tag][keyof V[Tag] & 'completion']
      : undefined
  }
}

/** The Message a capability constructs. */
type MessageFor<C extends Cases, Tag extends keyof C & string> =
  ConstructorFor<C, Tag> extends (value: any) => infer Message ? Message : AnyMessage

/** The default name map: any name, unknown input. Adapters work against this. */
export type AnyCapabilitiesByName = Record<string, unknown>

/** The default tag map: any tag, unknown input, any Message, any outcome. */
export type AnyCapabilitiesByTag = Record<
  string,
  {
    readonly input: unknown
    readonly message: AnyMessage
    readonly completion: CompletionOutcome | undefined
  }
>

/** One compiled capability: everything an adapter needs, and nothing application-specific. */
export interface ExposedVariant<Model = unknown, Principal = unknown> {
  readonly tag: string
  readonly name: string
  readonly description: string
  /** The Effect Schema agent input crosses before dispatch. */
  readonly inputSchema: Schema.Codec<any, any, never, never>
  /** JSON Schema derived from `inputSchema`. */
  readonly inputJsonSchema: Record<string, unknown>
  /** Constructs the internal Foldkit Message. */
  readonly construct: (input: unknown, context: InvocationContext<Model, Principal>) => AnyMessage
  /** The union's own constructor, so a caller can name this capability by reference. */
  readonly messageConstructor: unknown
  readonly available?: ((model: Model) => boolean) | undefined
  readonly authorize?: VariantConfig<any, any, Model, Principal>['authorize']
  readonly applies?: VariantConfig<any, any, Model, Principal>['applies']
  readonly completion?: AnyCompletion | undefined
  /** The completion contract compiled to the tags and predicate the runtime matches on. */
  readonly compiledCompletion?: CompiledCompletion | undefined
}

/**
 * An agent-safe projection of a Foldkit Message union.
 *
 * `ByName` and `ByTag` carry each capability's input type, so dispatching by
 * name or by Message constructor stays checked. They default to the permissive
 * maps, which is what a protocol adapter binds against.
 */
export interface ExposedMessages<
  Model = unknown,
  Principal = unknown,
  ByName = AnyCapabilitiesByName,
  ByTag = AnyCapabilitiesByTag,
> {
  readonly variants: ReadonlyArray<ExposedVariant<Model, Principal>>
  /** Type-only witnesses. Never populated at runtime. */
  readonly '~capabilities'?: { readonly byName: ByName; readonly byTag: ByTag }
}

/**
 * The schema for a capability that takes no input.
 *
 * `Schema.Struct({})` is not an empty-object schema: it accepts `{ foo: 1 }`,
 * `[]`, and `"str"` alike, even with `onExcessProperty: 'error'`. A record with
 * no permitted values accepts `{}` and nothing else, which is what the derived
 * JSON Schema advertises.
 */
const EmptyPayload = Schema.Record(Schema.String, Schema.Never)

/** True for a struct Schema with no fields, whose JSON Schema needs normalizing. */
const isEmptyStruct = (schema: unknown): boolean => {
  const fields = (schema as { fields?: Record<string, unknown> }).fields
  return fields !== undefined && Object.keys(fields).length === 0
}

/**
 * Rejects anything but a plain object with no properties.
 *
 * Appended to a supplied empty struct rather than replacing it: replacing it
 * threw away the schema's own checks, annotations and decoding, while `Struct({})`
 * on its own accepts `{ foo: 1 }`, `[]` and `"str"`. Adding the check closes that
 * hole and keeps everything the caller declared.
 */
const closedEmptyObject = Schema.makeFilter((value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === 0
    ? undefined
    : 'Expected an empty object',
)

/** One completing Message constructor, or several. */
type Constructors = MessageConstructor | ReadonlyArray<MessageConstructor>

/** The Message type a constructor, or a list of them, produces. */
type MessageOf<Of extends Constructors> =
  Of extends ReadonlyArray<MessageConstructor<infer Message>>
    ? Message
    : Of extends MessageConstructor<infer Message>
      ? Message
      : never

/**
 * A completion contract whose `correlate` follows the contract itself.
 *
 * Spelled out rather than reusing `Completion`, because `success` and `failure`
 * are inference sites here: `result` is the union of the Messages this contract
 * actually names, and `request` the decoded input beside it.
 */
type VariantCompletion<Request, Success extends Constructors, Failure extends Constructors> = {
  readonly success: Success
  readonly failure?: Failure | undefined
  readonly correlate?:
    | ((
        request: Request,
        result: MessageOf<Success> | MessageOf<Failure>,
        call: Correlation,
      ) => boolean)
    | undefined
  readonly timeout?: Duration.Input | undefined
}

/**
 * What `Agent.variant` returns: its config, with the completion contract
 * erased to `AnyCompletion` and kept as the `Outcome` a dispatch returns.
 *
 * Named, and free of the `success` and `failure` constructors, so a project
 * emitting declarations can write a contract's type: the constructor's own
 * type lives in `foldkit/schema`, which such a project need not import, and
 * its inferred definition then failed with TS2883. An omitted `name` is
 * absent, not `name?: string`, which `NameFor` would read as any key.
 */
export type Variant<
  ExternalInput,
  Encoded,
  MessageInput,
  Name extends string | undefined = undefined,
  Model = any,
  Principal = any,
  Outcome extends CompletionOutcome | undefined = CompletionOutcome | undefined,
> = {
  readonly description: string
  readonly available?: ((model: Model) => boolean) | undefined
  readonly input: Schema.Codec<ExternalInput, Encoded, never, never>
  readonly toMessage: (
    input: ExternalInput,
    context: InvocationContext<Model, Principal>,
  ) => MessageInput
  readonly authorize?: VariantConfig<MessageInput, ExternalInput, Model, Principal>['authorize']
  readonly applies?: VariantConfig<MessageInput, ExternalInput, Model, Principal>['applies']
  // Erased: the contract was checked against this variant's own input, and
  // `expose`'s constraint types `completion` for the inline form, which is a
  // different (internal) request type.
  readonly completion?: AnyCompletion | undefined
  /** Types only: the outcome of `completion`, which dispatch returns. Never set. */
  readonly '~outcome'?: Outcome
} & (undefined extends Name ? { readonly name?: undefined } : { readonly name: Name })

/**
 * The outcome `Agent.variant` read off its completion. A state contract leaves
 * `Success` uninferred and infers `State`; no contract leaves both.
 */
type VariantOutcome<Success extends Constructors, Failure extends Constructors, State> = [
  Success,
] extends [never]
  ? [State] extends [never]
    ? undefined
    : StateOutcome
  : MessageOutcome<MessageOf<Success>, MessageOf<Failure>>

/**
 * Types a variant that maps a distinct external input onto its Message.
 *
 * `expose` already infers `toMessage` and `authorize` from the `input` codec
 * beside them. What it cannot infer inline is `completion`: `success` and
 * `failure` are inference sites here, so `correlate`'s `result` is the union of
 * the Messages this contract actually names rather than any Message.
 *
 * @example
 * ```ts
 * Agent.expose(Message, {
 *   RequestedDeleteTodo: Agent.variant({
 *     description: 'Delete a todo',
 *     input: Schema.Struct({ id: Schema.String }),
 *     toMessage: ({ id }, { invocation }) => ({ id, requestId: invocation.id }),
 *   }),
 * })
 * ```
 */
export const variant = <
  ExternalInput,
  Encoded,
  MessageInput,
  Success extends Constructors = never,
  Failure extends Constructors = never,
  const Name extends string | undefined = undefined,
  Model = any,
  Principal = any,
  State extends StateCompletion<ExternalInput, Model> = never,
>(config: {
  readonly name?: Name
  readonly description: string
  readonly available?: ((model: Model) => boolean) | undefined
  readonly input: Schema.Codec<ExternalInput, Encoded, never, never>
  readonly toMessage: (
    input: ExternalInput,
    context: InvocationContext<Model, Principal>,
  ) => MessageInput
  readonly authorize?: VariantConfig<MessageInput, ExternalInput, Model, Principal>['authorize']
  readonly applies?: VariantConfig<MessageInput, ExternalInput, Model, Principal>['applies']
  readonly completion?: VariantCompletion<ExternalInput, Success, Failure> | State | undefined
}): Variant<
  ExternalInput,
  Encoded,
  MessageInput,
  Name,
  Model,
  Principal,
  VariantOutcome<Success, Failure, State>
> => config as never

/**
 * A `foldkit-surface` Action as a variant: its name, description and input,
 * ending in the Message it makes. `extras` adds what only an agent needs,
 * `available`, `authorize` and `applies`. Expose it under the tag of the Message it makes:
 *
 * ```ts
 * Agent.expose(Message, { AddedToCart: Agent.action(AddToCart, { authorize }) })
 * ```
 *
 * The same Action can be a page Block's button, so a capability is declared
 * once for every consumer that may cause it.
 */
export const action = <
  const Name extends string,
  Input,
  Encoded,
  ActionMessage extends { readonly _tag: string },
  Model = any,
  Principal = any,
>(
  action: Action<Name, Input, Encoded, ActionMessage>,
  extras: {
    readonly available?: ((model: Model) => boolean) | undefined
    readonly authorize?:
      | VariantConfig<Omit<ActionMessage, '_tag'>, Input, Model, Principal>['authorize']
      | undefined
    readonly applies?:
      | VariantConfig<Omit<ActionMessage, '_tag'>, Input, Model, Principal>['applies']
      | undefined
  } = {},
) =>
  variant<Input, Encoded, Omit<ActionMessage, '_tag'>, never, never, Name, Model, Principal>({
    name: action.name,
    description: action.description,
    input: action.input,
    // The whole Message: `expose` checks its tag is the key's before dispatching.
    toMessage: input => action.toMessage(input),
    ...extras,
  }) as Variant<Input, Encoded, Omit<ActionMessage, '_tag'>, Name, Model, Principal, undefined> & {
    /** Types only: the tag of the Message the Action makes, which `expose` requires of the key. Never set. */
    readonly messageTag?: ActionMessage['_tag']
  }

/** Strips the `_tag` literal so only the agent-facing payload fields remain. */
const payloadSchemaOf = (
  constructor: unknown,
): { schema: Schema.Codec<any, any, never, never>; empty: boolean } => {
  const fields = (constructor as { fields?: Fields }).fields ?? {}
  // A field may be named `__proto__`, which a plain object would take as its prototype.
  const payload: Record<string, unknown> = Object.create(null)
  for (const key of Object.keys(fields)) {
    if (key !== '_tag') payload[key] = (fields as Record<string, unknown>)[key]
  }
  const empty = Object.keys(payload).length === 0
  return {
    schema: empty ? EmptyPayload : (Schema.Struct(payload as Fields) as never),
    empty,
  }
}

/**
 * Creates an agent-safe projection of a Foldkit Message union.
 *
 * Exposure is explicit and opt-in: it declares that a Message variant is
 * meaningful and safe for an agent to originate. There is deliberately no
 * `exposeAll()` — exposure is a capability boundary.
 *
 * A variant that needs nothing but a description can be written as one.
 *
 * @example
 * ```ts
 * const messages = Agent.expose(Message, {
 *   RequestedCreateTodo: 'Create a todo',
 *   RequestedDeleteTodo: {
 *     name: 'delete_todo',
 *     description: 'Delete a todo',
 *     available: model => Option.isSome(model.selectedTodoId),
 *   },
 * })
 * ```
 */
export const expose = <
  const C extends Cases,
  const V extends Record<string, unknown>,
  Ext extends Record<string, unknown> = {},
  Model = any,
  Principal = any,
>(
  message: MessageUnion<C>,
  variants: V & ValidateVariants<C, Ext, Model, Principal>,
): ExposedMessages<
  Model,
  Principal,
  CapabilitiesByName<C, DeclaredVariants<V>>,
  CapabilitiesByTag<C, DeclaredVariants<V>>
> => {
  const union = message as unknown as Record<string, unknown>

  const compiled = Object.keys(variants).map((tag): ExposedVariant<Model, Principal> => {
    const declared = (
      variants as Record<string, string | VariantConfig<any, any, Model, Principal>>
    )[tag]!
    // A bare string is the description; every other field takes its default.
    const config: VariantConfig<any, any, Model, Principal> =
      typeof declared === 'string' ? { description: declared } : declared
    // Own keys only: the union inherits `constructor` and `toString`, which are functions.
    const constructor = Object.hasOwn(union, tag) ? union[tag] : undefined

    if (typeof constructor !== 'function') {
      throw new Error(`Cannot expose "${tag}": it is not a variant of this Message union`)
    }
    if (config.input !== undefined && config.toMessage === undefined) {
      throw new Error(`Cannot expose "${tag}": "input" was provided without "toMessage"`)
    }

    const name = config.name ?? defaultName(tag)
    assertValidName(name, tag)

    const payload = payloadSchemaOf(constructor)
    const external = config.input
    // An externally declared empty struct has the same hole, and the JSON
    // Schema derived for it makes the same promise, so enforce it the same way.
    const externalIsEmpty = external !== undefined && isEmptyStruct(external)
    const inputSchema = (
      external === undefined
        ? payload.schema
        : externalIsEmpty
          ? (external as Schema.Codec<any, any, never, never>).check(closedEmptyObject)
          : external
    ) as Schema.Codec<any, any, never, never>

    const make = constructor as (value: unknown) => AnyMessage
    const toMessage = config.toMessage
    const construct = (
      input: unknown,
      context: InvocationContext<Model, Principal>,
    ): AnyMessage => {
      if (toMessage === undefined) return make(input)
      const made = toMessage(input, context)
      // A whole Message, as `Agent.action` gives, must be the one this key names.
      const madeTag = Predicate.hasProperty(made, '_tag') ? made._tag : undefined
      // tag-check: open, a toMessage may make any application's Message
      if (typeof madeTag === 'string' && madeTag !== tag)
        throw new Error(`"${name}" made a "${madeTag}" Message, but is exposed as "${tag}"`)
      return make(made)
    }

    return {
      tag,
      name,
      description: config.description,
      inputSchema,
      inputJsonSchema: toJsonSchema(inputSchema, {
        emptyPayload: external === undefined ? payload.empty : externalIsEmpty,
      }),
      construct,
      messageConstructor: constructor,
      available: config.available,
      ...(config.completion === undefined
        ? {}
        : { compiledCompletion: compileCompletion(config.completion, name) }),
      authorize: config.authorize,
      applies: config.applies,
      completion: config.completion,
    }
  })

  const names = new Set<string>()
  for (const variant of compiled) {
    if (names.has(variant.name)) {
      throw new Error(`Duplicate exposed capability name "${variant.name}"`)
    }
    names.add(variant.name)
  }

  return { variants: compiled }
}

/** A tag-to-constructor map for a subset, in the shape `expose` reads. */
const subsetUnion = (subset: MessageSet<any, any, any, any, any>): Record<string, unknown> => {
  const union: Record<string, unknown> = {}
  for (const constructor of subset.constructors) {
    const tag = messageTag(constructor)
    if (tag !== undefined) union[tag] = constructor
  }
  return union
}

/**
 * Exposes the variants of a `MessageSet.make` subset. A separate entry point
 * from `expose` so the common path keeps its precise error messages; a variant
 * outside the subset is a compile error, and the runtime only sees the subset's
 * own constructors.
 */
export const exposeSubset = <
  Root,
  Message,
  Subset extends Message,
  Ms extends readonly ((...args: never[]) => Message)[],
  AllCases extends Cases,
  const V extends Record<string, unknown>,
  Ext extends Record<string, unknown> = {},
  Model = any,
  Principal = any,
>(
  subset: MessageSet<Root, Message, Subset, Ms, AllCases>,
  variants: V & ValidateVariants<SubsetCases<AllCases, Ms>, Ext, Model, Principal>,
): ExposedMessages<
  Model,
  Principal,
  CapabilitiesByName<SubsetCases<AllCases, Ms>, DeclaredVariants<V>>,
  CapabilitiesByTag<SubsetCases<AllCases, Ms>, DeclaredVariants<V>>
> =>
  expose(
    subsetUnion(subset) as unknown as MessageUnion<SubsetCases<AllCases, Ms>>,
    variants as never,
  ) as unknown as ExposedMessages<
    Model,
    Principal,
    CapabilitiesByName<SubsetCases<AllCases, Ms>, DeclaredVariants<V>>,
    CapabilitiesByTag<SubsetCases<AllCases, Ms>, DeclaredVariants<V>>
  >
