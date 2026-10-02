import { Tabs } from '@foldkit/ui'
import { Validating } from 'foldkit/fieldValidation'
import {
  Command,
  click,
  expect,
  given,
  inside,
  label,
  role,
  scene,
  text,
  type,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import { Submission } from '../src/model.js'
import { update } from '../src/update.js'
import { view } from '../src/view/view.js'
import { completeModel, initialModel, withFields } from './fixtures.js'

const resolveFocusTab = Command.resolve(Tabs.FocusTab, Tabs.Message.CompletedFocusTab())

describe('view', () => {
  test('initial view shows the page heading and the PersonalInfo step', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(role('heading', { name: 'Apply to Work on Foldkit' })).toExist(),
      expect(role('heading', { name: 'Personal Info' })).toExist(),
      expect(role('button', { name: 'Next →' })).toExist(),
    )
  })

  test('the step nav lists every step', () => {
    scene(
      { update, view },
      given(initialModel),
      inside(
        role('tablist', { name: 'Application steps' }),
        expect(text('Personal Info')).toExist(),
        expect(text('Work History')).toExist(),
        expect(text('Education')).toExist(),
        expect(text('Skills')).toExist(),
        expect(text('Cover Letter')).toExist(),
        expect(text('Attachments')).toExist(),
        expect(text('Review')).toExist(),
      ),
    )
  })

  test('tabs can jump directly to any step', () => {
    scene(
      { update, view },
      given(initialModel),
      inside(
        role('tablist', { name: 'Application steps' }),
        click(role('tab', { name: /Review$/ })),
      ),
      resolveFocusTab,
      expect(role('heading', { name: 'Review' })).toExist(),
    )
  })

  test('the blocked notice names the steps to review, and each takes you there', () => {
    scene(
      { update, view },
      given(
        modifyFields(initialModel, {
          currentStep: () => 'Review',
          isSubmitAttempted: () => true,
        }),
      ),
      click(role('button', { name: 'Personal Info' })),
      resolveFocusTab,
      expect(role('heading', { name: 'Personal Info' })).toExist(),
    )
  })

  test('clicking Next advances to the Work History step', () => {
    scene(
      { update, view },
      given(initialModel),
      click(role('button', { name: 'Next →' })),
      expect(role('heading', { name: 'Work History' })).toExist(),
      expect(role('button', { name: '← Previous' })).toExist(),
    )
  })

  test('Previous on a later step returns to the prior step', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, { currentStep: () => 'Education' })),
      expect(role('heading', { name: 'Education' })).toExist(),
      click(role('button', { name: '← Previous' })),
      expect(role('heading', { name: 'Work History' })).toExist(),
    )
  })

  test('the first step does not render a Previous button', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(role('button', { name: '← Previous' })).toBeAbsent(),
    )
  })

  test('the Review step exposes a Submit button and hides Next', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, { currentStep: () => 'Review' })),
      expect(role('button', { name: 'Submit Application' })).toExist(),
      expect(role('button', { name: 'Next →' })).toBeAbsent(),
    )
  })

  test('clicking Submit on an incomplete application shows a blocking notice', () => {
    scene(
      { update, view },
      given(modifyFields(initialModel, { currentStep: () => 'Review' })),
      expect(role('button', { name: 'Submit Application' })).toBeEnabled(),
      expect(
        text('Review Personal Info, Work History, Education, Skills before submitting.'),
      ).not.toExist(),
      click(role('button', { name: 'Submit Application' })),
      expect(
        text('Review Personal Info, Work History, Education, Skills before submitting.'),
      ).toExist(),
    )
  })

  test('a pending validation notice names the incomplete step', () => {
    scene(
      { update, view },
      given(
        modifyFields(completeModel, {
          currentStep: () => 'Review',
          personalInfo: modifyFields({
            form: withFields({ email: Validating({ value: 'jane@example.com' }) }),
          }),
        }),
      ),
      expect(role('button', { name: 'Submit Application' })).toBeEnabled(),
      click(role('button', { name: 'Submit Application' })),
      expect(text('Review Personal Info before submitting.')).toExist(),
    )
  })

  test('submit blocking notices include multiple incomplete required steps', () => {
    scene(
      { update, view },
      given(
        modifyFields(completeModel, {
          currentStep: () => 'Review',
          workHistory: modifyFields({
            entries: () => [],
          }),
          education: modifyFields({
            entries: () => [],
          }),
          skills: modifyFields({
            entries: () => [],
          }),
        }),
      ),
      expect(role('button', { name: 'Submit Application' })).toBeEnabled(),
      click(role('button', { name: 'Submit Application' })),
      expect(text('Review Work History, Education, Skills before submitting.')).toExist(),
    )
  })

  test('a submitting application shows a Submitting button', () => {
    scene(
      { update, view },
      given(
        modifyFields(initialModel, {
          currentStep: () => 'Review',
          submission: () => Submission.Submitting(),
        }),
      ),
      expect(role('button', { name: 'Submitting...' })).toExist(),
    )
  })

  test('a successful submission swaps the form for a success panel', () => {
    scene(
      { update, view },
      given(
        modifyFields(initialModel, {
          currentStep: () => 'Review',
          submission: () => Submission.SubmitSuccess(),
        }),
      ),
      expect(text('Application Submitted', { exact: false })).toExist(),
    )
  })

  test('a failed submission shows the error and a Try Again control', () => {
    scene(
      { update, view },
      given(
        modifyFields(initialModel, {
          currentStep: () => 'Review',
          submission: () => Submission.SubmitError({ error: 'Network down' }),
        }),
      ),
      expect(text('Network down')).toExist(),
      expect(role('button', { name: 'Try Again' })).toExist(),
    )
  })

  test('a field with an error marks its step for attention before any submit', () => {
    scene(
      { update, view },
      given(initialModel),
      expect(role('tab', { name: '1Personal Info' })).toExist(),
      type(label('First Name'), 'J'),
      expect(role('tab', { name: '!Personal Info' })).toExist(),
    )
  })
})
