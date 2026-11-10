/**
 * One entry of the gallery through a real form: the draft its stored value
 * fills, what the form makes of what was typed and of what is refused, and how
 * a list shows the value. Each is the form's own answer, read back.
 */
import { Option, Record, Schema } from 'effect'
import { type Control, type ControlChange, Form, Input } from 'foldkit-form'
import type { FieldRecipe } from 'foldkit-form-recipes'
import { renderers } from 'foldkit-form-recipes/html'
import { FormView } from 'foldkit-mixins-form'
import * as FieldValidation from 'foldkit/fieldValidation'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineTaggedUnion } from 'foldkit/schema'

/** What became of one draft: the value, as the key stores it, or the errors. */
export const Outcome = defineTaggedUnion({
  Kept: { stored: Schema.String },
  Refused: { errors: Schema.Array(Schema.String) },
})
export type Outcome = typeof Outcome.Type

/** What a page and the index say of a recipe, whatever its value. */
export interface Facts {
  /** The page's address and heading. */
  readonly name: string
  /** How the recipe is made, as an application writes it. */
  readonly call: string
  /** What it does when things go wrong, in the README's words. */
  readonly failures: ReadonlyArray<string>
}

/** One recipe, typed by the value its key holds (`A`, stored as `I`) and its control (`C`). */
export interface Recipe<
  A,
  I,
  C extends Control<unknown> | ControlChange,
  K extends string,
> extends Facts {
  readonly schema: Schema.Codec<A, I>
  readonly recipe: FieldRecipe<C>
  /** What the key holds, decoded. */
  readonly stored: A
  /** A draft a person might type, and one the recipe refuses; none for a control with no text. */
  readonly typed?: string | undefined
  readonly refused?: string | undefined
  /** For a recipe that follows another key (`slug`): that key, and what it says. */
  readonly follows?: { readonly key: K; readonly text: string } | undefined
}

/**
 * A page's body, given the filled form and a function drawing its control. Generic, since each
 * recipe's form has a Model and Message of its own.
 */
export type Drawn = <R>(
  use: <Model, Message>(
    model: Model,
    control: (model: Model, h: HtmlBuilder<Message>) => Html,
  ) => R,
) => R

export interface Reading {
  readonly entry: Facts
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
  readonly drawn: Drawn
}

/** A recipe of the gallery, its value's type left behind once it is read. */
export interface Entry extends Facts {
  readonly read: () => Reading
}

const nameOf = (name: string) =>
  name.replace(/(^|-)(\w)/g, (_, __, letter: string) => letter.toUpperCase())

const read = <A, I, C extends Control<unknown> | ControlChange, K extends string>(
  entry: Recipe<A, I, C, K>,
): Reading => {
  const follows = Option.fromNullishOr(entry.follows)
  const form = Form.make(
    nameOf(entry.name),
    Form.input(
      Schema.Struct({
        // The key a `slug` follows, as a field of the form beside `value`.
        ...Option.match(follows, {
          onNone: () => ({}),
          onSome: ({ key }) => Record.singleton(key, Schema.String),
        }),
        value: entry.schema.annotate({ title: entry.name }),
      }),
    ),
    { inputs: { value: entry.recipe.control } },
  )
  type Model = typeof form.initial
  type Message = typeof form.Message.Type
  const update = (model: Model, message: Message): Model =>
    form.bundle.update(model, message, undefined).model
  const storedText = (value: unknown) =>
    JSON.stringify(Schema.encodeUnknownSync(entry.schema)(value))
  const filled = form.fill(form.initial, {
    ...Option.match(follows, {
      onNone: () => ({}),
      onSome: ({ key, text }) => Record.singleton(key, text),
    }),
    value: entry.stored,
  }).model
  const bundled = form.controls.some(
    control => control.key === 'value' && Input.isBundle(control.control),
  )
  const typing = (text: string): readonly [string, Outcome] => {
    const typed = update(filled, form.Message.Changed({ key: 'value', value: text }))
    const kept = () => Outcome.Kept({ stored: storedText(form.partial(typed).value) })
    const outcome = FieldValidation.match(typed.fields.value, {
      onNotValidated: kept,
      onValidating: kept,
      onValid: kept,
      onInvalid: ({ errors }) => Outcome.Refused({ errors }),
    })
    return [text, outcome]
  }
  const View = FormView.define(form, { renderers: renderers() })
  return {
    entry,
    stored: storedText(entry.stored),
    draft: bundled ? Option.none() : Option.some(String(filled.fields.value.value)),
    typed: Option.map(Option.fromNullishOr(entry.typed), typing),
    refused: Option.map(Option.fromNullishOr(entry.refused), typing),
    followed: Option.map(follows, ({ key, text }) => {
      // The followed key is the form's at run time; its Message is checked by decoding it.
      const changed = Schema.decodeUnknownSync(form.Message)({ _tag: 'Changed', key, value: text })
      const typed = update(form.initial, changed)
      return { key, text, draft: String(typed.fields.value.value) }
    }),
    display: entry.recipe.display.text(entry.stored, {}),
    drawn: use =>
      use(filled, (model: Model, h: HtmlBuilder<Message>) =>
        View({ model, errors: [], canSubmit: true }, h),
      ),
  }
}

/** A recipe as the gallery lists it: read through its own form when asked. */
export const entry = <A, I, C extends Control<unknown> | ControlChange, K extends string = never>(
  recipe: Recipe<A, I, C, K>,
): Entry => ({
  name: recipe.name,
  call: recipe.call,
  failures: recipe.failures,
  read: () => read(recipe),
})
