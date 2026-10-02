/**
 * Upstream's stories, with the edits and the submit now the form's: a field
 * changes by the form's `Changed` and the form is submitted by its
 * `Submitted`, each wrapped for the Login page as its view wraps them.
 */
import {
  Command,
  expectNoOutMessage,
  expectOutMessage,
  given,
  message,
  model,
  story,
} from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import {
  Message,
  OutMessage,
  SimulateAuthRequest,
  initModel,
  update,
} from '../../../../src/page/loggedOut/page/login.js'
import { submitted, typed, validLoginModel as validModel } from '../../../fixtures.js'

const aliceSession = { userId: '1', email: 'alice@example.com', name: 'alice' }

describe('login', () => {
  test('typing an email validates the field', () => {
    story(
      update,
      given(initModel()),
      message(typed('email', '')),
      model(model => {
        expect(model.form.fields.email._tag).toBe('Invalid')
      }),
      message(typed('email', 'alice@example.com')),
      model(model => {
        expect(model.form.fields.email._tag).toBe('Valid')
        expect(model.form.fields.email.value).toBe('alice@example.com')
      }),
    )
  })

  test('typing a password validates the field', () => {
    story(
      update,
      given(initModel()),
      message(typed('password', '')),
      model(model => {
        expect(model.form.fields.password._tag).toBe('Invalid')
      }),
      message(typed('password', 'secret')),
      model(model => {
        expect(model.form.fields.password._tag).toBe('Valid')
      }),
    )
  })

  test('submitting with invalid fields does nothing', () => {
    story(
      update,
      given(initModel()),
      message(submitted),
      model(model => {
        expect(model.isSubmitting).toBe(false)
      }),
      Command.expectNone(),
    )
  })

  test('submitting with valid fields sends an auth request', () => {
    story(
      update,
      given(validModel),
      message(submitted),
      model(model => {
        expect(model.isSubmitting).toBe(true)
      }),
      Command.expectHas(SimulateAuthRequest),
      Command.resolve(
        SimulateAuthRequest,
        Message.SucceededSimulateAuthRequest({ session: aliceSession }),
      ),
      expectOutMessage(OutMessage.SucceededLogin({ session: aliceSession })),
    )
  })

  test('failed auth marks the password field invalid and stops submitting', () => {
    story(
      update,
      given(validModel),
      message(submitted),
      model(model => {
        expect(model.isSubmitting).toBe(true)
      }),
      Command.resolve(
        SimulateAuthRequest,
        Message.FailedSimulateAuthRequest({
          error: 'Invalid credentials',
        }),
      ),
      model(model => {
        expect(model.isSubmitting).toBe(false)
        expect(model.form.fields.password._tag).toBe('Invalid')
      }),
      expectNoOutMessage(),
    )
  })

  // Not upstream's stories: what the form's submit adds and keeps.
  test('a second submit while the first is in flight requests nothing more', () => {
    story(
      update,
      given(modifyFields(validModel, { isSubmitting: () => true })),
      message(submitted),
      Command.expectNone(),
    )
  })

  test('the refused password keeps what was typed and says why', () => {
    story(
      update,
      given(validModel),
      message(Message.FailedSimulateAuthRequest({ error: 'Invalid credentials' })),
      model(model => {
        expect(model.form.fields.password).toEqual({
          _tag: 'Invalid',
          value: 'password',
          errors: ['Invalid credentials'],
        })
      }),
    )
  })
})
