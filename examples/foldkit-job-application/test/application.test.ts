import { Array, Option } from 'effect'
import { Calendar } from 'foldkit'
import { NotValidated, Validating } from 'foldkit/fieldValidation'
import { describe, expect, test } from 'vitest'

import { applicationPayload } from '../src/application.js'
import { Message } from '../src/message.js'
import type { Model } from '../src/model.js'
import { CoverLetter } from '../src/step/index.js'
import { update } from '../src/update.js'
import { completeModel, initialModel, withFields } from './fixtures.js'

const today = Calendar.make(2026, 4, 16)

const resume = new globalThis.File(['resume'], 'resume.pdf', { type: 'application/pdf' })
const portfolio = new globalThis.File(['portfolio'], 'portfolio.zip', {
  type: 'application/zip',
})

/** `completeModel` with every choice around the forms made: dates, pills, letter, files. */
const chosen: Model = {
  ...completeModel,
  personalInfo: {
    ...completeModel.personalInfo,
    maybeSelectedPronoun: Option.some('Other'),
    customPronouns: 'Zir',
    maybeAvailableDate: Option.some(today),
  },
  workHistory: {
    ...completeModel.workHistory,
    entries: Array.map(completeModel.workHistory.entries, entry => ({
      ...entry,
      maybeStartDate: Option.some(today),
      maybeEndDate: Option.none(),
      isCurrentlyEmployed: true,
      description: 'Built the pipeline',
    })),
  },
  education: {
    ...completeModel.education,
    entries: Array.map(completeModel.education.entries, entry => ({
      ...entry,
      maybeGraduationYear: Option.some('2020'),
      isCurrentlyEnrolled: false,
    })),
  },
  skills: {
    ...completeModel.skills,
    entries: Array.map(completeModel.skills.entries, entry => ({
      ...entry,
      proficiency: 'Expert' as const,
    })),
  },
  coverLetter: { ...completeModel.coverLetter, content: 'I would love to work on Foldkit.' },
  attachments: {
    ...completeModel.attachments,
    maybeResume: Option.some(resume),
    additionalFiles: [portfolio],
  },
}

const expectedPayload = {
  applicant: {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
  },
  pronouns: Option.some('Other'),
  customPronouns: 'Zir',
  availableDate: Option.some(today),
  workHistory: [
    {
      company: 'Foldkit',
      title: 'Engineer',
      startDate: Option.some(today),
      endDate: Option.none(),
      isCurrentlyEmployed: true,
      description: 'Built the pipeline',
    },
  ],
  education: [
    {
      school: 'MIT',
      degree: 'BS',
      fieldOfStudy: 'CS',
      graduationYear: Option.some('2020'),
      isCurrentlyEnrolled: false,
    },
  ],
  skills: [{ name: 'TypeScript', proficiency: 'Expert' }],
  coverLetter: 'I would love to work on Foldkit.',
  resume: Option.some({ name: 'resume.pdf', size: resume.size, mimeType: 'application/pdf' }),
  additionalFiles: [{ name: 'portfolio.zip', size: portfolio.size, mimeType: 'application/zip' }],
}

describe('the application payload', () => {
  test('carries the decoded forms beside every choice and file around them', () => {
    expect(applicationPayload(chosen)).toEqual(Option.some(expectedPayload))
  })

  test('leaves no payload while a form key is missing or a check runs', () => {
    const missing = {
      ...chosen,
      personalInfo: {
        ...chosen.personalInfo,
        form: withFields({ firstName: NotValidated({ value: '' }) })(chosen.personalInfo.form),
      },
    }
    expect(applicationPayload(missing)).toEqual(Option.none())

    const checking = {
      ...chosen,
      personalInfo: {
        ...chosen.personalInfo,
        form: withFields({ email: Validating({ value: 'jane@example.com' }) })(
          chosen.personalInfo.form,
        ),
      },
    }
    expect(applicationPayload(checking)).toEqual(Option.none())
  })

  test('leaves no payload for a step whose entries are all gone', () => {
    const withoutWork = { ...chosen, workHistory: { ...chosen.workHistory, entries: [] } }
    expect(applicationPayload(withoutWork)).toEqual(Option.none())
    const withoutSkills = { ...chosen, skills: { ...chosen.skills, entries: [] } }
    expect(applicationPayload(withoutSkills)).toEqual(Option.none())
    expect(applicationPayload(initialModel)).toEqual(Option.none())
  })
})

describe('what a submit sends', () => {
  test('captures the payload as the Model stands, so later edits do not reach the request', () => {
    const started = update({ ...chosen, currentStep: 'Review' }, Message.ClickedSubmit())
    const command = started.commands?.[0]
    expect(command?.name).toBe('SubmitApplication')
    expect(command?.args).toEqual({ application: expectedPayload })

    // The applicant keeps editing while the request is in flight.
    const edited = update(
      started.model,
      Message.GotCoverLetterMessage({
        message: CoverLetter.Message.UpdatedContent({ value: 'Never mind.' }),
      }),
    )
    expect(edited.model.coverLetter.content).toBe('Never mind.')
    expect(command?.args).toEqual({ application: expectedPayload })
  })

  test('a second submit while the request runs changes nothing', () => {
    const started = update({ ...chosen, currentStep: 'Review' }, Message.ClickedSubmit())
    expect(started.model.submission._tag).toBe('Submitting')
    const again = update(started.model, Message.ClickedSubmit())
    expect(again.model).toBe(started.model)
    expect(again.commands ?? []).toEqual([])
  })

  test('an empty entry list is not an application to send', () => {
    const withoutWork: Model = {
      ...chosen,
      currentStep: 'Review',
      workHistory: { ...chosen.workHistory, entries: [] },
    }
    const result = update(withoutWork, Message.ClickedSubmit())
    expect(result.model.submission._tag).toBe('NotSubmitted')
    expect(result.commands ?? []).toEqual([])
  })
})
