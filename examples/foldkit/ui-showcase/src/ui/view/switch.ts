import { Submodel } from 'foldkit'

import { Switch as UiSwitch } from '@foldkit/ui'
import { SlotView, Style } from 'foldkit-mixins'
import { Switch } from 'foldkit-mixins-ui'

import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { DemoSwitchStyle, SwitchPageSlots, SwitchPageStyle } from '../style/switch.js'

const SWITCH_DEMO_ID = 'switch-demo'

/** The control is empty: the Switch recipe draws the knob and slides it on `aria-checked`. */
const SwitchPage = SlotView.forMessages<UiMessage>()
  .define(SwitchPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Switch']),
      h.div(slots.demo.attrs(), [
        UiSwitch.view(
          {
            id: SWITCH_DEMO_ID,
            isChecked: model.isSwitchDemoChecked,
            hasDescription: true,
            onToggle: isChecked => UiMessage.ToggledSwitchDemo({ isChecked }),
            toView: attributes => {
              const control = Switch.resolve(attributes, [DemoSwitchStyle.mixin], {
                input: undefined,
                h,
              })

              return h.div(slots.row.attrs(), [
                h.button(control.button, []),
                h.div(slots.text.attrs(), [
                  h.label(control.label, ['Enable notifications']),
                  h.p(control.description, ['Get notified when something important happens.']),
                ]),
              ])
            },
          },
          h,
        ),
      ]),
    ]),
  )
  .pipe(Style.attach(SwitchPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(SwitchPage)
