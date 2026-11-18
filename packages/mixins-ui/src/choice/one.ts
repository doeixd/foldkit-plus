import { Option } from 'effect'
import { ChoiceChange, itemOf, type SingleChoice } from '../choice.js'

/** At most one of `items`: the value is an `Option` of an item. */
export const one = <const Item extends string>(
  items: ReadonlyArray<Item>,
): SingleChoice<Item, Option.Option<Item>> => ({
  items,
  empty: Option.none(),
  picked: (value, change) =>
    ChoiceChange.match(change, {
      // A value that is no item (a stale id, a created row) leaves the choice as it was.
      Selected: ({ value: reported }) =>
        Option.match(itemOf(items, reported), {
          onNone: () => value,
          onSome: item => (Option.contains(value, item) ? value : Option.some(item)),
        }),
      ClearedSelection: () => (Option.isNone(value) ? value : Option.none()),
      Typed: () => value,
    }),
  chosen: value => Option.toArray(value),
  resting: (value, labelOf) => Option.match(value, { onNone: () => '', onSome: labelOf }),
  multiple: false,
})
