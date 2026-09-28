/**
 * Upstream's stories, with the edits and the email check now the form's: a
 * field changes by the form's `Changed`, and the check is answered by the
 * form's `Checked`, which Story wraps for the page as the runtime would.
 */
import { Option } from 'effect'
import { FieldValidation } from 'foldkit'
import { Command, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { Message, SubmitForm, initialModel, update } from '../src/main.js'
import { CheckEmail, checked, submitted, typed, validModel, withFields } from './fixtures.js'

describe('update', () => {
  describe('name field', () => {
    test('typing a long name produces a Valid field', () => {
      story(
        update,
        given(initialModel),
        message(typed('name', 'Alice')),
        model(model => {
          expect(model.form.fields.name).toEqual(FieldValidation.Valid({ value: 'Alice' }))
        }),
      )
    })

    test('typing a short name produces an Invalid field with the min-length error', () => {
      story(
        update,
        given(initialModel),
        message(typed('name', 'A')),
        model(model => {
          expect(model.form.fields.name).toEqual(
            FieldValidation.Invalid({
              value: 'A',
              errors: ['Name must be at least 2 characters'],
            }),
          )
        }),
      )
    })
  })

  describe('email field', () => {
    test('typing a well-formed email transitions to Validating and fires the check', () => {
      story(
        update,
        given(initialModel),
        message(typed('email', 'alice@example.com')),
        model(model => {
          expect(model.form.fields.email._tag).toBe('Validating')
        }),
        Command.expectExact(CheckEmail),
        Command.resolve(CheckEmail, checked('alice@example.com', Option.none())),
        model(model => {
          expect(model.form.fields.email).toEqual(
            FieldValidation.Valid({ value: 'alice@example.com' }),
          )
        }),
      )
    })

    test.each([
      ['not-an-email', 'Please enter a valid email address'],
      ['', 'Email is required'],
    ])('typing %j produces Invalid without an async command', (value, error) => {
      story(
        update,
        given(withFields({ email: FieldValidation.Valid({ value: 'a@b.co' }) })),
        message(typed('email', value)),
        Command.expectNone(),
        model(model => {
          expect(model.form.fields.email).toEqual(
            FieldValidation.Invalid({ value, errors: [error] }),
          )
        }),
      )
    })

    test('a validation result for a superseded email value is ignored', () => {
      const inFlightModel = withFields({
        email: FieldValidation.Validating({ value: 'alice@example.com' }),
      })

      const next = update(
        inFlightModel,
        Message.GotFormMessage({ message: checked('old@example.com', Option.none()) }),
      )
      expect(next.model).toBe(inFlightModel)
    })

    test('a validation result for the current email value updates the field', () => {
      story(
        update,
        given(initialModel),
        message(typed('email', 'taken@example.com')),
        Command.resolve(
          CheckEmail,
          checked('taken@example.com', Option.some('This email is already on our waitlist')),
        ),
        model(model => {
          expect(model.form.fields.email).toEqual(
            FieldValidation.Invalid({
              value: 'taken@example.com',
              errors: ['This email is already on our waitlist'],
            }),
          )
        }),
      )
    })
  })

  describe('message text field', () => {
    test('typing a message stores it as Valid', () => {
      story(
        update,
        given(initialModel),
        message(typed('messageText', 'Hello there.')),
        model(model => {
          expect(model.form.fields.messageText).toEqual(
            FieldValidation.Valid({ value: 'Hello there.' }),
          )
        }),
      )
    })
  })

  // To the form an emptied draft is nothing entered, so neither shows a check
  // mark; upstream keeps an emptied message `Valid`.
  test.each(['name', 'messageText'] as const)(
    'clearing the optional %s leaves it not validated',
    key => {
      story(
        update,
        given(initialModel),
        message(typed(key, 'x')),
        message(typed(key, '')),
        model(model => {
          expect(model.form.fields[key]).toEqual(FieldValidation.NotValidated({ value: '' }))
        }),
      )
    },
  )

  describe('submission', () => {
    test('submitting an invalid form sends nothing, and says what is missing', () => {
      story(
        update,
        given(initialModel),
        message(submitted),
        Command.expectNone(),
        model(model => {
          expect(model.submission._tag).toBe('NotSubmitted')
          expect(model.form.fields.email).toEqual(
            FieldValidation.Invalid({ value: '', errors: ['Email is required'] }),
          )
        }),
      )
    })

    test('submitting a valid form fires SubmitForm with the decoded signup and enters Submitting', () => {
      story(
        update,
        given(validModel),
        message(submitted),
        model(model => {
          expect(model.submission._tag).toBe('Submitting')
        }),
        Command.expectExact(
          SubmitForm({ name: 'Alice', email: 'alice@example.com', messageText: '' }),
        ),
        Command.resolve(SubmitForm, Message.SucceededSubmitForm({ name: 'Alice' })),
        model(model => {
          expect(model.submission).toEqual({
            _tag: 'SubmitSuccess',
            confirmationText: "Welcome to the waitlist, Alice! We'll be in touch soon.",
          })
        }),
      )
    })

    test('FailedSubmitForm sets SubmitError', () => {
      story(
        update,
        given(validModel),
        message(submitted),
        Command.resolve(SubmitForm, Message.FailedSubmitForm()),
        model(model => {
          expect(model.submission._tag).toBe('SubmitError')
        }),
      )
    })

    // Story refuses a Message while a Command is pending; these two send one on purpose.
    test('a second submit while the first is in flight sends nothing', () => {
      const first = update(validModel, submitted)
      const second = update(first.model, submitted)
      expect(second.model.submission._tag).toBe('Submitting')
      expect(second.commands).toEqual([])
    })

    test('a submit while the email is being checked goes out once the check passes', () => {
      const asking = update(
        withFields({ name: FieldValidation.Valid({ value: 'Alice' }) }),
        typed('email', 'alice@example.com'),
      )
      const waiting = update(asking.model, submitted)
      expect(waiting.model.submission._tag).toBe('NotSubmitted')
      expect(waiting.commands).toEqual([])

      const passed = update(
        waiting.model,
        Message.GotFormMessage({ message: checked('alice@example.com', Option.none()) }),
      )
      expect(passed.model.submission._tag).toBe('Submitting')
      expect(passed.commands?.map(command => command.name)).toEqual(['SubmitForm'])
    })
  })
})
