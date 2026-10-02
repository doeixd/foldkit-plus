import { FieldValidation } from 'foldkit'
import { expectOutMessage, given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import {
  Message,
  OutMessage,
  SkillForm,
  init,
  revealErrors,
  update,
} from '../../../src/step/skills/entry/entry.js'

describe('skills entry', () => {
  test('UpdatedName stores a valid skill name', () => {
    story(
      update,
      given(init('entry-1')),
      message(
        Message.GotFormMessage({
          message: SkillForm.Message.Changed({ key: 'name', value: 'TypeScript' }),
        }),
      ),
      model(model => {
        expect(model.form.fields.name.value).toBe('TypeScript')
        expect(model.form.fields.name._tag).toBe('Valid')
      }),
    )
  })

  test('revealing an untouched skill says its name is required', () => {
    const revealed = revealErrors(init('entry-1'))
    expect(revealed.model.form.fields.name).toEqual(
      FieldValidation.Invalid({ value: '', errors: ['Skill name is required'] }),
    )
    expect(revealed.commands).toEqual([])
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
