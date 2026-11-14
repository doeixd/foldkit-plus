/**
 * What `Input.field` and `Textarea.field` share: a text field's description
 * from its validation state, and the parts a custom `draw` places. (The
 * `Field` recipe styles in `recipes/` are the look; this is the wiring.)
 */
import { Array, Option } from 'effect'
import { FieldValidation } from 'foldkit'
import type { SlotAttributes } from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'

/** A labelled field's pieces, drawn: the label, the control, and its description. */
export interface FieldParts {
  readonly label: Html
  readonly control: Html
  readonly description: Html
}

/**
 * What typing into a field sends: a closure from the text to a Message, or
 * the `OnInput` attribute the view's builder makes. The attribute is for a
 * builder whose `OnInput` takes more than a closure: `foldkit-ssr`'s resumable
 * builder takes a Message member (`rh.OnInput(Message.ChangedEmail)`) and
 * names it in the server's markup, which a closure cannot be.
 */
export type OnInput<Message> =
  | ((value: string) => Message)
  | Extract<Attribute<Message>, { readonly _tag: 'OnInput' }>

/** The field's `OnInput` attribute, built by `h` from a closure or passed through as given. */
export const onInputOf = <Message>(h: HtmlBuilder<Message>, onInput: OnInput<Message>) =>
  typeof onInput === 'function' ? h.OnInput(onInput) : onInput

/**
 * The region a field's description or error is spoken from. A live region
 * announces only what is put into it, so it is drawn even with nothing to
 * say, as `TagsInput`'s `message` and `PasswordInput`'s Caps Lock hint are.
 */
export const statusOf = <Message>(
  h: HtmlBuilder<Message>,
  attributes: SlotAttributes<Message>,
  text: Option.Option<string>,
): Html => h.span([...attributes, h.Role('status')], Option.toArray(text))

/** What a text field says under itself: its first error, or that it is being checked. */
export const descriptionOf = (field: FieldValidation.Field<unknown>): Option.Option<string> =>
  FieldValidation.match(field, {
    onNotValidated: () => Option.none(),
    onValidating: () => Option.some('Checking…'),
    onValid: () => Option.none(),
    onInvalid: ({ errors }) => Array.head(errors),
  })
