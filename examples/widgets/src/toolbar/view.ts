/**
 * The toolbar, drawn with `foldkit-mixins-ui`'s `Toolbar`: it owns the keys and
 * the one tab stop, the application keeps the stop (`Roving`, placed in
 * `app.ts`) and the pressed state. Each tool is a `Button` handed the
 * toolbar's attributes; a disabled one is skipped by the arrows.
 */
import { Option } from 'effect'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import {
  Button,
  ButtonSlots,
  Recipes,
  Toolbar as UiToolbar,
  ToolbarSlots as UiToolbarSlots,
} from 'foldkit-mixins-ui'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import { toolbarStyle } from '../style.js'
import { Message, Roving, TOOLS, type Model } from './app.js'

export const ToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
})

export const BarStyle = Style.forSlots(UiToolbarSlots)(Recipes.Toolbar({}))
export const ToolStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline' }),
)

export const Toolbar = SlotView.forMessages<Message>()
  .define(ToolbarSlots, (model: Model, slots, h) =>
    h.div(slots.root.attrs(), [
      UiToolbar.view(
        {
          id: 'format',
          label: 'Formatting',
          items: TOOLS.map((tool): UiToolbar.ToolbarControl<Message> => ({
            id: tool.id,
            disabled: tool.disabled,
            draw: control =>
              Button.view(
                {
                  label: tool.label,
                  disabled: control.disabled,
                  pressed: Option.exists(model.active, active => active === tool.id),
                  onClick: Message.PressedTool({ id: tool.id }),
                  attributes: {
                    button: [
                      ...control.attributes,
                      ...(tool.disabled ? [h.Title('Unavailable with plain text selected')] : []),
                    ],
                  },
                  style: ToolStyle,
                },
                h,
              ),
          })),
          roving: model.toolbarFocus,
          onFocus: id => Roving.wrapper.make(RovingTabindex.Message.Focused({ id })),
          style: BarStyle,
        },
        h,
      ),
    ]),
  )
  .pipe(Style.attach(toolbarStyle(ToolbarSlots)))
