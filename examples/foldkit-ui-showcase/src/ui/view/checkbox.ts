import { Submodel } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Checkbox as UiCheckbox } from '@foldkit/ui'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Checkbox } from 'foldkit-mixins-ui'

import { Message as UiMessage } from '../message.js'
import type { UiModel } from '../model.js'
import { CheckboxPageSlots, CheckboxPageStyle } from '../style/checkbox.js'
import { FieldCheckboxStyle } from '../style/field.js'

const CHECKBOX_BASIC_DEMO_ID = 'checkbox-basic-demo'
const CHECKBOX_ALL_DEMO_ID = 'checkbox-all-demo'
const CHECKBOX_OPTION_A_DEMO_ID = 'checkbox-option-a-demo'
const CHECKBOX_OPTION_B_DEMO_ID = 'checkbox-option-b-demo'

type Slots = SlotBuilders<typeof CheckboxPageSlots, UiMessage>

const resolve = (attributes: UiCheckbox.CheckboxAttributes<UiMessage>, h: HtmlBuilder<UiMessage>) =>
  Checkbox.resolve(attributes, [FieldCheckboxStyle.mixin], { input: undefined, h })

/**
 * The control is empty: the Checkbox recipe draws the check, or the dash
 * while `aria-checked="mixed"`, from the state `@foldkit/ui` writes.
 */
const checkboxRow = (
  checkbox: ReturnType<typeof resolve>,
  label: string,
  slots: Slots,
  h: HtmlBuilder<UiMessage>,
): Html =>
  h.div(slots.row.attrs(), [h.button(checkbox.checkbox, []), h.label(checkbox.label, [label])])

const indeterminateDemo = (model: UiModel, slots: Slots, h: HtmlBuilder<UiMessage>): Html => {
  const isAllChecked = model.isCheckboxOptionADemoChecked && model.isCheckboxOptionBDemoChecked
  const isNoneChecked = !model.isCheckboxOptionADemoChecked && !model.isCheckboxOptionBDemoChecked
  const isIndeterminate = !isAllChecked && !isNoneChecked

  return h.div(slots.group.attrs(), [
    UiCheckbox.view(
      {
        id: CHECKBOX_ALL_DEMO_ID,
        isChecked: isAllChecked,
        isIndeterminate,
        onToggle: isChecked => UiMessage.ToggledCheckboxAllDemo({ isChecked }),
        toView: attributes => checkboxRow(resolve(attributes, h), 'All notifications', slots, h),
      },
      h,
    ),
    h.div(slots.options.attrs(), [
      UiCheckbox.view(
        {
          id: CHECKBOX_OPTION_A_DEMO_ID,
          isChecked: model.isCheckboxOptionADemoChecked,
          onToggle: isChecked => UiMessage.ToggledCheckboxOptionADemo({ isChecked }),
          toView: attributes =>
            checkboxRow(resolve(attributes, h), 'Email notifications', slots, h),
        },
        h,
      ),
      UiCheckbox.view(
        {
          id: CHECKBOX_OPTION_B_DEMO_ID,
          isChecked: model.isCheckboxOptionBDemoChecked,
          onToggle: isChecked => UiMessage.ToggledCheckboxOptionBDemo({ isChecked }),
          toView: attributes => checkboxRow(resolve(attributes, h), 'Push notifications', slots, h),
        },
        h,
      ),
    ]),
  ])
}

const CheckboxPage = SlotView.forMessages<UiMessage>()
  .define(CheckboxPageSlots, (model: UiModel, slots, h) =>
    h.div(slots.page.attrs(), [
      h.h2(slots.title.attrs(), ['Checkbox']),

      h.h3(slots.section.attrs(), ['Basic']),
      UiCheckbox.view(
        {
          id: CHECKBOX_BASIC_DEMO_ID,
          isChecked: model.isCheckboxBasicDemoChecked,
          hasDescription: true,
          onToggle: isChecked => UiMessage.ToggledCheckboxBasicDemo({ isChecked }),
          toView: attributes => {
            const checkbox = resolve(attributes, h)

            return h.div(slots.field.attrs(), [
              checkboxRow(checkbox, 'Accept terms and conditions', slots, h),
              h.p(checkbox.description, ['You agree to our Terms of Service and Privacy Policy.']),
            ])
          },
        },
        h,
      ),

      h.h3(slots.section.attrs(), ['Indeterminate']),
      indeterminateDemo(model, slots, h),
    ]),
  )
  .pipe(Style.attach(CheckboxPageStyle))

export const view = Submodel.defineView<UiModel, UiMessage>(CheckboxPage)
