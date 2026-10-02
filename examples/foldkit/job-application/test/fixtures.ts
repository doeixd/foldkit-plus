import { Menu, Tabs } from '@foldkit/ui'
import { Array, Effect, Option } from 'effect'
import { Calendar } from 'foldkit'
import { type Field, Valid } from 'foldkit/fieldValidation'
import { modifyFields } from 'foldkit/struct'

import { type Model, Submission } from '../src/model.js'
import {
  Attachments,
  CoverLetter,
  Education,
  PersonalInfo,
  Skills,
  WorkHistory,
} from '../src/step/index.js'

export const today = Calendar.make(2026, 4, 16)

export const initialModel: Model = {
  currentStep: 'PersonalInfo',
  personalInfo: PersonalInfo.init(today),
  workHistory: WorkHistory.init(today, 'work-history-entry-1'),
  education: Education.init(today, 'education-entry-1'),
  skills: Skills.init('skills-entry-1'),
  coverLetter: CoverLetter.init(),
  attachments: Attachments.init(),
  isPreviewVisible: false,
  submission: Submission.NotSubmitted(),
  stepMenu: Menu.init({ id: 'step-menu' }),
  stepTabs: Tabs.init({ id: 'step-tabs' }),
  isSubmitAttempted: false,
}

/** A form with some of its keys already in the given states. */
export const withFields =
  <Key extends string>(fields: Readonly<Record<Key, Field<string>>>) =>
  <Form extends { readonly fields: Readonly<Record<Key, Field<string>>> }>(form: Form): Form => ({
    ...form,
    fields: { ...form.fields, ...fields },
  })

const valid = (value: string): Field<string> => Valid({ value })

export const completeModel: Model = modifyFields(initialModel, {
  personalInfo: personalInfo =>
    modifyFields(personalInfo, {
      form: withFields({
        firstName: valid('Jane'),
        lastName: valid('Doe'),
        email: valid('jane@example.com'),
      }),
    }),
  workHistory: workHistory =>
    modifyFields(workHistory, {
      entries: Array.map(entry =>
        modifyFields(entry, {
          form: withFields({ company: valid('Foldkit'), title: valid('Engineer') }),
        }),
      ),
    }),
  education: education =>
    modifyFields(education, {
      entries: Array.map(entry =>
        modifyFields(entry, {
          form: withFields({
            school: valid('MIT'),
            degree: valid('BS'),
            fieldOfStudy: valid('CS'),
          }),
        }),
      ),
    }),
  skills: skills =>
    modifyFields(skills, {
      entries: Array.map(entry =>
        modifyFields(entry, { form: withFields({ name: valid('TypeScript') }) }),
      ),
    }),
})

/** Typing into one of the applicant's fields: the form's own edit, wrapped for the step. */
export const typedPersonalInfo = (
  key: keyof PersonalInfo.Applicant,
  value: string,
): PersonalInfo.Message =>
  PersonalInfo.Message.GotFormMessage({
    message: PersonalInfo.PersonalInfoForm.Message.Changed({ key, value }),
  })

type PersonalInfoFormMessage = typeof PersonalInfo.PersonalInfoForm.Message.Type

/**
 * The form's email check, matched by name and args as Story and Scene match a
 * Command instance: `foldkit-form` builds the Command itself (`<form>.check`)
 * and exports no Definition to match it by. The effect is never run.
 */
export const ValidateEmail: {
  readonly name: string
  readonly args: { readonly key: 'email' }
  readonly effect: Effect.Effect<PersonalInfoFormMessage>
} = { name: 'PersonalInfo.check', args: { key: 'email' }, effect: Effect.never }

/**
 * The check's answer for `email`: in use, or free. Story and Scene wrap it for
 * the step, and the step's for the application, as the runtime would.
 */
export const checkedEmail = (
  email: string,
  error: Option.Option<string>,
): PersonalInfoFormMessage =>
  PersonalInfo.PersonalInfoForm.Message.Checked({
    key: 'email',
    draft: email,
    error: Option.getOrNull(error),
  })
