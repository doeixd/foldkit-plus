import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Textarea as UiTextarea } from '@foldkit/ui'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { TextareaPageSlots, TextareaPageStyle } from '../style/textarea.js'
import { resolveTextarea } from '../textareaField.js'

type Slots = SlotBuilders<typeof TextareaPageSlots, UiMessage>

const bioField = (
  attributes: UiTextarea.TextareaAttributes<UiMessage>,
  description: string,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html => {
  const field = resolveTextarea(attributes, h)

  return h.div(slots.field.attrs(), [
    h.label(field.label, ['Bio']),
    h.textarea(field.textarea),
    h.span(field.description, [description]),
  ])
}

const TextareaPage = SlotView.forMessages<UiMessage>()
  .define(TextareaPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Textarea']),

      h.h3(slots.section.attrs(), ['Basic']),
      h.div(slots.demo.attrs(), [
        UiTextarea.view(
          {
            id: 'textarea-basic-demo',
            value: model.textareaDemoValue,
            hasDescription: true,
            onInput: value => UiMessage.UpdatedTextareaDemoValue({ value }),
            placeholder: 'Tell us about yourself...',
            rows: 4,
            toView: attributes =>
              bioField(attributes, 'A brief introduction about yourself.', slots, h),
          },
          h,
        ),
      ]),

      h.h3(slots.section.attrs(), ['Disabled']),
      h.div(slots.demo.attrs(), [
        UiTextarea.view(
          {
            id: 'textarea-disabled-demo',
            isDisabled: true,
            hasDescription: true,
            value:
              "Mathematician and writer, known for work on Charles Babbage's Analytical Engine.",
            rows: 3,
            toView: attributes => bioField(attributes, 'This textarea is disabled.', slots, h),
          },
          h,
        ),
      ]),
    ]),
  )
  .pipe(Style.attach(TextareaPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(TextareaPage)
