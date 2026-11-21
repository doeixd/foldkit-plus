import { Schema } from 'effect'

/**
 * The key under which a variant built by `foldkit-agent/metakit` carries a step
 * that adds what Effect's derivation cannot see (bounds written as metakit
 * expressions, domain formats) to the JSON Schema `expose` derives from its
 * `input`. A symbol rather than a `VariantConfig` option, so no contract can
 * advertise a schema of its own beside the one dispatch decodes: the step only
 * adds keywords read off that same `input`.
 */
export const refineInputJsonSchema: unique symbol = Symbol.for(
  'foldkit-agent/refineInputJsonSchema',
)

export type RefineInputJsonSchema = (derived: Record<string, unknown>) => Record<string, unknown>

/**
 * Derives a JSON Schema document from an Effect Schema.
 *
 * Definitions produced during derivation are inlined under `$defs` so the
 * result is a single self-contained schema an adapter can hand to a protocol.
 */
export const toJsonSchema = (
  schema: Schema.Codec<any, any, never, never>,
  options?: { readonly emptyPayload?: boolean },
): Record<string, unknown> => {
  // Spelled out rather than derived: a payload-free capability must advertise a
  // closed object with an explicit empty `properties`, which tool protocols
  // expect and which neither Struct({}) nor Record(String, Never) produces.
  if (options?.emptyPayload === true) {
    return { type: 'object', properties: {}, required: [], additionalProperties: false }
  }

  const document = Schema.toJsonSchemaDocument(schema as never)
  const derived = document.schema as Record<string, unknown>

  const definitions = document.definitions as Record<string, unknown> | undefined
  return definitions !== undefined && Object.keys(definitions).length > 0
    ? { ...derived, $defs: definitions }
    : { ...derived }
}
