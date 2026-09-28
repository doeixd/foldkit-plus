import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Input as UiInput } from '@foldkit/ui'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Input } from 'foldkit-mixins-ui'

import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { FieldInputStyle } from '../style/field.js'
import { InputPageSlots, InputPageStyle } from '../style/input.js'

type Slots = SlotBuilders<typeof InputPageSlots, UiMessage>

const nameField = (
  attributes: UiInput.InputAttributes<UiMessage>,
  description: string,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => {
  const field = Input.resolve(attributes, [FieldInputStyle.mixin], { input: undefined, h })

  return h.div(slots.field.attrs(), [
    h.label(field.label, ['Name']),
    h.input(field.input),
    h.span(field.description, [description]),
  ])
}

const InputPage = SlotView.forMessages<UiMessage>()
  .define(InputPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Input']),

      h.h3(slots.section.attrs(), ['Basic']),
      h.div(slots.demo.attrs(), [
        UiInput.view(
          {
            id: 'input-basic-demo',
            value: model.inputDemoValue,
            hasDescription: true,
            onInput: value => UiMessage.UpdatedInputDemoValue({ value }),
            placeholder: 'Enter your full name',
            toView: attributes =>
              nameField(attributes, 'As it appears on your government-issued ID.', slots, h),
          },
          h,
        ),
      ]),

      h.h3(slots.section.attrs(), ['Disabled']),
      h.div(slots.demo.attrs(), [
        UiInput.view(
          {
            id: 'input-disabled-demo',
            isDisabled: true,
            hasDescription: true,
            value: 'Ada Lovelace',
            toView: attributes => nameField(attributes, 'This input is disabled.', slots, h),
          },
          h,
        ),
      ]),
    ]),
  )
  .pipe(Style.attach(InputPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(InputPage)
