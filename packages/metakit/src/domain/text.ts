/**
 * Text that holds no NUL character (U+0000), which Postgres cannot store and
 * every text and equality operation refuses. A field of `Text.schema` is one
 * the checker and the solver know no operation refuses for a NUL, so a rule
 * over it can be proved; partial evaluation folds a strict call beside a known
 * null over it.
 */
import { Schema } from 'effect'
import { DOMAIN_ANNOTATION_KEY } from './annotation.js'

/** `Schema.String` refusing text that holds a NUL, with `metakit/domain` metadata `{ kind: 'text' }`. */
export const schema: Schema.String = Schema.String.check(
  Schema.makeFilter<string>(
    text => (text.includes('\u0000') ? 'text holding a NUL character' : undefined),
    {
      [DOMAIN_ANNOTATION_KEY]: { kind: 'text' },
      expected: 'text without a NUL character',
    } as Schema.Annotations.Filter,
  ),
)
