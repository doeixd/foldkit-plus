/**
 * What an attachment's read rules come to for one principal, once its
 * principal guards are decided: a condition over the row, which an
 * interpreter runs (`evaluate` in memory, SQL in a binding). Principal guards
 * never reach it, so their bodies stay on the server that decided them.
 */
import { Effect, Match, Option } from 'effect'
import {
  Held,
  Judge,
  Query,
  evaluateEach,
  type AnyEntity,
  type ExprContext,
  type HeldRow,
  type HeldRows,
  type MemoryOperators,
} from 'foldkit-entity'
import { attached, defaultDeny, surfaceOf, type AnyRule, type Deny } from './attach.js'
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

/** Whether a row guard reads another row: one row cannot judge it. */
const reachesOther = (guard: RowGuard<any, AnyEntity>): boolean =>
  Query.dependencies(guard.query).reaches.length > 0

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
   * A row guard the row's own values make an operator refuse (text holding a
   * NUL, an implementation that throws) does not hold: what a write supplies
   * can deny it, never end the request.
   */
  holds: (
    condition: Condition,
    values: Readonly<Record<string, unknown>>,
    input: Readonly<Record<string, unknown>>,
    inherit: (relation: string) => boolean,
    operators: MemoryOperators,
  ): boolean => {
    const holds = (each: Condition): boolean =>
      Match.valueTags(each, {
        Always: () => true,
        Never: () => false,
        // A row as a Source reads it holds its links as ref keys; the rule reads ids.
        Row: ({ guard, context }) =>
          evaluateEach(guard.query, input, [Held.fromRefs(guard.query, values)], {
            operators,
            context,
          }).matched.length === 1,
        Inherit: ({ relation }) => inherit(relation),
        And: ({ conditions }) => conditions.every(holds),
        Or: ({ conditions }) => conditions.some(holds),
      })
    return holds(condition)
  },

  /**
   * `condition` decided over one row as far as one row can: each row guard
   * over the row alone judged (`holds`), an inherited Read refused, as a
   * writer refuses one, and each row guard that reads another row (a path, an
   * exists) kept for a statement to judge. `Always` or `Never` when the row
   * alone decides it.
   */
  residual: (
    condition: Condition,
    values: Readonly<Record<string, unknown>>,
    input: Readonly<Record<string, unknown>>,
    operators: MemoryOperators,
  ): Condition => {
    const decided = (each: Condition): Condition =>
      Match.valueTags(each, {
        Always: () => each,
        Never: () => each,
        Row: row =>
          reachesOther(row.guard)
            ? each
            : Condition.holds(each, values, input, () => false, operators)
              ? always
              : never,
        Inherit: () => never,
        And: ({ conditions }) => and(conditions.map(decided)),
        Or: ({ conditions }) => or(conditions.map(decided)),
      })
    return decided(condition)
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
   * The members of its own row that a condition's guards reading another row
   * start from: each one's fields, and the relation each path leaves by. A
   * write that changes one would need the guard judged over the row it
   * leaves, which a statement over the stored row does not do.
   */
  reachedFrom: (condition: Condition): ReadonlyArray<string> => {
    const read = (each: Condition): ReadonlyArray<string> =>
      Match.valueTags(each, {
        Always: () => [],
        Never: () => [],
        Row: ({ guard }) => {
          if (!reachesOther(guard)) return []
          const dependencies = Query.dependencies(guard.query)
          return [
            ...dependencies.predicate.map(field => field.key),
            // An exists reached through a path leaves by its first relation as surely
            // as a path does; one over the row itself reads only its id.
            ...dependencies.reaches.flatMap(reach =>
              Match.valueTags(reach, {
                Path: ({ via }) => [via[0]!.key],
                Exists: ({ via }) => via.slice(0, 1).map(relation => relation.key),
                ViewerPath: () => [],
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
   * Whether a row a client holds meets `condition`, a part it cannot decide
   * taken to be `assumed`: a row guard over the principal's fields, which a
   * client is not given, an inherited Read, and a rule over a row or field
   * the holder lacks. A row guard reads the holder's rows (`rows`) where it
   * follows a path from the viewer. Run once assuming each way, it is decided
   * where both agree, since no part of a condition is negated.
   */
  judge: (condition: Condition, row: HeldRow, rows: HeldRows, assumed: boolean): boolean => {
    const judge = (each: Condition): boolean =>
      Match.valueTags(each, {
        Always: () => true,
        Never: () => false,
        Row: ({ guard, context }) =>
          readsPrincipal(guard)
            ? assumed
            : Judge.match(Judge.predicate(guard.body, row, { context, rows }), {
                // SQL's null leaves a row out, as false does.
                onKnown: truth => truth === true,
                onUnknown: () => assumed,
              }),
        Inherit: () => assumed,
        And: ({ conditions }) => conditions.every(judge),
        Or: ({ conditions }) => conditions.some(judge),
      })
    return judge(condition)
  },

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
