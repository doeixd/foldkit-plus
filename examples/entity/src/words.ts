/**
 * Every word the packages say for this application, in one place. The three
 * shapes share no key, so one object is all of them: a form's validation words,
 * the drawn form's buttons, and the drawn list's states. Translating the
 * application is replacing this file. They are text with blanks, not functions,
 * so the same object goes to `Form.make` and into a placed view's inputs.
 */
import type { FormMessages } from 'foldkit-form'
import type { ConfirmWords, EditorWords, ViewWords } from 'foldkit-mixins-crud'
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

/** What the editor says in its states: its own words, which share keys with a list's. */
export const editorWords = {
  loading: 'Loading…',
  notFound: 'That post does not exist.',
  loadFailed: 'The post could not be read.',
} satisfies EditorWords

/** What the delete question says. */
export const confirmWords = {
  confirm: 'Yes, delete',
  cancel: 'No',
} satisfies ConfirmWords
