import * as UiButton from '@foldkit/ui/button'
import * as UiInput from '@foldkit/ui/input'
import { Array, Duration, Effect, Option, Schema, String, pipe } from 'effect'
import { Command, FieldValidation, Submodel, Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Entity } from 'foldkit-entity'
import { Form, type FormControl, type Submitted } from 'foldkit-form'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button, Input } from 'foldkit-mixins-ui'

import { Session } from '../../../domain/session.js'
import { homeRouter } from '../../../route.js'
import { LoginInputStyle, LoginSlots, LoginStyle, SubmitButtonStyle } from '../../../style.js'

// FORM

/** Foldkit's `Rule.email` pattern, which upstream's email rule checks. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * What signing in takes, and so what the form checks and submits. Each key's
 * `title` is its label and the `{label}` of the required message; a password
 * is required by being at least one character.
 */
export const Credentials = Schema.Struct({
  email: Schema.String.check(
    Schema.isPattern(EMAIL_PATTERN, { message: 'Please enter a valid email' }),
  ).annotate({ title: 'Email' }),
  password: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Password' }),
})
export type Credentials = typeof Credentials.Type

/** A form reads its keys through an Entity; credentials are exactly what signing in takes. */
const CredentialsEntity = Entity.define('Credentials', Credentials)

/** Each draft, its validation state, and the decoded credentials once both keys are valid. */
export const LoginForm = Form.make('Login', Entity.input(CredentialsEntity, Credentials), {
  messages: { required: '{label} is required' },
})

// MODEL

export const Model = Schema.Struct({
  form: LoginForm.bundle.Model,
  isSubmitting: Schema.Boolean,
})

export type Model = typeof Model.Type

export const initModel = (): Model => ({
  form: LoginForm.initial,
  isSubmitting: false,
})

// MESSAGE

export const Message = defineMessageUnion({
  GotFormMessage: { message: LoginForm.Message },
  SucceededSimulateAuthRequest: { session: Session },
  FailedSimulateAuthRequest: { error: Schema.String },
})

export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = defineMessageUnion({
  SucceededLogin: { session: Session },
})

export type OutMessage = typeof OutMessage.Type

// UPDATE

export const SimulateAuthRequest = Command.define('SimulateAuthRequest', {
  args: { email: Schema.String, password: Schema.String },
  messages: [Message.SucceededSimulateAuthRequest, Message.FailedSimulateAuthRequest],
  execute: ({ email, password }) =>
    Effect.gen(function* () {
      yield* Effect.sleep(Duration.seconds(1))

      if (password !== 'password') {
        return Message.FailedSimulateAuthRequest({
          error: 'Invalid credentials',
        })
      }

      const name = pipe(
        email,
        String.split('@'),
        Array.head,
        Option.getOrElse(() => email),
      )

      const session: Session = { userId: '1', email, name }

      return Message.SucceededSimulateAuthRequest({ session })
    }),
})

/** The form hands over decoded credentials; a second submit while the first is in flight is dropped. */
const requestAuth =
  ({ value }: Submitted<Credentials>): Update.Step<Model, Message> =>
  model =>
    model.isSubmitting
      ? { model }
      : {
          model: modifyFields(model, { isSubmitting: () => true }),
          commands: [SimulateAuthRequest(value)],
        }

const foldForm = Update.foldChild({
  update: LoginForm.bundle.update,
  read: (model: Model) => Option.some(model.form),
  write: (model, form) => modifyFields(model, { form: () => form }),
  toParentMessage: message => Message.GotFormMessage({ message }),
  foldOutMessage: requestAuth,
})

export const update = (model: Model, message: Message) =>
  Message.match<Update.ReturnWithOutMessage<Model, Message, OutMessage>>(message, {
    GotFormMessage: ({ message }) => foldForm(model, message),

    SucceededSimulateAuthRequest: ({ session }) => ({
      model,
      outMessage: OutMessage.SucceededLogin({ session }),
    }),

    // The form marks the password invalid with the reason, keeping what was
    // typed, until it is edited again.
    FailedSimulateAuthRequest: ({ error }) =>
      foldForm(
        modifyFields(model, { isSubmitting: () => false }),
        LoginForm.Message.Refused({ key: 'password', error }),
      ),
  })

// VIEW

type Slots = SlotBuilders<typeof LoginSlots, Message>
type Field = FieldValidation.Field<string>
type FieldKey = keyof Credentials

const canSubmit = (model: Model): boolean => LoginForm.canSubmit(model.form) && !model.isSubmitting

/** What upstream draws per key beyond what the form describes. */
const inputByKey: {
  readonly [K in FieldKey]: { readonly type: 'email' | 'password'; readonly placeholder: string }
} = {
  email: { type: 'email', placeholder: 'you@example.com' },
  password: { type: 'password', placeholder: 'Enter your password' },
}

const fieldView = (
  control: FormControl<FieldKey>,
  field: Field,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  UiInput.view(
    {
      id: control.key,
      type: inputByKey[control.key].type,
      value: field.value,
      placeholder: inputByKey[control.key].placeholder,
      onInput: value =>
        Message.GotFormMessage({ message: LoginForm.Message.Changed({ key: control.key, value }) }),
      isInvalid: FieldValidation.isInvalid(field),
      hasDescription: FieldValidation.isInvalid(field),
      toView: attributes => {
        const resolved = Input.resolve<Field, Message>(attributes, [LoginInputStyle.mixin], {
          input: field,
          h,
        })
        return h.div(slots.field.attrs(), [
          h.div(slots.fieldHeader.attrs(), [
            h.label(resolved.label, [control.label]),
            FieldValidation.match(field, {
              onNotValidated: () => h.empty,
              onValidating: () => h.empty,
              onValid: () => h.span(slots.validMark.attrs(), ['✓']),
              onInvalid: () => h.empty,
            }),
          ]),
          h.input(resolved.input),
          FieldValidation.match(field, {
            onNotValidated: () => h.empty,
            onValidating: () => h.empty,
            onValid: () => h.empty,
            onInvalid: ({ errors }) => h.div(resolved.description, [Array.headNonEmpty(errors)]),
          }),
        ])
      },
    },
    h,
  )

const submitButton = (model: Model, h: HtmlBuilder<Message>): Html =>
  UiButton.view(
    {
      type: 'submit',
      isDisabled: !canSubmit(model),
      toView: attributes =>
        h.button(
          Button.resolve<undefined, Message>(attributes, [SubmitButtonStyle.mixin], {
            input: undefined,
            h,
          }).button,
          [model.isSubmitting ? 'Signing in...' : 'Sign In'],
        ),
    },
    h,
  )

/** The page, drawn through its own Slots: `h` here is the Submodel's, typed by Login's Message. */
export const LoginPage = SlotView.forMessages<Message>()
  .define(LoginSlots, (model: Model, slots, h) =>
    h.div(slots.content.attrs(), [
      h.div(slots.card.attrs(), [
        h.h1(slots.heading.attrs(), ['Sign In']),
        h.div(slots.hint.attrs(), [
          h.p(slots.hintText.attrs(), ['Hint: Use any email with password "password"']),
        ]),
        h.form(
          slots.form.attrs([
            h.OnSubmit(Message.GotFormMessage({ message: LoginForm.Message.Submitted() })),
          ]),
          [
            ...Array.map(LoginForm.controls, control =>
              fieldView(control, model.form.fields[control.key], slots, h),
            ),
            submitButton(model, h),
          ],
        ),
        h.div(slots.footer.attrs(), [
          h.span(slots.footerText.attrs(), ['Back to ']),
          h.a(slots.homeLink.attrs([h.Href(homeRouter())]), ['Home']),
        ]),
      ]),
    ]),
  )
  .pipe(Style.attach(LoginStyle))

export const view = Submodel.defineView<Model, Message>(LoginPage)
