import { Submodel } from 'foldkit'

import { Button as UiButton } from '@foldkit/ui'
import { SlotView, Style } from 'foldkit-mixins'
import { Button } from 'foldkit-mixins-ui'

import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { ButtonPageSlots, ButtonPageStyle, DemoButtonStyle } from '../style/button.js'

const ButtonPage = SlotView.forMessages<UiMessage>()
  .define(ButtonPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Button']),

      h.h3(slots.section.attrs(), ['Basic']),
      h.div(slots.demo.attrs(), [
        UiButton.view(
          {
            onClick: UiMessage.ClickedButtonDemo(),
            toView: attributes =>
              h.button(
                Button.resolve(attributes, [DemoButtonStyle.mixin], { input: undefined, h }).button,
                ['Click me'],
              ),
          },
          h,
        ),
        h.span(slots.count.attrs(), [
          `Clicked ${model.buttonClickCount} time${model.buttonClickCount === 1 ? '' : 's'}`,
        ]),
      ]),

      h.h3(slots.section.attrs(), ['Disabled']),
      UiButton.view(
        {
          isDisabled: true,
          toView: attributes =>
            h.button(
              Button.resolve(attributes, [DemoButtonStyle.mixin], { input: undefined, h }).button,
              ['Disabled'],
            ),
        },
        h,
      ),
    ]),
  )
  .pipe(Style.attach(ButtonPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(ButtonPage)
