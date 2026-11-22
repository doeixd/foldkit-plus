import { Schema } from 'effect'
import { Expr } from '../src/index.js'

// @ts-expect-error Law is removed; use claims from metakit/operation
import type { Law } from '../src/index.js'
void (0 as unknown as Law)

// @ts-expect-error Evidence is removed; use discharges in metakit/temporal
import type { Evidence } from '../src/index.js'
void (0 as unknown as Evidence)

Expr.operator('acme.old', {
  input: [Schema.Int, Schema.Int],
  output: Schema.Int,
  // @ts-expect-error Expr.operator takes claims, not laws
  laws: [],
})

Expr.operator('acme.oldNulls', {
  input: [Schema.NullOr(Schema.Int)],
  output: Schema.Int,
  // @ts-expect-error nulls: 'handled' is now nulls: 'own'
  nulls: 'handled',
})

// @ts-expect-error defined operators may not declare claims
Expr.operator('acme.definedWithClaims', {
  input: [Schema.String],
  output: Schema.Boolean,
  definedAs: text => Expr.isNotNull(text),
  claims: { idempotent: true },
})
