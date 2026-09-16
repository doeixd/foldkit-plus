/**
 * A Link says where a child machine lives in a parent: a lens onto the child
 * Model and the parent Message variant that carries the child's Messages.
 */
import { Option, Record, type Schema } from 'effect'
import { taggedStruct, type CallableTaggedStruct } from 'foldkit/schema'

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

export interface Link<Parent, ParentMessage, Child, ChildMessage> {
  readonly [LinkTypeId]: typeof LinkTypeId
  readonly read: (parent: Parent) => Option.Option<Child>
  readonly write: (parent: Parent, child: Child) => Parent
  readonly toParentMessage: (message: ChildMessage) => ParentMessage
  /** Recognises this child's variant among all of the parent's Messages. */
  readonly fromParentMessage: (message: AnyMessage) => Option.Option<ChildMessage>
  /** The parent's own gate: while it returns `false`, the child's Subscriptions and resources stop. */
  readonly when: Option.Option<(parent: Parent) => boolean>
  /** Where the child lives, for placement keys and diagnostics. */
  readonly path: ReadonlyArray<string>
}

export const isLink = (value: unknown): value is Link<unknown, unknown, unknown, unknown> =>
  typeof value === 'object' && value !== null && LinkTypeId in value

const wrapper = <const Tag extends string, ChildMessage>(
  tag: Tag,
  childMessage: Schema.Codec<ChildMessage, unknown>,
): Wrapper<Tag, ChildMessage> => {
  const fields = { message: childMessage }
  const make = (message: ChildMessage): Wrapped<Tag, ChildMessage> => ({ _tag: tag, message })
  const isWrapped = (message: AnyMessage): message is Wrapped<Tag, ChildMessage> =>
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

interface MakeConfig<Parent, Tag extends string, Child, ChildMessage> {
  readonly read: (parent: Parent) => Option.Option<Child>
  readonly write: (parent: Parent, child: Child) => Parent
  readonly wrapper: Wrapper<Tag, ChildMessage>
  readonly when?: (parent: Parent) => boolean
  readonly path: ReadonlyArray<string>
}

const make = <Parent, const Tag extends string, Child, ChildMessage>(
  config: MakeConfig<Parent, Tag, Child, ChildMessage>,
): Link<Parent, Wrapped<Tag, ChildMessage>, Child, ChildMessage> => ({
  [LinkTypeId]: LinkTypeId,
  read: config.read,
  write: config.write,
  toParentMessage: config.wrapper.toParentMessage,
  fromParentMessage: config.wrapper.fromParentMessage,
  when: Option.fromNullishOr(config.when),
  path: config.path,
})

/** A child held in a struct field of the parent. */
const field =
  <Parent>() =>
  <const Key extends keyof Parent & string, const Tag extends string, ChildMessage>(
    key: Key,
    wrap: Wrapper<Tag, ChildMessage>,
    options: { readonly when?: (parent: Parent) => boolean } = {},
  ): Link<Parent, Wrapped<Tag, ChildMessage>, Parent[Key], ChildMessage> =>
    make({
      read: parent => Option.some(parent[key]),
      write: (parent, child) => ({ ...parent, [key]: child }),
      wrapper: wrap,
      ...options,
      path: [key],
    })

type OptionKeys<Parent> = {
  [K in keyof Parent]: Parent[K] extends Option.Option<unknown> ? K : never
}[keyof Parent] &
  string

type OptionValue<A> = A extends Option.Option<infer Value> ? Value : never

/** A child held as `Option<Child>` in a struct field: absent while the field is `None`. */
const optional =
  <Parent>() =>
  <const Key extends OptionKeys<Parent>, const Tag extends string, ChildMessage>(
    key: Key,
    wrap: Wrapper<Tag, ChildMessage>,
    options: { readonly when?: (parent: Parent) => boolean } = {},
  ): Link<Parent, Wrapped<Tag, ChildMessage>, OptionValue<Parent[Key]>, ChildMessage> =>
    make({
      read: (parent): Option.Option<OptionValue<Parent[Key]>> =>
        parent[key] as Option.Option<OptionValue<Parent[Key]>>,
      write: (parent, child) => ({ ...parent, [key]: Option.some(child) }),
      wrapper: wrap,
      ...options,
      path: [key],
    })

/** A child placed inside another placed child: lenses, Messages, gates, and paths chain. */
const compose = <A, AMessage, B, BMessage extends AnyMessage, C, CMessage>(
  outer: Link<A, AMessage, B, BMessage>,
  inner: Link<B, BMessage, C, CMessage>,
): Link<A, AMessage, C, CMessage> => ({
  [LinkTypeId]: LinkTypeId,
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
})

export const Link = { wrapper, make, field, optional, compose } as const
