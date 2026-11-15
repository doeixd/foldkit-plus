/**
 * `Lower.check`: whether a declared write fits inside one Domain aggregate.
 * An aggregate is one consistency boundary, so a write lowered into its
 * `decide` may read and set only the row the aggregate holds.
 */
import { Data, Match, Option } from 'effect'
import {
  Entity,
  Query,
  Write,
  dependenciesOf,
  type AnyWrite,
  type Dependencies,
} from 'foldkit-entity'
import { Guards, type AnyRule } from 'foldkit-guard'

/** Why a write cannot be lowered into the aggregate holding its row. */
export type LoweringFinding = Data.TaggedEnum<{
  /** A rule, precondition, invariant or context value reads another row. */
  OutsideBoundary: {
    readonly source: 'when' | 'rule' | 'invariant' | 'context'
    /** The rule's or invariant's name; `when` for the precondition; the Entity a context value reads. */
    readonly name: string
    /** What it reads beyond the row, each as the relations it follows. */
    readonly reaches: ReadonlyArray<string>
  }
  /** The write reads or sets a member the aggregate's row does not persist. */
  NotPersisted: { readonly member: string }
}>
export const LoweringFinding = Data.taggedEnum<LoweringFinding>()

type Reach = Dependencies['reaches'][number]

const nameOf = (reach: Reach): string =>
  Match.valueTags(reach, {
    Path: ({ via, field }) => [...via.map(relation => relation.key), field.key].join('.'),
    Exists: ({ via, relation }) =>
      [...via.map(each => each.key), `${relation.owner.name}.${relation.key}`].join('.'),
    ViewerPath: ({ via, field }) =>
      ['viewer', ...via.map(relation => relation.key), field.key].join('.'),
  })

const outside = (
  source: 'when' | 'rule' | 'invariant',
  name: string,
  { reaches }: Dependencies,
): ReadonlyArray<LoweringFinding> =>
  reaches.length === 0
    ? []
    : [LoweringFinding.OutsideBoundary({ source, name, reaches: reaches.map(nameOf) })]

/** Each row guard a rule holds, with what it is named by. */
const rowGuards = (
  rule: AnyRule,
): ReadonlyArray<{ readonly name: string; readonly body: Dependencies }> =>
  Match.valueTags(rule, {
    PrincipalGuard: () => [],
    RowGuard: guard => [{ name: guard.name, body: Query.dependencies(guard.query) }],
    All: ({ rules }) => rules.flatMap(rowGuards),
    Inherit: () => [],
  })

/** The rules that judge an update of the row and of each member it writes. */
const updateRules = (write: AnyWrite): ReadonlyArray<AnyRule> =>
  Option.match(Guards.attached(write.input.entity), {
    onNone: () => [],
    onSome: attachment => {
      const written = new Set(Write.writes(write).map(member => member.key))
      const members = Object.entries(attachment.members).flatMap(([member, surfaces]) =>
        written.has(member) ? (surfaces['Update']?.rules ?? []) : [],
      )
      return [...(attachment.row['Update']?.rules ?? []), ...attachment.always, ...members]
    },
  })

/**
 * What keeps `write` out of one aggregate: each rule, precondition, invariant
 * or context value that reads another row (`OutsideBoundary`), and each member
 * it reads or sets that is not one of its Entity's stored fields
 * (`NotPersisted`). Empty when it can be lowered.
 */
export const check = (write: AnyWrite): ReadonlyArray<LoweringFinding> => {
  const entity = write.input.entity
  const stored = new Set(Object.keys(entity.fields))
  // A body's `fields` are its own row's; what it reads beyond the row is in `reaches`.
  const when = Option.match(write.when, {
    onNone: () => [],
    onSome: body => outside('when', 'when', Query.dependencies(body)),
  })
  const rules = updateRules(write).flatMap(rule =>
    rowGuards(rule).flatMap(({ name, body }) => outside('rule', name, body)),
  )
  const invariants = [...Entity.invariants(entity), ...Option.toArray(write.ensures)].flatMap(
    held => outside('invariant', held.id, dependenciesOf(held.predicate)),
  )
  const context = Write.contextReads(write).map(name =>
    LoweringFinding.OutsideBoundary({ source: 'context', name, reaches: [name] }),
  )
  const members = [
    ...new Set([...Write.reads(write), ...Write.writes(write)].map(each => each.key)),
  ]
  const notPersisted = members
    .filter(member => !stored.has(member))
    .map(member => LoweringFinding.NotPersisted({ member }))
  return [...when, ...rules, ...invariants, ...context, ...notPersisted]
}
