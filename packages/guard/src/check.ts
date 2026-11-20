import { Match, Option, Schema, SchemaAST } from 'effect'
import { Entity, type AnyEntity, type Operandish, type Predicate } from 'foldkit-entity'
import { Eq, Expr, Num, Path, type Verdict } from 'metakit'
import * as Policy from 'metakit/policy'
import { enforced, reachesOther, type AnyRule, type Surface } from './attach.js'

type Term = Expr.Expr<unknown, boolean>

export interface PolicyCheck<Row> {
  readonly definition: Policy.Definition<
    Row,
    unknown,
    Readonly<Record<'Update' | 'Read', Expr.Expr<Policy.PolicyEnv<Row, unknown>, boolean>>>
  >
  readonly consistent: Verdict.Verdict<never>
  readonly implication: Verdict.Verdict<never>
}

// A principal body can depend on the interaction. Only the enforcement interpreter
// can run one. Distinct opaque functions give the prover independent free variables.
const unknownRule = (name: string): Term =>
  Expr.opaque({ name }, () => {
    throw new Error(`Guard "${name}" needs an enforcement context`)
  })

// Numeric comparisons on encoded, non-nullable row fields have the same truth
// value in Entity and metakit. Keep a predicate opaque when its SQL semantics
// (nulls, collations, related rows or custom operators) need another interpreter.
const numeric = (
  operand: Operandish,
  prefix: readonly string[],
): Option.Option<Expr.Expr<unknown, number>> => {
  if (
    operand._tag === 'Literal' &&
    typeof operand.value === 'number' &&
    Number.isFinite(operand.value)
  )
    return Option.some(Expr.lit(operand.value))
  if (operand._tag === 'Next') return numeric(operand.field, prefix)
  if (operand._tag === 'Field' && !operand.key.includes('.')) {
    const schema = Schema.toEncoded(operand.schema)
    if (SchemaAST.isNumber(schema.ast) && !Schema.is(schema)(NaN))
      return Option.some(Path.make([...prefix, operand.key]))
  }
  return Option.none()
}

const predicateOf = (predicate: Predicate, prefix: readonly string[]): Option.Option<Term> => {
  const each = (operands: ReadonlyArray<Predicate>) =>
    Option.all(operands.map(p => predicateOf(p, prefix)))
  const sides = (left: Operandish, right: Operandish) =>
    Option.all([numeric(left, prefix), numeric(right, prefix)])
  return Match.value(predicate).pipe(
    Match.tags({
      And: ({ operands }) => Option.map(each(operands), (terms): Term => Expr.all(...terms)),
      Or: ({ operands }) => Option.map(each(operands), (terms): Term => Expr.any(...terms)),
      Eq: ({ left, right }) => Option.map(sides(left, right), ([l, r]): Term => Eq.is(l, r)),
      Compare: ({ left, right, operator }) =>
        Option.map(sides(left, right), ([l, r]): Term => Num[operator](l, r)),
    }),
    Match.orElse(() => Option.none<Term>()),
  )
}

/** Check whether row Update is reachable and implies Read of the named member, on a valid row. */
export const check = <E extends AnyEntity>(
  entity: E,
  member: keyof NoInfer<E>['members'] & string,
): PolicyCheck<E['schema']['Encoded']> => {
  const attached = enforced(entity)
  if (!Object.hasOwn(entity.members, member))
    throw new Error(`[foldkit-guard] Unknown member ${entity.name}.${member}`)
  const rowSchema = Schema.toEncoded(entity.schema).pipe(
    Expr.refine(() =>
      Expr.all(
        ...Entity.invariants(entity)
          .filter(inv => !Entity.readsBefore(inv))
          .map(inv => Option.getOrElse(predicateOf(inv.predicate, []), () => unknownRule(inv.id))),
      ),
    ),
  )
  const principalSchema = Schema.Unknown
  const rowTerms = new Map<AnyRule, Term>()
  const rulesOf = (interaction: 'Read' | 'Update'): Term => {
    if (Option.isNone(attached)) return Expr.lit(true)
    const attachment = attached.value
    const term = (rule: AnyRule): Term =>
      Match.valueTags(rule, {
        All: ({ rules }) => Expr.all(...rules.map(term)),
        Inherit: ({ relation }) => unknownRule(relation),
        PrincipalGuard: ({ name }) => unknownRule(`${interaction}.${name}`),
        RowGuard: guard => {
          // A rule that follows another row may depend on that row's visibility.
          if (reachesOther(guard)) return unknownRule(guard.name)
          const known = rowTerms.get(guard)
          if (known !== undefined) return known
          const built = Option.getOrElse(predicateOf(guard.body, ['row']), () =>
            unknownRule(guard.name),
          )
          rowTerms.set(guard, built)
          return built
        },
      })
    const slot = (surface: Surface | undefined, missing: boolean) =>
      surface === undefined ? Expr.lit(missing) : Expr.any(...surface.rules.map(term))
    const row = slot(attachment.row[interaction], attachment.unguarded === 'allow')
    const terms = [...attachment.always.map(term), row]
    if (interaction === 'Read') {
      const surfaces = Object.hasOwn(entity.relations, member)
        ? attachment.relations
        : attachment.members
      terms.push(slot(surfaces[member]?.Read, true))
    }
    return Expr.all(...terms)
  }
  const definition = {
    rowSchema,
    principalSchema,
    rules: { Update: rulesOf('Update'), Read: rulesOf('Read') },
  }
  return {
    definition,
    consistent: Policy.checkConsistent(definition, 'Update'),
    implication: Policy.checkImplication(definition, 'Update', 'Read'),
  }
}
