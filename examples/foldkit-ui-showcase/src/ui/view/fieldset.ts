import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import {
  Checkbox as UiCheckbox,
  Fieldset as UiFieldset,
  Input as UiInput,
  Textarea as UiTextarea,
} from '@foldkit/ui'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Checkbox, Fieldset, Input } from 'foldkit-mixins-ui'

import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { FieldCheckboxStyle, FieldInputStyle } from '../style/field.js'
import { DemoFieldsetStyle, FieldsetPageSlots, FieldsetPageStyle } from '../style/fieldset.js'
import { resolveTextarea } from '../textareaField.js'

const FIELDSET_CHECKBOX_DEMO_ID = 'fieldset-checkbox-demo'
const FIELDSET_DISABLED_CHECKBOX_ID = 'fieldset-disabled-checkbox'

type Slots = SlotBuilders<typeof FieldsetPageSlots, UiMessage>

// FIELDS

const resolveInput = (attributes: UiInput.InputAttributes<UiMessage>, h: HtmlBuilder<UiMessage>) =>
  Input.resolve(attributes, [FieldInputStyle.mixin], { input: undefined, h })

const resolveCheckbox = (
  attributes: UiCheckbox.CheckboxAttributes<UiMessage>,
  h: HtmlBuilder<UiMessage>,
) => Checkbox.resolve(attributes, [FieldCheckboxStyle.mixin], { input: undefined, h })

const nameInput = (value: string, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  UiInput.view(
    {
      id: 'fieldset-name-input',
      value,
      hasDescription: true,
      onInput: inputValue => UiMessage.UpdatedFieldsetInputValue({ value: inputValue }),
      placeholder: 'Enter your full name',
      toView: attributes => {
        const field = resolveInput(attributes, h)

        return h.div(slots.field.attrs(), [
          h.label(field.label, ['Name']),
          h.input(field.input),
          h.span(field.description, ['As it appears on your government-issued ID.']),
        ])
      },
    },
    h,
  )

const bioTextarea = (value: string, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  UiTextarea.view(
    {
      id: 'fieldset-bio-textarea',
      value,
      hasDescription: true,
      onInput: textareaValue => UiMessage.UpdatedFieldsetTextareaValue({ value: textareaValue }),
      placeholder: 'Tell us about yourself...',
      rows: 3,
      toView: attributes => {
        const field = resolveTextarea(attributes, h)

        return h.div(slots.field.attrs(), [
          h.label(field.label, ['Bio']),
          h.textarea(field.textarea),
          h.span(field.description, ['A brief introduction about yourself.']),
        ])
      },
    },
    h,
  )

/** The control is empty: the Checkbox recipe draws the check. */
const termsCheckbox = (isChecked: boolean, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  UiCheckbox.view(
    {
      id: FIELDSET_CHECKBOX_DEMO_ID,
      isChecked,
      hasDescription: true,
      onToggle: nextIsChecked =>
        UiMessage.ToggledFieldsetCheckboxDemo({ isChecked: nextIsChecked }),
      toView: attributes => {
        const checkbox = resolveCheckbox(attributes, h)

        return h.div(slots.checkField.attrs(), [
          h.div(slots.checkRow.attrs(), [
            h.button(checkbox.checkbox, []),
            h.label(checkbox.label, ['I agree to the terms and conditions']),
          ]),
          h.p(checkbox.description, ['You agree to our Terms of Service and Privacy Policy.']),
        ])
      },
    },
    h,
  )

// DISABLED FIELDS

const disabledNameInput = (slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  UiInput.view(
    {
      id: 'fieldset-disabled-name-input',
      isDisabled: true,
      value: 'Ada Lovelace',
      toView: attributes => {
        const field = resolveInput(attributes, h)

        return h.div(slots.field.attrs(), [h.label(field.label, ['Name']), h.input(field.input)])
      },
    },
    h,
  )

const disabledBioTextarea = (slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  UiTextarea.view(
    {
      id: 'fieldset-disabled-bio-textarea',
      isDisabled: true,
      value: "Mathematician and writer, known for work on Charles Babbage's Analytical Engine.",
      rows: 3,
      toView: attributes => {
        const field = resolveTextarea(attributes, h)

        return h.div(slots.field.attrs(), [
          h.label(field.label, ['Bio']),
          h.textarea(field.textarea),
        ])
      },
    },
    h,
  )

const disabledTermsCheckbox = (slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  UiCheckbox.view(
    {
      id: FIELDSET_DISABLED_CHECKBOX_ID,
      isChecked: true,
      isDisabled: true,
      onToggle: isChecked => UiMessage.ToggledFieldsetCheckboxDemo({ isChecked }),
      toView: attributes => {
        const checkbox = resolveCheckbox(attributes, h)

        return h.div(slots.checkRow.attrs(), [
          h.button(checkbox.checkbox, []),
          h.label(checkbox.label, ['I agree to the terms and conditions']),
        ])
      },
    },
    h,
  )

// DEMOS

type FieldsetDemo = Readonly<{
  id: string
  isDisabled: boolean
  description: string
  fields: ReadonlyArray<Html>
}>

const fieldsetDemo = (demo: FieldsetDemo, slots: Slots, h: HtmlBuilder<UiMessage>): Html =>
  UiFieldset.view(
    {
      id: demo.id,
      isDisabled: demo.isDisabled,
      hasDescription: true,
      toView: attributes => {
        const fieldset = Fieldset.resolve(attributes, [DemoFieldsetStyle.mixin], {
          input: undefined,
          h,
        })

        return h.fieldset(fieldset.fieldset, [
          h.legend(fieldset.legend, ['Personal Information']),
          h.span(fieldset.description, [demo.description]),
          h.div(slots.fields.attrs(), demo.fields),
        ])
      },
    },
    h,
  )

// VIEW

const FieldsetPage = SlotView.forMessages<UiMessage>()
  .define(FieldsetPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Fieldset']),

      h.h3(slots.section.attrs(), ['Basic']),
      fieldsetDemo(
        {
          id: 'fieldset-basic-demo',
          isDisabled: false,
          description: 'We just need a few details.',
          fields: [
            nameInput(model.fieldsetInputValue, slots, h),
            bioTextarea(model.fieldsetTextareaValue, slots, h),
            termsCheckbox(model.isFieldsetCheckboxDemoChecked, slots, h),
          ],
        },
        slots,
        h,
      ),

      h.h3(slots.section.attrs(), ['Disabled']),
      fieldsetDemo(
        {
          id: 'fieldset-disabled-demo',
          isDisabled: true,
          description: 'This fieldset is disabled.',
          fields: [
            disabledNameInput(slots, h),
            disabledBioTextarea(slots, h),
            disabledTermsCheckbox(slots, h),
          ],
        },
        slots,
        h,
      ),
    ]),
  )
  .pipe(Style.attach(FieldsetPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(FieldsetPage)
