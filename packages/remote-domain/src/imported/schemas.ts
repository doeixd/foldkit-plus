/** The wire shapes of a Domain command, as the mutation and its description both read them. */
import { Schema, SchemaAST } from 'effect'
import type * as Domain from '@alchemy.run/domain'

/** The fields a command takes after its target: its class's own, without the tag. */
const inputFields = (command: Domain.Command.Any): Schema.Struct.Fields => {
  const { _tag: _, ...fields } = (command as unknown as { readonly fields: Schema.Struct.Fields })
    .fields
  return fields
}

/** What a client sends a command: its target and its input. */
export const inputOf = (command: Domain.Command.Any) =>
  Schema.Struct({ target: command.target, input: Schema.Struct(inputFields(command)) })

/** What a command answers besides its receipt: its reply, or an empty struct. */
export const replyOf = (command: Domain.Command.Any): Schema.Top =>
  command.reply ?? Schema.Struct({})

/** A JSON Schema, as plain data. */
export type JsonSchema = Readonly<Record<string, unknown>>

/** The JSON Schema of `schema` as one document: its definitions travel under `$defs`. */
export const jsonSchemaOf = (schema: Schema.Top): JsonSchema => {
  const { schema: root, definitions } = Schema.toJsonSchemaDocument(schema)
  return Object.keys(definitions).length === 0 ? root : { ...root, $defs: definitions }
}

/**
 * The tag of a Rejection class, which `Domain.Rejection` declares as `tag` and
 * any other tagged error only as the literal of its `_tag` field.
 */
export const tagOf = (rejection: Domain.Rejection.Any): string => {
  const ast = (rejection as unknown as { readonly fields: { readonly _tag: Schema.Top } }).fields
    ._tag.ast
  if (SchemaAST.isLiteral(ast) && typeof ast.literal === 'string') return ast.literal
  throw new Error('[foldkit-remote-domain] a Rejection has no literal _tag to name it by')
}
