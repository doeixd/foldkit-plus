import { flipped } from '../choices.js'

/**
 * The open sections after `id` is pressed. With `multiple`, any number stay
 * open; otherwise opening one shuts the others. A pressed open section shuts
 * unless it is the only one open and `collapsible` is false (shadcn's and
 * Zag's default for a single accordion is collapsible, and so is this).
 */
export const toggled = (
  open: ReadonlyArray<string>,
  id: string,
  options: {
    readonly multiple?: boolean | undefined
    readonly collapsible?: boolean | undefined
  } = {},
): ReadonlyArray<string> => {
  const isOpen = open.includes(id)
  if (options.multiple === true) return flipped(open, id)
  if (!isOpen) return [id]
  return options.collapsible === false ? open : []
}
