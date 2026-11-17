/**
 * Compile-time contract of `FocusRecovery.behavior`: the owner is a slot of
 * the contract, a `{ part }` step names a key of `parts`, a key of `parts`
 * that is no slot names a part a widget draws itself (`recoveryPart`), and
 * `parent` reads the view's input. Type-checked, not executed.
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

// A key that is no slot names the part a widget marks itself, as an Alert's
// `recoveryPart: 'dismiss'` does, and a step may go to it.
const widgetPart = FocusRecovery.behavior(Search)({
  owner: 'root',
  parts: { dismiss: ['next', { part: 'input' }], input: [] },
})
void widgetPart

FocusRecovery.behavior(Search)({
  owner: 'root',
  // @ts-expect-error a step naming a part `parts` does not declare, though the contract publishes it as a slot.
  parts: { row: [{ part: 'input' }] },
})

FocusRecovery.behavior(Search)({
  owner: 'root',
  // @ts-expect-error a step naming a part `parts` does not declare, and no slot either.
  parts: { row: [{ part: 'add' }] },
})

FocusRecovery.behavior(Search)({
  owner: 'root',
  // @ts-expect-error a misspelt step beside a declared part.
  parts: { row: [{ part: 'inputt' }], input: [] },
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
