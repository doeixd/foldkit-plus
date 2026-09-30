import { Array, Duration, Effect, Option, Random, Schema } from 'effect'
import { Command, FieldValidation, Runtime, Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import { Entity } from 'foldkit-entity'
import {
  Form,
  Input as FormInput,
  type Draft,
  type FormControl,
  type Submitted,
} from 'foldkit-form'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { FormView, type FieldOverrideInput } from 'foldkit-mixins-form'
import { Button, Input, Textarea } from 'foldkit-mixins-ui'

import { InputStyle, FormPage, SubmitButtonStyle, TextareaStyle } from './style.js'

const FAKE_API_DELAY_MS = 500

// FORM

/** Foldkit's `Rule.email` pattern, which upstream's email rule checks. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * What joining the waitlist takes, and so what the form checks and submits. A
 * name is optional, as upstream's rules have no `required`: an empty one passes.
 * Each key's `title` is its label, and the `{label}` of the required message.
 */
export const JoinWaitlist = Schema.Struct({
  name: Schema.String.check(
    Schema.makeFilter(
      (name: string) => name === '' || name.length >= 2 || 'Name must be at least 2 characters',
    ),
  ).annotate({ title: 'Name' }),
  email: Schema.String.check(
    Schema.isPattern(EMAIL_PATTERN, { message: 'Please enter a valid email address' }),
  ).annotate({ title: 'Email' }),
  messageText: Schema.String.annotate({ title: "Anything you'd like to share with us?" }),
})
export type JoinWaitlist = typeof JoinWaitlist.Type

/** A form reads its keys through an Entity; a signup is exactly what joining writes. */
const Signup = Entity.define('Signup', JoinWaitlist)

const EMAILS_ON_WAITLIST = ['test@example.com', 'demo@email.com', 'admin@test.com']

const isEmailOnWaitlist = (email: string): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    yield* Effect.sleep(Duration.millis(FAKE_API_DELAY_MS))
    return Array.contains(EMAILS_ON_WAITLIST, email.toLowerCase())
  })

/**
 * The form owns every field's draft and state, the rules, the waitlist check
 * and the submit. The check runs only once the email's own rule passes, and
 * an answer for an email since edited is dropped.
 */
export const WaitlistForm = Form.make('Waitlist', Entity.input(Signup, JoinWaitlist), {
  inputs: { messageText: FormInput.multiline() },
  messages: { required: '{label} is required' },
  checks: {
    email: email =>
      Effect.map(isEmailOnWaitlist(email), isOnWaitlist =>
        isOnWaitlist ? 'This email is already on our waitlist' : undefined,
      ),
  },
  // Upstream asks at once; its only wait is the fake API's.
  debounce: 0,
})

type FieldKey = keyof JoinWaitlist

// MODEL

const Submission = defineTaggedUnion({
  NotSubmitted: {},
  Submitting: {},
  SubmitSuccess: { confirmationText: Schema.String },
  SubmitError: { error: Schema.String },
})

type Submission = typeof Submission.Type

export const Model = Schema.Struct({
  form: WaitlistForm.bundle.Model,
  submission: Submission,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  GotFormMessage: { message: WaitlistForm.Message },
  SucceededSubmitForm: { name: Schema.String },
  FailedSubmitForm: {},
})

export type Message = typeof Message.Type

// INIT

export const initialModel: Model = {
  form: WaitlistForm.initial,
  submission: Submission.NotSubmitted(),
}

export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: initialModel,
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const isSubmitting = (submission: Submission): boolean =>
  Submission.match(submission, {
    NotSubmitted: () => false,
    Submitting: () => true,
    SubmitSuccess: () => false,
    SubmitError: () => false,
  })

/** The form hands over a decoded signup; a second one while the first is in flight is dropped. */
const joinWaitlist =
  ({ value }: Submitted<JoinWaitlist>): Update.Step<Model, Message> =>
  model =>
    isSubmitting(model.submission)
      ? { model }
      : {
          model: modifyFields(model, { submission: () => Submission.Submitting() }),
          commands: [SubmitForm(value)],
        }

const foldForm = Update.foldChild({
  update: WaitlistForm.bundle.update,
  read: (model: Model) => Option.some(model.form),
  // An unchanged form, such as a dropped check answer, leaves the Model as it was.
  write: (model, form) => (form === model.form ? model : modifyFields(model, { form: () => form })),
  toParentMessage: message => Message.GotFormMessage({ message }),
  foldOutMessage: joinWaitlist,
})

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    GotFormMessage: ({ message }) => foldForm(model, message),

    SucceededSubmitForm: ({ name }) => ({
      model: modifyFields(model, {
        submission: () =>
          Submission.SubmitSuccess({
            confirmationText: `Welcome to the waitlist, ${name}! We'll be in touch soon.`,
          }),
      }),
    }),

    FailedSubmitForm: () => ({
      model: modifyFields(model, {
        submission: () =>
          Submission.SubmitError({
            error: 'Sorry, there was an error adding you to the waitlist. Please try again.',
          }),
      }),
    }),
  })

// COMMAND

export const SubmitForm = Command.define('SubmitForm', {
  args: JoinWaitlist.fields,
  messages: [Message.SucceededSubmitForm, Message.FailedSubmitForm],
  execute: ({ name }) =>
    Effect.gen(function* () {
      yield* Effect.sleep(`${FAKE_API_DELAY_MS} millis`)

      const isSuccess = yield* Random.nextBoolean
      if (isSuccess) {
        return Message.SucceededSubmitForm({ name })
      } else {
        return Message.FailedSubmitForm()
      }
    }),
})

// VIEW

type Slots = SlotBuilders<typeof FormPage.slots, Message>
type Field = FieldValidation.Field<Draft>

/**
 * Whether every key is valid as it stands. `engine.value` decodes only then, so
 * a running check keeps the button disabled, as upstream's does; the form's own
 * `canSubmit` would enable it, since a submit made then waits for the check.
 */
const isFormValid = (model: Model): boolean => WaitlistForm.engine.value(model.form) !== undefined

type FormMessage = typeof WaitlistForm.Message.Type

const Fields = FormView.fields(WaitlistForm, {
  attrs: { email: { type: 'email' } },
})

type FieldOverride = (
  input: FieldOverrideInput<FieldKey, FormMessage>,
  h: HtmlBuilder<Message>,
) => Html

const changed = (message: FormMessage): Message => Message.GotFormMessage({ message })

const textOverride =
  (slots: Slots): FieldOverride =>
  (input, h) =>
    Input.field(
      {
        id: input.id,
        label: input.control.label,
        field: input.field,
        changed: value => changed(input.changed(value)),
        type: input.attrs.type ?? 'text',
        placeholder: input.attrs.placeholder,
        style: InputStyle,
        draw: (parts, h) =>
          fieldLayout(
            {
              field: input.field,
              label: parts.label,
              control: parts.control,
              description: parts.description,
            },
            slots,
            h,
          ),
      },
      h,
    )

const textareaOverride =
  (slots: Slots): FieldOverride =>
  (input, h) =>
    Textarea.field(
      {
        id: input.id,
        label: input.control.label,
        field: input.field,
        changed: value => changed(input.changed(value)),
        rows: input.attrs.rows,
        placeholder: input.attrs.placeholder,
        style: TextareaStyle,
        draw: (parts, h) =>
          fieldLayout(
            {
              field: input.field,
              label: parts.label,
              control: parts.control,
              description: parts.description,
            },
            slots,
            h,
          ),
      },
      h,
    )

/** How each key is drawn: the control's kind decides. */
const overrideOf = (control: FormControl<FieldKey>, slots: Slots): FieldOverride => {
  if (control.control.kind === FormInput.Multiline.kind) return textareaOverride(slots)
  if (control.control.kind === FormInput.Text.kind) return textOverride(slots)
  throw new Error(`no override for a "${control.control.kind}" control ("${control.key}")`)
}

const statusMark = (field: Field, slots: Slots, h: HtmlBuilder<Message>): Html =>
  FieldValidation.match(field, {
    onNotValidated: () => h.empty,
    onValidating: () => h.span(slots.checkingMark.attrs(), ['◐']),
    onValid: () => h.span(slots.validMark.attrs(), ['✓']),
    onInvalid: () => h.empty,
  })

interface FieldParts {
  readonly field: Field
  readonly label: Html
  readonly control: Html
  readonly description: Html
}

const fieldLayout = (parts: FieldParts, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.field.attrs(), [
    h.div(slots.fieldHeader.attrs(), [parts.label, statusMark(parts.field, slots, h)]),
    parts.control,
    parts.description,
  ])

const submitButton = (model: Model, h: HtmlBuilder<Message>): Html =>
  Button.view(
    {
      label: isSubmitting(model.submission) ? 'Joining...' : 'Join Waitlist',
      style: SubmitButtonStyle,
      type: 'submit',
      disabled: !isFormValid(model) || isSubmitting(model.submission),
    },
    h,
  )

export const Page = SlotView.forMessages<Message>()
  .define(FormPage.slots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      h.div(slots.card.attrs(), [
        h.h1(slots.title.attrs(), ['Join Our Waitlist']),

        h.form(
          slots.form.attrs([
            h.OnSubmit(Message.GotFormMessage({ message: WaitlistForm.Message.Submitted() })),
          ]),
          [
            ...WaitlistForm.controls.map(control =>
              Fields.field(control, model.form, control.key, h, overrideOf(control, slots)),
            ),
            submitButton(model, h),
          ],
        ),

        Submission.match(model.submission, {
          NotSubmitted: () => h.empty,
          Submitting: () => h.empty,
          SubmitSuccess: ({ confirmationText }) =>
            h.div(slots.success.attrs([h.Role('status')]), [confirmationText]),
          SubmitError: ({ error }) => h.div(slots.failure.attrs([h.Role('alert')]), [error]),
        }),
      ]),
    ]),
  )
  .pipe(Style.attach(FormPage.style))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Foldkit Form Example',
  body: Page(model, h),
})
