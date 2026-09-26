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

const make = (block: AnyBlock) => {
  const fields = fieldsOf(block.Props)
  const Props = Schema.Struct(fields)
  // A prop without a title is labelled by its key, spaced, as the rest of the editor names things.
  const labels = Object.fromEntries(
    Object.entries(fields).flatMap(([key, schema]) =>
      Option.isSome(Words.of(schema).title) ? [] : [[key, Form.label(spaced(key))]],
    ),
  )
  const entity = Entity.define(`${block.name}Settings`, Props).pipe(Entity.annotateMembers(labels))
  const form = Form.make(`${block.name}Settings`, Entity.input(entity, Props), {
    inputs: controlsKey.get(block.metadata)[0] ?? {},
  })
  const decodeProps = Schema.decodeUnknownResult(
    Props as unknown as Schema.Codec<Readonly<Record<string, unknown>>, unknown>,
  )
  const encodeModel = Schema.encodeSync(form.bundle.Model)
  const decodeModel = Schema.decodeUnknownResult(form.bundle.Model)
  const encodeMessage = Schema.encodeSync(form.bundle.Message)
  const decodeMessage = Schema.decodeUnknownResult(form.bundle.Message)
  const encodeProp = Object.fromEntries(
    // A Block's props are stored JSON: encoding one needs no services.
    Object.entries(fields).map(([key, schema]) => [
      key,
      Schema.encodeUnknownResult(schema as Schema.Codec<unknown, unknown>),
    ]),
  )
  return {
    form,
    fields,
    /** A node's stored props, decoded by key; none where they do not decode. */
    props: (stored: unknown): Option.Option<Readonly<Record<string, unknown>>> =>
      Result.getSuccess(decodeProps(stored)),
    /** The form's Model as the Builder's Model holds it: JSON. */
    encode: (model: typeof form.initial): Schema.Json => encodeModel(model) as Schema.Json,
    /** A held form Model read back; none if it no longer fits, which a refill then replaces. */
    decode: (held: Schema.Json): Option.Option<typeof form.initial> =>
      Result.getSuccess(decodeModel(held)),
    encodeMessage: (message: typeof form.Message.Type): Schema.Json =>
      encodeMessage(message) as Schema.Json,
    decodeMessage: (held: Schema.Json): Option.Option<typeof form.Message.Type> =>
      Result.getSuccess(decodeMessage(held)),
    /** One decoded prop as the Document stores it; none if it does not encode. */
    stored: (key: string, value: unknown): Option.Option<Schema.Json> =>
      Object.hasOwn(encodeProp, key)
        ? Result.getSuccess(encodeProp[key]!(value)).pipe(Option.map(json => json as Schema.Json))
        : Option.none(),
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
