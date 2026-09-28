import { Listbox } from '@foldkit/ui'
import { Option, Schema } from 'effect'
import { Update } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'

import * as Validation from '../../validation.js'

// FORM

/** A degree's validated keys, each labelled by its `title`. */
export const Degree = Schema.Struct({
  school: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'School' }),
  degree: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Degree' }),
  fieldOfStudy: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Field of Study' }),
})
export type Degree = typeof Degree.Type

const DegreeEntity = Entity.define('Degree', Degree)

export const DegreeForm = Form.make('Degree', Entity.input(DegreeEntity, Degree), {
  messages: { required: Validation.requiredMessage },
})

// MODEL

export const Model = Schema.Struct({
  id: Schema.String,
  form: DegreeForm.bundle.Model,
  maybeGraduationYear: Schema.Option(Schema.String),
  graduationYearListbox: Listbox.Model,
  isCurrentlyEnrolled: Schema.Boolean,
})
export type Model = typeof Model.Type

export const GraduationYearListbox = Listbox.create<string>()

// MESSAGE

export const Message = defineMessageUnion({
  GotFormMessage: { message: DegreeForm.Message },
  GotGraduationYearListboxMessage: { message: Listbox.Message },
  ToggledCurrentlyEnrolled: { isChecked: Schema.Boolean },
  ClickedRemoveSelf: {},
})

export type Message = typeof Message.Type

// OUT MESSAGE

export const OutMessage = defineMessageUnion({
  Removed: {},
})

export type OutMessage = typeof OutMessage.Type

export type Removed = typeof OutMessage.Removed.Type

// INIT

export const init = (entryId: string): Model => ({
  id: entryId,
  form: DegreeForm.initial,
  maybeGraduationYear: Option.none(),
  graduationYearListbox: Listbox.init({
    id: `${entryId}-graduation-year`,
  }),
  isCurrentlyEnrolled: false,
})

// UPDATE

/** The form placed in the entry. */
const formFold = {
  read: (model: Model) => Option.some(model.form),
  write: (model: Model, form: Model['form']) =>
    form === model.form ? model : modifyFields(model, { form: () => form }),
  toParentMessage: (message: typeof DegreeForm.Message.Type) => Message.GotFormMessage({ message }),
  // The application submits every step at once, so nothing sends this form's
  // `Submitted` and it never hands over a value.
  foldOutMessage: () => (model: Model) => ({ model }),
}

const foldForm = Update.foldChild({ update: DegreeForm.bundle.update, ...formFold })

const foldGraduationYearListboxOutMessage = Listbox.OutMessage.match<Update.Step<Model, Message>>({
  Selected:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        maybeGraduationYear: () => Option.some(value),
      }),
    }),
})

const foldGraduationYearListbox = Update.foldChild({
  update: GraduationYearListbox.update,
  read: (model: Model) => Option.some(model.graduationYearListbox),
  write: (model, nextGraduationYearListbox) =>
    modifyFields(model, {
      graduationYearListbox: () => nextGraduationYearListbox,
    }),
  toParentMessage: message => Message.GotGraduationYearListboxMessage({ message }),
  foldOutMessage: foldGraduationYearListboxOutMessage,
})

export const update = (model: Model, message: Message) =>
  Message.match<Update.ReturnWithOutMessage<Model, Message, OutMessage>>(message, {
    GotFormMessage: ({ message }) => foldForm(model, message),

    GotGraduationYearListboxMessage: ({ message }) => foldGraduationYearListbox(model, message),

    ToggledCurrentlyEnrolled: ({ isChecked }) => ({
      model: modifyFields(model, { isCurrentlyEnrolled: () => isChecked }),
    }),

    ClickedRemoveSelf: () => ({ model, outMessage: OutMessage.Removed() }),
  })

// VALIDATION SUMMARY

export const hasErrors = (entry: Model): boolean => Validation.hasErrors(entry.form)

export const isComplete = (entry: Model): boolean => DegreeForm.isValid(entry.form)

export const revealErrors: Update.Step<Model, Message> = Update.foldChildStep({
  update: Validation.revealErrors(DegreeForm),
  ...formFold,
})
