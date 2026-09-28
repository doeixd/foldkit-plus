import * as UiCheckbox from '@foldkit/ui/checkbox'
import * as UiInput from '@foldkit/ui/input'
import * as UiTextarea from '@foldkit/ui/textarea'
import { Array, Option } from 'effect'
import { FieldValidation } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { FormControl } from 'foldkit-form'
import { SlotView, type SlotAttributes, type SlotBuilders } from 'foldkit-mixins'
import { Checkbox, Input, Textarea } from 'foldkit-mixins-ui'

import { CheckboxStyle, FieldSlots, FieldStyle, InputStyle, TextareaStyle } from '../style.js'

type FieldState = FieldValidation.Field<string>

type Slots<Message> = SlotBuilders<typeof FieldSlots, Message>

/**
 * A form's controls by key, read once, so a view that lays its fields out by
 * hand still takes each label from the form.
 */
export const controlsOf = <Key extends string>(
  controls: ReadonlyArray<FormControl<Key>>,
): { readonly [K in Key]: FormControl<K> } =>
  // `Object.fromEntries` forgets the keys, which are exactly `Key`.
  Object.fromEntries(Array.map(controls, control => [control.key, control])) as {
    readonly [K in Key]: FormControl<K>
  }

/** The field's first error, shown under it and read as its description. */
const errorOf = (field: FieldState): Option.Option<string> =>
  FieldValidation.match(field, {
    onNotValidated: () => Option.none(),
    onValidating: () => Option.none(),
    onValid: () => Option.none(),
    onInvalid: ({ errors }) => Array.head(errors),
  })

const statusMark = <Message>(field: FieldState, slots: Slots<Message>, h: HtmlBuilder<Message>) =>
  FieldValidation.match(field, {
    onNotValidated: () => h.empty,
    onValidating: () => h.span(slots.checkingMark.attrs(), ['◐']),
    onValid: () => h.span(slots.validMark.attrs(), ['✓']),
    onInvalid: () => h.empty,
  })

const errorView = <Message>(
  field: FieldState,
  attributes: SlotAttributes<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(errorOf(field), {
    onNone: () => h.empty,
    onSome: error => h.span(attributes, [error]),
  })

/**
 * A labelled text input, marked `◐` while it is checked and `✓` once valid,
 * with its first error under it. Drawn through `FieldSlots` and the Input
 * recipe, from whichever view places it.
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
): Html =>
  UiInput.view(
    {
      id: config.id,
      value: config.field.value,
      onInput: config.onInput,
      isInvalid: FieldValidation.isInvalid(config.field),
      hasDescription: Option.isSome(errorOf(config.field)),
      ...(config.type !== undefined && { type: config.type }),
      ...(config.placeholder !== undefined && { placeholder: config.placeholder }),
      toView: attributes => {
        const context = { input: config.field, h }
        const resolved = Input.resolve<FieldState, Message>(attributes, [InputStyle.mixin], context)
        const slots = SlotView.buildersFor(FieldSlots, [FieldStyle.mixin], context)
        return h.keyed('div')(config.id, slots.field.attrs(), [
          h.div(slots.header.attrs(), [
            h.label(resolved.label, [config.label]),
            statusMark(config.field, slots, h),
          ]),
          h.input(resolved.input),
          errorView(config.field, resolved.description, h),
        ])
      },
    },
    h,
  )

export const checkbox = <Message>(
  config: Readonly<{
    id: string
    label: string
    isChecked: boolean
    onToggle: (isChecked: boolean) => Message
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  UiCheckbox.view(
    {
      id: config.id,
      isChecked: config.isChecked,
      onToggle: config.onToggle,
      toView: attributes => {
        const context = { input: undefined, h }
        const resolved = Checkbox.resolve<undefined, Message>(
          attributes,
          [CheckboxStyle.mixin],
          context,
        )
        const slots = SlotView.buildersFor(FieldSlots, [FieldStyle.mixin], context)
        // The recipe draws the check mark, so the control is empty.
        return h.div(slots.checkboxRow.attrs(), [
          h.div(resolved.checkbox, []),
          h.label(resolved.label, [config.label]),
        ])
      },
    },
    h,
  )

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
): Html =>
  UiTextarea.view(
    {
      id: config.id,
      value: config.value,
      onInput: config.onInput,
      rows: config.rows ?? 4,
      ...(config.placeholder !== undefined && { placeholder: config.placeholder }),
      toView: attributes => {
        const context = { input: undefined, h }
        const resolved = Textarea.resolve<undefined, Message>(
          attributes,
          [TextareaStyle.mixin],
          context,
        )
        const slots = SlotView.buildersFor(FieldSlots, [FieldStyle.mixin], context)
        return h.div(slots.field.attrs(), [
          h.label(resolved.label, [config.label]),
          // A slot's attributes are typed for every element, and Foldkit's textarea
          // excludes `InnerHTML`; nothing here sets one.
          h.textarea(resolved.textarea as Parameters<typeof h.textarea>[0]),
        ])
      },
    },
    h,
  )
