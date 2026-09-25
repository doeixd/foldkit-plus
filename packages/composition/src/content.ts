/**
 * Content capabilities: what a Block is, as far as where it may be placed.
 *
 * A Region accepts Blocks by the Content they provide, not by name, so a Region
 * written today accepts a Block written next year. Each capability is a value,
 * compared by identity: two libraries that both define `Pricing` define two
 * capabilities, and neither's Regions accept the other's Blocks by accident.
 */

export interface Content<Name extends string = string> {
  readonly _tag: 'Content'
  readonly name: Name
}

const define = <const Name extends string>(name: Name): Content<Name> => {
  if (name.length === 0) throw new Error('Content.define: a capability needs a name')
  return Object.freeze({ _tag: 'Content', name })
}

export const Content = {
  /** A capability of the application's own: `Content.define('Pricing')`. */
  define,
  /** A section of a page: what a page's root holds. */
  Section: define('Section'),
  /** Block-level content in the flow of a section: headings, text, images. */
  Flow: define('Flow'),
  /** Content inside a line of text. */
  Inline: define('Inline'),
  /** Something a visitor acts on: a button, a link, a form. */
  Interactive: define('Interactive'),
  /** An image, a video, an embed. */
  Media: define('Media'),
  /** Content read from the application's data: a product grid, a list of posts. */
  Data: define('Data'),
}

/** Whether a Block that provides `provided` may go where `accepted` is accepted. */
export const accepts = (
  accepted: ReadonlyArray<Content>,
  provided: ReadonlyArray<Content>,
): boolean => provided.some(content => accepted.includes(content))
