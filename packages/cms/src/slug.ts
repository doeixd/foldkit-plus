/**
 * How a server says a slug is taken, and how a client reads it back. It is a
 * mutation's error, which is a message and no more, so the key it is about rides
 * in a prefix: `CmsSlugTaken: <key>: ...`.
 */
export const slugTaken = {
  message: (key: string, slug: string): string => `CmsSlugTaken: ${key}: "${slug}" is already used`,
  /** The form key the error names, or `undefined` for an error about something else. */
  key: (message: string): string | undefined => /CmsSlugTaken: ([^:]+): /.exec(message)?.[1],
  /** What to show on that key: the reason, without the prefix that addressed it. */
  reason: (message: string): string =>
    message.replace(/^.*?CmsSlugTaken: [^:]+: /, 'That address is taken: '),
}
