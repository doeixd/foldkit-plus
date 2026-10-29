import * as UiCheckbox from '@foldkit/ui/checkbox'
import * as UiTextarea from '@foldkit/ui/textarea'
import { FieldValidation } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, type SlotBuilders } from 'foldkit-mixins'
import { Checkbox, Input, Textarea } from 'foldkit-mixins-ui'

import { CheckboxStyle, FieldPart, InputStyle, TextareaStyle } from '../style.js'

type FieldState = FieldValidation.Field<string>

type Slots<Message> = SlotBuilders<typeof FieldPart.slots, Message>

const statusMark = <Message>(field: FieldState, slots: Slots<Message>, h: HtmlBuilder<Message>) =>
  FieldValidation.match(field, {
    onNotValidated: () => h.empty,
    onValidating: () => h.span(slots.checkingMark.attrs(), ['◐']),
    onValid: () => h.span(slots.validMark.attrs(), ['✓']),
    onInvalid: () => h.empty,
  })

/**
 * A labelled text input, marked `◐` while it is checked and `✓` once valid,
 * with its first error (or the check) under it. Drawn through
 * `FieldPart.slots` and the Input recipe, from whichever view places it.
 */
export const input = <Message>(
  config: Readonly<{
    id: string
    label: string
    field: FieldState
    onInput: (value: string) => Message
    type?: string
    placeholder?: string
  }>,
  h: HtmlBuilder<Message>,
): Html => {
  const slots = SlotView.buildersFor(FieldPart.slots, [FieldPart.style.mixin], {
    input: config.field,
    h,
  })
  return Input.field(
    {
      id: config.id,
      label: config.label,
      field: config.field,
      changed: config.onInput,
      ...(config.type !== undefined && { type: config.type }),
      ...(config.placeholder !== undefined && { placeholder: config.placeholder }),
      style: InputStyle,
      draw: (parts, h) =>
        h.keyed('div')(config.id, slots.field.attrs(), [
          h.div(slots.header.attrs(), [parts.label, statusMark(config.field, slots, h)]),
          parts.control,
          parts.description,
        ]),
    },
    h,
  )
}

export const checkbox = <Message>(
  config: Readonly<{
    id: string
    label: string
    isChecked: boolean
    onToggle: (isChecked: boolean) => Message
  }>,
  h: HtmlBuilder<Message>,
): Html => {
  const slots = SlotView.buildersFor(FieldPart.slots, [FieldPart.style.mixin], {
    input: undefined,
    h,
  })
  return UiCheckbox.view(
    {
      id: config.id,
      isChecked: config.isChecked,
      onToggle: config.onToggle,
      // The recipe draws the check mark, so the control is empty.
      toView: Checkbox.toView([CheckboxStyle.mixin], { h }, ({ checkbox, label }) =>
        h.div(slots.checkboxRow.attrs(), [h.div(checkbox, []), h.label(label, [config.label])]),
      ),
    },
    h,
  )
}

export const textarea = <Message>(
  config: Readonly<{
    id: string
    label: string
    value: string
    onInput: (value: string) => Message
    rows?: number
    placeholder?: string
  }>,
  h: HtmlBuilder<Message>,
): Html => {
  const slots = SlotView.buildersFor(FieldPart.slots, [FieldPart.style.mixin], {
    input: undefined,
    h,
  })
  return UiTextarea.view(
    {
      id: config.id,
      value: config.value,
      onInput: config.onInput,
      rows: config.rows ?? 4,
      ...(config.placeholder !== undefined && { placeholder: config.placeholder }),
      toView: Textarea.toView([TextareaStyle.mixin], { h }, ({ label, textarea }) =>
        h.div(slots.field.attrs(), [h.label(label, [config.label]), h.textarea(textarea)]),
      ),
    },
    h,
  )
}
