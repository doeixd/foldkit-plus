/**
 * A Link says where a child machine lives in a parent: a lens onto the child
 * Model and the parent Message variant that carries the child's Messages.
 */
import { Array, Function, Option, Pipeable, Record, Schema } from 'effect'
import { taggedStruct, type CallableTaggedStruct } from 'foldkit/schema'
import type { Invalid } from './placed.js'

const LinkTypeId: unique symbol = Symbol.for('foldkit-bundle/Link')

/** The parent Message variant `Tag({ message })` that carries a child's Messages. */
export type Wrapped<Tag extends string, ChildMessage> = {
  readonly _tag: Tag
  readonly message: ChildMessage
}

/**
 * Both directions between a child Message and its parent variant. Spread
 * `cases` into the parent's `defineMessageUnion` so the variant is part of the
 * parent Message.
 */
export interface Wrapper<Tag extends string, ChildMessage> {
  readonly tag: Tag
  readonly Schema: CallableTaggedStruct<
    Tag,
    { readonly message: Schema.Codec<ChildMessage, unknown> }
  >
  readonly cases: { readonly [K in Tag]: { readonly message: Schema.Codec<ChildMessage, unknown> } }
  readonly make: (message: ChildMessage) => Wrapped<Tag, ChildMessage>
  readonly toParentMessage: (message: ChildMessage) => Wrapped<Tag, ChildMessage>
  readonly fromParentMessage: (message: AnyMessage) => Option.Option<ChildMessage>
}

/** Every Foldkit Message is tagged; routing only needs the tag. */
export type AnyMessage = { readonly _tag: string }

/**
 * `Field` is the parent's top-level field the child is written into, when the
 * Link is one: `never` for a child nested deeper, and `string` when unknown.
 */
export interface Link<Parent, ParentMessage, Child, ChildMessage, Field extends string = string>
  extends Pipeable.Pipeable {
  readonly [LinkTypeId]: typeof LinkTypeId
  /** Types only: the top-level field, so `placements.initial` knows who writes it. */
  readonly field?: Field
  readonly read: (parent: Parent) => Option.Option<Child>
  readonly write: (parent: Parent, child: Child) => Parent
  readonly toParentMessage: (message: ChildMessage) => ParentMessage
  /** Recognises this child's variant among all of the parent's Messages. */
  readonly fromParentMessage: (message: AnyMessage) => Option.Option<ChildMessage>
  /** The parent's own gate: while it returns `false`, the child's Subscriptions and resources stop. */
  readonly when: Option.Option<(parent: Parent) => boolean>
  /** Where the child lives, for placement keys and diagnostics. */
  readonly path: ReadonlyArray<string>
  /** The parent Message tags this link's Messages travel under, outermost first. */
  readonly messages: ReadonlyArray<string>
  /** The application a Link built from a Surface field ref belongs to, for its Module contract. */
  readonly owner?: object | undefined
}

export const isLink = (value: unknown): value is Link<unknown, unknown, unknown, unknown> =>
  typeof value === 'object' && value !== null && LinkTypeId in value

/** A Message union's variant `Tag({ message })`, as `defineMessageUnion` declares it. */
type Variant = {
  readonly fields: { readonly _tag: Schema.tag<string>; readonly message: Schema.Top }
}

type VariantTag<V extends Variant> =
  V['fields']['_tag'] extends Schema.tag<infer Tag extends string> ? Tag : never

type OnlyMessage<V extends Variant> = [Exclude<keyof V['fields'], '_tag' | 'message'>] extends [
  never,
]
  ? unknown
  : Invalid<'A wrapper variant carries only `message`; this variant has other fields'>

/**
 * The parent variant `Tag({ message })` for a child's Messages: from a tag and
 * the child's Message Schema, whose `cases` then go into the parent's union, or
 * from a variant the parent's union already declares.
 */
function wrapper<const Tag extends string, ChildMessage>(
  tag: Tag,
  childMessage: Schema.Codec<ChildMessage, unknown>,
): Wrapper<Tag, ChildMessage>
function wrapper<V extends Variant>(
  variant: V & OnlyMessage<V>,
): Wrapper<VariantTag<V>, V['fields']['message']['Type']>
function wrapper(
  tagOrVariant: string | Variant,
  childMessage?: Schema.Codec<unknown, unknown>,
): Wrapper<string, unknown> {
  return typeof tagOrVariant === 'string'
    ? wrapperOf(tagOrVariant, childMessage!)
    : wrapperOf(
        String(tagOrVariant.fields._tag.ast.literal),
        // A union holding a declared Schema, such as Foldkit's `File`, types its
        // decoding services `unknown`; the union decoded it already, so this does too.
        tagOrVariant.fields.message as Schema.Codec<unknown, unknown>,
      )
}

const wrapperOf = <const Tag extends string, ChildMessage>(
  tag: Tag,
  childMessage: Schema.Codec<ChildMessage, unknown>,
): Wrapper<Tag, ChildMessage> => {
  const fields = { message: childMessage }
  const make = (message: ChildMessage): Wrapped<Tag, ChildMessage> => ({ _tag: tag, message })
  const isWrapped = (message: AnyMessage): message is Wrapped<Tag, ChildMessage> =>
    // tag-check: open — the parent's Message, against the tag its caller chose
    message._tag === tag && 'message' in message
  return {
    tag,
    Schema: taggedStruct(tag, fields),
    cases: Record.singleton(tag, fields),
    make,
    toParentMessage: make,
    fromParentMessage: message =>
      isWrapped(message) ? Option.some(message.message) : Option.none(),
  }
}

interface MakeConfig<Parent, Tag extends string, Child, ChildMessage, Path> {
  readonly read: (parent: Parent) => Option.Option<Child>
  readonly write: (parent: Parent, child: Child) => Parent
  readonly wrapper: Wrapper<Tag, ChildMessage>
  readonly when?: (parent: Parent) => boolean
  readonly path: Path
  readonly owner?: object | undefined
}

type LinkFields<Parent, ParentMessage, Child, ChildMessage> = Omit<
  Link<Parent, ParentMessage, Child, ChildMessage>,
  typeof LinkTypeId | 'pipe' | 'field'
>

/**
 * The top-level field a path names. `initial` treats a one-segment path as the
 * field the placement writes, so a longer one names none.
 */
type FieldOfPath<Path> = Path extends readonly [infer Field extends string]
  ? Field
  : Path extends readonly [string, ...ReadonlyArray<string>]
    ? never
    : string

/** Brands plain link fields as a pipeable Link. */
const toLink = <Parent, ParentMessage, Child, ChildMessage, Field extends string>(
  fields: LinkFields<Parent, ParentMessage, Child, ChildMessage>,
): Link<Parent, ParentMessage, Child, ChildMessage, Field> => ({
  ...fields,
  [LinkTypeId]: LinkTypeId,
  pipe() {
    return Pipeable.pipeArguments(this, arguments)
  },
})

const make = <
  Parent,
  const Tag extends string,
  Child,
  ChildMessage,
  const Path extends ReadonlyArray<string> = ReadonlyArray<string>,
>(
  config: MakeConfig<Parent, Tag, Child, ChildMessage, Path>,
): Link<Parent, Wrapped<Tag, ChildMessage>, Child, ChildMessage, FieldOfPath<Path>> =>
  toLink({
    read: config.read,
    write: config.write,
    toParentMessage: config.wrapper.toParentMessage,
    fromParentMessage: config.wrapper.fromParentMessage,
    when: Option.fromNullishOr(config.when),
    path: config.path,
    messages: [config.wrapper.tag],
    owner: config.owner,
  })

/**
 * A child held in a struct field of the parent. Writes copy the parent with an
 * object spread, so a class-based parent Model needs `Link.make` instead.
 *
 * Its `read`, `write` and `toParentMessage` are what `Update.foldChild` takes,
 * so a component that is not a Bundle folds through it:
 * `Update.foldChild({ ...link, update: VirtualList.update })`. Its init folds
 * through `Link.foldInit`: `Update.foldChildInit(boot, Link.foldInit(link, rest))`.
 * That fold writes back
 * even a child its update left alone, so the write keeps the parent when the
 * child is the one already there: Foldkit renders only when the root Model
 * changes identity.
 */
const field =
  <Parent>() =>
  <const Key extends keyof Parent & string, const Tag extends string, ChildMessage>(
    key: Key,
    wrap: Wrapper<Tag, ChildMessage>,
    options: { readonly when?: (parent: Parent) => boolean } = {},
  ): Link<Parent, Wrapped<Tag, ChildMessage>, Parent[Key], ChildMessage, Key> =>
    make({
      read: parent => Option.some(parent[key]),
      write: (parent, child) => (parent[key] === child ? parent : { ...parent, [key]: child }),
      wrapper: wrap,
      ...options,
      path: [key],
    })

type OptionKeys<Parent> = {
  [K in keyof Parent]: Parent[K] extends Option.Option<unknown> ? K : never
}[keyof Parent] &
  string

type OptionValue<A> = A extends Option.Option<infer Value> ? Value : never

/**
 * A child held as `Option<Child>` in a struct field: absent while the field is
 * `None`. Like `field`, it keeps the parent when the child is unchanged.
 */
const optional =
  <Parent>() =>
  <const Key extends OptionKeys<Parent>, const Tag extends string, ChildMessage>(
    key: Key,
    wrap: Wrapper<Tag, ChildMessage>,
    options: { readonly when?: (parent: Parent) => boolean } = {},
  ): Link<Parent, Wrapped<Tag, ChildMessage>, OptionValue<Parent[Key]>, ChildMessage, Key> =>
    make({
      read: (parent): Option.Option<OptionValue<Parent[Key]>> =>
        parent[key] as Option.Option<OptionValue<Parent[Key]>>,
      write: (parent, child) => {
        // Absent, not `None`, while a placement's `initial` builds the parent.
        const current: unknown = parent[key]
        return Option.isOption(current) && Option.exists(current, value => value === child)
          ? parent
          : { ...parent, [key]: Option.some(child) }
      },
      wrapper: wrap,
      ...options,
      path: [key],
    })

/**
 * A child placed inside another placed child: lenses, Messages, gates, and paths
 * chain. The result writes no top-level field of its own.
 */
const compose = <A, AMessage, B, BMessage extends AnyMessage, C, CMessage>(
  outer: Link<A, AMessage, B, BMessage, string>,
  inner: Link<B, BMessage, C, CMessage, string>,
): Link<A, AMessage, C, CMessage, never> =>
  toLink({
    read: parent => Option.flatMap(outer.read(parent), inner.read),
    write: (parent, child) =>
      Option.match(outer.read(parent), {
        onNone: () => parent,
        onSome: b => outer.write(parent, inner.write(b, child)),
      }),
    toParentMessage: message => outer.toParentMessage(inner.toParentMessage(message)),
    fromParentMessage: message =>
      Option.flatMap(outer.fromParentMessage(message), inner.fromParentMessage),
    when: Option.match(inner.when, {
      onNone: () => outer.when,
      onSome: innerWhen =>
        Option.some(
          (parent: A) =>
            Option.match(outer.when, { onNone: () => true, onSome: when => when(parent) }) &&
            Option.match(outer.read(parent), { onNone: () => false, onSome: innerWhen }),
        ),
    }),
    path: [...outer.path, ...inner.path],
    messages: [...outer.messages, ...inner.messages],
    owner: outer.owner ?? inner.owner,
  })

/**
 * What `Update.foldChildInit` takes, for a child that is not a Bundle: the
 * Link's `toParentMessage`, and a `toParentModel` that writes the child's
 * Model into the rest of the parent. Where `Update.foldChild` spreads the
 * Link itself (`{ ...link, update }`), init has no parent yet to read, so the
 * caller hands over everything but the child:
 * `Update.foldChildInit(Counter.init(args), Link.foldInit(link, rest))`.
 *
 * For a composed Link, `rest` must already hold the outer children the Link
 * passes through; an absent outer child has nowhere to live, so the write
 * keeps the rest as it is, as a placement's `init` does.
 */
const foldInit = <Parent, ParentMessage, Child, ChildMessage, Field extends string>(
  link: Link<Parent, ParentMessage, Child, ChildMessage, Field>,
  rest: Omit<Parent, Field>,
): {
  readonly toParentModel: (child: Child) => Parent
  readonly toParentMessage: (message: ChildMessage) => ParentMessage
} => ({
  // Copied, so a `Link.make` write that mutates cannot take the caller's rest.
  toParentModel: child => link.write({ ...rest } as Parent, child),
  toParentMessage: link.toParentMessage,
})

/**
 * Adds a gate: the child's Subscriptions and resources run only while every gate
 * on its Link returns `true`. `link.pipe(Link.when(model => model.open))`.
 */
const when: {
  <Parent>(
    predicate: (parent: Parent) => boolean,
  ): <ParentMessage, Child, ChildMessage, Field extends string>(
    self: Link<Parent, ParentMessage, Child, ChildMessage, Field>,
  ) => Link<Parent, ParentMessage, Child, ChildMessage, Field>
  <Parent, ParentMessage, Child, ChildMessage, Field extends string>(
    self: Link<Parent, ParentMessage, Child, ChildMessage, Field>,
    predicate: (parent: Parent) => boolean,
  ): Link<Parent, ParentMessage, Child, ChildMessage, Field>
} = Function.dual(
  2,
  <Parent, ParentMessage, Child, ChildMessage, Field extends string>(
    self: Link<Parent, ParentMessage, Child, ChildMessage, Field>,
    predicate: (parent: Parent) => boolean,
  ): Link<Parent, ParentMessage, Child, ChildMessage, Field> =>
    toLink({
      ...self,
      when: Option.some(
        (parent: Parent) =>
          Option.match(self.when, { onNone: () => true, onSome: gate => gate(parent) }) &&
          predicate(parent),
      ),
    }),
)

/**
 * Continues a Link into a child of its child: `outer.pipe(Link.andThen(inner))`.
 * Lenses, Messages, gates, and paths chain, as in `compose`.
 */
const andThen: {
  <B, BMessage extends AnyMessage, C, CMessage>(
    inner: Link<B, BMessage, C, CMessage, string>,
  ): <A, AMessage>(
    outer: Link<A, AMessage, B, BMessage, string>,
  ) => Link<A, AMessage, C, CMessage, never>
  <A, AMessage, B, BMessage extends AnyMessage, C, CMessage>(
    outer: Link<A, AMessage, B, BMessage, string>,
    inner: Link<B, BMessage, C, CMessage, string>,
  ): Link<A, AMessage, C, CMessage, never>
} = Function.dual(2, compose)

/** The parent Message variant `Tag({ key, message })` that carries one collection item's Messages. */
export type KeyedWrapped<Tag extends string, ChildMessage, Key extends string = string> = {
  readonly _tag: Tag
  readonly key: Key
  readonly message: ChildMessage
}

type KeyedFields<ChildMessage, Key extends string> = {
  readonly key: Schema.Codec<Key, string>
  readonly message: Schema.Codec<ChildMessage, unknown>
}

/** Both directions between an item's Message and its keyed parent variant. */
export interface KeyedWrapper<Tag extends string, ChildMessage, Key extends string = string> {
  readonly tag: Tag
  readonly Schema: CallableTaggedStruct<Tag, KeyedFields<ChildMessage, Key>>
  readonly cases: { readonly [K in Tag]: KeyedFields<ChildMessage, Key> }
  readonly make: (key: Key, message: ChildMessage) => KeyedWrapped<Tag, ChildMessage, Key>
  readonly fromParentMessage: (
    message: AnyMessage,
  ) => Option.Option<readonly [key: Key, message: ChildMessage]>
}

/**
 * The keyed variant for a collection. `key` is the key Schema, a string-encoded
 * one such as a branded id; it defaults to `Schema.String`.
 */
const keyedWrapper = <const Tag extends string, ChildMessage, Key extends string = string>(
  tag: Tag,
  childMessage: Schema.Codec<ChildMessage, unknown>,
  key?: Schema.Codec<Key, string>,
): KeyedWrapper<Tag, ChildMessage, Key> => {
  const fields: KeyedFields<ChildMessage, Key> = {
    // Without a key Schema, `Key` is its default, `string`.
    key: key ?? (Schema.String as unknown as Schema.Codec<Key, string>),
    message: childMessage,
  }
  const isWrapped = (message: AnyMessage): message is KeyedWrapped<Tag, ChildMessage, Key> =>
    // tag-check: open — the parent's Message, against the tag its caller chose
    message._tag === tag && 'key' in message && 'message' in message
  return {
    tag,
    Schema: taggedStruct(tag, fields),
    cases: Record.singleton(tag, fields),
    make: (itemKey, message) => ({ _tag: tag, key: itemKey, message }),
    fromParentMessage: message =>
      isWrapped(message) ? Option.some([message.key, message.message] as const) : Option.none(),
  }
}

/**
 * Where a keyed collection of children lives. The storage is the Link's
 * business: a record by key, an array identified by id, or anything with these
 * operations. `entries` is the order views and Subscriptions follow.
 */
export interface CollectionLink<
  Parent,
  ParentMessage,
  Child,
  ChildMessage,
  Key extends string = string,
  Field extends string = string,
> {
  /** Types only: the top-level field holding the items, or `string` when unknown. */
  readonly field?: Field
  /** The storage with no items, for a parent's initial Model. */
  readonly empty: unknown
  readonly entries: (parent: Parent) => ReadonlyArray<readonly [key: Key, child: Child]>
  readonly get: (parent: Parent, key: Key) => Option.Option<Child>
  /** Writes one item; `None` removes it. */
  readonly write: (parent: Parent, key: Key, child: Option.Option<Child>) => Parent
  readonly toParentMessage: (key: Key, message: ChildMessage) => ParentMessage
  readonly fromParentMessage: (
    message: AnyMessage,
  ) => Option.Option<readonly [key: Key, message: ChildMessage]>
  /** The parent's gate per item: while it returns `false`, that item's Subscriptions stop. */
  readonly when: Option.Option<(parent: Parent, key: Key) => boolean>
  readonly path: ReadonlyArray<string>
  /** The parent Message tag this collection's Messages travel under. */
  readonly messages: ReadonlyArray<string>
}

type RecordKeys<Parent> = {
  [K in keyof Parent]: Parent[K] extends Readonly<Record<string, unknown>> ? K : never
}[keyof Parent] &
  string

type RecordValue<A> = A extends Readonly<Record<string, infer Value>> ? Value : never

/**
 * A collection held in a `Record<Key, Child>` field of the parent. Record order
 * puts integer-like keys first; use `collectionById` when order matters.
 */
const collection =
  <Parent>() =>
  <
    const Field extends RecordKeys<Parent>,
    const Tag extends string,
    ChildMessage,
    Key extends string,
  >(
    field: Field,
    wrap: KeyedWrapper<Tag, ChildMessage, Key>,
    options: { readonly when?: (parent: Parent, key: Key) => boolean } = {},
  ): CollectionLink<
    Parent,
    KeyedWrapped<Tag, ChildMessage, Key>,
    RecordValue<Parent[Field]>,
    ChildMessage,
    Key,
    Field
  > => {
    type Child = RecordValue<Parent[Field]>
    const items = (parent: Parent) => parent[field] as Readonly<Record<string, Child>>
    return {
      empty: {},
      // Record keys are the collection's keys, written only through `write`.
      entries: parent =>
        Object.entries(items(parent)).map(([key, child]) => [key as Key, child] as const),
      get: (parent, key) => Record.get(items(parent), key),
      write: (parent, key, child) => {
        const next = Option.match(child, {
          onNone: () => Record.remove(items(parent), key),
          onSome: value => ({ ...items(parent), [key]: value }),
        })
        return { ...parent, [field]: next }
      },
      toParentMessage: wrap.make,
      fromParentMessage: wrap.fromParentMessage,
      when: Option.fromNullishOr(options.when),
      path: [field],
      messages: [wrap.tag],
    }
  }

type ArrayKeys<Parent> = {
  [K in keyof Parent]: Parent[K] extends ReadonlyArray<unknown> ? K : never
}[keyof Parent] &
  string

type ArrayItem<A> = A extends ReadonlyArray<infer Item> ? Item : never

/**
 * A collection held in an array field, each item identified by `id`. Views and
 * Subscriptions follow the array's order; adding a new key appends.
 */
const collectionById =
  <Parent>() =>
  <
    const Field extends ArrayKeys<Parent>,
    const Tag extends string,
    ChildMessage,
    Key extends string,
  >(
    field: Field,
    wrap: KeyedWrapper<Tag, ChildMessage, Key>,
    options: {
      readonly id: (item: ArrayItem<Parent[Field]>) => Key
      readonly when?: (parent: Parent, key: Key) => boolean
    },
  ): CollectionLink<
    Parent,
    KeyedWrapped<Tag, ChildMessage, Key>,
    ArrayItem<Parent[Field]>,
    ChildMessage,
    Key,
    Field
  > => {
    type Child = ArrayItem<Parent[Field]>
    const items = (parent: Parent) => parent[field] as ReadonlyArray<Child>
    return {
      empty: [],
      entries: parent => items(parent).map(item => [options.id(item), item] as const),
      get: (parent, key) => Array.findFirst(items(parent), item => options.id(item) === key),
      write: (parent, key, child) => {
        const current = items(parent)
        const next = Option.match(child, {
          onNone: () => current.filter(item => options.id(item) !== key),
          onSome: value => {
            // Stored under its id, so an item whose id is not its key could never
            // be read back under that key, and its Messages would reach nothing.
            if (options.id(value) !== key) {
              throw new Error(
                `Link.collectionById: the item written under "${key}" has the id "${options.id(value)}"; give \`add\` a prepare that sets it, and keep it through update`,
              )
            }
            return current.some(item => options.id(item) === key)
              ? current.map(item => (options.id(item) === key ? value : item))
              : [...current, value]
          },
        })
        return { ...parent, [field]: next }
      },
      toParentMessage: wrap.make,
      fromParentMessage: wrap.fromParentMessage,
      when: Option.fromNullishOr(options.when),
      path: [field],
      messages: [wrap.tag],
    }
  }

export const Link = {
  wrapper,
  make,
  field,
  optional,
  compose,
  andThen,
  when,
  foldInit,
  keyedWrapper,
  collection,
  collectionById,
} as const
