import { Data, Option } from 'effect'
import type { Attribute, HtmlBuilder } from 'foldkit/html'
import type { Definition } from './make.js'

/**
 * The ARIA role a part plays: what a person would see it as, and what an agent
 * reads to tell a search box from a button.
 */
export type PartRole =
  | 'alert'
  | 'article'
  | 'button'
  | 'cell'
  | 'checkbox'
  | 'columnheader'
  | 'combobox'
  | 'dialog'
  | 'figure'
  | 'form'
  | 'grid'
  | 'gridcell'
  | 'group'
  | 'heading'
  | 'img'
  | 'link'
  | 'list'
  | 'listbox'
  | 'listitem'
  | 'log'
  | 'main'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'menuitemcheckbox'
  | 'menuitemradio'
  | 'meter'
  | 'navigation'
  | 'note'
  | 'option'
  | 'progressbar'
  | 'radio'
  | 'radiogroup'
  | 'region'
  | 'row'
  | 'rowheader'
  | 'search'
  | 'searchbox'
  | 'separator'
  | 'slider'
  | 'spinbutton'
  | 'status'
  | 'switch'
  | 'tab'
  | 'table'
  | 'tablist'
  | 'tabpanel'
  | 'textbox'
  | 'timer'
  | 'toolbar'
  | 'tooltip'
  | 'tree'
  | 'treegrid'
  | 'treeitem'

/** The constructor of a Message the definition exposes: what `invokes` and `sets` take. */
type Exposed<Tag extends string> = (...args: never) => { readonly _tag: Tag }

/** The input a capability takes on the wire, for a repeated part's `input`. */
type InputOf<ByTag, Tag> = Tag extends keyof ByTag
  ? ByTag[Tag] extends { readonly input: infer Input }
    ? Input
    : never
  : never

/** A key of the projected context: a struct context's fields, and nothing without one. */
type FieldOf<Context> = unknown extends Context ? never : keyof Context & string

/** A part drawn once: a read-only value, a control that invokes, or a field a capability sets. */
export type SinglePartConfig<Context, ByTag, Tag extends string> = {
  /** Text a person reads on the control; `find` matches it exactly. */
  readonly label: string
  readonly role: PartRole
  readonly each?: undefined
  readonly key?: undefined
  readonly input?: undefined
} & (
  | {
      /** A key of the projected context: the value the part shows. */
      readonly field?: FieldOf<Context> | undefined
      /** The exposed capability the control invokes. */
      readonly invokes?: Exposed<Tag> | undefined
      readonly sets?: undefined
    }
  | {
      readonly field: FieldOf<Context>
      /** The exposed capability that changes `field`. */
      readonly sets: Exposed<Tag>
      readonly invokes?: undefined
    }
)

/** A part drawn once per item of the projected context, told apart by `key`. */
export interface RepeatedPartConfig<Context, ByTag, Item, Tag extends string> {
  readonly role: PartRole
  /** The items, read from the projected context. */
  readonly each: (context: Context) => ReadonlyArray<Item>
  /** The occurrence key: unique among the items, stable while the item is. */
  readonly key: (item: Item) => string
  readonly label: string | ((item: Item) => string)
  readonly invokes?: Exposed<Tag> | undefined
  /** The capability input this occurrence would be invoked with: a hint, decoded again at dispatch. */
  readonly input?: ((item: Item) => InputOf<ByTag, Tag>) | undefined
  readonly field?: undefined
  readonly sets?: undefined
}

/**
 * A declared part, as `Agent.part` types it. `Repeated` says whether it has
 * occurrences, which `attributes` reads to ask for a key. Types only.
 */
export interface Part<Context, ByTag, Repeated extends boolean = boolean> {
  readonly '~part'?: {
    // Invariant, so a part written against another context, or none, is refused.
    readonly context: (context: Context) => Context
    readonly byTag: ByTag
    readonly repeated: Repeated
  }
}

/**
 * Declares one part of the screen for an agent: a label, a role, and what it
 * is, in terms the contract already has. `field` names a key of the
 * definition's projected context, `invokes` and `sets` an exposed capability;
 * a part with neither capability is read-only. `each`, `key`, `label` and
 * `input` are given the projected context, never the Model.
 *
 * Typed by the `parts` call it is written in, so it needs no annotation there.
 */
export const part = <Context, ByTag, Item = never, const Tag extends keyof ByTag & string = never>(
  config: SinglePartConfig<Context, ByTag, Tag> | RepeatedPartConfig<Context, ByTag, Item, Tag>,
): Part<Context, ByTag, [Item] extends [never] ? false : true> => config as never

/** What `runtime.parts.list` reads of one part: what an agent may know of the control. */
export interface PartDescriptor {
  /** The declaration's key: stable across renders, routes and remounts. */
  readonly id: string
  /** `key(item)` for a repeated part's occurrence. */
  readonly occurrence: Option.Option<string>
  readonly label: string
  readonly role: PartRole
  /** The capability the part names. Calling it is `messages.dispatch`, unchanged. */
  readonly capability: Option.Option<{
    readonly name: string
    /** The input a repeated part declares for this occurrence. */
    readonly input: Option.Option<unknown>
    /** Whether the capability runs `authorize`, which needs an input and runs at dispatch. */
    readonly requiresAuthorization: boolean
  }>
  /** The `field`'s value, from the encoded context `runtime.context` serves. */
  readonly value: Option.Option<unknown>
}

/** What `find({ label })` answers: one part, every part sharing the label, or none. */
export type Found = Data.TaggedEnum<{
  One: { readonly part: PartDescriptor }
  Ambiguous: { readonly parts: ReadonlyArray<PartDescriptor> }
  None: {}
}>

export const Found = Data.taggedEnum<Found>()

/** The keys of the declarations that are, or are not, repeated. */
type IdsOf<P, Repeated extends boolean> = {
  readonly [K in keyof P]: P[K] extends Part<any, any, infer R>
    ? R extends Repeated
      ? K
      : never
    : never
}[keyof P] &
  string

/** One part, compiled once by `parts`. */
interface CompiledPart {
  readonly id: string
  readonly role: PartRole
  readonly label: string | ((item: unknown) => string)
  readonly field: Option.Option<string>
  /** The tag of the capability it names, looked up by constructor once. */
  readonly tag: Option.Option<string>
  readonly each: Option.Option<{
    readonly items: (context: unknown) => ReadonlyArray<unknown>
    readonly key: (item: unknown) => string
    readonly input: Option.Option<(item: unknown) => unknown>
  }>
}

/** A definition's parts, checked against it: what `bind({ parts })` takes. */
export interface Parts<P = Record<string, Part<any, any>>> {
  /** The definition the parts were checked against; `bind` refuses another. */
  readonly definition: Definition<any, any, any, any, any>
  /** The declared ids, in declaration order. */
  readonly ids: ReadonlyArray<keyof P & string>
  /**
   * `data-fk-part` (and `data-fk-part-key` for an occurrence) for the drawn
   * control, so an in-page adapter or a test can find it. Nothing reads them
   * for authority.
   */
  readonly attributes: {
    <Message>(h: HtmlBuilder<Message>, id: IdsOf<P, false>): ReadonlyArray<Attribute<Message>>
    <Message>(
      h: HtmlBuilder<Message>,
      id: IdsOf<P, true>,
      key: string,
    ): ReadonlyArray<Attribute<Message>>
  }
  /** @internal The compiled declarations `bind` lists from. */
  readonly compiled: ReadonlyArray<CompiledPart>
}

/**
 * The parts of a definition, keyed by id. Each `invokes`/`sets` must name a
 * capability the definition exposes, and each `field` a key of its projected
 * context; another is a type error, and throws here.
 *
 * @example
 * ```ts
 * const Parts = Agent.parts(AppAgent, {
 *   save: Agent.part({ label: 'Save', role: 'button', invokes: Message.RequestedSave }),
 * })
 * ```
 */
export const parts = <Context_, ByTag, const P extends Record<string, Part<Context_, ByTag>>>(
  definition: Definition<any, Context_, any, any, ByTag>,
  declarations: P,
): Parts<P> => {
  const tags = new Map<unknown, string>()
  for (const variant of definition.messages.variants)
    tags.set(variant.messageConstructor, variant.tag)
  const fields = contextFields(definition)

  const compiled = Object.keys(declarations).map((id): CompiledPart => {
    const config = (declarations as unknown as Record<string, AnyConfig>)[id]!
    const named = config.invokes ?? config.sets
    const tag = named === undefined ? undefined : tags.get(named)
    if (named !== undefined && tag === undefined) {
      throw new Error(
        `Agent.parts: "${id}" names a capability this definition does not expose. Expose its Message first.`,
      )
    }
    if (config.field !== undefined && !Option.exists(fields, keys => keys.has(config.field!))) {
      throw new Error(
        `Agent.parts: "${id}" reads "${config.field}", which the definition's context does not project.`,
      )
    }
    if (config.each !== undefined && definition.context === undefined) {
      throw new Error(
        `Agent.parts: "${id}" is repeated over a context this definition does not declare.`,
      )
    }
    return {
      id,
      role: config.role,
      label: config.label,
      field: Option.fromUndefinedOr(config.field),
      tag: Option.fromUndefinedOr(tag),
      each:
        config.each === undefined
          ? Option.none()
          : Option.some({
              items: config.each,
              key: config.key!,
              input: Option.fromUndefinedOr(config.input),
            }),
    }
  })

  return {
    definition,
    ids: compiled.map(each => each.id) as ReadonlyArray<keyof P & string>,
    attributes: (<Message>(h: HtmlBuilder<Message>, id: string, key?: string) => [
      h.DataAttribute('fk-part', id),
      ...(key === undefined ? [] : [h.DataAttribute('fk-part-key', key)]),
    ]) as Parts<P>['attributes'],
    compiled,
  }
}

/** A declaration with its types erased, as `parts` reads it at run time. */
interface AnyConfig {
  readonly label: string | ((item: unknown) => string)
  readonly role: PartRole
  readonly field?: string | undefined
  readonly invokes?: unknown
  readonly sets?: unknown
  readonly each?: ((context: unknown) => ReadonlyArray<unknown>) | undefined
  readonly key?: ((item: unknown) => string) | undefined
  readonly input?: ((item: unknown) => unknown) | undefined
}

/** The keys a struct context projects, read off its Schema; none without one. */
const contextFields = (
  definition: Definition<any, any, any, any, any>,
): Option.Option<ReadonlySet<string>> =>
  Option.flatMap(Option.fromUndefinedOr(definition.context), context => {
    const fields = (context.Model as { readonly fields?: Record<string, unknown> }).fields
    return fields === undefined ? Option.none() : Option.some(new Set(Object.keys(fields)))
  })

/** What the runtime gives `list`: one snapshot's context, and what is available in it. */
export interface Snapshot {
  /** The context as `runtime.context` serves it: encoded, undeclared properties dropped. */
  readonly encoded: Option.Option<unknown>
  /** The encoded context decoded again: the projected value, holding only what it declares. */
  readonly decoded: Option.Option<unknown>
  readonly available: ReadonlySet<string>
  readonly capabilityOf: (tag: string) => {
    readonly name: string
    readonly requiresAuthorization: boolean
  }
}

/**
 * The parts one snapshot shows. A part whose capability is unavailable is left
 * out, as the tool list leaves the capability out.
 */
export const listParts = (
  compiled: ReadonlyArray<CompiledPart>,
  snapshot: Snapshot,
): ReadonlyArray<PartDescriptor> =>
  compiled.flatMap(declared => {
    if (Option.exists(declared.tag, tag => !snapshot.available.has(tag))) return []
    const capability = (input: Option.Option<unknown>) =>
      Option.map(declared.tag, tag => ({ ...snapshot.capabilityOf(tag), input }))

    return Option.match(declared.each, {
      onNone: () => [
        {
          id: declared.id,
          occurrence: Option.none(),
          label: declared.label as string,
          role: declared.role,
          capability: capability(Option.none()),
          value: Option.flatMap(declared.field, field =>
            Option.map(snapshot.encoded, context => (context as Record<string, unknown>)[field]),
          ),
        },
      ],
      onSome: ({ items, key, input }) => {
        const seen = new Set<string>()
        // `parts` refused a repeated part over a definition with no context.
        return items(Option.getOrThrow(snapshot.decoded)).map(item => {
          const occurrence = key(item)
          if (seen.has(occurrence)) {
            throw new Error(
              `Agent parts: "${declared.id}" has two occurrences keyed "${occurrence}". Its key must tell its items apart.`,
            )
          }
          seen.add(occurrence)
          return {
            id: declared.id,
            occurrence: Option.some(occurrence),
            label: typeof declared.label === 'string' ? declared.label : declared.label(item),
            role: declared.role,
            capability: capability(Option.map(input, make => make(item))),
            value: Option.none(),
          }
        })
      },
    })
  })
