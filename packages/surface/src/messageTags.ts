/** Reads the tag off a Foldkit Message constructor without constructing one. */
export const messageTag = (constructor: unknown): string | undefined => {
  const literal = (constructor as { fields?: { _tag?: { ast?: { literal?: unknown } } } }).fields
    ?._tag?.ast?.literal
  return typeof literal === 'string' ? literal : undefined
}

/** The tags of the Messages a Surface lists in `messages`. */
export const messageTags = (surface: {
  readonly messages: readonly unknown[]
}): ReadonlyArray<string> =>
  surface.messages.map(messageTag).filter((tag): tag is string => tag !== undefined)
