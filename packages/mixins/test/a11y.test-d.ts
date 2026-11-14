/**
 * Compile-time A11y contract. Type-checked, not executed.
 */
import { pipe } from 'effect'
import {
  A11y,
  Attr,
  Behavior,
  Capability,
  Event,
  Slots,
  SlotView,
  Style,
  type A11yDiagnostic,
  type A11yDiagnosticCode,
} from '../src/index.js'
import { FieldSlots } from './fixture.js'
import type { TestMessage } from './resolverFixture.js'
import {
  Clears,
  List,
  ListSlots,
  Listbox,
  Named,
  Nav,
  Picks,
  bare,
  type ListInput,
} from './a11y.fixture.js'

const FieldPattern = A11y.pattern({
  root: { capability: Capability.Container },
  input: {
    capability: Capability.TextInput,
    events: [Event.Input, Event.Focus],
    attributes: [Attr.AriaLabel],
  },
})

const _diagnostics: ReadonlyArray<A11yDiagnostic> = A11y.validate(FieldPattern, FieldSlots)
const _code: A11yDiagnosticCode = _diagnostics[0]!.code
void _diagnostics
void _code

// A pattern is a portable contract: keys are not constrained to one slot set.
// A missing slot is a runtime diagnostic, not a compile error.
A11y.validate(A11y.pattern({ legend: {} }), FieldSlots)

// @ts-expect-error a requirement has no `event` field.
A11y.pattern({ trigger: { event: Event.Click } })

// @ts-expect-error a11y diagnostics never carry a mixins code.
const _mixinsCode: A11yDiagnosticCode = 'mixins:unknown-slot'
void _mixinsCode

// @ts-expect-error only A11y.pattern produces a branded pattern.
A11y.validate({ requirements: {} }, FieldSlots)

// --- Obligations: what attachments supply covers what a pattern owes.

const Look = Style.forSlots(ListSlots)({ listbox: { display: 'grid' } })

// Covered through the view's own `pipe`, a Style and an unrelated Behavior between.
const Conforming = bare.pipe(
  Behavior.attach(Nav),
  Style.attach(Look),
  Behavior.attach(Clears),
  Behavior.attach(Picks),
  SlotView.attach(Named),
  A11y.conform(Listbox),
)
// `conform` hands back the view with what it supplies.
const _supplied: SlotView.SlotView<
  typeof ListSlots,
  ListInput,
  TestMessage,
  | 'listbox/navigation'
  | 'listbox/name'
  | 'option/focus-strategy'
  | 'option/activation'
  | 'option/state:aria-selected'
> = Conforming
void _supplied

// And through Effect's `pipe`, the transforms hoisted.
const conformsToListbox = A11y.conform(Listbox)
pipe(bare, Behavior.attach(Nav), Behavior.attach(Picks), SlotView.attach(Named), conformsToListbox)

// A native element and a delegation supply too.
const Natively = A11y.native(
  { option: [A11y.FocusStrategy, A11y.Activation] },
  { element: 'button' },
)
const NavOnTheList: Behavior.NamedBehavior<
  typeof ListSlots,
  ListInput,
  TestMessage,
  'listbox/navigation'
> = List.behavior({ listbox: Behavior.slot({ provides: [A11y.Navigation] }) }, { name: 'Keys' })
bare.pipe(
  Behavior.attach(NavOnTheList),
  SlotView.attach(Natively),
  Behavior.attach(Picks),
  SlotView.attach(
    A11y.delegated({ clear: [A11y.Navigation] }, { to: 'listbox', provider: NavOnTheList }),
  ),
  SlotView.attach(Named),
  A11y.conform(Listbox),
)

// Each rejection alone, at the `conform` that cannot be met.
bare.pipe(
  Behavior.attach(NavOnTheList),
  Behavior.attach(Picks),
  SlotView.attach(Named),
  // @ts-expect-error option/focus-strategy is supplied by nothing attached.
  A11y.conform(Listbox),
)
const FocusOnly: Behavior.NamedBehavior<
  typeof ListSlots,
  ListInput,
  TestMessage,
  'option/focus-strategy'
> = List.behavior({ option: Behavior.slot({ provides: [A11y.FocusStrategy] }) })
bare.pipe(
  Behavior.attach(FocusOnly),
  Behavior.attach(Picks),
  SlotView.attach(Named),
  // @ts-expect-error listbox/navigation is supplied by nothing attached.
  A11y.conform(Listbox),
)
// @ts-expect-error a bare view supplies nothing.
A11y.conform(Listbox)(bare)
pipe(
  bare,
  Behavior.attach(Nav),
  Behavior.attach(Picks),
  SlotView.attach(Named),
  SlotView.detach('Clears'),
  // @ts-expect-error what a detached attachment supplied is not known, so nothing is.
  A11y.conform(Listbox),
)
// And through the view's own `pipe`. Its catch-all, for a spread array of transforms, reads a
// refused call's every step as the view it was called on, which supplies nothing here.
bare.pipe(
  Behavior.attach(Nav),
  Behavior.attach(Picks),
  SlotView.attach(Named),
  SlotView.detach('Clears'),
  // @ts-expect-error what a detached attachment supplied is not known, so nothing is.
  A11y.conform(Listbox),
)
// A Behavior made without a statement of what it supplies supplies nothing at the type level.
bare.pipe(
  Behavior.attach(List.behavior({ listbox: Behavior.slot({ provides: [A11y.Navigation] }) })),
  Behavior.attach(Nav),
  Behavior.attach(Picks),
  // @ts-expect-error listbox/name is still owed.
  A11y.conform(Listbox),
)

// A delegation names only what its provider supplies, on one of the provider's slots.
// @ts-expect-error `Nav` supplies no navigation on `option`.
A11y.delegated({ clear: [A11y.Navigation] }, { to: 'option', provider: Nav })
// @ts-expect-error `nope` is not a slot of the provider.
A11y.delegated({ clear: [A11y.Navigation] }, { to: 'nope', provider: Nav })
// @ts-expect-error a provider that states nothing supplies nothing to delegate.
A11y.delegated({ clear: [A11y.Navigation] }, { to: 'listbox', provider: Clears })

// @ts-expect-error a native element is one of the interactive ones.
A11y.native({ option: [A11y.Activation] }, { element: 'div' })
// @ts-expect-error `State` takes an attribute token, so the set of names stays the tokens'.
A11y.State('aria-selected')
// @ts-expect-error an obligation is a token, not a name.
A11y.pattern({ listbox: { obligations: ['navigation'] } })

// An assembly whose slot names are not known is not judged here; `conform` throws when it loads.
const slotNames: ReadonlyArray<string> = ['listbox', 'option']
const DynamicSlots = Slots.define(
  Object.fromEntries(slotNames.map(name => [name, { capability: Capability.Interactive }])),
)
A11y.conform(Listbox)(
  SlotView.forMessages<TestMessage>().define(DynamicSlots, (input: ListInput, slots, h) =>
    h.ul(slots['listbox']!.attrs(), input.ids),
  ),
)
