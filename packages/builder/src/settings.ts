/**
 * A Block's settings as a `foldkit-form` form: the inspector edits a node
 * through it. The Document owns the settings; the form holds only what a
 * field shows, including text that does not decode yet (a number typed as
 * "1."), and each change that decodes becomes one Operation.
 */
import { Option, Result, Schema } from 'effect'
import { fieldsOf, type AnyBlock } from 'foldkit-composition'
import { Entity, Words } from 'foldkit-entity'
import { Form, Input, type Control } from 'foldkit-form'
import { Metadata } from 'foldkit-metadata'

/** A name as words: `PostList` is "Post list". */
export const spaced = (name: string): string => {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const controlsKey = Metadata.key<Readonly<Record<string, Control>>>('foldkit-builder/controls', {
  // One record per Block: a later annotation's prop replaces an earlier one's.
  merge: records => [Object.assign({}, ...records)],
  summarize: record =>
    Object.entries(record)
      .map(([key, control]) => `${key}: ${control.kind}`)
      .join(', '),
})

/**
 * Block metadata: the control the inspector draws a prop with, where its
 * Schema alone does not say, as
 * `Heading.pipe(Block.annotate(Builder.controls({ text: Input.multiline() })))`.
 * `Input.hidden()` leaves a prop out of the inspector.
 */
export const controls = (given: Readonly<Record<string, Control>>): Metadata =>
  controlsKey.of(given)

/** A prop's words: its Schema's `title`, else its key spaced, and its description. */
const wordsOf = (key: string, schema: Schema.Top) => {
  const { title, description } = Words.of(schema)
  return { label: Option.getOrElse(title, () => spaced(key)), description }
}

const make = (block: AnyBlock) => {
  const fields = fieldsOf(block.Props)
  // A prop is edited as the Document stores it, so a control fits it or not there:
  // an `Option` of an id is a picker or text; a struct, or a list that is not a
  // relation, fits none and is shown, not edited.
  const editable = Object.entries(fields).filter(
    ([key, schema]) => controlOf(block, key, Schema.toEncoded(schema)) !== undefined,
  )
  // Checked against the whole Schema, so what it says (a brand, a length, a check
  // past a transformation, which the encoded side drops) is said at the field.
  const decoders = Object.fromEntries(
    editable.map(([key, schema]) => [
      key,
      // A Block's props are stored JSON: decoding one needs no services.
      Schema.decodeUnknownResult(schema as Schema.Codec<unknown, unknown>),
    ]),
  )
  const Props = Schema.Struct(
    Object.fromEntries(
      editable.map(([key, schema]) => [
        key,
        Schema.toEncoded(schema).check(
          Schema.makeFilter(value =>
            Result.match(decoders[key]!(value), {
              onSuccess: () => undefined,
              onFailure: error => error.message,
            }),
          ),
        ),
      ]),
    ) as Readonly<Record<string, Schema.Top>>,
  )
  // The encoded side has no words of its own to read, so they come from the prop.
  const labels = Object.fromEntries(
    editable.map(([key, schema]) => {
      const { label, description } = wordsOf(key, schema)
      return [key, Form.label(label, Option.getOrUndefined(description))]
    }),
  )
  const entity = Entity.define(`${block.name}Settings`, Props).pipe(Entity.annotateMembers(labels))
  const form = Form.make(`${block.name}Settings`, Entity.input(entity, Props), {
    inputs: controlsKey.get(block.metadata)[0] ?? {},
  })
  const encodeModel = Schema.encodeSync(form.bundle.Model)
  const decodeModel = Schema.decodeUnknownResult(form.bundle.Model)
  const encodeMessage = Schema.encodeSync(form.bundle.Message)
  const decodeMessage = Schema.decodeUnknownResult(form.bundle.Message)
  type FormModel = typeof form.initial

  return {
    form,
    /** The props the form does not edit, labelled as its fields are, and as stored: shown, not changed. */
    shown: (
      stored: Readonly<Record<string, unknown>>,
    ): ReadonlyArray<{ readonly key: string; readonly label: string; readonly value: unknown }> =>
      Object.entries(fields)
        .filter(([key]) => !Object.hasOwn(decoders, key))
        .map(([key, schema]) => ({ key, label: wordsOf(key, schema).label, value: stored[key] })),
    /**
     * `model` with the fields `keep` spares filled from a node's stored props.
     * A stored prop that does not decode is shown as it is, with its error.
     */
    fill: (
      model: FormModel,
      stored: Readonly<Record<string, unknown>>,
      keep: (key: string) => boolean = () => false,
    ): FormModel => {
      const keys = Object.keys(decoders).filter(key => !keep(key))
      const filled = form.fill(model, Object.fromEntries(keys.map(key => [key, stored[key]]))).model
      return keys
        .filter(key => stored[key] !== undefined && Result.isFailure(decoders[key]!(stored[key])))
        .reduce(
          (next, key) => form.bundle.update(next, form.Message.Blurred({ key }), undefined).model,
          filled,
        )
    },
    /** The form's Model as the Builder's Model holds it: JSON. */
    encode: (model: FormModel): Schema.Json => encodeModel(model) as Schema.Json,
    /** A held form Model read back; none if it no longer fits, which a refill then replaces. */
    decode: (held: Schema.Json): Option.Option<FormModel> => Result.getSuccess(decodeModel(held)),
    encodeMessage: (message: typeof form.Message.Type): Schema.Json =>
      encodeMessage(message) as Schema.Json,
    decodeMessage: (held: Schema.Json): Option.Option<typeof form.Message.Type> =>
      Result.getSuccess(decodeMessage(held)),
    /** A value from the form, as the Document stores it; none for a prop the form does not edit. */
    stored: (key: string, value: unknown): Option.Option<Schema.Json> =>
      Object.hasOwn(decoders, key) ? Option.some(value as Schema.Json) : Option.none(),
  }
}

/** A Block's settings form and the codecs the Builder holds it with. */
export type Settings = ReturnType<typeof make>

const made = new WeakMap<AnyBlock, Settings>()

/** A Block's settings, made at the first use and kept: one form per Block. */
export const settingsOf = (block: AnyBlock): Settings => {
  const known = made.get(block)
  if (known !== undefined) return known
  const settings = make(block)
  made.set(block, settings)
  return settings
}

/** The control a prop is drawn with: the Block's hint, else what its Schema says. */
export const controlOf = (block: AnyBlock, key: string, schema: Schema.Top): Control | undefined =>
  controlsKey.get(block.metadata)[0]?.[key] ?? Input.resolve(Entity.unmapped, schema)
