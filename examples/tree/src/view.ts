/**
 * The tree as one SlotView over three behaviors sharing one Collection
 * description. `TreeNavigation` owns keys, focus, and the tree ARIA;
 * `Selection` owns click-to-select and `aria-selected`. Neither writes the
 * other's attributes: the resolver would refuse the second owner, so
 * `Collection.behavior` stays out — its descriptor is shared, its bundles
 * would collide with the navigation's `id` and `aria-disabled`.
 */
import { Behavior, Behaviors, Capability, Event, Slot, Slots, SlotView } from 'foldkit-mixins'
import { Selection, TreeNavigation } from 'foldkit-primitives/interaction'
import { Nav, Sel, allRows, labelOf, navArgs, selArgs, type Message, type Model } from './app.js'

export const TreeSlots = Slots.define({
  tree: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Focusable }),
  expander: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

const showingOf = (model: Model) => TreeNavigation.shown(allRows(), model.nav, navArgs)

const describeOf = (model: Model) =>
  Behaviors.Collection.of(showingOf(model), {
    id: row => row.id,
    disabled: row => row.disabled === true,
  })

export const TreeKeys = TreeNavigation.behavior(Nav, navArgs)(TreeSlots)<Model, Message>({
  container: 'tree',
  item: 'row',
  rows: () => allRows(),
})

export const TreePicks = Selection.behavior(Sel, selArgs)(TreeSlots)<Model, Message>({
  item: 'row',
  items: model => describeOf(model),
})

/** The toggle message for a branch row: close when open, open when closed. */
export const toggleOf = (model: Model, id: string): Message =>
  Nav.wrapper.make(
    TreeNavigation.isOpen(model.nav, navArgs, id)
      ? TreeNavigation.Message.Closed({ id })
      : TreeNavigation.Message.Opened({ id }),
  )

export const Tree = SlotView.forMessages<Message>()
  .define(TreeSlots, (model: Model, slots, h) => {
    const showing = showingOf(model)
    const described = describeOf(model)
    return h.div(
      slots.tree.attrs([h.Role('tree'), h.AriaLabel('Files')]),
      showing.map((row, index) => {
        const open = TreeNavigation.isOpen(model.nav, navArgs, row.id)
        return h.div(slots.row.attrs([], described.slotItem(index)), [
          ...(row.branch
            ? [
                h.button(
                  slots.expander.attrs([
                    h.AriaLabel(`${open ? 'Collapse' : 'Expand'} ${labelOf(row.id)}`),
                    h.OnClick(toggleOf(model, row.id)),
                  ]),
                  [open ? '▾' : '▸'],
                ),
              ]
            : []),
          h.span([], [labelOf(row.id)]),
        ])
      }),
    )
  })
  .pipe(Behavior.attach(TreeKeys), Behavior.attach(TreePicks))
