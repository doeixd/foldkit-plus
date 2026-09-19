/**
 * Every word the packages say for this application, in one place. The three
 * shapes share no key, so one object is all of them: a form's validation words,
 * the drawn form's buttons, and the drawn list's states. Translating the
 * application is replacing this file. They are text with blanks, not functions,
 * so the same object goes to `Form.make` and into a placed view's inputs.
 */
import type { FormMessages } from 'foldkit-form'
import type { ViewWords } from 'foldkit-mixins-crud'
import type { FormViewWords } from 'foldkit-mixins-form'

export const words = {
  // foldkit-form
  required: '{label} is required',
  // foldkit-mixins-form
  submit: 'Save',
  search: 'Find',
  // foldkit-mixins-crud
  yes: 'yes',
  no: 'no',
  loading: 'Loading posts…',
  empty: 'No posts.',
} satisfies FormMessages & FormViewWords & ViewWords
