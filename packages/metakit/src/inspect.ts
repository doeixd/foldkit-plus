/**
 * Non-interpreter Schema & Transition inspector (`metakit/inspect`) for forms,
 * data grids, CMS fields, and AI agent JSON Schemas.
 *
 * Reads Effect `SchemaAST`, `Expr.refinementsOf`, `Domain.domainOf`, and
 * `Transition.can` directly — no interpreter interface in between.
 */
import { Option, SchemaAST } from 'effect'
import type { Schema } from 'effect'
import { DOMAIN_ANNOTATION_KEY, type DomainMetadata } from './domain/annotation.js'
import * as Expr from './expr.js'
import * as Node from './node.js'
import * as Transition from './transition.js'
import * as Verdict from './verdict.js'

export interface FieldSpec {
  readonly name: string
  readonly kind: 'integer' | 'number' | 'string' | 'boolean' | 'enum' | 'unknown'
  readonly nullable: boolean
  readonly min: Option.Option<number>
  readonly max: Option.Option<number>
  readonly exclusiveMin: Option.Option<number>
  readonly exclusiveMax: Option.Option<number>
  readonly literals: Option.Option<ReadonlyArray<string | number | boolean>>
  readonly domain: Option.Option<DomainMetadata>
}

const readDomainFromAst = (ast: SchemaAST.AST): Option.Option<DomainMetadata> => {
  if (ast.checks !== undefined) {
    for (let i = ast.checks.length - 1; i >= 0; i--) {
      const ann = ast.checks[i]!.annotations as Readonly<Record<string, unknown>> | undefined
      if (ann !== undefined && DOMAIN_ANNOTATION_KEY in ann) {
        return Option.some(ann[DOMAIN_ANNOTATION_KEY] as DomainMetadata)
      }
    }
  }
  const ann = ast.annotations as Readonly<Record<string, unknown>> | undefined
  if (ann !== undefined && DOMAIN_ANNOTATION_KEY in ann) {
    return Option.some(ann[DOMAIN_ANNOTATION_KEY] as DomainMetadata)
  }
  return Option.none()
}

const extractSingleField = (name: string, rawAst: SchemaAST.AST): FieldSpec => {
  let ast = rawAst
  let nullable = false
  let domain = readDomainFromAst(ast)

  if (SchemaAST.isUnion(ast)) {
    const hasNull = ast.types.some(SchemaAST.isNull)
    const nonNull = ast.types.filter(t => !SchemaAST.isNull(t))
    if (hasNull && nonNull.length === 1) {
      nullable = true
      ast = nonNull[0]!
      if (Option.isNone(domain)) domain = readDomainFromAst(ast)
    }
  }

  let kind: FieldSpec['kind'] = 'unknown'
  let min: number | undefined
  let max: number | undefined
  let exclusiveMin: number | undefined
  let exclusiveMax: number | undefined
  let literals: ReadonlyArray<string | number | boolean> | undefined

  if (SchemaAST.isNumber(ast)) {
    let isInt = false
    const scanChecks = (checks: ReadonlyArray<SchemaAST.Check<unknown>>) => {
      for (const c of checks) {
        const ann = c.annotations as Readonly<Record<string, unknown>> | undefined
        const repr = ann?.['representation'] as
          | { readonly id?: string; readonly payload?: Readonly<Record<string, unknown>> | null }
          | undefined
        if (repr?.id === 'effect/schema/isInt') isInt = true
        if (
          repr?.id === 'effect/schema/isGreaterThanOrEqualTo' &&
          typeof repr.payload?.['minimum'] === 'number'
        ) {
          min = min === undefined ? repr.payload['minimum'] : Math.max(min, repr.payload['minimum'])
        }
        if (
          repr?.id === 'effect/schema/isGreaterThan' &&
          typeof repr.payload?.['exclusiveMinimum'] === 'number'
        ) {
          exclusiveMin = repr.payload['exclusiveMinimum']
        }
        if (
          repr?.id === 'effect/schema/isLessThanOrEqualTo' &&
          typeof repr.payload?.['maximum'] === 'number'
        ) {
          max = max === undefined ? repr.payload['maximum'] : Math.min(max, repr.payload['maximum'])
        }
        if (
          repr?.id === 'effect/schema/isLessThan' &&
          typeof repr.payload?.['exclusiveMaximum'] === 'number'
        ) {
          exclusiveMax = repr.payload['exclusiveMaximum']
        }
        if (repr?.id === 'effect/schema/isBetween') {
          if (typeof repr.payload?.['minimum'] === 'number') {
            if (repr.payload['exclusiveMinimum'] === true) exclusiveMin = repr.payload['minimum']
            else
              min =
                min === undefined ? repr.payload['minimum'] : Math.max(min, repr.payload['minimum'])
          }
          if (typeof repr.payload?.['maximum'] === 'number') {
            if (repr.payload['exclusiveMaximum'] === true) exclusiveMax = repr.payload['maximum']
            else
              max =
                max === undefined ? repr.payload['maximum'] : Math.min(max, repr.payload['maximum'])
          }
        }
        if ('checks' in c && Array.isArray(c.checks)) scanChecks(c.checks)
      }
    }
    if (ast.checks !== undefined) scanChecks(ast.checks)
    kind = isInt ? 'integer' : 'number'
  } else if (SchemaAST.isString(ast)) {
    kind = 'string'
  } else if (SchemaAST.isBoolean(ast)) {
    kind = 'boolean'
  } else if (SchemaAST.isLiteral(ast)) {
    const lit = ast.literal
    if (typeof lit === 'string' || typeof lit === 'number' || typeof lit === 'boolean') {
      kind = 'enum'
      literals = [lit]
    }
  } else if (SchemaAST.isUnion(ast)) {
    const nonNull = ast.types.filter(t => !SchemaAST.isNull(t))
    if (nonNull.length < ast.types.length) nullable = true
    const lits: Array<string | number | boolean> = []
    if (nonNull.length > 0 && nonNull.every(SchemaAST.isLiteral)) {
      for (const m of nonNull) {
        if (SchemaAST.isLiteral(m)) {
          const lit = m.literal
          if (typeof lit === 'string' || typeof lit === 'number' || typeof lit === 'boolean') {
            lits.push(lit)
          }
        }
      }
      kind = 'enum'
      literals = lits
    }
  }

  return {
    name,
    kind,
    nullable,
    min: Option.fromUndefinedOr(min),
    max: Option.fromUndefinedOr(max),
    exclusiveMin: Option.fromUndefinedOr(exclusiveMin),
    exclusiveMax: Option.fromUndefinedOr(exclusiveMax),
    literals: Option.fromUndefinedOr(literals),
    domain,
  }
}

/** Extract per-field bounds, nullability, enum literals, and domain metadata from a struct Schema. */
export const fieldSpecs = <S extends Schema.Top>(schema: S): ReadonlyArray<FieldSpec> => {
  if (!SchemaAST.isObjects(schema.ast)) {
    return [extractSingleField('$', schema.ast)]
  }
  const specs = new Map<string, FieldSpec>()
  for (const prop of schema.ast.propertySignatures) {
    if (typeof prop.name === 'string') {
      specs.set(prop.name, extractSingleField(prop.name, prop.type))
    }
  }

  // Enrich per-field numeric bounds from top-level Expr.refine conjuncts (e.g. Num.gte($.balance, 0))
  const visitConjunct = (node: Node.Node): void => {
    if (!Node.$is('Call')(node)) return
    if (node.op.id === 'bool.and') {
      visitConjunct(node.args[0]!)
      visitConjunct(node.args[1]!)
      return
    }
    const [a, b] = node.args
    if (
      !Node.$is('Path')(a!) ||
      a!.segments.length !== 1 ||
      !Node.$is('Lit')(b!) ||
      typeof b!.value !== 'number'
    ) {
      return
    }
    const fieldName = a!.segments[0]!
    const prev = specs.get(fieldName)
    if (prev === undefined) return
    const v = b!.value
    if (node.op.id === 'ord.gte') {
      specs.set(fieldName, {
        ...prev,
        min: Option.some(Option.match(prev.min, { onNone: () => v, onSome: m => Math.max(m, v) })),
      })
    } else if (node.op.id === 'ord.gt') {
      specs.set(fieldName, { ...prev, exclusiveMin: Option.some(v) })
    } else if (node.op.id === 'ord.lte') {
      specs.set(fieldName, {
        ...prev,
        max: Option.some(Option.match(prev.max, { onNone: () => v, onSome: m => Math.min(m, v) })),
      })
    } else if (node.op.id === 'ord.lt') {
      specs.set(fieldName, { ...prev, exclusiveMax: Option.some(v) })
    }
  }

  for (const r of Expr.refinementsOf(schema)) {
    visitConjunct(r.node)
  }

  return Array.from(specs.values())
}

/** Generate a JSON Schema object enriched with `Expr.refine` bounds and `metakit/domain` formats. */
export const toJsonSchema = <S extends Schema.Top>(
  schema: S,
): Readonly<Record<string, unknown>> => {
  const fields = fieldSpecs(schema)
  const properties: Record<string, Record<string, unknown>> = {}
  const required: Array<string> = []

  for (const f of fields) {
    const prop: Record<string, unknown> = {}
    const baseType = f.kind === 'enum' ? 'string' : f.kind === 'unknown' ? 'string' : f.kind
    prop['type'] = f.nullable ? [baseType, 'null'] : baseType
    if (Option.isSome(f.min)) prop['minimum'] = f.min.value
    if (Option.isSome(f.max)) prop['maximum'] = f.max.value
    if (Option.isSome(f.exclusiveMin)) prop['exclusiveMinimum'] = f.exclusiveMin.value
    if (Option.isSome(f.exclusiveMax)) prop['exclusiveMaximum'] = f.exclusiveMax.value
    if (Option.isSome(f.literals)) prop['enum'] = f.literals.value
    if (Option.isSome(f.domain)) {
      prop['x-metakit-domain'] = f.domain.value
      if (f.domain.value.kind === 'calendarDay') {
        prop['format'] = 'date'
      }
    }
    properties[f.name] = prop
    required.push(f.name)
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  }
}

type TransitionState<T> = T extends {
  readonly when: Expr.Expr<Transition.TransitionEnv<infer S, never>, boolean>
}
  ? S
  : never

/** Evaluate `Transition.can` across a transition map for UI buttons and agent tool visibility. */
export const affordances = <
  Transitions extends Readonly<
    Record<string, { readonly when: Expr.Expr<Transition.TransitionEnv<never, never>, boolean> }>
  >,
>(
  transitions: Transitions,
  partialState: Expr.PartialEnv<TransitionState<Transitions[keyof Transitions]>>,
): {
  readonly available: ReadonlyArray<keyof Transitions & string>
  readonly disabled: ReadonlyArray<keyof Transitions & string>
  readonly unknown: ReadonlyArray<keyof Transitions & string>
} => {
  const available: Array<keyof Transitions & string> = []
  const disabled: Array<keyof Transitions & string> = []
  const unknown: Array<keyof Transitions & string> = []
  for (const [name, tr] of Object.entries(transitions) as Array<
    readonly [
      keyof Transitions & string,
      { readonly when: Expr.Expr<Transition.TransitionEnv<never, never>, boolean> },
    ]
  >) {
    Verdict.match(
      Transition.can(
        tr as Transition.Transition<unknown, unknown, unknown>,
        {
          state: partialState,
        } as never,
      ),
      {
        True: () => available.push(name),
        False: () => disabled.push(name),
        Unknown: () => unknown.push(name),
      },
    )
  }
  return { available, disabled, unknown }
}
