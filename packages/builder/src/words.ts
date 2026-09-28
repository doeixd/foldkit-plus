/**
 * The Builder's own words: what it says to assistive technology of each edit,
 * its commands' labels, and the refusals it makes itself. Words are text; a
 * word that takes a value names it as a blank (`'Moved {label}{at}'`), as a
 * form's and a view's words do, so one object can hold them all. A Block is
 * named by its label (`Block.words`), the Catalog's word.
 */
export interface EditWords {
  /** Where a node is after an edit, after its name: ", 2 of 3 in Section body". Blanks `{position}`, `{count}`, `{container}`. */
  readonly at: string
  /** The container of a root. */
  readonly thePage: string
  /** The container of a node in a Region: the holder's `{label}` and the `{region}`. */
  readonly inRegion: string
  /** An edit, said: its node's `{label}` and where it is now, `{at}`. */
  readonly moved: string
  readonly added: string
  readonly duplicated: string
  /** A removal, said: the node's `{label}`. */
  readonly removed: string
  readonly editedPage: string
  readonly undone: string
  readonly redone: string
  /** A drag that ended with nothing done: a node, or a new one from the palette. */
  readonly notMoved: string
  readonly notAdded: string
  /** A copy and a cut, said: the node's `{label}`. */
  readonly copied: string
  readonly cut: string

  /** The refusals the Builder makes itself: nothing to paste, as nothing copied or not a page. */
  readonly nothingCopied: string
  readonly notAPage: string
  /** A Block that cannot be inserted: `{block}`. */
  readonly noStartingProps: string
  readonly startingPropsFail: string
  /** A node the page does not hold, or one changed while its copy was made: `{id}`. */
  readonly notANode: string
  readonly copyChanged: string
  /** A pattern the Catalog lacks: `{name}`. */
  readonly unknownPattern: string
  /** A paste the page has no place for: its root's Block, `{label}`. */
  readonly noPlace: string
  /** A refusal `apply` made: blanks `{code}` and `{message}`, by default its own message. */
  readonly refusal: string

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
  at: ', {position} of {count} in {container}',
  thePage: 'the page',
  inRegion: '{label} {region}',
  moved: 'Moved {label}{at}',
  added: 'Added {label}{at}',
  duplicated: 'Duplicated {label}{at}',
  removed: 'Removed {label}',
  editedPage: 'Edited the page',
  undone: 'Undone',
  redone: 'Redone',
  notMoved: 'Not moved',
  notAdded: 'Not added',
  copied: 'Copied {label}',
  cut: 'Cut {label}',
  nothingCopied: 'Nothing has been copied',
  notAPage: 'The clipboard holds no part of a page',
  noStartingProps: '"{block}" has no starting props, so it cannot be inserted',
  startingPropsFail: '"{block}"\'s starting props do not encode',
  notANode: '"{id}" is not a node',
  unknownPattern: 'the Catalog has no pattern "{name}"',
  noPlace: 'There is no place on this page for a {label}',
  copyChanged: '"{id}" changed while its copy was being made; copy it again',
  refusal: '{message}',
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
