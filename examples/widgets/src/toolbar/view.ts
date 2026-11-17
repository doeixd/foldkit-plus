/**
 * The toolbar, drawn with `foldkit-mixins-ui`'s `Toolbar`: it owns the keys and
 * the one tab stop, the application keeps the stop (`Roving`, placed in
 * `app.ts`) and the pressed state. Each tool is a `Button` handed the
 * toolbar's attributes; a disabled one is skipped by the arrows.
 */
import { Option } from 'effect'
import { Capability, Layers, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
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
const t = AppStyle.make({}).t

// A tool is quiet on the tray (a ghost button: no fill, no line) and fills under the pointer.
// Pressed, it takes the accent's tint and ink, a different hue from the tray's grey, where the
// neutral toggle fill was a darker grey that barely parted from it; the `app` layer beats the
// Button's own pressed, hovered and held fills.
const pressedTool = Layers.standard.in(
  'app',
  Style.pseudo('[aria-pressed="true"]', {
    background: t.accent.subtle,
    borderColor: `color-mix(in oklab, ${t.accent.ink} 35%, transparent)`,
    color: t.accent.ink,
  }),
)

export const ToolStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button.extend({ base: { button: pressedTool } })({ tone: 'neutral', variant: 'ghost' }),
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
