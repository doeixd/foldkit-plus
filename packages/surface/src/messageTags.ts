import { Option, Predicate } from 'effect'

/** The tag of a Message of an application this cannot name; none for a value that has none. */
export const tagOf = (message: unknown): Option.Option<string> =>
  Predicate.hasProperty(message, '_tag') && typeof message._tag === 'string'
    ? Option.some(message._tag)
    : Option.none()

/** Reads the tag off a Foldkit Message constructor without constructing one. */
export const messageTag = (constructor: unknown): string | undefined => {
  const literal = (constructor as { fields?: { _tag?: { ast?: { literal?: unknown } } } }).fields
    ?._tag?.ast?.literal
  return typeof literal === 'string' ? literal : undefined
}

/** Whether a Message, of an application this cannot name, has one of `tags`. */
export const hasTagIn = (tags: ReadonlySet<string>, message: unknown): boolean =>
  Predicate.hasProperty(message, '_tag') &&
  typeof message._tag === 'string' &&
  tags.has(message._tag)

/** The tags of the Messages a Surface lists in `messages`. */
export const messageTags = (surface: {
  readonly messages: readonly unknown[]
}): ReadonlyArray<string> =>
  surface.messages.map(messageTag).filter((tag): tag is string => tag !== undefined)
