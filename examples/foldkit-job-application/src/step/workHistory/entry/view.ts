import { Submodel } from 'foldkit'
import { SlotView, Style } from 'foldkit-mixins'

import { RemoveButtonStyle, StepSlots, StepStyle } from '../../../style.js'
import { Button, DatePicker, Field } from '../../../view/index.js'
import { Message, type Model, type Position, PositionForm } from './entry.js'

const controls = Field.controlsOf(PositionForm.controls)

const changed =
  (key: keyof Position) =>
  (value: string): Message =>
    Message.GotFormMessage({ message: PositionForm.Message.Changed({ key, value }) })

export const EntryView = SlotView.forMessages<Message>()
  .define(StepSlots, (model: Model, slots, h) => {
    const showEndDate = !model.isCurrentlyEmployed

    const startDatePicker = DatePicker.view(
      {
        label: 'Start Date',
        placeholder: 'Select start date',
        model: model.startDate,
        maybeSelectedDate: model.maybeStartDate,
        toParentMessage: message => Message.GotStartDateMessage({ message }),
      },
      h,
    )

    const endDatePicker = DatePicker.view(
      {
        label: 'End Date',
        placeholder: 'Select end date',
        model: model.endDate,
        maybeSelectedDate: model.maybeEndDate,
        toParentMessage: message => Message.GotEndDateMessage({ message }),
      },
      h,
    )

    return h.keyed('div')(model.id, slots.entry.attrs(), [
      h.div(slots.pair.attrs(), [
        Field.input(
          {
            id: `${model.id}-company`,
            label: controls.company.label,
            field: model.form.fields.company,
            onInput: changed('company'),
            placeholder: 'e.g. Acme Corp',
          },
          h,
        ),
        Field.input(
          {
            id: `${model.id}-title`,
            label: controls.title.label,
            field: model.form.fields.title,
            onInput: changed('title'),
            placeholder: 'e.g. Senior Engineer',
          },
          h,
        ),
      ]),
      h.div(slots.pair.attrs(), [startDatePicker, ...(showEndDate ? [endDatePicker] : [])]),
      Field.checkbox(
        {
          id: `${model.id}-current`,
          label: 'I currently work here',
          isChecked: model.isCurrentlyEmployed,
          onToggle: isChecked => Message.ToggledCurrentlyEmployed({ isChecked }),
        },
        h,
      ),
      Field.textarea(
        {
          id: `${model.id}-description`,
          label: 'Description',
          value: model.description,
          onInput: value => Message.UpdatedDescription({ value }),
          rows: 3,
          placeholder: 'Describe your role and key accomplishments...',
        },
        h,
      ),
      h.div(slots.entryActions.attrs(), [
        Button.view(
          {
            label: 'Remove position',
            style: RemoveButtonStyle,
            onClick: Message.ClickedRemoveSelf(),
          },
          h,
        ),
      ]),
    ])
  })
  .pipe(Style.attach(StepStyle))

export const view = Submodel.defineView<Model, Message>(EntryView)
