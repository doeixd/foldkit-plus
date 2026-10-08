/**
 * The toolbar as one SlotView: a shared `Behaviors.Collection` description
 * feeds both the identity Behavior (ids, `aria-disabled`) and the
 * `RovingTabindex` Behavior (one tab stop, arrows). The only view rule is
 * the pressed state; a disabled tool draws with no click.
 */
import { Behavior, Behaviors, Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import { toolbarStyle } from '../style.js'
import { Message, Roving, TOOLS, toolbarArgs, type Model } from './app.js'

export const ToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  tool: Slot.make({ capability: Capability.Focusable }),
})

export const describeTools = () =>
  Behaviors.Collection.of(TOOLS, {
    id: tool => tool.id,
    disabled: tool => tool.disabled,
  })

const Ids = Behaviors.Collection.behavior(ToolbarSlots)<Model, Message>({
  item: 'tool',
  items: () => describeTools(),
})

const Focus = RovingTabindex.behavior(Roving, toolbarArgs)(ToolbarSlots)<Model, Message>({
  container: 'root',
  item: 'tool',
  items: () => describeTools(),
})

export const Toolbar = SlotView.forMessages<Message>()
  .define(ToolbarSlots, (model: Model, slots, h) => {
    const items = describeTools()
    return h.div(
      slots.root.attrs([h.Role('toolbar'), h.AriaLabel('Formatting')]),
      TOOLS.map((tool, index) =>
        h.button(
          slots.tool.attrs(
            [
              h.Key(tool.id),
              h.AriaPressed(model.active === tool.id ? 'true' : 'false'),
              ...(tool.disabled
                ? [h.Title('Unavailable with plain text selected')]
                : [h.OnClick(Message.PressedTool({ id: tool.id }))]),
            ],
            items.slotItem(index),
          ),
          [tool.label],
        ),
      ),
    )
  })
  .pipe(Behavior.attach(Ids), Behavior.attach(Focus), Style.attach(toolbarStyle(ToolbarSlots)))
