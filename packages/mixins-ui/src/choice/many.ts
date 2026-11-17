import { Option } from 'effect'
import { ChoiceChange, itemOf, type Choice } from '../choice.js'
import { flipped } from '../choices.js'

/** Any number of `items`, in the order they were chosen: `Selected` flips one. */
export const many = <const Item extends string>(
  items: ReadonlyArray<Item>,
): Choice<Item, ReadonlyArray<Item>> => ({
  items,
  empty: [],
  picked: (value, change) =>
    ChoiceChange.match(change, {
      Selected: ({ value: reported }) =>
        Option.match(itemOf(items, reported), {
          onNone: () => value,
          onSome: item => flipped(value, item),
        }),
      ClearedSelection: () => (value.length === 0 ? value : []),
      Typed: () => value,
    }),
  chosen: value => value,
  // The chosen items show as chips, so the input rests empty.
  resting: () => '',
  multiple: true,
})
