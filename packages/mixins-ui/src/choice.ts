/**
 * How a value the application owns is read and folded by a widget that lets
 * a reader choose among items (Combobox; Listbox and Picker to follow). The
 * widget holds its own interaction state and never the value: the
 * application passes the value at each draw, and folds what the widget
 * reports through the same `Choice`.
 *
 * `Choice` is an interface an application may implement: `one`, `many` and
 * `text` (each a file under `./choice/`) are the three shipped, and a rule
 * of the application's own, such as "at most three", wraps one of them.
 */
import { Array, Schema, type Option } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'

/** What a choosing widget reports. */
export const ChoiceChange = defineTaggedUnion({
  /** The reader chose `value`, or, where several are chosen, flipped it. */
  Selected: { value: Schema.String },
  /** The reader emptied the field. */
  ClearedSelection: {},
  /** The field's text is now `text`, typed or restored: only a value that is the text follows it. */
  Typed: { text: Schema.String },
})
export type ChoiceChange = typeof ChoiceChange.Type

export interface Choice<Item extends string, Value> {
  /** Every item that can be chosen. A reported value is looked up here, so what is stored is an `Item`. */
  readonly items: ReadonlyArray<Item>
  /** The value with nothing chosen. */
  readonly empty: Value
  /** The value after `change`; the same value when the change does not move it. */
  readonly picked: (value: Value, change: ChoiceChange) => Value
  /** The chosen items, for the view to mark. */
  readonly chosen: (value: Value) => ReadonlyArray<Item>
  /** What a closed input rests on. */
  readonly resting: (value: Value, labelOf: (item: Item) => string) => string
  /** Whether several items may be chosen, which the list says to assistive technology. */
  readonly multiple: boolean
}

/** The item of `items` that `value` names, if any: a reported string becomes an `Item` here. */
export const itemOf = <Item extends string>(
  items: ReadonlyArray<Item>,
  value: string,
): Option.Option<Item> => Array.findFirst(items, item => item === value)
