/**
 * Domain annotations attached to Effect `Schema`s so non-interpreter consumers
 * (forms, grids, JSON Schema, agents) recognize `Money`, `CalendarDay`,
 * `OrderedEnum`, and `Currency` without a parallel type system.
 */
import { Option, type Schema, type SchemaAST } from 'effect'

export const DOMAIN_ANNOTATION_KEY = 'metakit/domain' as const

export type DomainMetadata =
  | {
      readonly kind: 'money'
      readonly currency: string
      readonly scale: number
    }
  | {
      readonly kind: 'decimal'
      readonly scale: number
    }
  | {
      readonly kind: 'calendarDay'
    }
  | {
      readonly kind: 'orderedEnum'
      readonly order: ReadonlyArray<string>
    }
  | {
      readonly kind: 'currency'
      readonly allowed: ReadonlyArray<string>
    }
  | {
      /** Text holding no NUL character (`Text.schema`). */
      readonly kind: 'text'
    }
  | {
      /** Branded, non-empty, NUL-free entity identifier (`Id.make`). */
      readonly kind: 'id'
      readonly entity: string
      readonly prefix?: string
    }
  | {
      /** Lexicographic fractional-index ordinal (`Ordinal.schema`). */
      readonly kind: 'ordinal'
    }

/**
 * Read `metakit/domain` metadata from a `SchemaAST.AST`, scanning check
 * annotations from last to first so chaining `Expr.refine` after a domain
 * Schema (e.g. `Usd.pipe(Expr.refine(...))`) preserves its domain metadata.
 */
export const domainOfAst = (ast: SchemaAST.AST): Option.Option<DomainMetadata> => {
  if (ast.checks !== undefined) {
    for (let i = ast.checks.length - 1; i >= 0; i--) {
      const ann = ast.checks[i]!.annotations as Readonly<Record<string, unknown>> | undefined
      if (ann !== undefined && DOMAIN_ANNOTATION_KEY in ann) {
        return Option.some(ann[DOMAIN_ANNOTATION_KEY] as DomainMetadata)
      }
    }
  }
  const astAnn = ast.annotations as Readonly<Record<string, unknown>> | undefined
  if (astAnn !== undefined && DOMAIN_ANNOTATION_KEY in astAnn) {
    return Option.some(astAnn[DOMAIN_ANNOTATION_KEY] as DomainMetadata)
  }
  return Option.none()
}

/** Read `metakit/domain` metadata from an Effect `Schema`, if present. */
export const domainOf = (schema: Schema.Top): Option.Option<DomainMetadata> =>
  domainOfAst(schema.ast)
