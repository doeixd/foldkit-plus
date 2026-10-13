import { Option } from 'effect'
import { FieldValidation } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import { type JoinWaitlist, Message, type Model, WaitlistForm, initialModel } from '../src/main.js'

type FormMessage = typeof WaitlistForm.Message.Type

/** What typing `value` into a field sends: the form's own edit, wrapped for the page. */
export const typed = (key: keyof JoinWaitlist, value: string): Message =>
  Message.GotFormMessage({ message: WaitlistForm.Message.Changed({ key, value }) })

/** What submitting the form sends, by the button or by Enter. */
export const submitted: Message = Message.GotFormMessage({
  message: WaitlistForm.Message.Submitted(),
})

/** The initial Model with some fields already in the given states. */
export const withFields = (fields: Partial<Model['form']['fields']>): Model =>
  modifyFields(initialModel, {
    form: form => ({ ...form, fields: { ...form.fields, ...fields } }),
  })

export const validModel: Model = withFields({
  name: FieldValidation.Valid({ value: 'Alice' }),
  email: FieldValidation.Valid({ value: 'alice@example.com' }),
})

/** The form's waitlist check: its Command definition, which Story and Scene match by name. */
export const CheckEmail = WaitlistForm.Check

/** The check's answer for `email`: taken, or free. The form wraps it for the page. */
export const checked = (email: string, error: Option.Option<string>): FormMessage =>
  WaitlistForm.Message.Checked({ key: 'email', draft: email, error: Option.getOrNull(error) })
