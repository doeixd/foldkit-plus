import { Input as FormInput } from 'foldkit-form'
import { SlotView, type NamedStyle } from 'foldkit-mixins'
import {
  Input,
  Textarea,
  type FieldParts,
  type InputSlots,
  type TextareaSlots,
} from 'foldkit-mixins-ui'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { FieldSlots, type FieldOverride, type FieldOverrideInput } from './index.js'

/** UI field parts for an application-owned layout, with the form's validation state. */
export interface UiFieldParts extends FieldParts {
  readonly field: FieldOverrideInput['field']
}

export interface UiFieldOptions<FormMessage, Message> {
  readonly toMessage: (message: FormMessage) => Message
  readonly inputStyle: NamedStyle<typeof InputSlots>
  readonly textareaStyle?: NamedStyle<typeof TextareaSlots>
  readonly draw?: (parts: UiFieldParts, h: HtmlBuilder<Message>) => Html
}

/** A FormView.fields override for Text/Multiline keys drawn through the UI adapters. */
export const field =
  <FormMessage, Message>(
    options: UiFieldOptions<FormMessage, Message>,
  ): FieldOverride<string, FormMessage, Message> =>
  (input, h) => {
    const checking = input.field._tag === 'Validating'
    const description = [
      ...(input.control.description === undefined ? [] : [input.control.description]),
      ...(checking ? ['Checking…'] : []),
      ...input.errors,
    ]
    const extra = [
      h.Name(input.control.key),
      h.OnBlur(options.toMessage(input.blurred)),
      ...(input.control.required ? [h.AriaRequired(true)] : []),
      ...(checking ? [h.AriaBusy(true)] : []),
    ]
    const finish = (parts: FieldParts): Html => {
      const value: UiFieldParts = { ...parts, field: input.field }
      return options.draw === undefined
        ? h.div(
            SlotView.buildersFor(FieldSlots, [], { input, h }).root.attrs([
              h.DataAttribute('validation', input.field._tag),
            ]),
            [parts.label, parts.control, parts.description],
          )
        : options.draw(value, h)
    }
    const described = (attributes: Parameters<typeof h.span>[0]): Html =>
      description.length === 0
        ? h.empty
        : h.span(
            [
              ...attributes,
              ...(checking ? [h.Role('status')] : []),
              ...(input.invalid ? [h.Role('alert')] : []),
            ],
            [description.join(' ')],
          )
    const common = {
      id: input.id,
      value: String(input.field.value),
      onInput: (value: string) => options.toMessage(input.changed(value)),
      invalid: input.invalid,
      described: description.length > 0,
      placeholder: input.attrs.placeholder,
      input: input.field,
    }
    if (FormInput.Text.is(input.control.control))
      return Input.view(
        {
          ...common,
          type: input.attrs.type ?? 'text',
          style: options.inputStyle,
          draw: resolved =>
            finish({
              label: h.label(resolved.label, [input.control.label]),
              control: h.input([...resolved.input, ...extra]),
              description: described(resolved.description),
            }),
        },
        h,
      )
    if (FormInput.Multiline.is(input.control.control))
      return Textarea.view(
        {
          ...common,
          rows: input.attrs.rows,
          style: options.textareaStyle,
          draw: resolved =>
            finish({
              label: h.label(resolved.label, [input.control.label]),
              control: h.textarea([...resolved.textarea, ...extra]),
              description: described(resolved.description),
            }),
        },
        h,
      )
    throw new Error(
      `UI form field does not draw "${input.control.control.kind}" ("${input.control.key}")`,
    )
  }
