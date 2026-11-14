/**
 * `Patterns.Listbox` and `Patterns.Checkbox` name obligations, which a custom
 * view assembled from the primitives meets, and a view missing one does not.
 */
import {
  A11y,
  Attr,
  Behavior,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
} from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { Patterns } from '../src/index.js'

type Message = { readonly _tag: 'Toggled' } | { readonly _tag: 'Picked'; readonly id: string }

interface Input {
  readonly checked: boolean
  readonly fruit: ReadonlyArray<string>
}

const owed = (
  diagnostics: ReadonlyArray<{
    readonly slot?: string
    readonly details?: Readonly<Record<string, unknown>>
  }>,
) => diagnostics.map(({ slot, details }) => `${slot}/${String(details?.['obligation'])}`)

describe('Patterns.Checkbox', () => {
  const CheckboxSlots = Slots.define({
    checkbox: Slot.make({
      capability: Capability.Interactive,
      events: [Event.Click],
      attributes: [Attr.Role],
    }),
    label: Slot.make({ capability: Capability.Container }),
  })
  const Box = SlotView.over(CheckboxSlots)<Input, Message>()
  const view = Box.define((input, slots, h) =>
    h.div(
      [],
      [
        h.button(slots.checkbox.attrs([h.Role('checkbox')]), []),
        h.span(slots.label.attrs(), [String(input.checked)]),
      ],
    ),
  )
  const State = Behaviors.ToggleState.behavior(Box)({
    control: 'checkbox',
    state: input => input.checked,
    as: 'checked',
  })
  const Label = Behaviors.FieldAssociation.behavior(Box)({
    control: 'checkbox',
    label: 'label',
    id: () => 'agree',
  })
  // A native `<button>` is focusable and pressed by Enter, Space and a click by itself.
  const Native = A11y.native(
    { checkbox: [A11y.FocusStrategy, A11y.Activation] },
    { element: 'button' },
  )

  it('is met by ToggleState, FieldAssociation and a native button', () => {
    const checkbox = A11y.conform(Patterns.Checkbox)(
      view.pipe(Behavior.attach(State), Behavior.attach(Label), SlotView.attach(Native)),
    )
    expect(A11y.check(Patterns.Checkbox, checkbox)).toEqual([])
  })

  it('owes aria-checked without ToggleState', () => {
    expect(
      owed(
        A11y.check(Patterns.Checkbox, view.pipe(Behavior.attach(Label), SlotView.attach(Native))),
      ),
    ).toEqual(['checkbox/state:aria-checked'])
  })
})

describe('Patterns.Listbox', () => {
  const ListboxSlots = Slots.define({
    wrapper: Slot.make({ capability: Capability.Container }),
    button: Slot.make({
      capability: Capability.Interactive,
      events: [Event.Click],
      attributes: [Attr.AriaExpanded],
    }),
    items: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
    item: Slot.make({
      capability: Capability.Focusable,
      events: [Event.Click],
      attributes: [Attr.Role, Attr.AriaSelected],
    }),
  })
  const Fruit = SlotView.over(ListboxSlots)<Input, Message>()
  const view = Fruit.define((input, slots, h) =>
    h.div(slots.wrapper.attrs(), [
      h.button(slots.button.attrs(), ['Fruit']),
      h.ul(
        slots.items.attrs([h.Role('listbox'), h.AriaLabel('Fruit')]),
        input.fruit.map((name, index) => h.li(slots.item.attrs([], { id: name, index }), [name])),
      ),
    ]),
  )
  // What `ListNavigation` and `Selection` supply over these slots, written as a primitive author would.
  const Keys = Fruit.behavior(
    {
      items: Behavior.slot({ provides: [A11y.Navigation] }),
      item: Behavior.slot({ provides: [A11y.FocusStrategy] }),
    },
    { name: 'Keys' },
  )
  const Picks = Fruit.behavior(
    { item: Behavior.slot({ provides: [A11y.Activation, A11y.State(Attr.AriaSelected)] }) },
    { name: 'Picks' },
  )
  const Named = A11y.base({ items: [A11y.Name] })

  it("is met by ListNavigation, Selection and the list's own label", () => {
    // Hand-written Behaviors state nothing at the type level, so this view is judged by `check`.
    const listbox = view.pipe(Behavior.attach(Keys), Behavior.attach(Picks), SlotView.attach(Named))
    expect(A11y.check(Patterns.Listbox, listbox)).toEqual([])
  })

  it('owes what ListNavigation supplies without it', () => {
    expect(
      owed(A11y.check(Patterns.Listbox, view.pipe(Behavior.attach(Picks), SlotView.attach(Named)))),
    ).toEqual(['items/navigation', 'item/focus-strategy'])
  })
})
