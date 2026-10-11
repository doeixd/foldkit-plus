/**
 * What an attachment's read rules come to for one principal, once its
 * principal guards are decided: a condition over the row, which an
 * interpreter runs (`evaluate` in memory, SQL in a binding). Principal guards
 * never reach it, so their bodies stay on the server that decided them.
 */
import { Effect, Match, Option } from 'effect'
import { Query, evaluate, type AnyEntity } from 'foldkit-entity'
import { attached, defaultDeny, surfaceOf, type AnyRule, type Deny } from './attach.js'
import type { PrincipalGuard, RowGuard } from './index.js'

export type Condition =
  | { readonly _tag: 'Always' }
  | { readonly _tag: 'Never' }
  | { readonly _tag: 'Row'; readonly guard: RowGuard<any, AnyEntity> }
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

export const Condition = {
  always,
  never,
  and,
  or,

  /**
   * Whether a row's stored values meet `condition`, its row guards read with
   * `input` (the principal's, from `G.inputOf`). `inherit` answers whether the
   * row a relation points at is readable, which only the caller can look up.
   */
  holds: (
    condition: Condition,
    values: Readonly<Record<string, unknown>>,
    input: Readonly<Record<string, unknown>>,
    inherit: (relation: string) => boolean,
  ): boolean => {
    const holds = (each: Condition): boolean =>
      Match.valueTags(each, {
        Always: () => true,
        Never: () => false,
        Row: ({ guard }) => evaluate(guard.query, input, [values]).length === 1,
        Inherit: ({ relation }) => inherit(relation),
        And: ({ conditions }) => conditions.every(holds),
        Or: ({ conditions }) => conditions.some(holds),
      })
    return holds(condition)
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
 * decided once, however many rules name it; a visitor passes no row guard.
 */
const conditionsFor = <R>(
  rules: ReadonlyArray<AnyRule>,
  decide: (guard: PrincipalGuard<any>) => Effect.Effect<boolean, never, R>,
  visitor: boolean,
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
          RowGuard: guard => (visitor ? never : Object.freeze({ _tag: 'Row' as const, guard })),
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
          conditionsFor([...attachment.always, ...rules], decide, visitor),
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
          Effect.map(conditionsFor(rules, decide, visitor), condition =>
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
