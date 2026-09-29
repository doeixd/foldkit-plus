/**
 * Upstream's scenes, with the check and the submit now the form's: the
 * pending check is `CheckEmail`, answered with the form's `Checked`.
 */
import { Option } from 'effect'
import { FieldValidation } from 'foldkit'
import {
  Command,
  click,
  expect,
  given,
  label,
  role,
  scene,
  submit,
  text,
  type,
} from 'foldkit/scene'
import { describe, test } from 'vitest'

import { Message, SubmitForm, initialModel, update, view } from '../src/main.js'
import { CheckEmail, checked, validModel, withFields } from './fixtures.js'

describe('view', () => {
  test('initial view shows all fields and a disabled submit button', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(role('heading', { name: 'Join Our Waitlist' })).toExist(),
      expect(label('Name')).toExist(),
      expect(label('Email')).toExist(),
      expect(label("Anything you'd like to share with us?")).toExist(),
      expect(role('button', { name: 'Join Waitlist' })).toBeDisabled(),
    )
  })

  test('typing a short name shows a validation error via accessible description', () => {
    scene(
      { update, view },
      given(initialModel),
      type(label('Name'), 'A'),
      expect(label('Name')).toHaveAccessibleDescription('Name must be at least 2 characters'),
    )
  })

  test('typing a malformed email surfaces a synchronous validation error', () => {
    scene(
      { update, view },
      given(initialModel),
      type(label('Email'), 'not-an-email'),
      expect(label('Email')).toHaveAccessibleDescription('Please enter a valid email address'),
    )
  })

  test('typing a well-formed email triggers async validation', () => {
    scene(
      { update, view },
      given(withFields({ name: FieldValidation.Valid({ value: 'Alice' }) })),
      type(label('Email'), 'alice@example.com'),
      expect(label('Email')).toHaveAccessibleDescription('Checking…'),
      expect(text('◐')).toExist(),
      expect(role('button', { name: 'Join Waitlist' })).toBeDisabled(),
      Command.expectExact(CheckEmail),
      Command.resolve(CheckEmail, checked('alice@example.com', Option.none())),
      expect(text('◐')).not.toExist(),
      expect(role('button', { name: 'Join Waitlist' })).toBeEnabled(),
    )
  })

  test('async validation can flag an email as taken', () => {
    scene(
      { update, view },
      given(initialModel),
      type(label('Email'), 'test@example.com'),
      Command.expectExact(CheckEmail),
      Command.resolve(
        CheckEmail,
        checked('test@example.com', Option.some('This email is already on our waitlist')),
      ),
      expect(label('Email')).toHaveAccessibleDescription('This email is already on our waitlist'),
    )
  })

  test('submit becomes enabled once name and email are valid', () => {
    scene(
      { update, view },
      given(validModel),
      expect(role('button', { name: 'Join Waitlist' })).toBeEnabled(),
    )
  })

  test('a valid field shows a check mark beside its label', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(text('✓')).not.toExist(),
      type(label('Name'), 'Alice'),
      expect(text('✓')).toExist(),
    )
  })

  test('submitting a valid form shows the loading label then a success banner', () => {
    scene(
      { update, view },
      given(validModel),
      click(role('button', { name: 'Join Waitlist' })),
      expect(role('button', { name: 'Joining...' })).toBeDisabled(),
      Command.expectExact(SubmitForm),
      Command.resolve(SubmitForm, Message.SucceededSubmitForm({ name: 'Alice' })),
      expect(role('status')).toContainText('Welcome to the waitlist, Alice!'),
      expect(role('button', { name: 'Join Waitlist' })).toExist(),
    )
  })

  test('a failed submission renders an error banner', () => {
    scene(
      { update, view },
      given(validModel),
      submit(role('form')),
      Command.expectExact(SubmitForm),
      Command.resolve(SubmitForm, Message.FailedSubmitForm()),
      expect(role('alert')).toContainText('Sorry, there was an error'),
    )
  })

  test('submitting an invalid form (e.g. via Enter key) sends nothing and says what is missing', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(role('button', { name: 'Join Waitlist' })).toBeDisabled(),
      submit(role('form')),
      Command.expectNone(),
      expect(label('Email')).toHaveAccessibleDescription('Email is required'),
      expect(role('button', { name: 'Join Waitlist' })).toBeDisabled(),
    )
  })
})
