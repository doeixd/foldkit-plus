import { FileDrop, Menu, Tabs } from '@foldkit/ui'
import { Array, Option, pipe } from 'effect'
import { NotValidated, Validating } from 'foldkit/fieldValidation'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { SubmitApplication } from '../src/command.js'
import { Message } from '../src/message.js'
import { Submission } from '../src/model.js'
import {
  Attachments,
  CoverLetter,
  Education,
  PersonalInfo,
  Skills,
  WorkHistory,
} from '../src/step/index.js'
import { update } from '../src/update.js'
import {
  ValidateEmail,
  checkedEmail,
  completeModel,
  initialModel,
  typedPersonalInfo,
  withFields,
} from './fixtures.js'

const givenInitial = given(initialModel)

const resolveFocusTab = Command.resolve(Tabs.FocusTab, Tabs.Message.CompletedFocusTab())

const resolveFocusMenuButton = Command.resolve(
  Menu.FocusButton,
  Menu.Message.CompletedFocusButton(),
)

describe('update', () => {
  describe('navigation', () => {
    test('ClickedNext advances to the next step', () => {
      story(
        update,
        givenInitial,
        message(Message.ClickedNext()),
        Command.expectNone(),
        model(model => {
          expect(model.currentStep).toBe('WorkHistory')
        }),
      )
    })

    test('ClickedPrevious goes back to the previous step', () => {
      story(
        update,
        given(modifyFields(initialModel, { currentStep: () => 'Education' })),
        message(Message.ClickedPrevious()),
        model(model => {
          expect(model.currentStep).toBe('WorkHistory')
        }),
      )
    })

    test('ClickedPrevious on the first step stays put', () => {
      story(
        update,
        givenInitial,
        message(Message.ClickedPrevious()),
        model(model => {
          expect(model.currentStep).toBe('PersonalInfo')
        }),
      )
    })

    test('ClickedNext on the last step stays put', () => {
      story(
        update,
        given(modifyFields(initialModel, { currentStep: () => 'Review' })),
        message(Message.ClickedNext()),
        model(model => {
          expect(model.currentStep).toBe('Review')
        }),
      )
    })

    test('GotStepTabsMessage selects the matching step', () => {
      story(
        update,
        givenInitial,
        message(
          Message.GotStepTabsMessage({
            message: Tabs.Message.SelectedTab({ index: 6, value: 'Review' }),
          }),
        ),
        model(model => {
          expect(model.currentStep).toBe('Review')
        }),
        resolveFocusTab,
      )
    })

    test('GotStepMenuMessage selects the matching step', () => {
      story(
        update,
        givenInitial,
        message(
          Message.GotStepMenuMessage({
            message: Menu.Message.Opened({
              maybeActiveItemIndex: Option.none(),
            }),
          }),
        ),
        Command.resolve(Menu.FocusItems, Menu.Message.CompletedFocusItems()),
        message(
          Message.GotStepMenuMessage({
            message: Menu.Message.SelectedItem({
              index: 5,
              item: 'Attachments',
            }),
          }),
        ),
        model(model => {
          expect(model.currentStep).toBe('Attachments')
        }),
        resolveFocusMenuButton,
      )
    })
  })

  describe('preview toggle', () => {
    test('ToggledPreview flips visibility', () => {
      story(
        update,
        givenInitial,
        message(Message.ToggledPreview()),
        model(model => {
          expect(model.isPreviewVisible).toBe(true)
        }),
        message(Message.ToggledPreview()),
        model(model => {
          expect(model.isPreviewVisible).toBe(false)
        }),
      )
    })
  })

  describe('child folding', () => {
    test('GotPersonalInfoMessage writes through to personalInfo', () => {
      story(
        update,
        givenInitial,
        message(
          Message.GotPersonalInfoMessage({
            message: typedPersonalInfo('firstName', 'Jane'),
          }),
        ),
        model(model => {
          expect(model.personalInfo.form.fields.firstName.value).toBe('Jane')
        }),
      )
    })

    test('GotWorkHistoryMessage writes through to workHistory', () => {
      story(
        update,
        givenInitial,
        message(
          Message.GotWorkHistoryMessage({
            message: WorkHistory.Message.SucceededGenerateEntryId({
              entryId: 'test-work-1',
            }),
          }),
        ),
        model(model => {
          expect(model.workHistory.entries).toHaveLength(2)
        }),
      )
    })

    test('GotEducationMessage writes through to education', () => {
      story(
        update,
        givenInitial,
        message(
          Message.GotEducationMessage({
            message: Education.Message.SucceededGenerateEntryId({
              entryId: 'test-edu-1',
            }),
          }),
        ),
        model(model => {
          expect(model.education.entries).toHaveLength(2)
        }),
      )
    })

    test('GotSkillsMessage writes through to skills', () => {
      story(
        update,
        givenInitial,
        message(
          Message.GotSkillsMessage({
            message: Skills.Message.SucceededGenerateEntryId({
              entryId: 'test-skill-1',
            }),
          }),
        ),
        model(model => {
          expect(model.skills.entries).toHaveLength(2)
        }),
      )
    })

    test('GotCoverLetterMessage writes through to coverLetter', () => {
      story(
        update,
        givenInitial,
        message(
          Message.GotCoverLetterMessage({
            message: CoverLetter.Message.UpdatedContent({
              value: 'I love the Elm Architecture.',
            }),
          }),
        ),
        model(model => {
          expect(model.coverLetter.content).toBe('I love the Elm Architecture.')
        }),
      )
    })

    test('GotAttachmentsMessage writes through to attachments', () => {
      const resume = new globalThis.File(['pdf-bytes'], 'resume.pdf', {
        type: 'application/pdf',
      })

      story(
        update,
        givenInitial,
        message(
          Message.GotAttachmentsMessage({
            message: Attachments.Message.GotResumeDropMessage({
              message: FileDrop.Message.DroppedFiles({ files: [resume] }),
            }),
          }),
        ),
        model(model => {
          expect(model.attachments.maybeResume._tag).toBe('Some')
        }),
      )
    })
  })

  describe('submission', () => {
    test('ClickedSubmit on a complete application transitions to Submitting and fires command', () => {
      story(
        update,
        given(modifyFields(completeModel, { currentStep: () => 'Review' })),
        message(Message.ClickedSubmit()),
        Command.expectExact(SubmitApplication),
        Command.resolve(SubmitApplication, Message.SucceededSubmitApplication()),
        model(model => {
          expect(model.submission._tag).toBe('SubmitSuccess')
          expect(model.isSubmitAttempted).toBe(true)
        }),
      )
    })

    test('ClickedSubmit on an incomplete application reveals errors and does not submit', () => {
      story(
        update,
        given(modifyFields(initialModel, { currentStep: () => 'Review' })),
        message(Message.ClickedSubmit()),
        Command.expectNone(),
        model(model => {
          expect(model.submission._tag).toBe('NotSubmitted')
          expect(model.isSubmitAttempted).toBe(true)
          expect(model.personalInfo.form.fields.firstName._tag).toBe('Invalid')
          expect(model.personalInfo.form.fields.lastName._tag).toBe('Invalid')
          expect(model.personalInfo.form.fields.email._tag).toBe('Invalid')
          expect(
            pipe(
              model.workHistory.entries,
              Array.head,
              Option.map(entry => entry.form.fields.company._tag),
              Option.getOrThrow,
            ),
          ).toBe('Invalid')
          expect(
            pipe(
              model.education.entries,
              Array.head,
              Option.map(entry => entry.form.fields.school._tag),
              Option.getOrThrow,
            ),
          ).toBe('Invalid')
          expect(
            pipe(
              model.skills.entries,
              Array.head,
              Option.map(entry => entry.form.fields.name._tag),
              Option.getOrThrow,
            ),
          ).toBe('Invalid')
        }),
      )
    })

    test('ClickedSubmit with pending validation does not submit', () => {
      story(
        update,
        given(
          modifyFields(completeModel, {
            currentStep: () => 'Review',
            personalInfo: modifyFields({
              form: withFields({ email: Validating({ value: 'jane@example.com' }) }),
            }),
          }),
        ),
        message(Message.ClickedSubmit()),
        Command.expectNone(),
        model(model => {
          expect(model.submission._tag).toBe('NotSubmitted')
          expect(model.isSubmitAttempted).toBe(true)
          expect(model.personalInfo.form.fields.email._tag).toBe('Validating')
        }),
      )
    })

    test('ClickedSubmit preserves Valid fields rather than re-running validation', () => {
      story(
        update,
        given(modifyFields(completeModel, { currentStep: () => 'Review' })),
        message(Message.ClickedSubmit()),
        Command.resolve(SubmitApplication, Message.SucceededSubmitApplication()),
        model(model => {
          expect(model.personalInfo.form.fields.firstName._tag).toBe('Valid')
          expect(model.personalInfo.form.fields.firstName.value).toBe('Jane')
        }),
      )
    })

    test('successful submission shows success', () => {
      story(
        update,
        given(
          modifyFields(initialModel, {
            currentStep: () => 'Review',
            submission: () => Submission.Submitting(),
          }),
        ),
        message(Message.SucceededSubmitApplication()),
        model(model => {
          expect(model.submission._tag).toBe('SubmitSuccess')
        }),
      )
    })

    test('failed submission shows error', () => {
      story(
        update,
        given(
          modifyFields(initialModel, {
            currentStep: () => 'Review',
            submission: () => Submission.Submitting(),
          }),
        ),
        message(Message.FailedSubmitApplication({ error: 'Server down' })),
        model(model => {
          expect(model.submission._tag).toBe('SubmitError')
        }),
      )
    })
  })

  // What the form adds: its reveal is a submit's, its stale answers leave
  // nothing behind, and a step it leaves alone is the step it was given.
  describe('the step forms', () => {
    test('a submit asks about a well-formed email not checked yet, and does not submit', () => {
      const unchecked = modifyFields(completeModel, {
        currentStep: () => 'Review',
        personalInfo: modifyFields({
          form: withFields({ email: NotValidated({ value: 'jane@example.com' }) }),
        }),
      })
      story(
        update,
        given(unchecked),
        message(Message.ClickedSubmit()),
        Command.expectExact(ValidateEmail),
        model(model => {
          expect(model.submission._tag).toBe('NotSubmitted')
          expect(model.personalInfo.form.fields.email._tag).toBe('Validating')
        }),
        Command.resolve(ValidateEmail, checkedEmail('jane@example.com', Option.none())),
        model(model => {
          expect(model.personalInfo.form.fields.email._tag).toBe('Valid')
          expect(model.submission._tag).toBe('NotSubmitted')
        }),
      )
    })

    test('an answer for an email since edited leaves the Model as it was', () => {
      const checking = modifyFields(initialModel, {
        personalInfo: modifyFields({
          form: withFields({ email: Validating({ value: 'jane@example.com' }) }),
        }),
      })
      const next = update(
        checking,
        Message.GotPersonalInfoMessage({
          message: PersonalInfo.Message.GotFormMessage({
            message: checkedEmail('old@example.com', Option.none()),
          }),
        }),
      )
      expect(next.model).toBe(checking)
    })

    test('a submit validates what was never validated before deciding', () => {
      // A draft the form never checked, such as one a fixture or a fill puts there.
      const unchecked = modifyFields(completeModel, {
        currentStep: () => 'Review',
        personalInfo: modifyFields({
          form: withFields({ phone: NotValidated({ value: '12' }) }),
        }),
      })
      story(
        update,
        given(unchecked),
        message(Message.ClickedSubmit()),
        Command.expectNone(),
        model(model => {
          expect(model.submission._tag).toBe('NotSubmitted')
          expect(model.personalInfo.form.fields.phone._tag).toBe('Invalid')
        }),
      )
    })

    test('a submit leaves every step it finds valid as it was', () => {
      const next = update(
        modifyFields(completeModel, { currentStep: () => 'Review' }),
        Message.ClickedSubmit(),
      )
      expect(next.model.personalInfo).toBe(completeModel.personalInfo)
      expect(next.model.workHistory).toBe(completeModel.workHistory)
      expect(next.model.education).toBe(completeModel.education)
      expect(next.model.skills).toBe(completeModel.skills)
    })
  })
})
