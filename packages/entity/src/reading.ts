/**
 * What a reader needs of expressions past their own nodes: the order terms'
 * keys, folded under their collations; by segment (`<Badge.member`), the
 * relation whose pointing rows an exists reads; by name, each Entity whose
 * row `viewer.<name>` holds; and by `id@version`, each primitive operator
 * called as a foreign operation, with the implementations a memory table
 * gives of them. `environment.ts` builds the environment from it; every
 * judge in memory and the SQL compiler read both.
 */
import { Match, Option, Schema } from 'effect'
import { Node } from '@doeixd/metakit'
import type { ForeignImplementations } from '@doeixd/metakit/build'
import type { Collation } from './collation.js'
import { childrenOf } from './expr/dependencies.js'
import { originOf, relationName, type AnyExpr, type OneRelation } from './expr/operand.js'
import type { OperatorDescriptor } from './expr/operator.js'
import { declarationOf, foreignOpOf } from './expr/primitive.js'
import { keyOf, type OrderTerm } from './expr/order.js'
import type { AnyEntity } from './index.js'
import type { MemoryOperators } from './operators.js'

/** The rows pointing at a row through `relation`, and every filter asked of them, over the pointing row as `row`. */
export interface RelatedSlot {
  readonly relation: OneRelation
  readonly filters: ReadonlyArray<Option.Option<Node.Node>>
}

/** Expressions as a reader reads them: their nodes, and what they read past their own segments. */
export interface Reading {
  /** The expressions given, in order. */
  readonly nodes: ReadonlyArray<Node.Node>
  /** Each order term's key, folded under its collation, in order. */
  readonly keys: ReadonlyArray<Node.Node>
  /** By segment (`<Badge.member`), the relation whose rows it holds. */
  readonly related: ReadonlyMap<string, RelatedSlot>
  /** By name, each Entity whose row `viewer.<name>` holds. */
  readonly viewers: ReadonlyMap<string, AnyEntity>
  /** By name (`id@version`), each primitive operator called as a foreign operation. */
  readonly foreign: ReadonlyMap<string, OperatorDescriptor>
}

/**
 * `exprs` and the keys of `terms` (an order's, after `Query.orderFor`) as a
 * reader reads them. Refuses what no reader in memory can hold: a backend's
 * locale collation on a term, two relations of one name, two declarations of
 * one foreign operation.
 */
export const readingOf = (
  exprs: ReadonlyArray<AnyExpr>,
  terms: ReadonlyArray<OrderTerm> = [],
): Reading => {
  const related = new Map<string, RelatedSlot>()
  const viewers = new Map<string, AnyEntity>()
  const foreign = new Map<string, OperatorDescriptor>()
  const seen = new Set<Node.Node>()
  const visit = (node: Node.Node): void => {
    if (seen.has(node)) return
    seen.add(node)
    Option.map(originOf(node), origin =>
      Match.value(origin).pipe(
        Match.tags({
          Viewer: ({ entity }) => {
            viewers.set(entity.name, entity)
          },
          ViewerHop: ({ viewer }) => {
            viewers.set(viewer.name, viewer)
          },
          Exists: ({ relation, where }) => {
            const name = relationName(relation)
            const segment = Node.relatedSegment(name)
            const known = related.get(segment)
            if (known !== undefined && known.relation !== relation) {
              throw new Error(
                `[foldkit-entity] two relations are named ${name}; an environment holds the rows of one`,
              )
            }
            related.set(segment, { relation, filters: [...(known?.filters ?? []), where] })
          },
        }),
        Match.orElse(() => undefined),
      ),
    )
    if (Node.$is('Call')(node) && Node.isForeign(node.op)) {
      const name = Node.foreignName(node.op)
      Option.map(declarationOf(node.op), operator => {
        const known = foreign.get(name)
        if (known !== undefined && known !== operator) {
          throw new Error(
            `[foldkit-entity] two declarations of ${name} are called; a foreign operation is one declaration`,
          )
        }
        foreign.set(name, operator)
      })
    }
    childrenOf(node).forEach(visit)
  }
  const nodes = exprs.map(expr => expr.node)
  const keys = terms.map(keyOf)
  ;[...nodes, ...keys].forEach(visit)
  return { nodes, keys, related, viewers, foreign }
}

const NUL = String.fromCharCode(0)

/**
 * The implementations in `operators` of each foreign operation `reading`
 * calls, by `id@version`, as metakit's readers take them, so two versions of
 * one operator each run their own. Each runs as the memory interpreter ran
 * it: text holding a NUL refused, a throw refused (`failed`, by metakit), and
 * an answer its output schema does not admit refused in a checked table. It
 * is told no collation: an operator that compares text is given it folded.
 */
export const foreignOf = (reading: Reading, operators: MemoryOperators): ForeignImplementations =>
  Object.fromEntries(
    [...reading.foreign].flatMap(([name, operator]) =>
      Option.match(operators.get(operator), {
        onNone: () => [],
        onSome: run => [
          [
            name,
            {
              run: (values: ReadonlyArray<unknown>): unknown => {
                if (values.some(value => typeof value === 'string' && value.includes(NUL))) {
                  return Node.unportable(operator.id)
                }
                const answer = run(values, { collation: Option.none<Collation>() })
                const unknownTruth = foreignOpOf(operator).returns === 'boolean' && answer === null
                return operators.checked &&
                  !unknownTruth &&
                  !Schema.is(Schema.toEncoded(operator.output))(answer)
                  ? Node.illTyped(operator.id, 'a value its output schema admits', answer)
                  : answer
              },
            },
          ] as const,
        ],
      }),
    ),
  )
