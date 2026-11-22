/**
 * `foldkit-surface/declared`: derive an application's Foldkit `update`,
 * exhaustive emitted-record-to-Command dispatch, and `Writes` path-skipping
 * from one `metakit` Machine. Hand-written `update` arms coexist through
 * `fallback` so an application can move one Message at a time.
 */
import { Option, Predicate, type Schema } from 'effect'
import type { MessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import type { EmitOf, Machine, MessageOf } from 'metakit/machine'
import type { AppScope } from './index.js'
import { messageTag, tagOf, type OnlyMessages } from './messageTags.js'
import { Writes, type WritesOptions } from './writes.js'

type CommandOf<Root, Message, Resources> = NonNullable<
  Update.Return<Root, Message, Resources>['commands']
>[number]

type EmitTag<Emitted> = Emitted extends { readonly _tag: infer K extends string } ? K : never

type SuppliedOf<T> = T extends { readonly _supplied?: () => infer S } ? S : never

/** The tags of the transitions that declare supplied values. */
type SuppliedTag<Transitions> = {
  [K in keyof Transitions & string]: [SuppliedOf<Transitions[K]>] extends [never]
    ? never
    : [keyof SuppliedOf<Transitions[K]>] extends [never]
      ? never
      : K
}[keyof Transitions & string]

/** Exhaustive table mapping each emitted record tag to the Commands it runs. */
export type CommandTable<Emitted, Root, Message, Resources = never> = [Emitted] extends [never]
  ? Readonly<Record<string, never>>
  : {
      readonly [K in EmitTag<Emitted>]: (
        record: Extract<Emitted, { readonly _tag: K }>,
      ) => ReadonlyArray<CommandOf<Root, Message, Resources>>
    }

/**
 * For each transition that declares supplied values (a time, a new id), how
 * to make them for one step of its Message. Each runs once per step, before
 * the transition, and what it returns is checked against the transition's
 * `supplied` Schemas.
 */
export type SupplyTable<Transitions, Message> = {
  readonly [K in SuppliedTag<Transitions>]: (
    message: Extract<Message, { readonly _tag: K }>,
  ) => SuppliedOf<Transitions[K]>
}

/** One step's Message with the values `supply` made for it, as `record` receives it and `replay` takes it. */
export type SuppliedStep<Transitions, Message> = {
  readonly [K in SuppliedTag<Transitions>]: {
    readonly message: Extract<Message, { readonly _tag: K }>
    readonly supplied: SuppliedOf<Transitions[K]>
  }
}[SuppliedTag<Transitions>]

/** Optional map from each emitted record tag to the Message tags its Command may send back. */
export type SendsMap<Emitted, AppTag extends string> = [Emitted] extends [never]
  ? Readonly<Record<string, ReadonlyArray<AppTag>>>
  : Readonly<Partial<Record<EmitTag<Emitted>, ReadonlyArray<AppTag>>>>

/** Configuration for `Declared.of`. */
export type DeclaredConfig<
  Root,
  Message,
  AppTag extends string,
  Transitions extends Readonly<Record<string, unknown>>,
  Resources = never,
> = WritesOptions & {
  /** Which Message tags each emitted Command may send back, for dependency graphs. */
  readonly sends?: SendsMap<EmitOf<Transitions>, AppTag> | undefined
  /** Called with each step's Message and the values `supply` made for it, so a replay can pass them back. */
  readonly record?: ((step: SuppliedStep<Transitions, Message>) => void) | undefined
} & ([EmitOf<Transitions>] extends [never]
    ? { readonly commands?: CommandTable<never, Root, Message, Resources> | undefined }
    : { readonly commands: CommandTable<EmitOf<Transitions>, Root, Message, Resources> }) &
  ([SuppliedTag<Transitions>] extends [never]
    ? { readonly supply?: undefined }
    : { readonly supply: SupplyTable<Transitions, Message> }) &
  ([Exclude<AppTag, keyof Transitions>] extends [never]
    ? { readonly fallback?: undefined }
    : {
        /**
         * The hand-written arm for the Messages `machine.transitions` does not
         * declare, given only those variants.
         */
        readonly fallback: (
          model: Root,
          message: Exclude<Message, { readonly _tag: keyof Transitions & string }>,
        ) => Update.Return<Root, Message, Resources>
      })

/** Whether `Declared.of` can be called without a config: nothing it asks for is required. */
type ConfigOptional<
  AppTag extends string,
  Transitions extends Readonly<Record<string, unknown>>,
> = [EmitOf<Transitions> | SuppliedTag<Transitions> | Exclude<AppTag, keyof Transitions>] extends [
  never,
]
  ? true
  : false

/** A Message-to-Message edge derived from a transition's emitted record and its Command's `sends`. */
export interface MessageEdge<Tag extends string = string> {
  readonly from: Tag
  readonly emit: string
  readonly to: string
}

/** The derived application layer returned by `Declared.of`. */
export interface Declared<Root, Message, Tag extends string, Resources = never, Step = never> {
  /**
   * Derived Foldkit `update`, already wrapped in `writes.track`: runs
   * `machine.update` for declared tags (with the values `supply` makes, for a
   * transition that declares some), maps emitted records through `commands`
   * in emission order, and delegates undeclared tags to `fallback`. Returns
   * `{ model }` with identical reference on no-ops.
   */
  readonly update: (model: Root, message: Message) => Update.Return<Root, Message, Resources>
  /**
   * The untracked transition + Command step, for composing inside an outer
   * wrapper (such as `Bundle.assemble` or `WritesCheck.verify`) before a single
   * outermost `writes.track`.
   */
  readonly step: (model: Root, message: Message) => Update.Return<Root, Message, Resources>
  /**
   * Runs a recorded step with the values it was supplied, without calling
   * `supply`, so the replay gives the Model and Commands the first run gave.
   * Untracked, as `step` is.
   */
  readonly replay: (model: Root, step: Step) => Update.Return<Root, Message, Resources>
  /** Underlying `Writes` instance (`Writes.of(app, machine, ...)`). */
  readonly writes: Writes<Root, Message, Tag>
  /** Shortcut to `writes.rootView`. */
  readonly rootView: Writes<Root, Message, Tag>['rootView']
  /** Shortcut to `writes.install()` (#587). */
  readonly install: Writes<Root, Message, Tag>['install']
  /** Message tags of `app` not covered by `machine.transitions`. */
  readonly undeclared: ReadonlyArray<string>
  /** Validated map from emitted record tag to the Message tags its Command may send back. */
  readonly sends: Readonly<Record<string, ReadonlyArray<string>>>
  /**
   * Message-to-Message edges derived from each transition's declared `emits`
   * joined with `sends`, ready to pass to `Graph.of(module, { machine, sends })`.
   */
  readonly messageEdges: ReadonlyArray<MessageEdge<Tag>>
}

/** Whether a transition's `supplied` Schemas name at least one value. */
const declaresSupplied = (transition: unknown): boolean =>
  Predicate.hasProperty(transition, 'suppliedSchema') &&
  Option.isOption(transition.suppliedSchema) &&
  Option.match(transition.suppliedSchema, {
    onNone: () => false,
    onSome: schema =>
      Predicate.hasProperty(schema, 'fields') &&
      Predicate.isObject(schema.fields) &&
      Object.keys(schema.fields).length > 0,
  })

const of = <
  Root,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
  Transitions extends Readonly<Record<string, unknown>>,
  Resources = never,
>(
  app: AppScope<Root, F, Cases>,
  machine: Machine<Root, Transitions> & OnlyMessages<Cases, Transitions>,
  ...[config]: ConfigOptional<keyof Cases & string, Transitions> extends true
    ? [
        config?: DeclaredConfig<
          Root,
          Schema.Schema.Type<MessageUnion<Cases>>,
          keyof Cases & string,
          Transitions,
          Resources
        >,
      ]
    : [
        config: DeclaredConfig<
          Root,
          Schema.Schema.Type<MessageUnion<Cases>>,
          keyof Cases & string,
          Transitions,
          Resources
        >,
      ]
): Declared<
  Root,
  Schema.Schema.Type<MessageUnion<Cases>>,
  keyof Transitions & string,
  Resources,
  SuppliedStep<Transitions, Schema.Schema.Type<MessageUnion<Cases>>>
> => {
  type Message = Schema.Schema.Type<MessageUnion<Cases>>
  type Tag = keyof Transitions & string
  type Return = Update.Return<Root, Message, Resources>

  const writes = Writes.of<Root, F, Cases, Transitions>(app, machine, {
    contracts: config?.contracts,
    writers: config?.writers,
  })

  /** The record tags a transition emits, from its declared `emits`. */
  const emittedBy = (transition: unknown): ReadonlyArray<string> => {
    if (!Predicate.hasProperty(transition, 'emits')) return []
    const specs: unknown = transition.emits
    return Array.isArray(specs)
      ? specs.flatMap(spec =>
          Predicate.hasProperty(spec, 'tag') && typeof spec.tag === 'string' ? [spec.tag] : [],
        )
      : []
  }
  const emittedTags = new Set(Object.values(machine.transitions).flatMap(emittedBy))

  // Validate `sends` against the machine's emitted records and `app.Message` at definition time.
  const messages: Readonly<Record<string, unknown>> = app.Message
  const validatedSends: Record<string, ReadonlyArray<string>> = Object.create(null)
  for (const [emitTag, targetTags] of Object.entries(config?.sends ?? {})) {
    if (targetTags === undefined) continue
    if (!emittedTags.has(emitTag)) {
      throw new Error(
        `Declared.of: sends["${emitTag}"] names a record no transition of the machine emits`,
      )
    }
    for (const target of targetTags) {
      if (!Object.hasOwn(messages, target) || messageTag(messages[target]) !== target) {
        throw new Error(
          `Declared.of: sends["${emitTag}"] names "${target}", which is not a Message of this application`,
        )
      }
    }
    validatedSends[emitTag] = [...targetTags]
  }

  const declaredTags = new Set<string>(Object.keys(machine.transitions))
  const isTag = (key: string): key is Tag => declaredTags.has(key)
  const appTags = Object.keys(messages).filter(key => messageTag(messages[key]) === key)
  const undeclared = appTags.filter(tag => !declaredTags.has(tag))
  const fallback = config?.fallback
  if (undeclared.length > 0 && fallback === undefined) {
    throw new Error(
      `Declared.of: no transition for ${undeclared.map(tag => `"${tag}"`).join(', ')}, and no fallback to handle them`,
    )
  }

  // Join each transition's declared `emits` with `validatedSends` to produce
  // Message-to-Message edges for `Graph.of`.
  const messageEdges: Array<MessageEdge<Tag>> = []
  const seenEdges = new Set<string>()
  for (const [from, transition] of Object.entries(machine.transitions)) {
    if (!isTag(from)) continue
    for (const emit of emittedBy(transition)) {
      for (const to of Object.hasOwn(validatedSends, emit) ? (validatedSends[emit] ?? []) : []) {
        const key = `${from}\u0000${emit}\u0000${to}`
        if (seenEdges.has(key)) continue
        seenEdges.add(key)
        messageEdges.push({ from, emit, to })
      }
    }
  }

  const commandsTable = (config?.commands ?? Object.create(null)) as Readonly<
    Record<string, (record: unknown) => ReadonlyArray<CommandOf<Root, Message, Resources>>>
  >
  const supplyTable: object = config?.supply ?? Object.create(null)
  const record = config?.record
  // Without its values a step is refused, and the Message would do nothing.
  for (const [tag, transition] of Object.entries(machine.transitions)) {
    if (declaresSupplied(transition) && !Object.hasOwn(supplyTable, tag)) {
      throw new Error(
        `Declared.of: the transition "${tag}" takes supplied values, and supply has no entry for it`,
      )
    }
  }

  // The tag is checked here; the machine checks the input and the supplied
  // values against the transition's Schemas and refuses a step they fail.
  const isMachineMessage = (value: {
    readonly _tag: string
    readonly input: Message
  }): value is typeof value & MessageOf<Transitions> => declaredTags.has(value._tag)

  // `supply` is typed per tag, so the values made for a Message are its transition's.
  const isSuppliedStep = (value: {
    readonly message: Message
    readonly supplied: unknown
  }): value is typeof value & SuppliedStep<Transitions, Message> =>
    Option.match(tagOf(value.message), {
      onNone: () => false,
      onSome: tag => Object.hasOwn(supplyTable, tag),
    })

  const isUndeclared = (message: Message): message is Exclude<Message, { readonly _tag: Tag }> =>
    Option.match(tagOf(message), { onNone: () => true, onSome: tag => !declaredTags.has(tag) })

  /** The transition's step with `supplied` (none for one that declares none), and its Commands. */
  const run = (
    model: Root,
    tag: string,
    message: Message,
    supplied: Option.Option<unknown>,
  ): Return => {
    const machineMessage = Option.match(supplied, {
      onNone: () => ({ _tag: tag, input: message }),
      onSome: values => ({ _tag: tag, input: message, supplied: values }),
    })
    if (!isMachineMessage(machineMessage)) return { model }
    const [next, emitted] = machine.update(model, machineMessage)
    if (emitted.length === 0) return { model: next }
    const commands: Array<CommandOf<Root, Message, Resources>> = []
    for (const emittedRecord of emitted) {
      // The table is looked up by name, and a name it lacks is reported below.
      const recordTag = Option.getOrElse(tagOf(emittedRecord), () => '')
      if (!Object.hasOwn(commandsTable, recordTag)) {
        throw new Error(
          `Declared.of: transition "${tag}" emitted "${recordTag}", which has no handler in commands`,
        )
      }
      commands.push(...commandsTable[recordTag]!(emittedRecord))
    }
    return commands.length === 0 ? { model: next } : { model: next, commands }
  }

  /** A declared Message's step, with the values `supply` makes for it where its transition declares some. */
  const declaredStep = (model: Root, tag: string, message: Message): Return => {
    const supplier: unknown = Object.hasOwn(supplyTable, tag)
      ? Reflect.get(supplyTable, tag)
      : undefined
    if (typeof supplier !== 'function') return run(model, tag, message, Option.none())
    const step: { readonly message: Message; readonly supplied: unknown } = {
      message,
      supplied: supplier(message),
    }
    if (record !== undefined && isSuppliedStep(step)) record(step)
    return run(model, tag, message, Option.some(step.supplied))
  }

  const rawUpdate = (model: Root, message: Message): Return =>
    Option.match(
      Option.filter(tagOf(message), tag => declaredTags.has(tag)),
      {
        onNone: () =>
          isUndeclared(message) && fallback !== undefined ? fallback(model, message) : { model },
        onSome: tag => declaredStep(model, tag, message),
      },
    )

  const replay = (model: Root, step: SuppliedStep<Transitions, Message>): Return =>
    run(model, step.message._tag, step.message, Option.some(step.supplied))

  const update = writes.track(rawUpdate)

  return {
    update,
    step: rawUpdate,
    replay,
    writes,
    rootView: writes.rootView,
    install: writes.install,
    undeclared,
    sends: validatedSends,
    messageEdges,
  }
}

export const Declared = {
  /**
   * Derives a Foldkit `update`, exhaustive emitted-record Command dispatch,
   * and `Writes` path-skipping from one `metakit` Machine.
   */
  of,
}
