/**
 * What a guard set's rules prove, before any request: whether a row Update is
 * reachable and whether it implies Read of a member. A development and test
 * tool, apart from the main entry so no page carries the prover.
 */
import { Match, Option, Schema, SchemaAST } from 'effect'
import { Entity, type AnyEntity, type Predicate } from 'foldkit-entity'
import { readingOf } from 'foldkit-entity/lowering'
import { Expr, Node, type Verdict } from '@doeixd/metakit'
import { readsOfNode, wrap } from '@doeixd/metakit/build'
import * as Policy from '@doeixd/metakit/policy'
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

/**
 * A predicate over one row as metakit reads it (`foldkit-entity/lowering`),
 * its fields under `row`: none where it reads anything else (the principal's
 * fields, who asks, another row) or calls an operator only an implementation
 * runs, which the checker would know nothing of. An invariant's row after a
 * write (`next`) is the stored row it holds of.
 *
 * None, too, where it reads a field that may be absent or hold NaN: no
 * comparison holds of either, so neither `x >= 0` nor `x < 0` does, and the
 * checker reads every key as present (the plan's Phase 1 item 9).
 */
const predicateOf = (entity: AnyEntity, predicate: Predicate): Option.Option<Node.Node> => {
  const reading = readingOf([predicate])
  const node = Node.mapPaths(predicate.node, path =>
    path.segments[0] === 'next'
      ? Node.Path({ segments: ['row', ...path.segments.slice(1)], ast: path.ast })
      : path,
  )
  const fields: Readonly<Record<string, Schema.Top>> = entity.schema.fields
  const exact = (key: string) => {
    if (!Object.hasOwn(fields, key)) return false
    const stored = Schema.toEncoded(fields[key]!)
    return !SchemaAST.isOptional(stored.ast) && !Schema.is(stored)(NaN)
  }
  const ownRow = Option.exists(readsOfNode(node), reads =>
    reads.every(segments => segments.length === 2 && segments[0] === 'row' && exact(segments[1]!)),
  )
  return reading.foreign.size === 0 && reading.related.size === 0 && ownRow
    ? Option.some(node)
    : Option.none()
}

/** `node`, read over the row itself rather than under `row`, as a row Schema's rule is. */
const overRow = (node: Node.Node): Node.Node =>
  Node.mapPaths(node, path => Node.Path({ segments: path.segments.slice(1), ast: path.ast }))

/** Check whether row Update is reachable and implies Read of the named member, on a valid row. */
const policy = <E extends AnyEntity>(
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
          .map(inv =>
            Option.match(predicateOf(entity, inv.predicate), {
              onNone: () => unknownRule(inv.id),
              onSome: node => wrap<unknown, boolean>(overRow(node)),
            }),
          ),
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
          const built = Option.match(predicateOf(entity, guard.body), {
            onNone: () => unknownRule(guard.name),
            onSome: node => wrap<unknown, boolean>(node),
          })
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

export const GuardCheck = { policy } as const
