import { DatePicker, Listbox } from '@foldkit/ui'
import { Array, Duration, Effect, Option, Schema } from 'effect'
import { Update } from 'foldkit'
import { CalendarDate } from 'foldkit/calendar'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'

import * as Validation from '../validation.js'

// FORM

/** Foldkit's `Rule.email` pattern. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const PHONE_PATTERN = /^\+?[\d\s()-]{7,}$/

/** Foldkit's `Rule.url` pattern with `requireProtocol: false`. */
const PORTFOLIO_URL_PATTERN = /^(https?:\/\/)?\S+\.\S+$/

/**
 * The applicant's validated details: what the form checks, and each key's
 * label as its `title`. A phone number and a portfolio are optional, so an
 * empty one is left out rather than failing its pattern.
 */
export const Applicant = Schema.Struct({
  firstName: Schema.String.check(
    Schema.isMinLength(2, { message: 'First name must be at least 2 characters' }),
  ).annotate({ title: 'First Name' }),
  lastName: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Last Name' }),
  email: Schema.String.check(
    Schema.isPattern(EMAIL_PATTERN, { message: 'Please enter a valid email address' }),
  ).annotate({ title: 'Email' }),
  phone: Schema.optional(
    Schema.String.check(
      Schema.isPattern(PHONE_PATTERN, { message: 'Please enter a valid phone number' }),
    ),
  ).annotate({ title: 'Phone (optional)' }),
  portfolioUrl: Schema.optional(
    Schema.String.check(
      Schema.isPattern(PORTFOLIO_URL_PATTERN, { message: 'Please enter a valid URL' }),
    ),
  ).annotate({ title: 'Portfolio URL (optional)' }),
})
export type Applicant = typeof Applicant.Type

const ApplicantEntity = Entity.define('Applicant', Applicant)

const FAKE_API_DELAY_MS = 600

const TAKEN_EMAILS = ['admin@foldkit.dev', 'test@example.com', 'demo@foldkit.dev']

const isEmailTaken = (email: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(FAKE_API_DELAY_MS))
    return Array.contains(TAKEN_EMAILS, email.toLowerCase())
  })

/**
 * Each draft and its state, the rules, and the uniqueness check, which runs
 * once the email's own rule passes; an answer for an email since edited is
 * dropped.
 */
export const PersonalInfoForm = Form.make(
  'PersonalInfo',
  Entity.input(ApplicantEntity, Applicant),
  {
    messages: { required: Validation.requiredMessage },
    checks: {
      email: email =>
        Effect.map(isEmailTaken(email), isTaken =>
          isTaken ? 'This email is already in use' : undefined,
        ),
    },
    // Upstream asks at once; its only wait is the fake API's.
    debounce: 0,
  },
)

// MODEL

export const PronounsListbox = Listbox.create<string>()

export const Model = Schema.Struct({
  form: PersonalInfoForm.bundle.Model,
  pronouns: Listbox.Model,
  maybeSelectedPronoun: Schema.Option(Schema.String),
  customPronouns: Schema.String,
  availableDate: DatePicker.Model,
  maybeAvailableDate: Schema.Option(CalendarDate),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  GotFormMessage: { message: PersonalInfoForm.Message },
  GotPronounsMessage: { message: Listbox.Message },
  UpdatedCustomPronouns: { value: Schema.String },
  GotAvailableDateMessage: { message: DatePicker.Message },
})

export type Message = typeof Message.Type

// INIT

export const init = (today: CalendarDate): Model => ({
  form: PersonalInfoForm.initial,
  pronouns: Listbox.init({ id: 'pronouns' }),
  maybeSelectedPronoun: Option.none(),
  customPronouns: '',
  availableDate: DatePicker.init({
    id: 'available-date',
    today,
    minDate: today,
  }),
  maybeAvailableDate: Option.none(),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

/** The form placed in the step. */
const formFold = {
  read: (model: Model) => Option.some(model.form),
  // An unchanged form, such as a dropped check answer, leaves the Model as it was.
  write: (model: Model, form: Model['form']) =>
    form === model.form ? model : modifyFields(model, { form: () => form }),
  toParentMessage: (message: typeof PersonalInfoForm.Message.Type) =>
    Message.GotFormMessage({ message }),
  // The application submits every step at once, so nothing sends this form's
  // `Submitted` and it never hands over a value.
  foldOutMessage: () => (model: Model) => ({ model }),
}

const foldForm = Update.foldChild({ update: PersonalInfoForm.bundle.update, ...formFold })

const foldPronounsOutMessage = Listbox.OutMessage.match<Update.Step<Model, Message>>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        maybeSelectedPronoun: () => Option.some(value),
      }),
    }),
})

const foldPronouns = Update.foldChild({
  update: PronounsListbox.update,
  read: (model: Model) => Option.some(model.pronouns),
  write: (model, nextPronouns) => modifyFields(model, { pronouns: () => nextPronouns }),
  toParentMessage: message => Message.GotPronounsMessage({ message }),
  foldOutMessage: foldPronounsOutMessage,
})

const foldAvailableDateOutMessage = DatePicker.OutMessage.match<Update.Step<Model, Message>>({
  SelectedDate:
    ({ date }) =>
    model => ({
      model: modifyFields(model, {
        maybeAvailableDate: () => Option.some(date),
      }),
    }),
  ClearedDate: () => model => ({
    model: modifyFields(model, { maybeAvailableDate: () => Option.none() }),
  }),
  ChangedViewMonth: () => model => ({ model }),
})

const foldAvailableDate = Update.foldChild({
  update: DatePicker.update,
  read: (model: Model) => Option.some(model.availableDate),
  write: (model, nextAvailableDate) =>
    modifyFields(model, { availableDate: () => nextAvailableDate }),
  toParentMessage: message => Message.GotAvailableDateMessage({ message }),
  foldOutMessage: foldAvailableDateOutMessage,
})

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    GotFormMessage: ({ message }) => foldForm(model, message),

    GotPronounsMessage: ({ message }) => foldPronouns(model, message),

    UpdatedCustomPronouns: ({ value }) => ({
      model: modifyFields(model, { customPronouns: () => value }),
    }),

    GotAvailableDateMessage: ({ message }) => foldAvailableDate(model, message),
  })

// VALIDATION SUMMARY

export const hasErrors = (model: Model): boolean => Validation.hasErrors(model.form)

export const isComplete = (model: Model): boolean => PersonalInfoForm.isValid(model.form)

export const revealErrors: Update.Step<Model, Message> = Update.foldChildStep({
  update: Validation.revealErrors(PersonalInfoForm),
  ...formFold,
})
