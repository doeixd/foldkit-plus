import { DatePicker } from '@foldkit/ui'
import { Option, Schema } from 'effect'
import { Update } from 'foldkit'
import { CalendarDate } from 'foldkit/calendar'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'

import * as Validation from '../../validation.js'

// FORM

/** A position's validated keys, each labelled by its `title`. */
export const Position = Schema.Struct({
  company: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Company' }),
  title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Job Title' }),
})
export type Position = typeof Position.Type

const PositionEntity = Entity.define('Position', Position)

export const PositionForm = Form.make('Position', Entity.input(PositionEntity, Position), {
  messages: { required: Validation.requiredMessage },
})

// MODEL

export const Model = Schema.Struct({
  id: Schema.String,
  form: PositionForm.bundle.Model,
  startDate: DatePicker.Model,
  maybeStartDate: Schema.Option(CalendarDate),
  endDate: DatePicker.Model,
  maybeEndDate: Schema.Option(CalendarDate),
  isCurrentlyEmployed: Schema.Boolean,
  description: Schema.String,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  GotFormMessage: { message: PositionForm.Message },
  GotStartDateMessage: { message: DatePicker.Message },
  GotEndDateMessage: { message: DatePicker.Message },
  ToggledCurrentlyEmployed: { isChecked: Schema.Boolean },
  UpdatedDescription: { value: Schema.String },
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

export const init = (entryId: string, today: CalendarDate): Model => ({
  id: entryId,
  form: PositionForm.initial,
  startDate: DatePicker.init({ id: `${entryId}-start`, today }),
  maybeStartDate: Option.none(),
  endDate: DatePicker.init({ id: `${entryId}-end`, today }),
  maybeEndDate: Option.none(),
  isCurrentlyEmployed: false,
  description: '',
})

// UPDATE

/** The form placed in the entry. */
const formFold = {
  read: (model: Model) => Option.some(model.form),
  write: (model: Model, form: Model['form']) =>
    form === model.form ? model : modifyFields(model, { form: () => form }),
  toParentMessage: (message: typeof PositionForm.Message.Type) =>
    Message.GotFormMessage({ message }),
  // The application submits every step at once, so nothing sends this form's
  // `Submitted` and it never hands over a value.
  foldOutMessage: () => (model: Model) => ({ model }),
}

const foldForm = Update.foldChild({ update: PositionForm.bundle.update, ...formFold })

const foldStartDateOutMessage = DatePicker.OutMessage.match<Update.Step<Model, Message>>({
  ChangedViewMonth: () => model => ({ model }),
  SelectedDate:
    ({ date }) =>
    model => ({
      model: modifyFields(model, {
        maybeStartDate: () => Option.some(date),
        endDate: DatePicker.reflectMinDate(Option.some(date)),
      }),
    }),
  ClearedDate: () => model => ({
    model: modifyFields(model, {
      maybeStartDate: () => Option.none(),
      endDate: DatePicker.reflectMinDate(Option.none()),
    }),
  }),
})

const foldStartDate = Update.foldChild({
  update: DatePicker.update,
  read: (model: Model) => Option.some(model.startDate),
  write: (model, nextStartDate) => modifyFields(model, { startDate: () => nextStartDate }),
  toParentMessage: message => Message.GotStartDateMessage({ message }),
  foldOutMessage: foldStartDateOutMessage,
})

const foldEndDateOutMessage = DatePicker.OutMessage.match<Update.Step<Model, Message>>({
  ChangedViewMonth: () => model => ({ model }),
  SelectedDate:
    ({ date }) =>
    model => ({
      model: modifyFields(model, {
        maybeEndDate: () => Option.some(date),
        startDate: DatePicker.reflectMaxDate(Option.some(date)),
      }),
    }),
  ClearedDate: () => model => ({
    model: modifyFields(model, {
      maybeEndDate: () => Option.none(),
      startDate: DatePicker.reflectMaxDate(Option.none()),
    }),
  }),
})

const foldEndDate = Update.foldChild({
  update: DatePicker.update,
  read: (model: Model) => Option.some(model.endDate),
  write: (model, nextEndDate) => modifyFields(model, { endDate: () => nextEndDate }),
  toParentMessage: message => Message.GotEndDateMessage({ message }),
  foldOutMessage: foldEndDateOutMessage,
})

export const update = (model: Model, message: Message) =>
  Message.match<Update.ReturnWithOutMessage<Model, Message, OutMessage>>(message, {
    GotFormMessage: ({ message }) => foldForm(model, message),

    GotStartDateMessage: ({ message }) => foldStartDate(model, message),

    GotEndDateMessage: ({ message }) => foldEndDate(model, message),

    ToggledCurrentlyEmployed: ({ isChecked }) => ({
      model: modifyFields(model, { isCurrentlyEmployed: () => isChecked }),
    }),

    UpdatedDescription: ({ value }) => ({
      model: modifyFields(model, { description: () => value }),
    }),

    ClickedRemoveSelf: () => ({ model, outMessage: OutMessage.Removed() }),
  })

// VALIDATION SUMMARY

export const hasErrors = (entry: Model): boolean => Validation.hasErrors(entry.form)

export const isComplete = (entry: Model): boolean => PositionForm.isValid(entry.form)

export const revealErrors: Update.Step<Model, Message> = Update.foldChildStep({
  update: Validation.revealErrors(PositionForm),
  ...formFold,
})
