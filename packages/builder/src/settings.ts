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
  // A prop no control fits (a struct, a list that is not a relation) is shown, not edited.
  const editable: Readonly<Record<string, Schema.Top>> = Object.fromEntries(
    Object.entries(fields).filter(([key, schema]) => controlOf(block, key, schema) !== undefined),
  )
  const Props = Schema.Struct(editable)
  // A prop without a title is labelled by its key, spaced, as the rest of the editor names things.
  const labels = Object.fromEntries(
    Object.entries(editable).flatMap(([key, schema]) =>
      Option.isSome(Words.of(schema).title) ? [] : [[key, Form.label(spaced(key))]],
    ),
  )
  const entity = Entity.define(`${block.name}Settings`, Props).pipe(Entity.annotateMembers(labels))
  const form = Form.make(`${block.name}Settings`, Entity.input(entity, Props), {
    inputs: controlsKey.get(block.metadata)[0] ?? {},
  })
  // A Block's props are stored JSON: coding one needs no services.
  const codecs = Object.fromEntries(
    Object.entries(editable).map(([key, schema]) => {
      const codec = schema as Schema.Codec<unknown, unknown>
      return [
        key,
        { decode: Schema.decodeUnknownResult(codec), encode: Schema.encodeUnknownResult(codec) },
      ]
    }),
  )
  const encodeModel = Schema.encodeSync(form.bundle.Model)
  const decodeModel = Schema.decodeUnknownResult(form.bundle.Model)
  const encodeMessage = Schema.encodeSync(form.bundle.Message)
  const decodeMessage = Schema.decodeUnknownResult(form.bundle.Message)
  type FormModel = typeof form.initial

  /** Each stored prop the form edits, decoded on its own, so one bad prop spoils no other. */
  const decoded = (stored: Readonly<Record<string, unknown>>) =>
    Object.entries(codecs).map(([key, codec]) => ({
      key,
      raw: stored[key],
      value: Result.getSuccess(codec.decode(stored[key])),
    }))

  return {
    form,
    /** The props the form does not edit, as stored: shown, not changed. */
    shown: (stored: Readonly<Record<string, unknown>>): ReadonlyArray<readonly [string, unknown]> =>
      Object.keys(fields)
        .filter(key => !Object.hasOwn(codecs, key))
        .map(key => [key, stored[key]] as const),
    /**
     * `form` with the fields `keep` spares filled from a node's stored props.
     * A prop that does not decode shows what is stored, with its error.
     */
    fill: (
      form_: FormModel,
      stored: Readonly<Record<string, unknown>>,
      keep: (key: string) => boolean = () => false,
    ): FormModel => {
      const props = decoded(stored).filter(({ key }) => !keep(key))
      const good = Object.fromEntries(
        props.flatMap(({ key, value }) => (Option.isSome(value) ? [[key, value.value]] : [])),
      )
      // A draft of the wrong kind (text for a toggle) is ignored, so only text is offered.
      return props
        .filter(({ value, raw }) => Option.isNone(value) && raw !== undefined)
        .reduce(
          (model, { key, raw }) =>
            form.bundle.update(
              model,
              form.Message.Changed({
                key,
                value: typeof raw === 'string' ? raw : JSON.stringify(raw),
              }),
              undefined,
            ).model,
          form.fill(form_, good).model,
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
    /** One decoded prop as the Document stores it; none if it does not encode. */
    stored: (key: string, value: unknown): Option.Option<Schema.Json> =>
      Object.hasOwn(codecs, key)
        ? Result.getSuccess(codecs[key]!.encode(value)).pipe(
            Option.map(json => json as Schema.Json),
          )
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
