/**
 * Domain annotations attached to Effect `Schema`s so non-interpreter consumers
 * (forms, grids, JSON Schema, agents) recognize `Money`, `CalendarDay`,
 * `OrderedEnum`, and `Currency` without a parallel type system.
 */
import { Option, Schema } from 'effect'

export const DOMAIN_ANNOTATION_KEY = 'metakit/domain' as const

export type DomainMetadata =
  | {
      readonly kind: 'money'
      readonly currency: string
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

/** Read `metakit/domain` metadata from an Effect `Schema`, if present. */
export const domainOf = (schema: Schema.Top): Option.Option<DomainMetadata> => {
  const ann = Schema.resolveAnnotations(schema) as Readonly<Record<string, unknown>> | undefined
  if (ann !== undefined && DOMAIN_ANNOTATION_KEY in ann) {
    return Option.some(ann[DOMAIN_ANNOTATION_KEY] as DomainMetadata)
  }
  const astAnn = schema.ast.annotations as Readonly<Record<string, unknown>> | undefined
  if (astAnn !== undefined && DOMAIN_ANNOTATION_KEY in astAnn) {
    return Option.some(astAnn[DOMAIN_ANNOTATION_KEY] as DomainMetadata)
  }
  return Option.none()
}
