import { Record, String } from 'effect'
import { FieldValidation, Update } from 'foldkit'
import type { MessageField } from 'foldkit-form'

/** What a step's form needs for the application to reveal its errors. */
interface StepForm<Model, Message> {
  readonly Message: { readonly ValidatedAll: () => Message }
  readonly bundle: {
    readonly update: (
      model: Model,
      message: Message,
      args: void,
    ) => Update.ReturnWithOutMessage<Model, Message, unknown>
  }
}

/**
 * Upstream's required words: the label in sentence case, so "First Name" is
 * required as "First name is required".
 */
export const requiredMessage = ({ label }: MessageField): string =>
  `${String.capitalize(label.toLowerCase())} is required`

/**
 * Every draft not validated yet is, so a submit shows what is missing, and a
 * valid or checked draft is left as it is, as upstream's `revealFieldErrors`
 * did. A well-formed email not yet checked is asked about, rather than taken
 * as valid. The form's `ValidatedAll` hands over nothing: only a submit does.
 */
export const revealErrors =
  <Model, Message>(form: StepForm<Model, Message>) =>
  (model: Model): Update.Return<Model, Message> => {
    const { model: next, commands = [] } = form.bundle.update(
      model,
      form.Message.ValidatedAll(),
      undefined,
    )
    return { model: next, commands }
  }

/** Some key shows an error. */
export const hasErrors = (form: {
  readonly fields: Readonly<Record<string, FieldValidation.Field<unknown>>>
}): boolean => FieldValidation.anyInvalid(Record.values(form.fields))
