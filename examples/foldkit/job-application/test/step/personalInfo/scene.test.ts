import { Option } from 'effect'
import { expect, given, label, scene, text, type } from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { init, update } from '../../../src/step/personalInfo/personalInfo.js'
import { view } from '../../../src/step/personalInfo/view.js'
import { today } from '../../fixtures.js'

describe('personalInfo', () => {
  test('renders the name and email fields', () => {
    scene(
      { update, view },
      given(init(today)),
      expect(label('First Name')).toExist(),
      expect(label('Last Name')).toExist(),
      expect(label('Email')).toExist(),
    )
  })

  test('a valid first name shows a checkmark', () => {
    scene(
      { update, view },
      given(init(today)),
      type(label('First Name'), 'Jane'),
      expect(text('✓')).toExist(),
    )
  })

  test('a short first name shows the length error', () => {
    scene(
      { update, view },
      given(init(today)),
      type(label('First Name'), 'J'),
      expect(text('First name must be at least 2 characters')).toExist(),
    )
  })

  test.each([
    ['Other', true],
    ['They/Them', false],
  ])('with %s chosen, asks for custom pronouns: %s', (pronoun, asks) => {
    const chosen = modifyFields(init(today), {
      maybeSelectedPronoun: () => Option.some(pronoun),
    })
    scene(
      { update, view },
      given(chosen),
      asks
        ? expect(label('Custom Pronouns')).toExist()
        : expect(label('Custom Pronouns')).not.toExist(),
    )
  })

  test('custom pronouns are typed into the step', () => {
    scene(
      { update, view },
      given(modifyFields(init(today), { maybeSelectedPronoun: () => Option.some('Other') })),
      type(label('Custom Pronouns'), 'Xe/Xem'),
      expect(label('Custom Pronouns')).toHaveValue('Xe/Xem'),
    )
  })
})
