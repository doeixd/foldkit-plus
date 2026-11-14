/**
 * Compile-time contract of `FocusRecovery.behavior`: the owner, the part
 * slots and the `{ part }` steps are slots of the contract, and `parent` reads
 * the view's input. Type-checked, not executed.
 */
import { Option } from 'effect'
import { Capability, Slot, SlotView, Slots } from 'foldkit-mixins'
import { FocusRecovery } from '../src/interaction/index.js'

const SearchSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.TextInput }),
  row: Slot.make({ capability: Capability.Focusable }),
})
interface SearchInput {
  readonly parents: ReadonlyMap<string, string>
}
const Search = SlotView.over(SearchSlots)<SearchInput, never>()

const ok = FocusRecovery.behavior(Search)({
  owner: 'root',
  parts: {
    input: [],
    row: ['same', 'next', 'previous', 'parent', 'stop', 'owner', { part: 'input' }],
  },
  parent: (input, item) => Option.fromNullishOr(input.parents.get(item.id ?? '')),
})
void ok

FocusRecovery.behavior(Search)({
  // @ts-expect-error an owner the contract does not publish.
  owner: 'nope',
  parts: {},
})

FocusRecovery.behavior(Search)({
  owner: 'root',
  // @ts-expect-error a part slot the contract does not publish.
  parts: { nope: [] },
})

FocusRecovery.behavior(Search)({
  owner: 'root',
  // @ts-expect-error a step naming a slot the contract does not publish.
  parts: { row: [{ part: 'inputt' }] },
})

FocusRecovery.behavior(Search)({
  owner: 'root',
  // @ts-expect-error a step that is not one of the seven.
  parts: { row: ['first'] },
})

FocusRecovery.behavior(Search)({
  owner: 'root',
  parts: {},
  // @ts-expect-error a parent function over a field the input lacks.
  parent: input => Option.some(input.missing),
})
