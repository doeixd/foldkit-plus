/**
 * What one row of a widget's own list holds: an option, an item, a step, a
 * node. One type for every widget that draws such rows from data, so a row
 * reads the same in a Combobox, a Listbox or a Menu. Each part is drawn in a
 * Slot of its name.
 */
import type { Html } from 'foldkit/html'

export interface RowContent {
  /** The row's accessible name and what typing matches; always text. */
  readonly label: string
  /** A line under the label. */
  readonly description?: string | Html | undefined
  /** Drawn before the label: a glyph, an avatar, a dot. */
  readonly icon?: Html | undefined
  /** Drawn after the label: a badge, a count, a time, a shortcut. */
  readonly trailing?: Html | undefined
  /** Drawn in place of the label's text; `label` still names the row. */
  readonly content?: Html | undefined
  /** The row is shown and cannot be chosen. */
  readonly disabled?: boolean | undefined
}
