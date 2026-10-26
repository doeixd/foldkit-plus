/**
 * One entry of the gallery through a real form: the draft its stored value
 * fills, what the form makes of what was typed and of what is refused, and how
 * a list shows the value. Each is the form's own answer, read back.
 */
import { Option, Schema } from 'effect'
import { Form, Input } from 'foldkit-form'
import * as FieldValidation from 'foldkit/fieldValidation'
import { defineTaggedUnion } from 'foldkit/schema'
import type { Entry } from './gallery.js'

/** What became of one draft: the value, as the key stores it, or the errors. */
export const Outcome = defineTaggedUnion({
  Kept: { stored: Schema.String },
  Refused: { errors: Schema.Array(Schema.String) },
})
export type Outcome = typeof Outcome.Type

export interface Reading {
  readonly entry: Entry
  /** The key's value as it is stored: the schema's encoded side, as JSON. */
  readonly stored: string
  /** The draft a filled form shows; none for a control backed by a Bundle. */
  readonly draft: Option.Option<string>
  readonly typed: Option.Option<readonly [string, Outcome]>
  readonly refused: Option.Option<readonly [string, Outcome]>
  /** For a recipe that follows another key: the draft it writes from that key, on a blank form. */
  readonly followed: Option.Option<{
    readonly key: string
    readonly text: string
    readonly draft: string
  }>
  /** How a list or a detail shows the value. */
  readonly display: string
  /** The form, filled with the stored value, for a page to draw. */
  readonly form: ReturnType<typeof formOf>
  readonly filled: unknown
}

const nameOf = (entry: Entry) =>
  entry.name.replace(/(^|-)(\w)/g, (_, __, letter: string) => letter.toUpperCase())

/** A form of the entry's key (`value`), and of the key a `slug` follows. */
const formOf = (entry: Entry) =>
  Form.make(
    nameOf(entry),
    Form.input(
      Schema.Struct({
        ...(entry.follows === undefined ? {} : { [entry.follows.key]: Schema.String }),
        value: entry.schema.annotate({ title: entry.name }),
      }),
    ),
    { inputs: { value: entry.recipe.control } },
  )

export const read = (entry: Entry): Reading => {
  const form = formOf(entry)
  type Model = typeof form.initial
  type Message = typeof form.Message.Type
  const update = (model: Model, message: Message): Model =>
    form.bundle.update(model, message, undefined).model
  const storedText = (value: unknown) =>
    JSON.stringify(Schema.encodeUnknownSync(entry.schema)(value))
  const filled = form.fill(form.initial, {
    ...(entry.follows === undefined ? {} : { [entry.follows.key]: entry.follows.text }),
    value: entry.stored,
  } as never).model
  // The key is `value` in every entry's form, but with the schema typed `any`
  // the form cannot name its keys, so they read as `never`.
  const key = 'value' as never
  const bundled = form.controls.some(
    control => control.key === 'value' && Input.isBundle(control.control),
  )
  const typing = (text: string): readonly [string, Outcome] => {
    const typed = update(filled, form.Message.Changed({ key, value: text }))
    const kept = () =>
      Outcome.Kept({
        stored: storedText((form.partial(typed) as { readonly value?: unknown }).value),
      })
    const outcome = FieldValidation.match(
      form.field(typed, key) as FieldValidation.Field<unknown>,
      {
        onNotValidated: kept,
        onValidating: kept,
        onValid: kept,
        onInvalid: ({ errors }) => Outcome.Refused({ errors }),
      },
    )
    return [text, outcome]
  }
  return {
    entry,
    stored: storedText(entry.stored),
    draft: bundled ? Option.none() : Option.some(String(form.field(filled, key).value)),
    typed: Option.map(Option.fromNullishOr(entry.typed), typing),
    refused: Option.map(Option.fromNullishOr(entry.refused), typing),
    followed: Option.map(Option.fromNullishOr(entry.follows), ({ key: from, text }) => {
      const typed = update(form.initial, form.Message.Changed({ key: from as never, value: text }))
      return { key: from, text, draft: String(form.field(typed, key).value) }
    }),
    display: entry.recipe.display.text(entry.stored, {}),
    form,
    filled,
  }
}
