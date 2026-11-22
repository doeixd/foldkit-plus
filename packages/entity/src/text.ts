/**
 * The kernel's text operators: primitive, so each interpreter implements them,
 * and each states what it means here, where data-query §6.0.1 holds the rest.
 */
import { Schema } from 'effect'
import { Node, Str } from 'metakit'
import { makeOperator, type Operator } from './expr/operator.js'

const NullableText = Schema.NullOr(Schema.String)

export const Text = {
  /**
   * Whether the first text begins with the second, under the first's collation.
   *
   * | Case | Answer |
   * | --- | --- |
   * | either is null | unknown |
   * | the prefix is `''` | true |
   * | otherwise | whether it begins so, compared under the collation |
   *
   * The collation is the one its text operands share (a field's declared one,
   * or a call's), or one given to the call. `binary` compares exactly;
   * `asciiFold` folds ASCII letters on both sides. Operands declaring
   * different collations, text with none, or a backend's locale are refused
   * where the call is written.
   * Prefixes are by character, so non-ASCII and astral text begin as they read,
   * and half of an astral character begins nothing. A lone surrogate, which
   * UTF-8 cannot hold, compares as U+FFFD, as a database stores it.
   *
   * ```ts
   * Query.where(Text.startsWith(Product.fields.upc, input.search))
   * ```
   */
  startsWith: makeOperator(
    'text.startsWith',
    {
      input: [NullableText, NullableText],
      output: Schema.Boolean,
      collation: 'required',
      description: "Whether the first text begins with the second, under the first's collation.",
    },
    // metakit's own `str.startsWith`, its text folded as the call's collation folds it.
    (args, fold) => Node.Call({ op: Str.startsWithOp, args: args.map(fold) }),
  ) as unknown as Operator<
    readonly [typeof NullableText, typeof NullableText],
    typeof Schema.Boolean
  >,
}
