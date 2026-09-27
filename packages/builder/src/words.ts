import type { Refusal } from 'foldkit-composition'

/**
 * The Builder's own words: what it says to assistive technology of each edit,
 * its commands' labels, and the refusals it makes itself. A word that takes a
 * value is a function, since word order differs between languages. A Block is
 * named by its label (`Block.words`), the Catalog's word.
 */
export interface EditWords {
  /** Where a node is after an edit, after its name: ", 2 of 3 in Section body". */
  readonly at: (position: number, count: number, container: string) => string
  /** The container of a root, and of a node in a Region. */
  readonly thePage: string
  readonly inRegion: (label: string, region: string) => string
  /** An edit, said: its node's label and where it is now. */
  readonly moved: (label: string, at: string) => string
  readonly added: (label: string, at: string) => string
  readonly duplicated: (label: string, at: string) => string
  readonly removed: (label: string) => string
  readonly editedPage: string
  readonly undone: string
  readonly redone: string
  /** A drag that ended with nothing done: a node, or a new one from the palette. */
  readonly notMoved: string
  readonly notAdded: string
  readonly copied: (label: string) => string
  readonly cut: (label: string) => string

  /** The refusals the Builder makes itself. */
  readonly nothingCopied: string
  readonly notAPage: string
  readonly noStartingProps: (block: string) => string
  readonly startingPropsFail: (block: string) => string
  readonly notANode: (id: string) => string
  readonly unknownPattern: (name: string) => string
  readonly copyChanged: (id: string) => string
  /** A refusal `apply` made, by its code; by default its own message. */
  readonly refusal: (refusal: Refusal) => string

  /** The commands' labels. */
  readonly moveUp: string
  readonly moveDown: string
  readonly moveOut: string
  readonly moveIn: string
  readonly duplicate: string
  readonly copy: string
  readonly cutCommand: string
  readonly delete: string
  readonly undo: string
  readonly redo: string
  readonly paste: string
  readonly editText: string
  readonly deselect: string
}

export const editWords: EditWords = Object.freeze({
  at: (position: number, count: number, container: string) =>
    `, ${position} of ${count} in ${container}`,
  thePage: 'the page',
  inRegion: (label: string, region: string) => `${label} ${region}`,
  moved: (label: string, at: string) => `Moved ${label}${at}`,
  added: (label: string, at: string) => `Added ${label}${at}`,
  duplicated: (label: string, at: string) => `Duplicated ${label}${at}`,
  removed: (label: string) => `Removed ${label}`,
  editedPage: 'Edited the page',
  undone: 'Undone',
  redone: 'Redone',
  notMoved: 'Not moved',
  notAdded: 'Not added',
  copied: (label: string) => `Copied ${label}`,
  cut: (label: string) => `Cut ${label}`,
  nothingCopied: 'Nothing has been copied',
  notAPage: 'The clipboard holds no part of a page',
  noStartingProps: (block: string) => `"${block}" has no starting props, so it cannot be inserted`,
  startingPropsFail: (block: string) => `"${block}"'s starting props do not encode`,
  notANode: (id: string) => `"${id}" is not a node`,
  unknownPattern: (name: string) => `the Catalog has no pattern "${name}"`,
  copyChanged: (id: string) => `"${id}" changed while its copy was being made; copy it again`,
  refusal: (refusal: Refusal) => refusal.message,
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveOut: 'Move out',
  moveIn: 'Move in',
  duplicate: 'Duplicate',
  copy: 'Copy',
  cutCommand: 'Cut',
  delete: 'Delete',
  undo: 'Undo',
  redo: 'Redo',
  paste: 'Paste',
  editText: 'Edit its text',
  deselect: 'Select nothing',
})
