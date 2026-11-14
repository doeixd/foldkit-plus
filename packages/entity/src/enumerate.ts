/**
 * The enumerator `Laws.check` and a write's `becomes` share: every row a
 * declared write can start from, over the finite members asked about, with the
 * inputs it can be given and the row it leaves. No solver: a member that is not
 * finite, or that the write changes otherwise than by setting it from its
 * input, makes the question undecided, with the reason.
 */
import { Data, Match, Option, Schema, SchemaAST } from 'effect'
import { Judge, type Row } from './evaluate.js'
import { Query } from './expr.js'
import type { AnyEntity, EntityField } from './index.js'
import { kernelOperators } from './memoryTable.js'
import type { MemoryOperators } from './operators.js'
import { own, put } from './record.js'
import { heldRow } from './rows.js'
import type { AnyWrite } from './write.js'

type AnyField = EntityField<string, string, Schema.Constraint>

/** The most rows (rows before, times inputs) one question is enumerated over. */
export const maxRows = 4096

/**
 * The values a stored form can hold, when they are few: a literal, a union of
 * literals, a boolean, each with or without null. None for anything else.
 */
export const finiteValues = (schema: Schema.Top): Option.Option<ReadonlyArray<unknown>> =>
  valuesOf(Schema.toEncoded(schema).ast)

const valuesOf = (ast: SchemaAST.AST): Option.Option<ReadonlyArray<unknown>> => {
  if (SchemaAST.isLiteral(ast)) return Option.some([ast.literal])
  if (SchemaAST.isNull(ast)) return Option.some([null])
  if (SchemaAST.isBoolean(ast)) return Option.some([true, false])
  if (SchemaAST.isUnion(ast)) {
    return Option.map(Option.all(ast.types.map(valuesOf)), each => [...new Set(each.flat())])
  }
  return Option.none()
}

/** One row a write can start from, an input it can be given, and the row it leaves. */
export interface Step {
  readonly before: Row
  readonly input: Row
  readonly after: Row
}

/** What enumerating a write comes to: every step, or why there is no list of them. */
export type Steps = Data.TaggedEnum<{
  Steps: { readonly steps: ReadonlyArray<Step> }
  Undecided: { readonly reason: string }
}>
export const Steps = Data.taggedEnum<Steps>()

/** How a write changes one member: leaves it, sets it to one of a few values, or otherwise. */
type Change = Data.TaggedEnum<{
  Keep: {}
  Set: { readonly key: string; readonly values: ReadonlyArray<unknown>; readonly optional: boolean }
  Other: { readonly reason: string }
}>
const Change = Data.taggedEnum<Change>()

/** The values an input key gives a field, encoded as the field stores them: its own values when the input's are not few. */
const setValues = (
  write: AnyWrite,
  key: string,
  field: AnyField,
): Option.Option<{ readonly values: ReadonlyArray<unknown>; readonly optional: boolean }> => {
  const schema = write.input.schema.fields[key] as unknown as Schema.Top
  const takes = Schema.is(Schema.toType(schema) as Schema.Codec<unknown>)
  // A key that may be absent, or an `Option` holding nothing, writes nothing.
  const optional = SchemaAST.isOptional(schema.ast) || takes(undefined) || takes(Option.none())
  const encode = Schema.encodeUnknownOption(
    field.schema as unknown as Schema.Codec<unknown, unknown>,
  )
  const fromInput = Option.map(valuesOf(Schema.toType(schema).ast), values =>
    values.flatMap(value => Option.toArray(encode(value))),
  )
  return Option.map(
    Option.orElse(fromInput, () => finiteValues(field.schema as unknown as Schema.Top)),
    values => ({ values, optional }),
  )
}

/** How `write` changes the member `key` of its row. */
const changeOf = (write: AnyWrite, key: string): Change => {
  const set = write.sets.find(each => each.field.key === key)
  if (set !== undefined) {
    return Option.match(setValues(write, set.key, set.field), {
      onNone: () => Change.Other({ reason: `${key} is set to any value its input holds` }),
      onSome: ({ values, optional }) => Change.Set({ key: set.key, values, optional }),
    })
  }
  if (write.increments.some(each => each.field.key === key))
    return Change.Other({ reason: `${key} is incremented` })
  if (write.assignments.some(each => each.field.key === key))
    return Change.Other({ reason: `${key} is computed` })
  if (write.links.some(each => each.relation.key === key))
    return Change.Other({ reason: `${key} is linked to another row` })
  if (write.context.some(each => each.member.key === key))
    return Change.Other({ reason: `${key} is set by the write's context` })
  if (write.expect?.field.key === key)
    return Change.Other({ reason: `${key} is the revision it expects, moved on where it lands` })
  return Match.value(write).pipe(
    Match.tag('Insert', () =>
      Change.Other({ reason: `${key} is not written by the insert, so the store decides it` }),
    ),
    Match.orElse(() => Change.Keep()),
  )
}

/** Every combination of one value per key. */
const combinations = (
  choices: ReadonlyArray<readonly [string, ReadonlyArray<unknown>]>,
): ReadonlyArray<Row> =>
  choices.reduce<ReadonlyArray<Row>>(
    (rows, [key, values]) =>
      rows.flatMap(row =>
        values.map(value => {
          const next: Record<string, unknown> = { ...row }
          put(next, key, value)
          return next
        }),
      ),
    [{}],
  )

/** Absent from an input: the key the write is given nothing for. */
const absent: unique symbol = Symbol('absent')

/**
 * Every step `write` can take over the members `members` names (field keys of
 * its Entity): each row before over them and the finite members its `when`
 * reads, dropping a row the `when` definitely refuses, with each input value
 * of the keys that set them. Rows are not filtered by the Entity's
 * invariants: a row may be invalid before a write.
 */
export const steps = (
  write: AnyWrite,
  members: ReadonlyArray<string>,
  options: { readonly operators?: MemoryOperators | undefined } = {},
): Steps => {
  const entity: AnyEntity = write.input.entity
  const fields = entity.fields as Readonly<Record<string, AnyField>>
  const insert = write._tag === 'Insert'
  const changes = new Map<string, Change>()
  // How the write changes a member says more than that the member is not finite, so it is asked first.
  for (const key of members) {
    if (own(fields, key) === undefined)
      return Steps.Undecided({ reason: `${key} is a link, not a field` })
    const change = changeOf(write, key)
    if (change._tag === 'Other') return Steps.Undecided({ reason: change.reason })
    changes.set(key, change)
  }
  const infinite = insert
    ? undefined
    : members.find(key =>
        Option.isNone(finiteValues(own(fields, key)!.schema as unknown as Schema.Top)),
      )
  if (infinite !== undefined) return Steps.Undecided({ reason: `${infinite} is not finite` })
  // What the `when` reads joins the rows when it is finite, so a row it refuses is dropped.
  const condition = Option.filter(write.when, () => !insert)
  const read = Option.map(condition, body => Query.dependencies(body))
  const whenKeys = Option.match(read, {
    onNone: () => [],
    onSome: dependencies =>
      dependencies.predicate
        .map(field => field.key)
        .filter(
          key =>
            !changes.has(key) &&
            Option.isSome(
              Option.flatMap(Option.fromUndefinedOr(own(fields, key)), field =>
                finiteValues(field.schema as unknown as Schema.Top),
              ),
            ),
        ),
  })
  const beforeChoices = insert
    ? []
    : [...new Set([...changes.keys(), ...whenKeys])].map(
        key =>
          [
            key,
            Option.getOrThrow(finiteValues(own(fields, key)!.schema as unknown as Schema.Top)),
          ] as const,
      )
  const setKeys = [...changes.values()].filter(Change.$is('Set'))
  const inputChoices = [...new Map(setKeys.map(set => [set.key, set])).values()].map(
    set => [set.key, set.optional ? [...set.values, absent] : set.values] as const,
  )
  const size = [...beforeChoices, ...inputChoices].reduce(
    (product, [, values]) => product * values.length,
    1,
  )
  if (size > maxRows) return Steps.Undecided({ reason: `more than ${maxRows} rows` })
  const operators = options.operators ?? kernelOperators
  // The `when` is judged only when what it reads is held: an input it reads that is
  // not enumerated, or the write's context, would read as nothing and refuse wrongly.
  const judged = Option.filter(
    Option.zipWith(condition, read, (body, dependencies) => ({ body, dependencies })),
    ({ dependencies }) =>
      dependencies.inputs.every(key => inputChoices.some(([given]) => given === key)) &&
      !dependencies.operations.some(operation => operation === 'viewer' || operation === 'now'),
  )
  const result: Array<Step> = []
  for (const before of combinations(beforeChoices)) {
    for (const given of combinations(inputChoices)) {
      const input: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(given)) if (value !== absent) put(input, key, value)
      const refused = Option.match(judged, {
        onNone: () => false,
        onSome: ({ body }) => {
          const row = heldRow(entity, before)
          const verdict = Judge.query(body, input, row, { operators })
          return verdict._tag === 'Known' && !verdict.truth
        },
      })
      if (refused) continue
      const after: Record<string, unknown> = { ...before }
      for (const [key, change] of changes) {
        if (change._tag === 'Set' && Object.hasOwn(input, change.key))
          put(after, key, own(input, change.key))
      }
      result.push({ before: insert ? {} : before, input, after })
    }
  }
  return Steps.Steps({ steps: result })
}
