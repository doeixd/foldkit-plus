import { Array, Equal, Option, Order, Record, String, pipe } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'

import type { Message } from '../message.js'
import type { Model } from '../model.js'
import type { Education, Skills, WorkHistory } from '../step/index.js'
import { PreviewPart } from '../style.js'
import { employmentRange } from './format.js'

type Slots = SlotBuilders<typeof PreviewPart.slots, Message>

const COVER_LETTER_PREVIEW_MAX_CHARS = 200

const truncate = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}...` : value

const sectionHeading = (title: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.h3(slots.sectionHeading.attrs(), [title])

const headerSection = (
  fullName: string,
  pronounLabel: string,
  email: string,
  phone: string,
  portfolio: string,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const contacts = Array.filter([email, phone, portfolio], String.isNonEmpty)
  return h.div(slots.header.attrs(), [
    h.h2(slots.name.attrs(), [fullName]),
    ...(String.isNonEmpty(pronounLabel) ? [h.p(slots.pronouns.attrs(), [pronounLabel])] : []),
    ...(Array.isReadonlyArrayNonEmpty(contacts)
      ? [h.p(slots.contacts.attrs(), [contacts.join(' · ')])]
      : []),
  ])
}

const hasPosition = (entry: WorkHistory.Entry.Model): boolean =>
  String.isNonEmpty(entry.form.fields.company.value) ||
  String.isNonEmpty(entry.form.fields.title.value)

const workEntryView = (
  entry: WorkHistory.Entry.Model,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const { company, title } = entry.form.fields
  return h.keyed('div')(`work-${entry.id}`, slots.entry.attrs(), [
    ...(String.isNonEmpty(title.value) ? [h.strong(slots.entryTitle.attrs(), [title.value])] : []),
    ...(String.isNonEmpty(company.value) ? [h.p(slots.entryText.attrs(), [company.value])] : []),
    ...Option.match(entry.maybeStartDate, {
      onNone: () => [],
      onSome: start => [
        h.p(slots.entryMeta.attrs(), [
          employmentRange(start, entry.isCurrentlyEmployed, entry.maybeEndDate),
        ]),
      ],
    }),
    ...(String.isNonEmpty(entry.description)
      ? [h.p(slots.entryDescription.attrs(), [entry.description])]
      : []),
  ])
}

const experienceSection = (
  workHistory: WorkHistory.Model,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(slots.section.attrs(), [
    sectionHeading('Experience', slots, h),
    ...Array.filter(workHistory.entries, hasPosition).map(entry => workEntryView(entry, slots, h)),
  ])

const educationTimelineLine = (
  entry: Education.Entry.Model,
  slots: Slots,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => {
  if (entry.isCurrentlyEnrolled) {
    return [h.p(slots.entryMeta.attrs(), ['Currently enrolled'])]
  }
  return Option.match(entry.maybeGraduationYear, {
    onNone: () => [],
    onSome: graduationYear => [h.p(slots.entryMeta.attrs(), [`Class of ${graduationYear}`])],
  })
}

const hasSchool = (entry: Education.Entry.Model): boolean =>
  String.isNonEmpty(entry.form.fields.school.value)

const educationEntryView = (
  entry: Education.Entry.Model,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const { school, degree, fieldOfStudy } = entry.form.fields
  const degreeLine = Array.filter([degree.value, fieldOfStudy.value], String.isNonEmpty).join(', ')
  return h.keyed('div')(`education-${entry.id}`, slots.entry.attrs(), [
    ...(String.isNonEmpty(degreeLine) ? [h.strong(slots.entryTitle.attrs(), [degreeLine])] : []),
    ...(String.isNonEmpty(school.value) ? [h.p(slots.entryText.attrs(), [school.value])] : []),
    ...educationTimelineLine(entry, slots, h),
  ])
}

const educationSection = (
  education: Education.Model,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.section(slots.section.attrs(), [
    sectionHeading('Education', slots, h),
    ...Array.filter(education.entries, hasSchool).map(entry => educationEntryView(entry, slots, h)),
  ])

type SkillGroup = Readonly<{ level: string; names: ReadonlyArray<string> }>

const PROFICIENCY_ORDER = ['Expert', 'Advanced', 'Intermediate', 'Beginner']

const proficiencyRank = (level: string): number =>
  pipe(
    PROFICIENCY_ORDER,
    Array.findFirstIndex(Equal.equals(level)),
    Option.getOrElse(() => PROFICIENCY_ORDER.length),
  )

const proficiencyOrder = Order.mapInput(Order.Number, ([level]: readonly [string, unknown]) =>
  proficiencyRank(level),
)

const hasSkillName = (entry: Skills.Entry.Model): boolean =>
  String.isNonEmpty(entry.form.fields.name.value)

const groupSkillsByProficiency = (
  entries: ReadonlyArray<Skills.Entry.Model>,
): ReadonlyArray<SkillGroup> =>
  pipe(
    entries,
    Array.filter(hasSkillName),
    Array.groupBy<Skills.Entry.Model, string>(entry => entry.proficiency),
    Record.toEntries,
    Array.sort(proficiencyOrder),
    Array.map(([level, grouped]) => ({
      level,
      names: Array.map(grouped, entry => entry.form.fields.name.value),
    })),
  )

const skillGroupView = (group: SkillGroup, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.p(slots.skillGroup.attrs(), [
    h.strong(slots.skillLevel.attrs(), [`${group.level}:`]),
    ` ${group.names.join(', ')}`,
  ])

const skillsSection = (skills: Skills.Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.section(slots.section.attrs(), [
    sectionHeading('Skills', slots, h),
    ...groupSkillsByProficiency(skills.entries).map(group => skillGroupView(group, slots, h)),
  ])

const coverLetterSection = (content: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.section(slots.lastSection.attrs(), [
    sectionHeading('Cover Letter', slots, h),
    h.p(slots.letter.attrs(), [truncate(content, COVER_LETTER_PREVIEW_MAX_CHARS)]),
  ])

/** The application as a resume, built as it is filled in. */
export const Preview = SlotView.forMessages<Message>()
  .define(PreviewPart.slots, (model: Model, slots, h) => {
    const { personalInfo, workHistory, education, skills, coverLetter } = model
    const { fields } = personalInfo.form
    const firstName = fields.firstName.value
    const lastName = fields.lastName.value

    const fullName =
      String.isNonEmpty(firstName) || String.isNonEmpty(lastName)
        ? `${firstName} ${lastName}`.trim()
        : 'Your Name'

    const pronounLabel = Option.match(personalInfo.maybeSelectedPronoun, {
      onNone: () => '',
      onSome: value => (value === 'Other' ? personalInfo.customPronouns : value),
    })

    return h.div(slots.preview.attrs(), [
      headerSection(
        fullName,
        pronounLabel,
        fields.email.value,
        fields.phone.value,
        fields.portfolioUrl.value,
        slots,
        h,
      ),
      ...(Array.some(workHistory.entries, hasPosition)
        ? [experienceSection(workHistory, slots, h)]
        : []),
      ...(Array.some(education.entries, hasSchool) ? [educationSection(education, slots, h)] : []),
      ...(Array.some(skills.entries, hasSkillName) ? [skillsSection(skills, slots, h)] : []),
      ...(String.isNonEmpty(coverLetter.content)
        ? [coverLetterSection(coverLetter.content, slots, h)]
        : []),
    ])
  })
  .pipe(Style.attach(PreviewPart.style))
