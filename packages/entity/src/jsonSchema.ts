/**
 * A schema's JSON Schema, of what it encodes to as JSON carries it, its
 * definitions kept under `$defs` so a `$ref` in it resolves. Not exported from
 * the package.
 */
import { Schema } from 'effect'

export const jsonSchemaOf = (schema: Schema.Top): Readonly<Record<string, unknown>> => {
  const document = Schema.toJsonSchemaDocument(schema)
  return Object.keys(document.definitions).length === 0
    ? document.schema
    : { ...document.schema, $defs: document.definitions }
}
