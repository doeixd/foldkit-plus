import { FieldValidation } from 'foldkit'
import { expectOutMessage, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import {
  DegreeForm,
  Message,
  OutMessage,
  init,
  update,
} from '../../../src/step/education/entry/entry.js'

const typedSchool = (value: string): Message =>
  Message.GotFormMessage({ message: DegreeForm.Message.Changed({ key: 'school', value }) })

describe('education entry', () => {
  test('UpdatedSchool stores a valid school', () => {
    story(
      update,
      given(init('entry-1')),
      message(typedSchool('MIT')),
      model(model => {
        expect(model.form.fields.school.value).toBe('MIT')
        expect(model.form.fields.school._tag).toBe('Valid')
      }),
    )
  })

  test('clearing school after a value makes the field Invalid', () => {
    story(
      update,
      given(init('entry-1')),
      message(typedSchool('MIT')),
      message(typedSchool('')),
      model(model => {
        expect(model.form.fields.school._tag).toBe('Invalid')
      }),
    )
  })

  test.each([
    ['school', 'School is required'],
    ['degree', 'Degree is required'],
    ['fieldOfStudy', 'Field of study is required'],
  ] as const)('an emptied %s says %j', (key, error) => {
    story(
      update,
      given(init('entry-1')),
      message(Message.GotFormMessage({ message: DegreeForm.Message.Changed({ key, value: 'x' }) })),
      message(Message.GotFormMessage({ message: DegreeForm.Message.Changed({ key, value: '' }) })),
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
      given(init('entry-1')),
      message(Message.ClickedRemoveSelf()),
      expectOutMessage(OutMessage.Removed()),
    )
  })
})
