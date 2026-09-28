import { Calendar, FieldValidation } from 'foldkit'
import { expectOutMessage, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import {
  Message,
  OutMessage,
  PositionForm,
  init,
  update,
} from '../../../src/step/workHistory/entry/entry.js'

const typedCompany = (value: string): Message =>
  Message.GotFormMessage({ message: PositionForm.Message.Changed({ key: 'company', value }) })

const today = Calendar.make(2026, 4, 16)

describe('workHistory entry', () => {
  test('UpdatedCompany stores a valid company', () => {
    story(
      update,
      given(init('entry-1', today)),
      message(typedCompany('Foldkit Inc.')),
      model(model => {
        expect(model.form.fields.company.value).toBe('Foldkit Inc.')
        expect(model.form.fields.company._tag).toBe('Valid')
      }),
    )
  })

  test('clearing company after a value makes the field Invalid', () => {
    story(
      update,
      given(init('entry-1', today)),
      message(typedCompany('Foldkit Inc.')),
      message(typedCompany('')),
      model(model => {
        expect(model.form.fields.company._tag).toBe('Invalid')
      }),
    )
  })

  test.each([
    ['company', 'Company is required'],
    ['title', 'Job title is required'],
  ] as const)('an emptied %s says %j', (key, error) => {
    story(
      update,
      given(init('entry-1', today)),
      message(
        Message.GotFormMessage({ message: PositionForm.Message.Changed({ key, value: 'x' }) }),
      ),
      message(
        Message.GotFormMessage({ message: PositionForm.Message.Changed({ key, value: '' }) }),
      ),
      model(model => {
        expect(model.form.fields[key]).toEqual(
          FieldValidation.Invalid({ value: '', errors: [error] }),
        )
      }),
    )
  })

  test('ClickedRemoveSelf emits Removed', () => {
    story(
      update,
      given(init('entry-1', today)),
      message(Message.ClickedRemoveSelf()),
      expectOutMessage(OutMessage.Removed()),
    )
  })
})
