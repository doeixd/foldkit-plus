import { Listbox } from '@foldkit/ui'
import { Option } from 'effect'
import { type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'
import { SlotView } from 'foldkit-mixins'

import { ChoiceSlots, ChoiceStyle } from '../style.js'
import * as Icon from './icon.js'

const ANCHOR = { placement: 'bottom-start' as const, gap: 4, padding: 8 }

/**
 * A labelled `@foldkit/ui` Listbox of text choices: its button shows the choice
 * or a placeholder, and the chosen option is checked.
 */
export const view = <Message>(
  config: Readonly<{
    label: string
    placeholder: string
    model: Listbox.Model
    listbox: Listbox.Bundle<string>
    items: ReadonlyArray<string>
    maybeSelectedValue: Option.Option<string>
    toParentMessage: (message: Listbox.Message) => Message
  }>,
  h: HtmlBuilder<Message>,
): Html => {
  const slots = SlotView.buildersFor(ChoiceSlots, [ChoiceStyle.mixin], { input: undefined, h })
  return h.keyed('div')(config.model.id, slots.field.attrs(), [
    h.label(slots.label.attrs(), [config.label]),
    h.submodel({
      slotId: config.model.id,
      model: config.model,
      view: config.listbox.view,
      viewInputs: {
        anchor: ANCHOR,
        items: config.items,
        maybeSelectedValue: config.maybeSelectedValue,
        itemToConfig: item => ({
          content: h.div(slots.option.attrs(), [
            h.span(slots.check.attrs(), ['✓']),
            h.span(slots.optionText.attrs(), [item]),
          ]),
        }),
        buttonContent: h.div(slots.face.attrs(), [
          Option.match(config.maybeSelectedValue, {
            onNone: () => h.span(slots.placeholder.attrs(), [config.placeholder]),
            onSome: value => h.span(slots.value.attrs(), [value]),
          }),
          Icon.chevronDown(slots.chevron.attrs(), h),
        ]),
        attributes: childAttributes(slots.choice.attrs()),
        buttonAttributes: childAttributes(slots.button.attrs()),
        itemsAttributes: childAttributes(slots.items.attrs()),
        backdropAttributes: childAttributes(slots.backdrop.attrs()),
      },
      toParentMessage: config.toParentMessage,
    }),
  ])
}
