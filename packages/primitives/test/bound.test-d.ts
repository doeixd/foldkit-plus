/**
 * Compile-time contract of a Behavior factory given a `SlotView.over` binder:
 * the options are typed from the binder with nothing annotated, and the call
 * with bare slots still compiles. Type-checked, not executed.
 */
import { pipe, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, Event, Slot, SlotView, Slots } from 'foldkit-mixins'
import { FocusScope, ListNavigation, Selection, TreeNavigation } from '../src/interaction/index.js'

const Nav = Bundle.declare(TreeNavigation.bundle, 'nav')
const List = Bundle.declare(ListNavigation.bundle, 'list')
const Sel = Bundle.declare(Selection.bundle, 'selection')
const Message = defineMessageUnion({ ...Nav.cases, ...List.cases, ...Sel.cases, Cleared: {} })
type Message = typeof Message.Type

const ResultSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  option: Slot.make({ capability: Capability.Focusable }),
  clear: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

interface ResultInput {
  readonly nav: TreeNavigation.Model
  readonly list: ListNavigation.Model
  readonly selection: Selection.Model
  readonly results: ReadonlyArray<{ readonly id: string; readonly label: string }>
}

const navArgs = { openByDefault: false } as const
const listArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 10,
} as const
const selArgs = { mode: 'single', allowEmpty: false } as const

const Results = SlotView.over(ResultSlots)<ResultInput, Message>()

const describeOf = (input: ResultInput) =>
  Behaviors.Collection.of(input.results, { id: row => row.id })

// Each factory takes the binder and types `input` from it, nothing annotated.
const Keys = ListNavigation.behavior(List, listArgs)(Results)({
  container: 'root',
  item: 'option',
  items: input => describeOf(input),
  text: (input, index) => input.results[index]?.label ?? '',
})
const Picks = Selection.behavior(Sel, selArgs)(Results)({
  item: 'option',
  items: input => describeOf(input),
})
const Tree = TreeNavigation.behavior(Nav, navArgs)(Results)({
  container: 'root',
  item: 'option',
  rows: input =>
    input.results.map(row => ({ ...row, parent: null, branch: false, disabled: false })),
})
const Scope = FocusScope.behavior(Results)({ container: 'root' })
const Opens = Behaviors.Disclosure.behavior(Results)({
  trigger: 'clear',
  content: 'root',
  open: input => input.results.length > 0,
  id: () => 'results',
})

// Inline inside `pipe`, with the same Behaviors written in place.
const ResultsView = Results.define((input, slots, h) =>
  h.div(slots.root.attrs(), [h.span(slots.option.attrs(), [String(input.results.length)])]),
).pipe(
  Behavior.attach(Keys),
  Behavior.attach(Picks),
  Behavior.attach(Tree),
  Behavior.attach(Scope),
  Behavior.attach(
    Behaviors.Disclosure.behavior(Results)({
      trigger: 'clear',
      content: 'root',
      open: input => input.results.length > 0,
      id: () => 'results',
    }),
  ),
)
const _view: SlotView.SlotView<typeof ResultSlots, ResultInput, Message> = ResultsView
void _view

// And hoisted, through Effect's `pipe`.
const _piped: SlotView.SlotView<typeof ResultSlots, ResultInput, Message> = pipe(
  Results.define((_input, slots, h) => h.div(slots.root.attrs(), [])),
  Behavior.attach(Opens),
  Behavior.attach(Keys),
)
void _piped

// The call with bare slots still compiles, with the generics named as before.
const Old = ListNavigation.behavior(List, listArgs)(ResultSlots)<ResultInput, Message>({
  container: 'root',
  item: 'option',
  items: input => describeOf(input),
  text: (input, index) => input.results[index]?.label ?? '',
})
void Old

ListNavigation.behavior(List, listArgs)(Results)({
  // @ts-expect-error a slot the contract does not publish.
  container: 'nope',
  item: 'option',
  items: input => describeOf(input),
  text: () => '',
})

ListNavigation.behavior(List, listArgs)(Results)({
  container: 'root',
  item: 'option',
  items: input => describeOf(input),
  // @ts-expect-error a field the input lacks.
  text: input => input.missing,
})

Selection.behavior(Sel, selArgs)(Results)({
  item: 'option',
  // @ts-expect-error a field the input lacks.
  items: input => describeOf(input.missing),
})

TreeNavigation.behavior(Nav, navArgs)(Results)({
  container: 'root',
  item: 'option',
  // @ts-expect-error the binder's input holds no field for the wrong placement's slice.
  rows: input => input.nav.missing,
})

ListNavigation.behavior(List, listArgs)(Results)({
  container: 'root',
  item: 'option',
  items: input => describeOf(input),
  text: () => '',
  // @ts-expect-error a Message outside the binder's universe.
  commit: () => ({ _tag: 'Elsewhere' }),
})

const NoNav = SlotView.over(ResultSlots)<{ readonly results: [] }, Message>()
// @ts-expect-error a binder whose input lacks the placed slice.
TreeNavigation.behavior(Nav, navArgs)(NoNav)

FocusScope.behavior(Results)({
  // @ts-expect-error a slot the contract does not publish.
  container: 'nope',
})

// Every binder-first factory keeps `Slots` from the binder, so options name its slots only.
Behaviors.Disclosure.behavior(Results)({
  // @ts-expect-error a slot the contract does not publish.
  trigger: 'nope',
  content: 'root',
  open: () => true,
  id: () => 'results',
})

void Schema
