/**
 * The types of `Text.schema`: a string Schema, which a struct field, a path
 * and the text operations take as they take `Schema.String`.
 */
import { Schema } from 'effect'
import { Eq, Expr, Path, Str } from '@doeixd/metakit'
import { Text } from '@doeixd/metakit/domain'

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const holds = <T extends true>(): T => true as T

holds<Equals<typeof Text.schema, Schema.String>>()
holds<Equals<typeof Text.schema.Type, string>>()

const Named = Schema.Struct({ name: Text.schema, nick: Schema.NullOr(Text.schema) })
holds<Equals<typeof Named.Type, { readonly name: string; readonly nick: string | null }>>()

const $ = Path.forSchema(Named)
const starts: Expr.Expr<typeof Named.Type, boolean> = Str.startsWith($.name, 'a')
const same: Expr.Expr<typeof Named.Type, boolean | null> = Eq.equals($.nick, $.name)
void [starts, same]

// @ts-expect-error a Text field is text, not a number
Eq.is($.name, 1)
