/** Registers the test that holds an example's client to its brotli ceiling. */
export declare const clientBudget: (options: {
  /** The example's name as the test title and the recorded figure show it. */
  readonly name: string
  /** The example's directory. */
  readonly dir: string
  /** Brotli bytes; the measure must also exceed 90% of it. */
  readonly ceiling: number
  /** Build in a child process, for a config that imports `foldkit-ssr/vite`. */
  readonly childProcess?: boolean
}) => void
