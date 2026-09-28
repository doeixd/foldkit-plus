import { Equal, Option } from 'effect'
import { FieldValidation, Submodel } from 'foldkit'
import { SlotView, Style } from 'foldkit-mixins'

import { PronounOption } from '../../domain/index.js'
import { StepPart } from '../../style.js'
import { Choice, DatePicker, Field } from '../../view/index.js'
import {
  type Applicant,
  Message,
  type Model,
  PersonalInfoForm,
  PronounsListbox,
} from './personalInfo.js'

const controls = Field.controlsOf(PersonalInfoForm.controls)

const changed =
  (key: keyof Applicant) =>
  (value: string): Message =>
    Message.GotFormMessage({ message: PersonalInfoForm.Message.Changed({ key, value }) })

export const PersonalInfoView = SlotView.forMessages<Message>()
  .define(StepPart.slots, (model: Model, slots, h) => {
    const { fields } = model.form

    const isOtherSelected = Option.exists(model.maybeSelectedPronoun, Equal.equals('Other'))

    return h.div(slots.step.attrs(), [
      h.div(slots.pair.attrs(), [
        Field.input(
          {
            id: 'first-name',
            label: controls.firstName.label,
            field: fields.firstName,
            onInput: changed('firstName'),
            placeholder: 'Jane',
          },
          h,
        ),
        Field.input(
          {
            id: 'last-name',
            label: controls.lastName.label,
            field: fields.lastName,
            onInput: changed('lastName'),
            placeholder: 'Doe',
          },
          h,
        ),
      ]),
      Field.input(
        {
          id: 'email',
          label: controls.email.label,
          field: fields.email,
          onInput: changed('email'),
          type: 'email',
          placeholder: 'jane@example.com',
        },
        h,
      ),
      Field.input(
        {
          id: 'phone',
          label: controls.phone.label,
          field: fields.phone,
          onInput: changed('phone'),
          type: 'tel',
          placeholder: '+1 (555) 123-4567',
        },
        h,
      ),
      Choice.view(
        {
          label: 'Pronouns (optional)',
          placeholder: 'Select pronouns',
          model: model.pronouns,
          listbox: PronounsListbox,
          items: PronounOption.all,
          maybeSelectedValue: model.maybeSelectedPronoun,
          toParentMessage: message => Message.GotPronounsMessage({ message }),
        },
        h,
      ),
      ...(isOtherSelected
        ? [
            Field.input(
              {
                id: 'custom-pronouns',
                label: 'Custom Pronouns',
                // Nothing validates custom pronouns; upstream marks them valid.
                field: FieldValidation.Valid({ value: model.customPronouns }),
                onInput: value => Message.UpdatedCustomPronouns({ value }),
                placeholder: 'Enter your pronouns',
              },
              h,
            ),
          ]
        : []),
      Field.input(
        {
          id: 'portfolio-url',
          label: controls.portfolioUrl.label,
          field: fields.portfolioUrl,
          onInput: changed('portfolioUrl'),
          type: 'url',
        },
        h,
      ),
      DatePicker.view(
        {
          label: 'Available Start Date (optional)',
          placeholder: 'Pick a date',
          model: model.availableDate,
          maybeSelectedDate: model.maybeAvailableDate,
          toParentMessage: message => Message.GotAvailableDateMessage({ message }),
        },
        h,
      ),
    ])
  })
  .pipe(Style.attach(StepPart.style))

export const view = Submodel.defineView<Model, Message>(PersonalInfoView)
