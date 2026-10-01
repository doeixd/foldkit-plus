import { Tabs } from '@foldkit/ui'
import { Array, Option, pipe } from 'effect'
import { File } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button } from 'foldkit-mixins-ui'

import { Step } from '../domain/index.js'
import { Message } from '../message.js'
import { type Model, Submission } from '../model.js'
import { Education, PersonalInfo, Skills, WorkHistory } from '../step/index.js'
import { ReviewPart, SubmitButtonStyle, SubmittingButtonStyle } from '../style.js'
import { employmentRange, pluralize } from './format.js'

type Slots = SlotBuilders<typeof ReviewPart.slots, Message>

const reviewSection = (title: string, content: Html, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.section(slots.section.attrs(), [h.h3(slots.sectionTitle.attrs(), [title]), content])

const fieldRow = (label: string, value: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  value
    ? h.div(slots.row.attrs(), [
        h.span(slots.rowLabel.attrs(), [label]),
        h.span(slots.rowValue.attrs(), [value]),
      ])
    : h.empty

const personalInfoSection = (
  personalInfo: Model['personalInfo'],
  pronounLabel: string,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const { fields } = personalInfo.form
  return reviewSection(
    'Personal Information',
    h.div(slots.rows.attrs(), [
      fieldRow('Name', `${fields.firstName.value} ${fields.lastName.value}`.trim(), slots, h),
      fieldRow('Email', fields.email.value, slots, h),
      fieldRow('Phone', fields.phone.value, slots, h),
      fieldRow('Pronouns', pronounLabel, slots, h),
      fieldRow('Portfolio', fields.portfolioUrl.value, slots, h),
    ]),
    slots,
    h,
  )
}

const workEntryReview = (
  entry: WorkHistory.Entry.Model,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const { company, title } = entry.form.fields
  const heading = company.value ? `${title.value} at ${company.value}` : title.value

  return h.keyed('div')(entry.id, slots.entry.attrs(), [
    h.strong(slots.entryTitle.attrs(), [heading]),
    ...Option.match(entry.maybeStartDate, {
      onNone: () => [],
      onSome: start => [
        h.p(slots.entryMeta.attrs(), [
          employmentRange(start, entry.isCurrentlyEmployed, entry.maybeEndDate),
        ]),
      ],
    }),
  ])
}

const workHistorySection = (
  workHistory: Model['workHistory'],
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  reviewSection(
    `Work History (${pluralize(workHistory.entries.length, 'position', 'positions')})`,
    h.div(
      slots.entries.attrs(),
      workHistory.entries.map(entry => workEntryReview(entry, slots, h)),
    ),
    slots,
    h,
  )

const educationTimeline = (entry: Education.Entry.Model): string => {
  if (entry.isCurrentlyEnrolled) {
    return ' (Currently enrolled)'
  }
  return Option.match(entry.maybeGraduationYear, {
    onNone: () => '',
    onSome: graduationYear => ` – ${graduationYear}`,
  })
}

const educationEntryReview = (
  entry: Education.Entry.Model,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const { school, degree, fieldOfStudy } = entry.form.fields
  const title = fieldOfStudy.value ? `${degree.value} in ${fieldOfStudy.value}` : degree.value

  return h.keyed('div')(entry.id, slots.entry.attrs(), [
    h.strong(slots.entryTitle.attrs(), [title]),
    h.p(slots.entryMeta.attrs(), [school.value + educationTimeline(entry)]),
  ])
}

const educationSection = (
  education: Model['education'],
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  reviewSection(
    `Education (${pluralize(education.entries.length, 'entry', 'entries')})`,
    h.div(
      slots.entries.attrs(),
      education.entries.map(entry => educationEntryReview(entry, slots, h)),
    ),
    slots,
    h,
  )

const skillsSection = (skills: Model['skills'], slots: Slots, h: HtmlBuilder<Message>): Html =>
  reviewSection(
    `Skills (${skills.entries.length})`,
    h.div(
      slots.chips.attrs(),
      skills.entries
        .filter(entry => entry.form.fields.name.value)
        .map(entry =>
          h.keyed('span')(entry.id, slots.chip.attrs(), [entry.form.fields.name.value]),
        ),
    ),
    slots,
    h,
  )

const coverLetterSection = (
  coverLetter: Model['coverLetter'],
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  reviewSection(
    'Cover Letter',
    coverLetter.content
      ? h.p(slots.letter.attrs(), [coverLetter.content])
      : h.p(slots.missing.attrs(), ['No cover letter provided']),
    slots,
    h,
  )

const attachmentsSection = (
  attachments: Model['attachments'],
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  reviewSection(
    'Attachments',
    h.div(slots.entries.attrs(), [
      Option.match(attachments.maybeResume, {
        onNone: () => h.p(slots.missing.attrs(), ['No resume uploaded']),
        onSome: resume =>
          h.div(slots.attachment.attrs(), [
            h.span(slots.attachmentIcon.attrs(), ['📄']),
            h.span(slots.attachmentName.attrs(), [File.name(resume)]),
          ]),
      }),
      ...attachments.additionalFiles.map(file =>
        h.div(slots.attachment.attrs(), [
          h.span(slots.attachmentIcon.attrs(), ['📎']),
          h.span(slots.attachmentName.attrs(), [File.name(file)]),
        ]),
      ),
    ]),
    slots,
    h,
  )

/**
 * What to review before the application can go out, with each step named as
 * the thing that takes the reader there. The names select the step's tab, so
 * the jump is the navigation the page already has.
 */
const blockedNotice = (
  attentionSteps: ReadonlyArray<Step.Step>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  Array.match(attentionSteps, {
    onEmpty: () =>
      h.p(slots.blockedNotice.attrs(), ['Review the required fields before submitting.']),
    onNonEmpty: steps =>
      h.p(slots.blockedNotice.attrs(), [
        'Review ',
        ...Array.flatMap(steps, (step, index) => [
          ...(index === 0 ? [] : [', ']),
          h.button(
            slots.blockedNoticeStep.attrs([
              h.OnClick(
                Message.GotStepTabsMessage({
                  message: Tabs.Message.SelectedTab({ index: Step.indexOf(step), value: step }),
                }),
              ),
            ]),
            [Step.show(step)],
          ),
        ]),
        ' before submitting.',
      ]),
  })

const submissionSection = (
  submission: Model['submission'],
  shouldShowBlockedNotice: boolean,
  attentionSteps: ReadonlyArray<Step.Step>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  Submission.match(submission, {
    NotSubmitted: () =>
      h.div(slots.submission.attrs(), [
        ...(shouldShowBlockedNotice ? [blockedNotice(attentionSteps, slots, h)] : []),
        Button.view(
          {
            label: 'Submit Application',
            style: SubmitButtonStyle,
            onClick: Message.ClickedSubmit(),
          },
          h,
        ),
      ]),
    Submitting: () =>
      h.div(slots.submission.attrs(), [
        Button.view({ label: 'Submitting...', style: SubmittingButtonStyle }, h),
      ]),
    SubmitSuccess: () =>
      h.div(slots.success.attrs([h.Role('status')]), [
        h.p(slots.successTitle.attrs(), ['Application Submitted!']),
        h.p(slots.successText.attrs(), [
          "Thank you for applying to work on Foldkit. We'll be in touch!",
        ]),
      ]),
    SubmitError: ({ error }) =>
      h.div(slots.submission.attrs(), [
        h.div(slots.failure.attrs([h.Role('alert')]), [error]),
        ...(shouldShowBlockedNotice ? [blockedNotice(attentionSteps, slots, h)] : []),
        Button.view(
          { label: 'Try Again', style: SubmitButtonStyle, onClick: Message.ClickedSubmit() },
          h,
        ),
      ]),
  })

export const Review = SlotView.forMessages<Message>()
  .define(
    ReviewPart.slots,
    (
      {
        model,
        attentionSteps,
      }: Readonly<{ model: Model; attentionSteps: ReadonlyArray<Step.Step> }>,
      slots,
      h,
    ) => {
      const pronounLabel = Option.match(model.personalInfo.maybeSelectedPronoun, {
        onNone: () => '',
        onSome: value => (value === 'Other' ? model.personalInfo.customPronouns : value),
      })

      const isApplicationComplete =
        PersonalInfo.isComplete(model.personalInfo) &&
        WorkHistory.isComplete(model.workHistory) &&
        Education.isComplete(model.education) &&
        Skills.isComplete(model.skills)

      return h.div(slots.review.attrs(), [
        personalInfoSection(model.personalInfo, pronounLabel, slots, h),
        workHistorySection(model.workHistory, slots, h),
        educationSection(model.education, slots, h),
        skillsSection(model.skills, slots, h),
        coverLetterSection(model.coverLetter, slots, h),
        attachmentsSection(model.attachments, slots, h),
        submissionSection(
          model.submission,
          model.isSubmitAttempted && !isApplicationComplete,
          attentionSteps,
          slots,
          h,
        ),
      ])
    },
  )
  .pipe(Style.attach(ReviewPart.style))
