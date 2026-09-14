import { Schema } from 'effect'

/**
 * Encodes a value to JSON-compatible data and decodes it back strictly.
 *
 * A callback that throws means the value is invalid. `Encoded` is the
 * wire/storage side, so `Journal.append` can require it instead of accepting
 * `unknown`. An application that already has a `Schema.Codec` passes it
 * directly; `Codec.fromSchema` is the explicit conversion.
 */
export interface Codec<Value, Encoded = unknown> {
  readonly encode: (value: Value) => Encoded
  readonly decode: (value: Encoded) => Value
}

/**
 * What `JournalOptions.operation` and `.snapshot` accept: an Effect
 * `Schema.Codec`, or the function pair for an application that does not use
 * `Schema`. A schema that requires services to decode or encode is rejected,
 * because the journal resolves a codec synchronously inside the append
 * transaction.
 */
export type CodecInput<Value, Encoded = unknown> =
  Codec<Value, Encoded> | Schema.Codec<Value, Encoded>

const fromSchema = <Value, Encoded>(
  schema: Schema.Codec<Value, Encoded>,
): Codec<Value, Encoded> => ({
  encode: Schema.encodeSync(schema),
  decode: Schema.decodeUnknownSync(schema),
})

export const Codec = {
  /**
   * The function pair a `Schema.Codec` denotes. Decoding validates unknown
   * input and throws a `SchemaError` when it does not match, which the journal
   * reports as `InvalidOperationError`.
   */
  fromSchema,
}

/** Normalizes either accepted form once, when the journal is built. */
export const resolveCodec = <Value, Encoded>(
  input: CodecInput<Value, Encoded>,
): Codec<Value, Encoded> => (Schema.isSchema(input) ? fromSchema(input) : input)
