/**
 * `foldkit-surface/declared`: derive an application's Foldkit `update`,
 * exhaustive emitted-record-to-Command dispatch, and `Writes` path-skipping
 * from one `metakit` Machine. Hand-written `update` arms coexist through
 * `fallback` so an application can move one Message at a time.
 */
import { Option, type Schema } from 'effect'
import type { MessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import type { EmitOf, Machine, MessageOf } from 'metakit/machine'
import type { AppScope, Invalid } from './index.js'
import { messageTag, tagOf } from './messageTags.js'
import { Writes, type WritesOptions } from './writes.js'

type OnlyMessages<Cases, Transitions> = [Exclude<keyof Transitions, keyof Cases>] extends [never]
  ? unknown
  : Invalid<"Declared.of: a transition is named by one of the application's Message tags">

type CommandOf<Root, Message, Resources> = NonNullable<
  Update.Return<Root, Message, Resources>['commands']
>[number]

type EmitTag<Emitted> = Emitted extends { readonly _tag: infer K extends string } ? K : never

/** Exhaustive table mapping each emitted record tag to the Commands it runs. */
export type CommandTable<Emitted, Root, Message, Resources = never> = [Emitted] extends [never]
  ? Readonly<Record<string, never>>
  : {
      readonly [K in EmitTag<Emitted>]: (
        record: Extract<Emitted, { readonly _tag: K }>,
      ) => ReadonlyArray<CommandOf<Root, Message, Resources>>
    }

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
  /**
   * Coexistence handler for Messages not yet declared in `machine.transitions`.
   * Its `message` parameter is narrowed to only the undeclared Message variants.
   */
  readonly fallback?:
    | ((
        model: Root,
        message: Exclude<Message, { readonly _tag: keyof Transitions & string }>,
      ) => Update.Return<Root, Message, Resources>)
    | undefined
} & ([EmitOf<Transitions>] extends [never]
    ? { readonly commands?: CommandTable<never, Root, Message, Resources> | undefined }
    : { readonly commands: CommandTable<EmitOf<Transitions>, Root, Message, Resources> })

/** The derived application layer returned by `Declared.of`. */
export interface Declared<Root, Message, Tag extends string, Resources = never> {
  /**
   * Derived Foldkit `update`, already wrapped in `writes.track`: runs
   * `machine.update` for declared tags, maps emitted records through `commands`
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
}

const of = <
  Root,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
  Transitions extends Readonly<Record<string, unknown>>,
  Resources = never,
>(
  app: AppScope<Root, F, Cases>,
  machine: Machine<Root, Transitions> & OnlyMessages<Cases, Transitions>,
  ...[config]: [EmitOf<Transitions>] extends [never]
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
  Resources
> => {
  type Message = Schema.Schema.Type<MessageUnion<Cases>>
  type Tag = keyof Transitions & string

  const writes = Writes.of(
    app,
    machine as unknown as Parameters<typeof Writes.of<Root, F, Cases, Transitions>>[1],
    {
      contracts: config?.contracts,
      writers: config?.writers,
    },
  )

  // Validate `sends` target tags against `app.Message` at definition time.
  const messages: Readonly<Record<string, unknown>> = app.Message
  const validatedSends: Record<string, ReadonlyArray<string>> = Object.create(null)
  for (const [emitTag, targetTags] of Object.entries(config?.sends ?? {})) {
    if (targetTags === undefined) continue
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
  const appTags = Object.keys(messages).filter(key => messageTag(messages[key]) === key)
  const undeclared = appTags.filter(tag => !declaredTags.has(tag))

  const commandsTable = (config?.commands ?? Object.create(null)) as Readonly<
    Record<string, (record: unknown) => ReadonlyArray<CommandOf<Root, Message, Resources>>>
  >
  const fallback = config?.fallback

  const rawUpdate = (model: Root, message: Message): Update.Return<Root, Message, Resources> => {
    const tag = tagOf(message)
    if (Option.isSome(tag) && declaredTags.has(tag.value)) {
      const [next, emitted] = machine.update(model, {
        _tag: tag.value,
        input: message,
      } as MessageOf<Transitions>)
      if (emitted.length === 0) return { model: next }
      const commands: Array<CommandOf<Root, Message, Resources>> = []
      for (const record of emitted) {
        const recordTag = (record as { readonly _tag?: unknown })._tag
        if (typeof recordTag !== 'string' || !Object.hasOwn(commandsTable, recordTag)) {
          throw new Error(
            `Declared.of: transition "${tag.value}" emitted "${String(recordTag)}", which has no handler in commands`,
          )
        }
        commands.push(...commandsTable[recordTag]!(record))
      }
      return commands.length === 0 ? { model: next } : { model: next, commands }
    }
    if (fallback !== undefined) {
      return fallback(model, message as Exclude<Message, { readonly _tag: Tag }>)
    }
    return { model }
  }

  const update = writes.track(rawUpdate)

  return {
    update,
    step: rawUpdate,
    writes,
    rootView: writes.rootView,
    install: writes.install,
    undeclared,
    sends: validatedSends,
  }
}

export const Declared = {
  /**
   * Derives a Foldkit `update`, exhaustive emitted-record Command dispatch,
   * and `Writes` path-skipping from one `metakit` Machine.
   */
  of,
}
