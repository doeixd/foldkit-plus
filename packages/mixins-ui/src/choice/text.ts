import { Option } from 'effect'
import { ChoiceChange, itemOf, type Choice } from '../choice.js'

/**
 * The typed text is the value, and `items` are suggestions for it: an
 * autocomplete. Choosing an item writes it; typing writes what was typed,
 * an item or not.
 */
export const text = <const Item extends string>(
  items: ReadonlyArray<Item>,
): Choice<Item, string> => ({
  items,
  empty: '',
  picked: (value, change) =>
    ChoiceChange.match(change, {
      Selected: ({ value: reported }) => reported,
      ClearedSelection: () => '',
      Typed: ({ text: typed }) => typed,
    }),
  chosen: value => Option.toArray(itemOf(items, value)),
  resting: value => value,
  multiple: false,
})
