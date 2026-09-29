/**
 * What `Input.field` and `Textarea.field` share: a text field's description
 * from its validation state, and the parts a custom `draw` places. (The
 * `Field` recipe styles in `recipes/` are the look; this is the wiring.)
 */
import { Array, Option } from 'effect'
import { FieldValidation } from 'foldkit'
import type { Html } from 'foldkit/html'

/** A labelled field's pieces, drawn: the label, the control, and its description. */
export interface FieldParts {
  readonly label: Html
  readonly control: Html
  readonly description: Html
}

/** What a text field says under itself: its first error, or that it is being checked. */
export const descriptionOf = (field: FieldValidation.Field<unknown>): Option.Option<string> =>
  FieldValidation.match(field, {
    onNotValidated: () => Option.none(),
    onValidating: () => Option.some('Checking…'),
    onValid: () => Option.none(),
    onInvalid: ({ errors }) => Array.head(errors),
  })
