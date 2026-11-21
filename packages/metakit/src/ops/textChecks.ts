/**
 * What the checker and the prover read off a Schema's checks, beyond what
 * partial evaluation needs (`kind.ts`): whether a number is an integer, and
 * the length bounds a string Schema sets.
 */
import { Predicate, SchemaAST } from 'effect'
import { declares, declaresNoNul } from './kind.js'

/** A number Schema that admits only safe integers (`Schema.Int`). */
export const isInteger = (ast: SchemaAST.AST): boolean =>
  SchemaAST.isNumber(ast) && declares(ast.checks, new Set(['effect/schema/isInt']))

/**
 * What the checks on a string Schema ask of a value: a length in UTF-16
 * units at least `minLength` and at most `maxLength`, no NUL (`Text.schema`),
 * and `modelled` false where a check asks anything else (a pattern, a trim),
 * which a reader cannot show a value meets.
 */
export interface TextChecks {
  readonly minLength: number
  readonly maxLength: number
  readonly nulFree: boolean
  readonly modelled: boolean
}

export const textChecksOf = (ast: SchemaAST.AST): TextChecks => {
  let [minLength, maxLength, nulFree, modelled] = [0, Infinity, false, true]
  const read = (checks: ReadonlyArray<SchemaAST.Check<unknown>>): void => {
    for (const check of checks) {
      if (check._tag === 'FilterGroup') {
        read(check.checks)
        continue
      }
      const representation = check.annotations?.representation
      const payload: Readonly<Record<string, unknown>> = Predicate.isObject(representation?.payload)
        ? representation.payload
        : {}
      const bound = (name: string): number | undefined =>
        typeof payload[name] === 'number' ? payload[name] : undefined
      const id = representation?.id
      const [min, max] =
        id === 'effect/schema/isMinLength'
          ? [bound('minLength'), undefined]
          : id === 'effect/schema/isMaxLength'
            ? [undefined, bound('maxLength')]
            : id === 'effect/schema/isBetweenLength'
              ? [bound('minimum'), bound('maximum')]
              : [undefined, undefined]
      if (declaresNoNul(check)) nulFree = true
      else if (min !== undefined || max !== undefined) {
        minLength = Math.max(minLength, min ?? 0)
        maxLength = Math.min(maxLength, max ?? Infinity)
      } else modelled = false
    }
  }
  read(ast.checks ?? [])
  return { minLength, maxLength, nulFree, modelled }
}
