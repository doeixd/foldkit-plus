/** The fixed text a Combobox says. Each is text; `{label}` is the chip's label. */
export interface ComboboxWords {
  /** The clear button's name. */
  readonly clear: string
  /** A chip's remove button's name. */
  readonly remove: string
}

/** The words a Combobox uses when none are given. */
export const words: ComboboxWords = {
  clear: 'Clear',
  remove: 'Remove {label}',
}
