import { FieldValidation } from 'foldkit'
import { modifyFields } from 'foldkit/struct'

import {
  type Credentials,
  LoginForm,
  Message,
  type Model,
  initModel,
} from '../src/page/loggedOut/page/login.js'

/** What typing `value` into a field sends: the form's own edit, wrapped for the Login page. */
export const typed = (key: keyof Credentials, value: string): Message =>
  Message.GotFormMessage({ message: LoginForm.Message.Changed({ key, value }) })

/** What submitting the form sends, by the button or by Enter. */
export const submitted: Message = Message.GotFormMessage({ message: LoginForm.Message.Submitted() })

/** The Login page with both fields valid, as upstream's `validModel`. */
export const validLoginModel: Model = modifyFields(initModel(), {
  form: form => ({
    ...form,
    fields: {
      email: FieldValidation.Valid({ value: 'alice@example.com' }),
      password: FieldValidation.Valid({ value: 'password' }),
    },
  }),
})
