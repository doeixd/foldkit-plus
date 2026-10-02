/**
 * Upstream's stories, with the fields and the email check now the form's: a
 * field changes by the form's `Changed`, and the check is answered by the
 * form's `Checked`, which Story wraps for the step as the runtime would.
 */
import { Listbox } from '@foldkit/ui'
import { Option } from 'effect'
import { FieldValidation } from 'foldkit'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { Message, init, update } from '../../../src/step/personalInfo/personalInfo.js'
import {
  ValidateEmail,
  checkedEmail,
  today,
  typedPersonalInfo,
  withFields,
} from '../../fixtures.js'

const givenInitial = given(init(today))

describe('personalInfo', () => {
  test('a valid first name is stored as Valid', () => {
    story(
      update,
      givenInitial,
      message(typedPersonalInfo('firstName', 'Jane')),
      model(model => {
        expect(model.form.fields.firstName.value).toBe('Jane')
        expect(model.form.fields.firstName._tag).toBe('Valid')
      }),
    )
  })

  test('a short first name is Invalid', () => {
    story(
      update,
      givenInitial,
      message(typedPersonalInfo('firstName', 'J')),
      model(model => {
        expect(model.form.fields.firstName._tag).toBe('Invalid')
      }),
    )
  })

  test('a well-formed email starts async uniqueness validation', () => {
    story(
      update,
      givenInitial,
      message(typedPersonalInfo('email', 'jane@example.com')),
      Command.expectHas(ValidateEmail),
      Command.resolve(ValidateEmail, checkedEmail('jane@example.com', Option.none())),
      model(model => {
        expect(model.form.fields.email._tag).toBe('Valid')
      }),
    )
  })

  test('a malformed email fails sync validation without an async command', () => {
    story(
      update,
      givenInitial,
      message(typedPersonalInfo('email', 'not-email')),
      Command.expectNone(),
      model(model => {
        expect(model.form.fields.email._tag).toBe('Invalid')
      }),
    )
  })

  test('a stale email async result is discarded', () => {
    const validating = modifyFields(init(today), {
      form: withFields({
        email: FieldValidation.Validating({ value: 'jane@example.com' }),
      }),
    })

    story(
      update,
      given(validating),
      message(Message.GotFormMessage({ message: checkedEmail('old@example.com', Option.none()) })),
      model(model => {
        expect(model).toBe(validating)
        expect(model.form.fields.email).toEqual(
          FieldValidation.Validating({ value: 'jane@example.com' }),
        )
      }),
    )
  })

  test.each([
    ['admin@foldkit.dev', Option.some('This email is already in use')],
    ['jane@example.com', Option.none()],
  ])('the check answers %s in the form’s words', (email, error) => {
    story(
      update,
      givenInitial,
      message(typedPersonalInfo('email', email)),
      Command.resolve(ValidateEmail, checkedEmail(email, error)),
      model(model => {
        expect(model.form.fields.email).toEqual(
          Option.match(error, {
            onNone: () => FieldValidation.Valid({ value: email }),
            onSome: error => FieldValidation.Invalid({ value: email, errors: [error] }),
          }),
        )
      }),
    )
  })

  test.each([
    ['firstName', '', 'First name is required'],
    ['lastName', '', 'Last name is required'],
    ['email', '', 'Email is required'],
    ['phone', '12', 'Please enter a valid phone number'],
    ['portfolioUrl', 'not a url', 'Please enter a valid URL'],
  ] as const)('%s typed as %j says %j', (key, value, error) => {
    story(
      update,
      given(init(today)),
      message(typedPersonalInfo(key, 'x')),
      message(typedPersonalInfo(key, value)),
      model(model => {
        expect(model.form.fields[key]).toEqual(FieldValidation.Invalid({ value, errors: [error] }))
      }),
    )
  })

  test.each([
    ['phone', '+1 (555) 123-4567'],
    ['portfolioUrl', 'foldkit.dev'],
    ['portfolioUrl', 'https://foldkit.dev'],
  ] as const)('%s accepts %j', (key, value) => {
    story(
      update,
      givenInitial,
      message(typedPersonalInfo(key, value)),
      model(model => {
        expect(model.form.fields[key]).toEqual(FieldValidation.Valid({ value }))
      }),
    )
  })

  test.each(['phone', 'portfolioUrl'] as const)('an emptied %s is optional again', key => {
    story(
      update,
      givenInitial,
      message(typedPersonalInfo(key, 'x')),
      message(typedPersonalInfo(key, '')),
      model(model => {
        expect(model.form.fields[key]).toEqual(FieldValidation.NotValidated({ value: '' }))
      }),
    )
  })

  test('choosing a pronoun from the listbox stores it', () => {
    story(
      update,
      givenInitial,
      message(
        Message.GotPronounsMessage({ message: Listbox.Message.SelectedItem({ item: 'Other' }) }),
      ),
      model(model => {
        expect(model.maybeSelectedPronoun).toEqual(Option.some('Other'))
      }),
    )
  })
})
