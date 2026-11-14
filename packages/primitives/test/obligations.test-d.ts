/**
 * Compile-time contract of the primitives' obligations: a factory given a
 * binder states what it supplies from the slot names it was given, so a
 * listbox assembled from them conforms with nothing restated, and one that
 * leaves a primitive out does not. Type-checked, not executed.
 */
import { pipe } from 'effect'
import { A11y, Behavior, SlotView } from 'foldkit-mixins'
import { ListNavigation, Press, Selection } from '../src/interaction/index.js'
import {
  Keys,
  List,
  ListboxSlots,
  Listbox,
  Named,
  Options,
  Picks,
  Pressing,
  Sel,
  bare,
  itemsOf,
  listArgs,
  selArgs,
  type Input,
  type Message,
} from './obligations.fixture.js'

// What each factory supplies, read off its type.
const _keys: Behavior.NamedBehavior<
  typeof ListboxSlots,
  Input,
  Message,
  'listbox/navigation' | 'option/focus-strategy'
> = Keys
const _picks: Behavior.NamedBehavior<
  typeof ListboxSlots,
  Input,
  Message,
  'option/state:aria-selected' | 'option/activation'
> = Picks
void [_keys, _picks]

// Conforms with the primitives written inline, nothing annotated.
bare.pipe(
  Behavior.attach(
    ListNavigation.behavior(List, listArgs)(Options)({
      container: 'listbox',
      item: 'option',
      items: itemsOf,
      text: (input, index) => input.options[index]?.label ?? '',
    }),
  ),
  Behavior.attach(Selection.behavior(Sel, selArgs)(Options)({ item: 'option', items: itemsOf })),
  SlotView.attach(Named),
  A11y.conform(Listbox),
)

// Selection with its click off supplies no activation; Press supplies it instead.
pipe(
  bare,
  Behavior.attach(Keys),
  Behavior.attach(
    Selection.behavior(Sel, selArgs)(Options)({ item: 'option', items: itemsOf, click: false }),
  ),
  Behavior.attach(Press.behavior(Pressing)(Options)({ target: 'option' })),
  SlotView.attach(Named),
  A11y.conform(Listbox),
)
pipe(
  bare,
  Behavior.attach(Keys),
  Behavior.attach(
    Selection.behavior(Sel, selArgs)(Options)({ item: 'option', items: itemsOf, click: false }),
  ),
  SlotView.attach(Named),
  // @ts-expect-error option/activation: the click is off and nothing else presses.
  A11y.conform(Listbox),
)

// Navigation and focus strategy on other slots than the pattern's do not count.
pipe(
  bare,
  Behavior.attach(
    ListNavigation.behavior(List, listArgs)(Options)({
      container: 'panel',
      item: 'option',
      items: itemsOf,
      text: () => '',
    }),
  ),
  Behavior.attach(Picks),
  SlotView.attach(Named),
  // @ts-expect-error listbox/navigation: the keys were put on the panel.
  A11y.conform(Listbox),
)

// The call with bare slots states nothing, so only run time can judge such a view.
pipe(
  bare,
  Behavior.attach(
    ListNavigation.behavior(List, listArgs)(ListboxSlots)<Input, Message>({
      container: 'listbox',
      item: 'option',
      items: itemsOf,
      text: () => '',
    }),
  ),
  Behavior.attach(Picks),
  SlotView.attach(Named),
  // @ts-expect-error listbox/navigation and option/focus-strategy are not stated.
  A11y.conform(Listbox),
)

// A delegation to a primitive names only what it supplies there.
A11y.delegated({ toggle: [A11y.Navigation] }, { to: 'listbox', provider: Keys })
// @ts-expect-error ListNavigation supplies its focus strategy on the item, not the container.
A11y.delegated({ toggle: [A11y.FocusStrategy] }, { to: 'listbox', provider: Keys })
