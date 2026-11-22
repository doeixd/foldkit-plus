/**
 * One declared write against one invariant, decided by metakit's checker over
 * `transitionOf(write)` (step 7 of the kernel convergence note): what
 * `Laws.check` asks of the numbers and of whatever enumeration cannot list.
 * The checker answers in three values; a refusal is never taken from it but
 * from a concrete row and input that the reference judge refuses, so a pair
 * the checker leaves open is still refused when one is found.
 *
 * Its own file, imported by `laws.ts` alone: a page never carries the checker.
 */
import { Data, Match, Option, Schema } from 'effect'
import { Abstract, Node, Path, Verdict } from 'metakit'
import { evalNode } from 'metakit/build'
import { finiteValues } from './enumerate.js'
import { judgeAgainst, readsBefore, type Invariant } from './invariant.js'
import type { Row } from './evaluate.js'
import { Query, dependenciesOf } from './expr.js'
import { lower } from './lower.js'
import { foreignOf } from './lowerOperator.js'
import type { EntityField } from './index.js'
import type { MemoryOperators } from './operators.js'
import { own, put } from './record.js'
import { oneRelations } from './rows.js'
import { Write, type AnyWrite } from './write.js'
import { transitionOf, type WriteState, type WriteTransition } from './writeTransition.js'

type AnyField = EntityField<string, string, Schema.Constraint>

/** A row before, an input and the row after, concrete, that break a rule: what a refusal shows. */
export interface Witness {
  /** The row before the write, encoded as stored; none for a create. */
  readonly before: Option.Option<Row>
  readonly input: Row
  readonly after: Row
  /** The rule it breaks: its id, what it says, and the members a form shows it beside. */
  readonly invariant: string
  readonly message: string
  readonly path: ReadonlyArray<string>
}

/** What metakit's checker, and the search behind it, make of one write and one rule. */
export type Decision = Data.TaggedEnum<{
  /** Every row and input the declarations allow keeps it; `tier` is what the checker proved it with. */
  Kept: { readonly tier: Verdict.ProofTier }
  Refused: { readonly witness: Witness }
  Undecided: { readonly reason: string }
}>
export const Decision = Data.taggedEnum<Decision>()

/** A rule or write this pass cannot read: why. */
class Unreadable extends Error {}

const expr = (node: Node.Node) => ({ [Path.ExprTypeId]: undefined as never, node })

/**
 * `node` over the transition's states: each segment of the row before `row.x`
 * reads `state.row.x`, each of the row after `next.x` reads `next.row.x`
 * (`after`) or `state.row.x` (a rule assumed to hold of the row before).
 */
const underStates = (node: Node.Node, after: 'next' | 'state', before: boolean): Node.Node =>
  Node.substitutePaths(node, segments => {
    const [slice, key, ...rest] = segments
    const plain = key !== undefined && rest.length === 0 && !/^[@<#]/.test(key)
    if (!plain) throw new Unreadable(`it reads ${segments.join('.')}, another row than its own`)
    if (slice === 'next')
      return Option.some(Node.Path({ segments: [after, 'row', key], ast: Option.none() }))
    if (slice === 'row' && before)
      return Option.some(Node.Path({ segments: ['state', 'row', key], ast: Option.none() }))
    throw new Unreadable(`it reads ${segments.join('.')}`)
  })

/**
 * The state's Schema: `transitionOf`'s, widened by the id each `one` relation
 * holds, which a rule may read though the write does not link it.
 */
const stateSchemaOf = (write: AnyWrite): Schema.Codec<WriteState> => {
  const row: Record<string, Schema.Top> = {}
  const { entity } = write.input
  for (const [key, field] of Object.entries(entity.fields)) {
    row[key] = Schema.toEncoded(field.schema as unknown as Schema.Top)
  }
  for (const relation of oneRelations(entity)) {
    row[relation.key] = relation.optional ? Schema.NullOr(Schema.String) : Schema.String
  }
  return Schema.Struct({
    present: Schema.Boolean,
    row: Schema.Struct(row),
  }) as unknown as Schema.Codec<WriteState>
}

interface Built {
  readonly transition: WriteTransition
  readonly stateSchema: Schema.Codec<WriteState>
  /** The assumptions of a step: the invariants the row before keeps, read under `state`. */
  readonly assume: ReadonlyArray<ReturnType<typeof expr>>
}

/** The transition of `write` and what a step of it may assume, or why they cannot be read. */
const build = (write: AnyWrite, assumed: ReadonlyArray<Invariant>): Built => {
  let transition: WriteTransition
  try {
    transition = transitionOf(write)
  } catch (error) {
    // Only what `transitionOf` itself refuses to translate: a programming error stays loud.
    if (error instanceof Error && error.message.startsWith('[foldkit-entity] transitionOf'))
      throw new Unreadable(error.message.replace(/^\[foldkit-entity\] transitionOf [^:]*: /, ''))
    throw error
  }
  const assume: Array<ReturnType<typeof expr>> = []
  for (const held of assumed) {
    try {
      assume.push(expr(underStates(lower([held.predicate]).nodes[0]!, 'state', false)))
    } catch (error) {
      // An assumption this pass cannot read is one fewer, which only loses power.
      if (!(error instanceof Unreadable)) throw error
    }
  }
  return { transition, stateSchema: stateSchemaOf(write), assume }
}

const assumedOf = (
  write: AnyWrite,
  invariants: ReadonlyArray<Invariant>,
): ReadonlyArray<Invariant> =>
  Match.valueTags(write, {
    Insert: () => [],
    Update: () => invariants.filter(each => !readsBefore(each)),
    Delete: () => invariants.filter(each => !readsBefore(each)),
  })

/**
 * `goal` of one step of the write, under the assumed invariants. The checker
 * reads a literal set (a status, a boolean) as the fact that the member is one
 * of its values, so no case of them is split here.
 */
const checkOver = (
  write: AnyWrite,
  assumed: ReadonlyArray<Invariant>,
  goal: Node.Node,
): Verdict.Verdict<never> => {
  const { transition, stateSchema, assume } = build(write, assumed)
  return Abstract.checkGoal(stateSchema, transition, {
    assume: assume as never,
    goal: expr(goal) as never,
  })
}

/**
 * Whether some row the Entity's state invariants allow, and some input, meet a
 * write's `from` and `when`. False only where the checker proves none does.
 */
export const meetable = (write: AnyWrite, invariants: ReadonlyArray<Invariant>): boolean => {
  if (write._tag === 'Insert' || Option.isNone(write.when)) return true
  try {
    const never = checkOver(write, assumedOf(write, invariants), Node.Lit({ value: false }))
    return !Verdict.isTrue(never)
  } catch (error) {
    if (error instanceof Unreadable) return true
    throw error
  }
}

const tierOf = (verdict: Extract<Verdict.Verdict<never>, { readonly _tag: 'True' }>) =>
  Option.match(verdict.evidence, { onNone: () => 'concrete' as const, onSome: ({ tier }) => tier })

/** One declared write against one invariant of its Entity (or its own postcondition). */
export const decide = (
  write: AnyWrite,
  held: Invariant,
  invariants: ReadonlyArray<Invariant>,
  operators: MemoryOperators,
): Decision => {
  const assumed = assumedOf(write, invariants)
  let verdict: Verdict.Verdict<never>
  try {
    const goal = underStates(lower([held.predicate]).nodes[0]!, 'next', true)
    verdict = checkOver(write, assumed, goal)
  } catch (error) {
    if (error instanceof Unreadable) return Decision.Undecided({ reason: error.message })
    throw error
  }
  if (Verdict.isTrue(verdict)) return Decision.Kept({ tier: tierOf(verdict) })
  const witness = search(write, held, assumed, operators)
  if (Option.isSome(witness)) return Decision.Refused({ witness: witness.value })
  return Verdict.match(verdict, {
    True: () => Decision.Undecided({ reason: '' }),
    False: () =>
      Decision.Undecided({
        reason: 'it breaks the rule wherever it applies, but no concrete row was found to show it',
      }),
    Unknown: ({ reason }) => Decision.Undecided({ reason }),
  })
}

/** The most combinations of values one search tries. */
const MAX_COMBINATIONS = 10000

/** The most values of one number a search tries, beside the ends of its Schema. */
const MAX_VALUES = 10

/** The numbers a node names. */
const literalsOf = (node: Node.Node): ReadonlyArray<number> =>
  Node.$match(node, {
    Lit: ({ value }) => (typeof value === 'number' ? [value] : []),
    Path: () => [],
    Call: ({ args }) => args.flatMap(literalsOf),
    If: ({ cond, then, otherwise }) => [cond, then, otherwise].flatMap(literalsOf),
    Match: ({ on, cases, otherwise }) => [
      ...literalsOf(on),
      ...cases.flatMap(([, then]) => literalsOf(then)),
      ...Option.match(otherwise, { onNone: () => [], onSome: literalsOf }),
    ],
    Opaque: () => [],
    Rows: () => [],
  })

/** What a number's Schema holds: whether it is one, and where it ends. */
const rangeOf = (schema: Schema.Top) => {
  const encoded = Schema.toEncoded(schema)
  const infos = new Map<string, Abstract.FieldInfo>()
  Abstract.collectFields(encoded.ast, ['v'], infos)
  const info = [...infos.values()].find(each => each.segments.length === 1)
  return {
    number: info !== undefined && info.kind === 'number',
    ends: info === undefined ? [] : [info.interval.lo, info.interval.hi],
    takes: Schema.is(encoded as Schema.Codec<unknown>),
  }
}

/**
 * The numbers to try for every member: 0, 1, -1, the numbers the rule and the
 * write name, and the ends of each Schema, with the values beside them, twice
 * over, since a rule comparing two members needs a value one past the other's.
 */
const poolOf = (
  named: ReadonlyArray<number>,
  ends: ReadonlyArray<number>,
): ReadonlyArray<number> => {
  let pool = new Set([0, 1, -1, ...named, ...ends].filter(Number.isFinite))
  for (let round = 0; round < 2; round++)
    pool = new Set([...pool].flatMap(value => [value, value + 1, value - 1]))
  return [...pool]
}

/**
 * The values of a member's or an input key's stored form to try: all of a few;
 * of a number, those of the pool its Schema takes nearest 0, and its ends;
 * none otherwise.
 */
const choicesOf = (schema: Schema.Top, pool: ReadonlyArray<number>): ReadonlyArray<unknown> =>
  Option.getOrElse(finiteValues(schema), () => {
    const { number, ends, takes } = rangeOf(schema)
    if (!number) return []
    const near = pool.filter(takes).sort((a, b) => Math.abs(a) - Math.abs(b))
    return [
      ...new Set([
        ...near.slice(0, MAX_VALUES),
        ...ends.filter(end => Number.isFinite(end) && takes(end)),
      ]),
    ]
  })

const size = (value: unknown): number => (typeof value === 'number' ? Math.abs(value) : 0)

/** The members of its row a write reads, and those the rules assumed of the row before bring in. */
const rowKeysOf = (
  write: AnyWrite,
  held: Option.Option<Invariant>,
  assumed: ReadonlyArray<Invariant>,
): ReadonlySet<string> => {
  const keys = new Set<string>(
    Option.match(held, { onNone: () => [], onSome: each => [...each.before, ...each.after] }),
  )
  Write.reads(write).forEach(field => keys.add(field.key))
  for (let grown = true; grown;) {
    grown = false
    for (const other of assumed) {
      if (!other.after.some(key => keys.has(key))) continue
      for (const key of other.after)
        if (!keys.has(key)) {
          keys.add(key)
          grown = true
        }
    }
  }
  return keys
}

/** The input keys that carry a value into the members a rule reads, or that the `when` reads. */
const inputKeysOf = (write: AnyWrite, rowKeys: ReadonlySet<string>): ReadonlySet<string> => {
  const keys = new Set<string>()
  if (write.expect !== undefined) keys.add(write.expect.key)
  for (const { key, field } of write.sets) if (rowKeys.has(field.key)) keys.add(key)
  for (const { key, field } of write.increments) if (rowKeys.has(field.key)) keys.add(key)
  for (const { field, expr: body } of write.assignments)
    if (rowKeys.has(field.key)) dependenciesOf(body).inputs.forEach(key => keys.add(key))
  if (write._tag !== 'Insert')
    Option.map(write.when, body => Query.dependencies(body).inputs.forEach(key => keys.add(key)))
  return keys
}

/**
 * The smallest concrete row and input, from the few values of each member's
 * Schema, that the write takes to a row breaking `held`: within every Schema,
 * meeting the `when`, every assumed invariant held by the row before, and the
 * rule refused by the reference judge on the row after. None where the few
 * tried do not, and where the write asks for a context this search lacks.
 */
const search = (
  write: AnyWrite,
  held: Invariant,
  assumed: ReadonlyArray<Invariant>,
  operators: MemoryOperators,
): Option.Option<Witness> => {
  if (write._tag === 'Delete' || write.context.length > 0) return Option.none()
  const insert = write._tag === 'Insert'
  const fields = write.input.entity.fields as Readonly<Record<string, AnyField>>
  const mentioned = lower([
    held.predicate,
    ...assumed.map(other => other.predicate),
    ...Option.match(write.when, { onNone: () => [], onSome: query => query.where }),
    ...write.assignments.map(assignment => assignment.expr),
  ]).nodes
  const named = mentioned.flatMap(literalsOf)
  const ends = [
    ...Object.values(fields).flatMap(field => rangeOf(field.schema as unknown as Schema.Top).ends),
    ...Object.values(write.input.schema.fields).flatMap(
      schema => rangeOf(schema as unknown as Schema.Top).ends,
    ),
  ]
  const pool = poolOf(named, ends)
  const rowKeys = rowKeysOf(write, Option.some(held), assumed)
  const inputKeys = inputKeysOf(write, rowKeys)
  const variables: Array<{
    readonly slice: 'row' | 'input'
    readonly key: string
    readonly values: ReadonlyArray<unknown>
  }> = []
  if (!insert)
    for (const key of rowKeys) {
      const field = own(fields, key)
      if (field !== undefined)
        variables.push({
          slice: 'row',
          key,
          values: choicesOf(field.schema as unknown as Schema.Top, pool),
        })
    }
  for (const key of inputKeys) {
    const schema = write.input.schema.fields[key] as unknown as Schema.Top | undefined
    if (schema !== undefined)
      variables.push({ slice: 'input', key, values: choicesOf(schema, pool) })
  }
  // A member with nothing to try (text, say) stays absent, and a rule reading it is undecided.
  const tried = variables.filter(({ values }) => values.length > 0)
  const share = Math.max(3, Math.floor(MAX_COMBINATIONS ** (1 / Math.max(1, tried.length))))
  let combos: ReadonlyArray<ReadonlyArray<unknown>> = [[]]
  for (const { values } of tried) {
    // Every combination of a few values each: fewer of each where there are many members.
    combos = combos.flatMap(combo => values.slice(0, share).map(value => [...combo, value]))
    if (combos.length > MAX_COMBINATIONS) return Option.none()
  }
  // The smallest first: the least total, then the smallest input.
  const weight = (combo: ReadonlyArray<unknown>, of?: 'input') =>
    combo.reduce<number>(
      (sum, value, at) => (of === undefined || tried[at]!.slice === of ? sum + size(value) : sum),
      0,
    )
  const ordered = [...combos].sort(
    (a, b) => weight(a) - weight(b) || weight(a, 'input') - weight(b, 'input'),
  )

  const transition = transitionOf(write)
  const foreign = foreignOf(
    lower([
      ...Option.match(write.when, { onNone: () => [], onSome: query => query.where }),
      ...write.assignments.map(assignment => assignment.expr),
    ]),
    operators,
  )
  for (const combo of ordered) {
    const before: Record<string, unknown> = {}
    const input: Record<string, unknown> = {}
    tried.forEach(({ slice, key }, at) => put(slice === 'row' ? before : input, key, combo[at]))
    const state = { present: !insert, row: before }
    const env = { state, input, supplied: {} }
    // The transition's guard holds only where true, as `Transition.step` reads it.
    if (evalNode(transition.when.node, env, foreign) !== true) continue
    const values = transition.writes.map(
      each => [each.target, evalNode(each.value.node, env, foreign)] as const,
    )
    // A member the table cannot compute (an operator it lacks) need not be, where the rule does not read it.
    const unworked = (target: ReadonlyArray<string>, value: unknown): boolean =>
      Node.isRefusal(value) && value.reason === 'unsupported' && !held.after.includes(target[1]!)
    if (values.some(([target, value]) => Node.isRefusal(value) && !unworked(target, value)))
      continue
    const after: Record<string, unknown> = { ...before }
    for (const [target, value] of values) {
      if (target[0] !== 'row') continue
      if (unworked(target, value)) delete after[target[1]!]
      else put(after, target[1]!, value)
    }
    const allowed = assumed.every(other => {
      const holds = other.after.filter(key => Object.hasOwn(before, key))
      // One reading none of what the witness holds stands apart from it.
      if (holds.length === 0) return true
      if (holds.length < other.after.length) return false
      return judgeAgainst([other], { after: before }, operators)._tag === 'Valid'
    })
    if (!allowed) continue
    if (judgeAgainst([held], insert ? { after } : { before, after }, operators)._tag !== 'Invalid')
      continue
    return Option.some({
      before: insert ? Option.none() : Option.some(before),
      input,
      after,
      invariant: held.id,
      message: held.message,
      path: held.path,
    })
  }
  return Option.none()
}
