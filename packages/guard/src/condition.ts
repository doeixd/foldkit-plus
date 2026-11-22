/**
 * What an attachment's read rules come to for one principal, once its
 * principal guards are decided: a condition over the row, which an
 * interpreter runs (metakit's evaluator in memory, SQL in a binding).
 * Principal guards never reach it, so their bodies stay on the server that
 * decided them.
 *
 * In memory a condition is one metakit expression: each row guard's body, a
 * metakit node read by `foldkit-entity/lowering`, judged over the row, joined by
 * metakit's `and` and `or`. So null and a refusal mean here what they mean in
 * every reader: a refused guard (text holding a NUL, NaN, a sum past the safe
 * integer range, an operator that throws) refuses the whole condition, which
 * then does not hold, whatever the other guards say.
 */
import { Effect, Match, Option } from 'effect'
import {
  Held,
  Operators,
  Query,
  viewerIdOf,
  type AnyEntity,
  type EntityRef,
  type ExprContext,
  type HeldRow,
  type HeldRows,
  type MemoryOperators,
} from 'foldkit-entity'
import { envOf, foreignOf, readingOf, type Reading } from 'foldkit-entity/lowering'
import { Bool, Node, Verdict } from 'metakit'
import {
  Settled,
  fractionBesideInteger,
  judgeNode,
  residualizeNode,
  settleNode,
} from 'metakit/build'
import {
  attached,
  defaultDeny,
  reachesOther,
  surfaceOf,
  type AnyRule,
  type Deny,
} from './attach.js'
import type { PrincipalGuard, RowGuard } from './index.js'

export type Condition =
  | { readonly _tag: 'Always' }
  | { readonly _tag: 'Never' }
  /** A row guard, and what its `Expr.viewer` reads: the principal it was decided for. */
  | {
      readonly _tag: 'Row'
      readonly guard: RowGuard<any, AnyEntity>
      readonly context: ExprContext
    }
  /** The row its `one` relation points at is readable. */
  | { readonly _tag: 'Inherit'; readonly relation: string }
  | { readonly _tag: 'And'; readonly conditions: ReadonlyArray<Condition> }
  | { readonly _tag: 'Or'; readonly conditions: ReadonlyArray<Condition> }

const always: Condition = Object.freeze({ _tag: 'Always' })
const never: Condition = Object.freeze({ _tag: 'Never' })

/** A conjunction, with what it settles already folded away. */
const and = (conditions: ReadonlyArray<Condition>): Condition => {
  const kept: Array<Condition> = []
  for (const condition of conditions) {
    if (condition._tag === 'Never') return never
    if (condition._tag !== 'Always') kept.push(condition)
  }
  if (kept.length === 0) return always
  if (kept.length === 1) return kept[0]!
  return Object.freeze({ _tag: 'And', conditions: Object.freeze(kept) })
}

/** A disjunction, with what it settles already folded away. */
const or = (conditions: ReadonlyArray<Condition>): Condition => {
  const kept: Array<Condition> = []
  for (const condition of conditions) {
    if (condition._tag === 'Always') return always
    if (condition._tag !== 'Never') kept.push(condition)
  }
  if (kept.length === 0) return never
  if (kept.length === 1) return kept[0]!
  return Object.freeze({ _tag: 'Or', conditions: Object.freeze(kept) })
}

type RowCondition = Extract<Condition, { readonly _tag: 'Row' }>
type Row = Readonly<Record<string, unknown>>

const readings = new WeakMap<RowGuard<any, AnyEntity>, Reading>()

/**
 * What a row guard's body reads past its own nodes, read once.
 * `Guards.declare` asks it of each row guard, so a body no reader can hold
 * (two relations of one name) refuses where it is declared, not when a
 * request reads it.
 */
export const readingOfGuard = (guard: RowGuard<any, AnyEntity>): Reading => {
  const known = readings.get(guard)
  if (known !== undefined) return known
  const made = readingOf([guard.body])
  readings.set(guard, made)
  return made
}

/** One stored row as a holder of it alone: a key it lacks is null, as SQL binds it. */
const flatRow = (values: Row): HeldRow => ({
  field: key => Held.of(Object.hasOwn(values, key) ? (values[key] ?? null) : null),
  follow: relation => Held.unheld(`${relation.owner.name}.${relation.key} leads to another row`),
  pointing: relation => ({
    rows: [],
    missing: Option.some(`${relation.owner.name}.${relation.key} is read from other rows`),
  }),
})

/** What a row guard comes to over `row`: its value (null or a `Refusal` among them), or open. */
const settleGuard = (
  { guard, context }: RowCondition,
  row: HeldRow,
  over: {
    readonly input?: Row | undefined
    readonly rows?: HeldRows | undefined
    readonly operators: MemoryOperators
  },
): Settled => {
  const reading = readingOfGuard(guard)
  return settleNode(
    guard.body.node,
    envOf(reading, {
      row,
      owner: guard.entity.identity,
      input: over.input,
      context,
      rows: over.rows,
    }),
    foreignOf(reading, over.operators),
  )
}

/** A row guard over one stored row, its links held as ref keys, which the rule reads as ids. */
const settleStored = (
  each: RowCondition,
  values: Row,
  input: Row,
  operators: MemoryOperators,
): Settled => {
  let read: Row
  try {
    read = Held.fromRefs(each.guard.query, values)
  } catch {
    // A link that is no ref key: no reader can say what the rule makes of it.
    return Settled.Known({ value: Node.illTyped(each.guard.name, 'a ref key', values) })
  }
  return settleGuard(each, flatRow(read), { input, operators })
}

/**
 * `condition` as one metakit expression: each row guard as `leaf` gives it,
 * each inherited Read as `inherit` does, and an open part as a read of
 * nothing, so it stays open. A part left open is never taken to hold, and
 * neither is one beside it that may be refused (`Bool.or(true, x)` is refused
 * where `x` is).
 */
const nodeOf = (
  condition: Condition,
  leaf: (each: RowCondition) => Settled,
  inherit: (relation: string) => Settled,
): Node.Node => {
  let opened = 0
  const part = (settled: Settled): Node.Node =>
    Settled.$match(settled, {
      Known: ({ value }) => Node.Lit({ value: value === undefined ? null : value }),
      Open: () => Node.Path({ segments: ['open', String(opened++)], ast: Option.none() }),
    })
  const joined = (op: Node.Op, parts: ReadonlyArray<Condition>): Node.Node =>
    parts.map(build).reduce((left, right) => Node.Call({ op, args: [left, right] }))
  const build = (each: Condition): Node.Node =>
    Match.valueTags(each, {
      Always: () => Node.Lit({ value: true }),
      Never: () => Node.Lit({ value: false }),
      Row: row => part(leaf(row)),
      Inherit: ({ relation }) => part(inherit(relation)),
      And: ({ conditions }) => joined(Bool.andOp, conditions),
      Or: ({ conditions }) => joined(Bool.orOp, conditions),
    })
  return build(condition)
}

/**
 * A value no two readers agree on: text holding a NUL, a number that is not
 * finite or is past ±(2^53−1) (exact in SQL, rounded in a double), or a list
 * holding one.
 */
const unportable = (value: unknown): boolean =>
  typeof value === 'string'
    ? value.includes('\u0000')
    : typeof value === 'number'
      ? !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER
      : Array.isArray(value) && value.some(unportable)

/**
 * Whether a row guard of `condition` reads a principal's field holding a
 * value no two readers agree on. Metakit refuses NUL text and NaN and orders
 * ±Infinity; SQL refuses all three, and a guard kept for the statement is
 * never judged in memory. A fraction the guard compares with an integer
 * column is refused too, as SQL lowering refuses it (`fractionBesideInteger`)
 * over the guard with the principal's fields put in. Refused here, before any
 * guard, every reader denies.
 */
const refusesInput = (condition: Condition, input: Row): boolean =>
  Match.valueTags(condition, {
    Always: () => false,
    Never: () => false,
    Row: ({ guard }) =>
      Query.dependencies(guard.query).inputs.some(
        key => Object.hasOwn(input, key) && unportable(input[key]),
      ) ||
      guard.query.where.some(predicate =>
        fractionBesideInteger(residualizeNode(predicate.node, { input })),
      ),
    Inherit: () => false,
    And: ({ conditions }) => conditions.some(each => refusesInput(each, input)),
    Or: ({ conditions }) => conditions.some(each => refusesInput(each, input)),
  })

/** A part a client cannot judge: a rule over who asks, or an inherited Read. */
const open: Settled = Settled.Open({
  reads: Option.none(),
  verdict: Verdict.Unknown('the client cannot judge it'),
})

export const Condition = {
  always,
  never,
  and,
  or,

  /**
   * Whether a row's stored values meet `condition`, its row guards read with
   * `input` (the principal's, from `G.inputOf`). `inherit` answers whether the
   * row a relation points at is readable, which only the caller can look up.
   * `operators` runs the guards' primitive operators: the policy's.
   *
   * It holds only where it is true. A row guard the row's own values make
   * metakit refuse (text holding a NUL, NaN, a sum past the safe integer
   * range, an operator that throws or that `operators` lacks) refuses the
   * whole condition, as a database refuses a whole statement: what a write
   * supplies can deny it, never end the request. So does a part it cannot
   * judge over one row (a path to another row), and a principal's field a
   * guard reads that no reader agrees on (`refusesInput`). A guard a decided
   * principal guard made moot (`[isAdmin, isOwner]` for an admin) is not in
   * the condition, so it is not read.
   */
  holds: (
    condition: Condition,
    values: Readonly<Record<string, unknown>>,
    input: Readonly<Record<string, unknown>>,
    inherit: (relation: string) => boolean,
    operators: MemoryOperators,
  ): boolean =>
    !refusesInput(condition, input) &&
    Settled.$match(
      settleNode(
        nodeOf(
          condition,
          each => settleStored(each, values, input, operators),
          relation => Settled.Known({ value: inherit(relation) }),
        ),
        {},
      ),
      { Known: ({ value }) => value === true, Open: () => false },
    ),

  /**
   * `condition` decided over one row as far as one row can: each row guard
   * over the row alone judged, an inherited Read refused, as a writer refuses
   * one, and each row guard that reads another row (a path, an exists) kept
   * for a statement to judge. `Always` or `Never` when the row alone decides
   * it. A guard the row alone makes metakit refuse, or cannot judge, refuses
   * the whole condition (`Never`): no part kept for the statement can make a
   * refused one hold. So does a principal's field any guard reads, kept ones
   * among them, that no reader agrees on (`refusesInput`), which the
   * statement could not be compiled with.
   */
  residual: (
    condition: Condition,
    values: Readonly<Record<string, unknown>>,
    input: Readonly<Record<string, unknown>>,
    operators: MemoryOperators,
  ): Condition => {
    if (refusesInput(condition, input)) return never
    let refused = false
    const decided = (each: Condition): Condition =>
      Match.valueTags(each, {
        Always: () => each,
        Never: () => each,
        Row: row => {
          if (reachesOther(row.guard)) return each
          return Settled.$match(settleStored(row, values, input, operators), {
            Known: ({ value }) => {
              if (Node.isRefusal(value)) refused = true
              return value === true ? always : never
            },
            Open: () => {
              refused = true
              return never
            },
          })
        },
        Inherit: () => never,
        And: ({ conditions }) => and(conditions.map(decided)),
        Or: ({ conditions }) => or(conditions.map(decided)),
      })
    const left = decided(condition)
    return refused ? never : left
  },

  /** `Always` and `Never` as what one row decided; none where a statement must judge the rest. */
  decided: (condition: Condition): Option.Option<boolean> =>
    Match.valueTags(condition, {
      Always: () => Option.some(true),
      Never: () => Option.some(false),
      Row: () => Option.none(),
      Inherit: () => Option.none(),
      And: () => Option.none(),
      Or: () => Option.none(),
    }),

  /**
   * The members of `written`, the row a write changes, that a condition's
   * guards reading another row start from: each one's fields, the relation
   * each path leaves by, and, where `written` is the viewer's own row, what a
   * path from the viewer leaves it by. A write that changes one would need the
   * guard judged over the row it leaves, which a statement over the stored row
   * does not do.
   */
  reachedFrom: (condition: Condition, written: EntityRef): ReadonlyArray<string> => {
    const read = (each: Condition): ReadonlyArray<string> =>
      Match.valueTags(each, {
        Always: () => [],
        Never: () => [],
        Row: ({ guard, context }) => {
          if (!reachesOther(guard)) return []
          const dependencies = Query.dependencies(guard.query)
          return [
            ...dependencies.predicate.map(field => field.key),
            // An exists reached through a path leaves by its first relation as surely
            // as a path does; one over the row itself reads only its id. A path from the
            // viewer leaves the row written the same way when that row is the viewer's.
            ...dependencies.reaches.flatMap(reach =>
              Match.valueTags(reach, {
                Path: ({ via }) => [via[0]!.key],
                Exists: ({ via }) => via.slice(0, 1).map(relation => relation.key),
                ViewerPath: ({ viewer, via, field }) =>
                  viewer.name === written.entity &&
                  Option.exists(viewerIdOf(viewer, context), id => id === written.id)
                    ? [via[0]?.key ?? field.key]
                    : [],
              }),
            ),
          ]
        },
        Inherit: () => [],
        And: ({ conditions }) => conditions.flatMap(read),
        Or: ({ conditions }) => conditions.flatMap(read),
      })
    return [...new Set(read(condition))]
  },

  /**
   * Whether a row a client holds meets `condition`, as metakit judges it:
   * `True` or `False` only where what the client cannot know cannot change
   * the answer, `Unknown` otherwise. A client cannot know a row guard over
   * the principal's fields, which it is not given, an inherited Read, a rule
   * over a row or field the holder lacks, or an operator only the server
   * runs. A row guard reads the holder's rows (`rows`) where it follows a path
   * from the viewer. A refusal is `Unknown`: the server refuses the request,
   * and a hint does not say so before it does.
   */
  judge: (condition: Condition, row: HeldRow, rows: HeldRows): Verdict.Verdict<never> =>
    judgeNode(
      nodeOf(
        condition,
        each =>
          readsPrincipal(each.guard)
            ? open
            : settleGuard(each, row, { rows, operators: Operators.kernel }),
        () => open,
      ),
      {},
    ),

  /**
   * `condition` with every row guard that reads one of `unset`, and every
   * relation of them it follows, refused: a field a create leaves unset
   * matches no guard, `isNull` and `isNotNull` alike, since the create never
   * said what it holds.
   */
  unsetting: (condition: Condition, unset: ReadonlySet<string>): Condition => {
    const kept = (each: Condition): Condition =>
      Match.valueTags(each, {
        Always: () => each,
        Never: () => each,
        Row: ({ guard }) =>
          Query.dependencies(guard.query).predicate.some(field => unset.has(field.key))
            ? never
            : each,
        Inherit: ({ relation }) => (unset.has(relation) ? never : each),
        And: ({ conditions }) => and(conditions.map(kept)),
        Or: ({ conditions }) => or(conditions.map(kept)),
      })
    return kept(condition)
  },

  /** The members a condition reads: its row guards' fields, and each relation it follows. */
  members: (condition: Condition): ReadonlyArray<string> => {
    const read = (each: Condition): ReadonlyArray<string> =>
      Match.valueTags(each, {
        Always: () => [],
        Never: () => [],
        Row: ({ guard }) => Query.dependencies(guard.query).predicate.map(field => field.key),
        Inherit: ({ relation }) => [relation],
        And: ({ conditions }) => conditions.flatMap(read),
        Or: ({ conditions }) => conditions.flatMap(read),
      })
    return [...new Set(read(condition))]
  },
}

/** A member's read rule for one principal: the condition, and what a refusal shows. */
export interface MemberRead {
  readonly member: string
  readonly condition: Condition
  readonly deny: Deny
}

/**
 * Whether a row guard reads the principal's fields. A visitor has none, so
 * passes no guard that does; one over the row alone (`publishedAt` is set)
 * holds for a visitor as for anyone.
 */
export const readsPrincipal = (guard: RowGuard<any, AnyEntity>): boolean =>
  Query.dependencies(guard.query).inputs.length > 0

/** Every principal guard the rules name, each once. */
const principalGuardsIn = (rules: ReadonlyArray<AnyRule>): ReadonlyArray<PrincipalGuard<any>> => {
  const found = new Map<string, PrincipalGuard<any>>()
  const visit = (rule: AnyRule): void =>
    Match.valueTags(rule, {
      PrincipalGuard: guard => void found.set(guard.name, guard),
      RowGuard: () => {},
      All: ({ rules }) => rules.forEach(visit),
      Inherit: () => {},
    })
  rules.forEach(visit)
  return [...found.values()]
}

/**
 * Turns `rules` into a condition for one principal. Each principal guard is
 * decided once, however many rules name it; a visitor passes no row guard
 * that reads the principal.
 */
const conditionsFor = <R>(
  rules: ReadonlyArray<AnyRule>,
  decide: (guard: PrincipalGuard<any>) => Effect.Effect<boolean, never, R>,
  visitor: boolean,
  context: ExprContext,
): Effect.Effect<(rules: ReadonlyArray<AnyRule>, join: typeof and) => Condition, never, R> =>
  Effect.map(
    Effect.forEach(principalGuardsIn(rules), guard =>
      Effect.map(decide(guard), allowed => [guard.name, allowed] as const),
    ),
    decisions => {
      const allowed = new Map(decisions)
      const conditionOf = (rule: AnyRule): Condition =>
        Match.valueTags(rule, {
          PrincipalGuard: ({ name }) => (allowed.get(name) === true ? always : never),
          RowGuard: guard =>
            visitor && readsPrincipal(guard)
              ? never
              : Object.freeze({ _tag: 'Row' as const, guard, context }),
          All: ({ rules }) => and(rules.map(conditionOf)),
          Inherit: ({ relation }) => Object.freeze({ _tag: 'Inherit' as const, relation }),
        })
      return (rules, join) => join(rules.map(conditionOf))
    },
  )

/** A row's rule for one interaction and principal: the condition, and what a refusal shows. */
export interface RowRule {
  readonly condition: Condition
  readonly deny: Deny
}

/**
 * How a Policy decides one interaction, given the set's principal guards as
 * decided for it.
 */
export const deciding = <R>(
  decide: (guard: PrincipalGuard<any>) => Effect.Effect<boolean, never, R>,
  visitor: boolean,
  interaction: string,
  context: ExprContext,
) => ({
  /** Who may do it to which rows of `entity`: `always`, then the row's rules for it. */
  row: (entity: AnyEntity): Effect.Effect<RowRule, never, R> =>
    Option.match(attached(entity), {
      onNone: () =>
        Effect.succeed({ condition: always, deny: defaultDeny(rowTarget(interaction)) }),
      onSome: attachment => {
        const target = rowTarget(interaction)
        const row = surfaceOf(attachment, target)
        const rules = Option.match(row, {
          onNone: (): ReadonlyArray<AnyRule> => [],
          onSome: ({ rules }) => rules,
        })
        // An interaction left without rules falls to the set's default.
        const unguarded = attachment.unguarded === 'allow' ? always : never
        return Effect.map(
          conditionsFor([...attachment.always, ...rules], decide, visitor, context),
          condition => ({
            condition: and([
              condition(attachment.always, and),
              Option.isSome(row) ? condition(rules, or) : unguarded,
            ]),
            deny: Option.getOrElse(
              Option.flatMap(row, ({ deny }) => deny),
              () => defaultDeny(target),
            ),
          }),
        )
      },
    }),

  /**
   * The rule of each of `members` that has one for this interaction. One
   * without follows its row. A relation key's Read is its relation's, decided
   * over the parent row as a member's is.
   */
  members: (
    entity: AnyEntity,
    members: ReadonlyArray<string>,
  ): Effect.Effect<ReadonlyArray<MemberRead>, never, R> =>
    Option.match(attached(entity), {
      onNone: () => Effect.succeed([]),
      onSome: attachment => {
        const surfaces = members.flatMap(member => {
          const target = Object.hasOwn(entity.relations, member)
            ? ({ _tag: 'Relation', relation: member, interaction } as const)
            : ({ _tag: 'Member', member, interaction } as const)
          return Option.match(surfaceOf(attachment, target), {
            onNone: () => [],
            onSome: ({ rules, deny }) => [
              { member, rules, deny: Option.getOrElse(deny, () => defaultDeny(target)) },
            ],
          })
        })
        return Effect.map(
          conditionsFor(
            surfaces.flatMap(({ rules }) => rules),
            decide,
            visitor,
            context,
          ),
          condition =>
            surfaces.map(({ member, rules, deny }) => ({
              member,
              condition: condition(rules, or),
              deny,
            })),
        )
      },
    }),

  /** A relation's rule for this interaction (`Link`, `Unlink`), when it has one. */
  relation: (
    entity: AnyEntity,
    relation: string,
  ): Effect.Effect<Option.Option<RowRule>, never, R> => {
    const target = { _tag: 'Relation', relation, interaction } as const
    return Option.match(
      Option.flatMap(attached(entity), attachment => surfaceOf(attachment, target)),
      {
        onNone: () => Effect.succeed(Option.none()),
        onSome: ({ rules, deny }) =>
          Effect.map(conditionsFor(rules, decide, visitor, context), condition =>
            Option.some({
              condition: condition(rules, or),
              deny: Option.getOrElse(deny, () => defaultDeny(target)),
            }),
          ),
      },
    )
  },
})

const rowTarget = (interaction: string) => ({ _tag: 'Row', interaction }) as const
