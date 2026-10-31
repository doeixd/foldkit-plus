/** The codec a declaration's `Input` or `Output` names: given whole, or as a Struct's fields. */
import { Schema } from 'effect'

/** A codec, or the fields of a `Schema.Struct` where one is expected. */
export type SchemaOrFields = Schema.Codec<any, any, any, any> | Schema.Struct.Fields

/** The decoded type of a codec, or of the Struct the fields describe. */
export type TypeOf<S extends SchemaOrFields> =
  S extends Schema.Codec<infer T, any, any, any>
    ? T
    : S extends Schema.Struct.Fields
      ? Schema.Struct.Type<S>
      : never

/** The codec itself, or a `Schema.Struct` over the fields. */
export const schemaOf = <S extends SchemaOrFields>(shape: S): Schema.Codec<TypeOf<S>> =>
  (Schema.isSchema(shape) ? shape : Schema.Struct(shape as Schema.Struct.Fields)) as Schema.Codec<
    TypeOf<S>
  >
