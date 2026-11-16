import { Match, Option, Schema, SchemaAST } from 'effect'
import type { OrderTerm } from './expr.js'

/**
 * Whether values encoded by `ast` order the same everywhere: numbers and
 * booleans, never text. A null among them does too: where it goes is said on
 * every order term.
 */
const ordersIntrinsically = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNumber(ast) ||
  SchemaAST.isBoolean(ast) ||
  (SchemaAST.isLiteral(ast) && typeof ast.literal !== 'string') ||
  (SchemaAST.isUnion(ast) &&
    ast.types.every(member => SchemaAST.isNull(member) || ordersIntrinsically(member)))

/**
 * Why an order term cannot be answered the same by every reader for want of a
 * collation: a field of text that declares none. SQLite compares bytes,
 * Postgres follows its database's locale and JavaScript compares UTF-16 units,
 * so `Query.placement` and `evaluate` both refuse it, for this reason.
 */
export const uncollatedText = (orderTerm: OrderTerm): Option.Option<string> =>
  Match.value(orderTerm.expr).pipe(
    Match.tag('Field', field =>
      Option.isNone(orderTerm.collation) && !ordersIntrinsically(Schema.toEncoded(field.schema).ast)
        ? Option.some(
            `it orders by ${field.owner.name}.${field.key}, text with no declared collation`,
          )
        : Option.none<string>(),
    ),
    Match.orElse(() => Option.none<string>()),
  )
