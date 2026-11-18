/** The fixed text a Command says. */
export interface CommandWords {
  /** What the list says when nothing matches. */
  readonly empty: string
  /** What the list says while it is `loading`. */
  readonly loading: string
}

/** The words a Command uses when none are given. */
export const words: CommandWords = {
  empty: 'No results.',
  loading: 'Loading…',
}
