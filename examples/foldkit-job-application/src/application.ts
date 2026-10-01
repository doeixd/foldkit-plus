/**
 * What an accepted submit sends: the decoded forms beside the choices and
 * files the forms do not own. Read once, at the moment Submit is accepted, so
 * edits made while the request is in flight change the Model and not what was
 * sent. A browser `File` goes as its metadata; the file itself stays at the
 * boundary that uploads it.
 */
import { Array, Option, Schema } from 'effect'
import { File } from 'foldkit'
import { CalendarDate } from 'foldkit/calendar'

import { ProficiencyLevel } from './domain/index.js'
import type { Model } from './model.js'
import { Education, PersonalInfo, Skills, WorkHistory } from './step/index.js'

/** A selected file as the request carries it. */
export const FileRef = Schema.Struct({
  name: Schema.String,
  size: Schema.Number,
  mimeType: Schema.String,
})
export type FileRef = typeof FileRef.Type

const fileRef = (file: File.File): FileRef => ({
  name: File.name(file),
  size: File.size(file),
  mimeType: File.mimeType(file),
})

/** One work entry: the form's keys beside the dates and description around it. */
export const WorkEntry = Schema.Struct({
  ...WorkHistory.Entry.Position.fields,
  startDate: Schema.OptionFromNullOr(CalendarDate),
  endDate: Schema.OptionFromNullOr(CalendarDate),
  isCurrentlyEmployed: Schema.Boolean,
  description: Schema.String,
})
export type WorkEntry = typeof WorkEntry.Type

/** One degree: the form's keys beside the graduation year and enrollment beside it. */
export const EducationEntry = Schema.Struct({
  ...Education.Entry.Degree.fields,
  graduationYear: Schema.OptionFromNullOr(Schema.String),
  isCurrentlyEnrolled: Schema.Boolean,
})
export type EducationEntry = typeof EducationEntry.Type

/** One skill: the form's key beside the proficiency the pill chose. */
export const SkillEntry = Schema.Struct({
  ...Skills.Entry.Skill.fields,
  proficiency: ProficiencyLevel.ProficiencyLevel,
})
export type SkillEntry = typeof SkillEntry.Type

/** Everything one application is, as the request takes it. */
export const ApplicationPayload = Schema.Struct({
  applicant: PersonalInfo.Applicant,
  pronouns: Schema.OptionFromNullOr(Schema.String),
  customPronouns: Schema.String,
  availableDate: Schema.OptionFromNullOr(CalendarDate),
  workHistory: Schema.Array(WorkEntry),
  education: Schema.Array(EducationEntry),
  skills: Schema.Array(SkillEntry),
  coverLetter: Schema.String,
  resume: Schema.OptionFromNullOr(FileRef),
  additionalFiles: Schema.Array(FileRef),
})
export type ApplicationPayload = typeof ApplicationPayload.Type

/** One entry per row, or `None` while any row is incomplete (or the list is empty). */
const entriesOf = <Entry, Value>(
  entries: ReadonlyArray<Entry>,
  valueOf: (entry: Entry) => Option.Option<Value>,
): Option.Option<ReadonlyArray<Value>> =>
  Array.isReadonlyArrayNonEmpty(entries) ? Option.all(Array.map(entries, valueOf)) : Option.none()

/**
 * The application as one payload, or `None` while anything is missing. A
 * submit reveals what was not validated yet and then reads this, so its
 * `Some` is the completeness check: there is no second notion of "ready".
 */
export const applicationPayload = (model: Model): Option.Option<ApplicationPayload> =>
  Option.map(
    Option.all({
      applicant: PersonalInfo.PersonalInfoForm.value(model.personalInfo.form),
      workHistory: entriesOf(model.workHistory.entries, entry =>
        Option.map(WorkHistory.Entry.PositionForm.value(entry.form), position => ({
          ...position,
          startDate: entry.maybeStartDate,
          endDate: entry.maybeEndDate,
          isCurrentlyEmployed: entry.isCurrentlyEmployed,
          description: entry.description,
        })),
      ),
      education: entriesOf(model.education.entries, entry =>
        Option.map(Education.Entry.DegreeForm.value(entry.form), degree => ({
          ...degree,
          graduationYear: entry.maybeGraduationYear,
          isCurrentlyEnrolled: entry.isCurrentlyEnrolled,
        })),
      ),
      skills: entriesOf(model.skills.entries, entry =>
        Option.map(Skills.Entry.SkillForm.value(entry.form), skill => ({
          ...skill,
          proficiency: entry.proficiency,
        })),
      ),
    }),
    ({ applicant, workHistory, education, skills }) => ({
      applicant,
      pronouns: model.personalInfo.maybeSelectedPronoun,
      customPronouns: model.personalInfo.customPronouns,
      availableDate: model.personalInfo.maybeAvailableDate,
      workHistory,
      education,
      skills,
      coverLetter: model.coverLetter.content,
      resume: Option.map(model.attachments.maybeResume, fileRef),
      additionalFiles: Array.map(model.attachments.additionalFiles, fileRef),
    }),
  )
