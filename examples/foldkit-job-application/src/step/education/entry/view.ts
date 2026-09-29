import { Array } from 'effect'
import { Submodel } from 'foldkit'
import { type CalendarDate } from 'foldkit/calendar'
import { SlotView, Style } from 'foldkit-mixins'
import { Button } from 'foldkit-mixins-ui'

import { RemoveButtonStyle, StepPart } from '../../../style.js'
import { Choice, Field } from '../../../view/index.js'
import { type Degree, DegreeForm, GraduationYearListbox, Message, type Model } from './entry.js'

const GRADUATION_YEAR_WINDOW_SIZE = 30
const GRADUATION_YEAR_FORWARD_OFFSET = 6

const graduationYears = (today: CalendarDate): ReadonlyArray<string> =>
  Array.makeBy(GRADUATION_YEAR_WINDOW_SIZE, index =>
    String(today.year + GRADUATION_YEAR_FORWARD_OFFSET - index),
  )

const controls = Field.controlsOf(DegreeForm.controls)

const changed =
  (key: keyof Degree) =>
  (value: string): Message =>
    Message.GotFormMessage({ message: DegreeForm.Message.Changed({ key, value }) })

export type ViewInputs = Readonly<{
  today: CalendarDate
}>

export const EntryView = SlotView.forMessages<Message>()
  .define(StepPart.slots, ({ model, today }: ViewInputs & { readonly model: Model }, slots, h) => {
    const showGraduationYear = !model.isCurrentlyEnrolled

    const graduationYearField = Choice.view(
      {
        label: 'Graduation Year',
        placeholder: 'Select year',
        model: model.graduationYearListbox,
        listbox: GraduationYearListbox,
        items: graduationYears(today),
        maybeSelectedValue: model.maybeGraduationYear,
        toParentMessage: message => Message.GotGraduationYearListboxMessage({ message }),
      },
      h,
    )

    return h.keyed('div')(model.id, slots.entry.attrs(), [
      h.div(slots.pair.attrs(), [
        Field.input(
          {
            id: `${model.id}-school`,
            label: controls.school.label,
            field: model.form.fields.school,
            onInput: changed('school'),
            placeholder: 'e.g. MIT',
          },
          h,
        ),
        Field.input(
          {
            id: `${model.id}-degree`,
            label: controls.degree.label,
            field: model.form.fields.degree,
            onInput: changed('degree'),
            placeholder: "e.g. Bachelor's, Master's",
          },
          h,
        ),
      ]),
      Field.input(
        {
          id: `${model.id}-field`,
          label: controls.fieldOfStudy.label,
          field: model.form.fields.fieldOfStudy,
          onInput: changed('fieldOfStudy'),
          placeholder: 'e.g. Computer Science',
        },
        h,
      ),
      Field.checkbox(
        {
          id: `${model.id}-enrolled`,
          label: 'I’m currently enrolled',
          isChecked: model.isCurrentlyEnrolled,
          onToggle: isChecked => Message.ToggledCurrentlyEnrolled({ isChecked }),
        },
        h,
      ),
      ...(showGraduationYear ? [graduationYearField] : []),
      h.div(slots.entryActions.attrs(), [
        Button.view(
          {
            label: 'Remove education',
            style: RemoveButtonStyle,
            onClick: Message.ClickedRemoveSelf(),
          },
          h,
        ),
      ]),
    ])
  })
  .pipe(Style.attach(StepPart.style))

export const view = Submodel.defineView<Model, Message, ViewInputs>((model, viewInputs, h) =>
  EntryView({ model, ...viewInputs }, h),
)
