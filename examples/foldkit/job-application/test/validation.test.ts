/**
 * What a step's form says about the step: whether any key shows an error, which
 * marks the step's tab before any submit, as upstream's `hasErrors` does.
 */
import { FieldValidation } from 'foldkit'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { Education, PersonalInfo, Skills, WorkHistory } from '../src/step/index.js'
import { initialModel, withFields } from './fixtures.js'

const invalid = FieldValidation.Invalid({ value: 'J', errors: ['Too short'] })
const checking = FieldValidation.Validating({ value: 'jane@example.com' })

const withEntryFields =
  (fields: Readonly<Record<string, FieldValidation.Field<string>>>) =>
  <
    Step extends {
      readonly entries: ReadonlyArray<{ readonly form: { readonly fields: object } }>
    },
  >(
    step: Step,
  ): Step => ({
    ...step,
    entries: step.entries.map(entry => ({
      ...entry,
      form: { ...entry.form, fields: { ...entry.form.fields, ...fields } },
    })),
  })

describe('hasErrors', () => {
  test.each([
    ['personal info', () => PersonalInfo.hasErrors(initialModel.personalInfo), false],
    [
      'personal info with an invalid first name',
      () =>
        PersonalInfo.hasErrors(
          modifyFields(initialModel.personalInfo, { form: withFields({ firstName: invalid }) }),
        ),
      true,
    ],
    [
      'personal info with an email being checked',
      () =>
        PersonalInfo.hasErrors(
          modifyFields(initialModel.personalInfo, { form: withFields({ email: checking }) }),
        ),
      false,
    ],
    ['work history', () => WorkHistory.hasErrors(initialModel.workHistory), false],
    [
      'work history with an invalid title',
      () => WorkHistory.hasErrors(withEntryFields({ title: invalid })(initialModel.workHistory)),
      true,
    ],
    [
      'education with an invalid degree',
      () => Education.hasErrors(withEntryFields({ degree: invalid })(initialModel.education)),
      true,
    ],
    [
      'skills with an invalid name',
      () => Skills.hasErrors(withEntryFields({ name: invalid })(initialModel.skills)),
      true,
    ],
  ])('%s', (_, hasErrors, expected) => {
    expect(hasErrors()).toBe(expected)
  })
})
