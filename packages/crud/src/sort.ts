/**
 * Sorting a list, written once. How a list is sorted is the application's state
 * and its query's input, so this holds none of it: it is the schema of that
 * state, what a click on a header makes of it, and the shape a drawn table
 * takes. The server reads the same state and decides which columns it means.
 */
import { Schema } from 'effect'

/** How a list is sorted: by which of its orders, which way; `null` for the server's own order. */
export type SortState<Column extends string> = {
  readonly by: Column
  readonly direction: 'asc' | 'desc'
} | null

/** How one column is sorted now, and the Message a click on its header sends. */
export interface SortedColumn<Message> {
  readonly direction: 'asc' | 'desc' | undefined
  readonly message: Message
}

export const Sort = {
  /**
   * The orders a list offers, by name. A name is an order the server knows, not
   * a column: which columns may sort, and what `title` means in SQL, stay the
   * server's to decide.
   */
  make: <const Columns extends readonly [string, ...string[]]>(columns: Columns) => {
    type Column = Columns[number]
    type State = SortState<Column>
    /** A click on a header: ascending, then descending, then the server's own order again. */
    const toggle = (current: State, column: Column): State =>
      current === null || current.by !== column
        ? { by: column, direction: 'asc' }
        : current.direction === 'asc'
          ? { by: column, direction: 'desc' }
          : null
    return {
      columns,
      /** For the Model field, and for the query's input. */
      Schema: Schema.NullOr(
        Schema.Struct({
          by: Schema.Literals(columns),
          direction: Schema.Literals(['asc', 'desc']),
        }),
      ) as unknown as Schema.Codec<State, State>,
      /** The server's own order. */
      none: null as State,
      toggle,
      /**
       * What a drawn table takes as `sort`: every order with how it is sorted now
       * and the Message a click sends, made from the state the click leads to.
       */
      inputs: <Message>(
        current: State,
        message: (next: State) => Message,
      ): { readonly [K in Column]: SortedColumn<Message> } =>
        Object.fromEntries(
          columns.map(column => [
            column,
            {
              direction: current?.by === column ? current.direction : undefined,
              message: message(toggle(current, column)),
            },
          ]),
        ) as { readonly [K in Column]: SortedColumn<Message> },
    }
  },
}
