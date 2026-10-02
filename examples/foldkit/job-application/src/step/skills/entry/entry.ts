import { RadioGroup } from '@foldkit/ui'
import { Option, Schema } from 'effect'
import { Update } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'

import { ProficiencyLevel } from '../../../domain/index.js'
import * as Validation from '../../validation.js'

// FORM

/** A skill's validated name, labelled by its `title`. */
export const Skill = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Skill' }),
})
export type Skill = typeof Skill.Type

const SkillEntity = Entity.define('Skill', Skill)

export const SkillForm = Form.make('Skill', Entity.input(SkillEntity, Skill), {
  messages: { required: 'Skill name is required' },
})

// MODEL

export const proficiencyRadioGroupId = (entryId: string): string => `${entryId}-proficiency`

export const ProficiencyRadioGroup: RadioGroup.Bundle<ProficiencyLevel.ProficiencyLevel> =
  RadioGroup.create<ProficiencyLevel.ProficiencyLevel>()

export const Model = Schema.Struct({
  id: Schema.String,
  form: SkillForm.bundle.Model,
  proficiency: ProficiencyLevel.ProficiencyLevel,
  proficiencyRadioGroup: RadioGroup.Model,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  GotFormMessage: { message: SkillForm.Message },
  GotProficiencyRadioGroupMessage: { message: RadioGroup.Message },
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
  form: SkillForm.initial,
  proficiency: 'Intermediate',
  proficiencyRadioGroup: RadioGroup.init({
    id: proficiencyRadioGroupId(entryId),
  }),
})

// UPDATE

/** The form placed in the entry. */
const formFold = {
  read: (model: Model) => Option.some(model.form),
  write: (model: Model, form: Model['form']) =>
    form === model.form ? model : modifyFields(model, { form: () => form }),
  toParentMessage: (message: typeof SkillForm.Message.Type) => Message.GotFormMessage({ message }),
  // The application submits every step at once, so nothing sends this form's
  // `Submitted` and it never hands over a value.
  foldOutMessage: () => (model: Model) => ({ model }),
}

const foldForm = Update.foldChild({ update: SkillForm.bundle.update, ...formFold })

const foldProficiencyRadioGroupOutMessage = RadioGroup.OutMessage.match<
  Update.Step<Model, Message>,
  RadioGroup.OutMessage<ProficiencyLevel.ProficiencyLevel>
>({
  Selected:
    ({ value }) =>
    model => ({ model: modifyFields(model, { proficiency: () => value }) }),
})

const foldProficiencyRadioGroup = Update.foldChild({
  update: ProficiencyRadioGroup.update,
  read: (model: Model) => Option.some(model.proficiencyRadioGroup),
  write: (model, nextProficiencyRadioGroup) =>
    modifyFields(model, {
      proficiencyRadioGroup: () => nextProficiencyRadioGroup,
    }),
  toParentMessage: message => Message.GotProficiencyRadioGroupMessage({ message }),
  foldOutMessage: foldProficiencyRadioGroupOutMessage,
})

export const update = (model: Model, message: Message) =>
  Message.match<Update.ReturnWithOutMessage<Model, Message, OutMessage>>(message, {
    GotFormMessage: ({ message }) => foldForm(model, message),

    GotProficiencyRadioGroupMessage: ({ message }) => foldProficiencyRadioGroup(model, message),

    ClickedRemoveSelf: () => ({ model, outMessage: OutMessage.Removed() }),
  })

// VALIDATION SUMMARY

export const hasErrors = (entry: Model): boolean => Validation.hasErrors(entry.form)

export const isComplete = (entry: Model): boolean => SkillForm.isValid(entry.form)

export const revealErrors: Update.Step<Model, Message> = Update.foldChildStep({
  update: Validation.revealErrors(SkillForm),
  ...formFold,
})
