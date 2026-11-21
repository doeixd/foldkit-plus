import type { SchemaAST } from 'effect'

/** Whether `check` is Effect's `isInt`, or a group that holds it (`Schema.Int` is such a group). */
export const isIntCheck = (check: SchemaAST.Check<unknown>): boolean =>
  check.annotations?.representation?.id === 'effect/schema/isInt' ||
  (check._tag === 'FilterGroup' && check.checks.some(isIntCheck))
