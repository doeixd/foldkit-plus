/**
 * Marking the elements Slots draw with the Slot's name, for
 * `foldkit-mixins/testing`'s `Inert.draw`. Internal: the package index does not
 * export it, and a view drawn for real is never marked.
 */

/** The data attribute a marked element carries: `data-fk-slot="row"`. */
export const SLOT_MARK = 'fk-slot'

let marking = false

/** Whether Slots mark what they draw: only while `drawMarked` runs. */
export const isMarking = (): boolean => marking

/** Draws with every Slot, however deeply nested its view, marking its element. */
export const drawMarked = <A>(draw: () => A): A => {
  marking = true
  try {
    return draw()
  } finally {
    marking = false
  }
}
