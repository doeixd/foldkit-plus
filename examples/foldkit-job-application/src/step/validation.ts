import { Array, Equal, Option, Record, String } from 'effect'
import { FieldValidation, Update } from 'foldkit'
import type { MessageField } from 'foldkit-form'

/** What a step's form needs for the application to read and reveal it. */
interface StepForm<Model, Message, Key extends string> {
  readonly controls: ReadonlyArray<{ readonly key: Key }>
  readonly Message: { readonly Blurred: (args: { readonly key: Key }) => Message }
  readonly bundle: {
    readonly update: (
      model: Model,
      message: Message,
      args: void,
    ) => Update.ReturnWithOutMessage<Model, Message, unknown>
  }
  readonly engine: { readonly value: (model: Model) => unknown }
}

/**
 * Upstream's required words: the label in sentence case, so "First Name" is
 * required as "First name is required".
 */
export const requiredMessage = ({ label }: MessageField): string =>
  `${String.capitalize(label.toLowerCase())} is required`

/**
 * Every draft not validated yet is, so a submit shows what is missing. The form
 * validates a key on `Blurred` only while it is `NotValidated`, as upstream's
 * `revealFieldErrors` did, so a valid or checked draft is left as it is. A
 * well-formed email not yet checked is asked about, rather than taken as valid.
 */
export const revealErrors =
  <Model, Message, Key extends string>(form: StepForm<Model, Message, Key>) =>
  (model: Model): Update.Return<Model, Message> =>
    Update.combine(
      model,
      Array.map(form.controls, ({ key }) => (current: Model) => {
        // `Blurred` hands over nothing: only a submit does.
        const { model: next, commands = [] } = form.bundle.update(
          current,
          form.Message.Blurred({ key }),
          undefined,
        )
        // The form validates an empty optional key again into an equal copy,
        // and Foldkit redraws for a new Model.
        return { model: Equal.equals(next, current) ? current : next, commands }
      }),
    )

/** Every key valid as it stands, a running check included as not yet. */
export const isComplete =
  <Model, Message, Key extends string>(form: StepForm<Model, Message, Key>) =>
  (model: Model): boolean =>
    Option.isSome(Option.fromUndefinedOr(form.engine.value(model)))

/** Some key shows an error. */
export const hasErrors = (form: {
  readonly fields: Readonly<Record<string, FieldValidation.Field<unknown>>>
}): boolean => FieldValidation.anyInvalid(Record.values(form.fields))
