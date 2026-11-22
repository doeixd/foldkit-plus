/**
 * What a `Rows` node gives from the answers its body gives for each element,
 * shared by evaluation and partial evaluation, so the two cannot part.
 *
 * An element passes only where `where` is true. A refusal is a failure, with
 * the answers `bool.or` and `bool.and` give it: `any` is true once an element
 * passes, whatever another refused, and `every` false once one fails; every
 * other fold is refused where an answer it needs is. Over no element, or none
 * that passes, `any` is false, `every` true, `count` and `sum` 0, and `min`,
 * `max` and `find` null. `sum`, `min` and `max` skip a null value, as SQL's
 * aggregates do; `sum` over integers is the exact total, refused only where
 * it leaves the safe range.
 */
import { Data, Option } from 'effect'
import * as Node from '../node.js'
import { readable } from '../path.js'
import { applyForeign, type ForeignImplementations } from './eval.js'

/** The environment a body reads for one element: `env` with the element under `each`. */
export const withEach = (env: unknown, element: unknown): Readonly<Record<string, unknown>> =>
  env !== null && typeof env === 'object' && !Array.isArray(env)
    ? { ...(env as Record<string, unknown>), [Node.EACH]: element }
    : { [Node.EACH]: element }

/** The elements a `Rows` node folds, read from its source, or the value it gives without them. */
export type Elements = Data.TaggedEnum<{
  Held: { readonly elements: ReadonlyArray<unknown>; readonly whole: boolean }
  Value: { readonly value: unknown }
  Absent: {}
}>

export const Elements = Data.taggedEnum<Elements>()

const at = (rows: Node.Rows): string => `rows.${rows.fold}`

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The elements of `rows` from the value of its source: a list, or the row
 * the related rows point at, which holds them at `<relation>` as
 * `{ rows, whole }`. A null source gives null; a slot the row lacks is
 * `Absent`, which evaluation reads as null and partial evaluation as unknown.
 */
export const elementsOf = (rows: Node.Rows, source: unknown): Elements => {
  if (source === null || source === undefined) return Elements.Value({ value: null })
  if (Node.isRefusal(source)) return Elements.Value({ value: source })
  return Node.RowsOver.$match(rows.over, {
    List: () =>
      Array.isArray(source)
        ? Elements.Held({ elements: source, whole: true })
        : Elements.Value({ value: Node.illTyped(at(rows), 'a list', source) }),
    Related: ({ relation }) => {
      const row = readable(source)
      const segment = Node.relatedSegment(relation)
      if (!isRecord(row)) return Elements.Value({ value: Node.illTyped(at(rows), 'a row', row) })
      if (!Object.hasOwn(row, segment) || row[segment] === undefined) return Elements.Absent()
      const slot = row[segment]
      return isRecord(slot) && Array.isArray(slot['rows']) && typeof slot['whole'] === 'boolean'
        ? Elements.Held({ elements: slot['rows'], whole: slot['whole'] })
        : Elements.Value({
            value: Node.illTyped(at(rows), `{ rows, whole } at "${segment}"`, slot),
          })
    },
  })
}

/** What the body gives for element `index`, asked only when the fold needs it. */
export interface Answers {
  readonly where: (index: number) => unknown
  readonly value: (index: number) => unknown
  readonly set: (index: number, field: string) => unknown
}

/** Whether an element passes: true only where its test is true; a refusal passes on. */
export const passing = (test: unknown): boolean | Node.Refusal => {
  if (Node.isRefusal(test)) return test
  return test === true
}

const numberOf = (rows: Node.Rows, value: unknown): number | null | Node.Refusal => {
  if (value === null || value === undefined || Node.isRefusal(value)) return value ?? null
  if (typeof value !== 'number') return Node.illTyped(at(rows), 'a number', value)
  return Number.isFinite(value)
    ? value
    : new Node.Refusal({ reason: 'non-finite', at: at(rows), detail: `a value is ${value}` })
}

/** The exact total of `values`: by integers where each is one, refused past the safe range. */
const total = (rows: Node.Rows, values: ReadonlyArray<number>): number | Node.Refusal => {
  if (values.every(Number.isSafeInteger)) {
    const exact = values.reduce((sum, value) => sum + BigInt(value), 0n)
    return exact <= BigInt(Number.MAX_SAFE_INTEGER) && exact >= BigInt(-Number.MAX_SAFE_INTEGER)
      ? Number(exact)
      : new Node.Refusal({
          reason: 'unsafe-integer',
          at: at(rows),
          detail: 'the total is past ±(2^53−1)',
        })
  }
  const sum = values.reduce((acc, value) => acc + value, 0)
  if (!Number.isFinite(sum)) {
    return new Node.Refusal({
      reason: 'non-finite',
      at: at(rows),
      detail: 'the total is not finite',
    })
  }
  // -0 is a double's accident, as `num.add` has it.
  return sum === 0 ? 0 : sum
}

/**
 * `element` with each of `entries` written: a field that holds an `Option`
 * takes the value as `Option.some`, or null as `Option.none()`, as a write
 * of a transition does. An element no entry changes is returned as it was.
 */
export const writeFields = (
  element: Readonly<Record<string, unknown>>,
  entries: ReadonlyArray<readonly [string, unknown]>,
): Readonly<Record<string, unknown>> => {
  let next: Record<string, unknown> | undefined
  for (const [field, value] of entries) {
    const held = Object.hasOwn(element, field) ? element[field] : undefined
    if (Object.is(readable(held), value)) continue
    next ??= { ...element }
    next[field] = Option.isOption(held) ? Option.fromNullOr(value) : value
  }
  return next ?? element
}

/** The fold of `rows` over `elements`, from the body's answers for each. */
export const foldAnswers = (
  rows: Node.Rows,
  elements: ReadonlyArray<unknown>,
  answers: Answers,
  foreign: ForeignImplementations = {},
): unknown => {
  const passes = (index: number): boolean | Node.Refusal =>
    Option.isNone(rows.where) ? true : passing(answers.where(index))
  const indices = elements.map((_, index) => index)
  const numbers = (): ReadonlyArray<number> | Node.Refusal => {
    const out: Array<number> = []
    for (const index of indices) {
      const passed = passes(index)
      if (Node.isRefusal(passed)) return passed
      if (!passed) continue
      const value = numberOf(rows, answers.value(index))
      if (Node.isRefusal(value)) return value
      if (value !== null) out.push(value)
    }
    return out
  }
  const extreme = (better: (a: number, b: number) => boolean): unknown => {
    const values = numbers()
    if (Node.isRefusal(values)) return values
    return values.reduce<number | null>(
      (best, value) => (best === null || better(value, best) ? value : best),
      null,
    )
  }
  switch (rows.fold) {
    case 'any':
    case 'every': {
      // `any` is `bool.or` of the passes, `every` is `bool.and`.
      const decisive = rows.fold === 'any'
      let refused: Node.Refusal | undefined
      for (const index of indices) {
        const passed = passes(index)
        if (Node.isRefusal(passed)) refused ??= passed
        else if (passed === decisive) return decisive
      }
      return refused ?? !decisive
    }
    case 'count': {
      let count = 0
      for (const index of indices) {
        const passed = passes(index)
        if (Node.isRefusal(passed)) return passed
        if (passed) count++
      }
      return count
    }
    case 'sum': {
      const values = numbers()
      return Node.isRefusal(values) ? values : total(rows, values)
    }
    case 'min':
      return extreme((a, b) => a < b)
    case 'max':
      return extreme((a, b) => a > b)
    case 'reduce': {
      const op = rows.op
      if (op === undefined || op.claims?.identity === undefined) {
        return new Node.Refusal({
          reason: 'unsupported',
          at: at(rows),
          detail: 'reduce has no operation or identity',
        })
      }
      if (!Object.hasOwn(foreign, Node.foreignName(op))) return Node.unsupported(op)
      let acc: unknown = op.claims.identity.value
      for (const index of indices) {
        const passed = passes(index)
        if (Node.isRefusal(passed)) return passed
        if (!passed) continue
        const value = answers.value(index)
        if (Node.isRefusal(value)) return value
        if (value === null || value === undefined) continue
        acc = applyForeign(op, [acc, value], foreign)
        if (Node.isRefusal(acc)) return acc
      }
      return acc
    }
    case 'find': {
      for (const index of indices) {
        const passed = passes(index)
        if (Node.isRefusal(passed)) return passed
        if (passed) {
          const found = Option.isSome(rows.value) ? answers.value(index) : elements[index]
          return found === undefined ? null : found
        }
      }
      return null
    }
    case 'keep': {
      const kept: Array<unknown> = []
      for (const index of indices) {
        const passed = passes(index)
        if (Node.isRefusal(passed)) return passed
        if (passed) kept.push(elements[index])
      }
      // Nothing left out: the list it was given, so a no-op keeps its identity.
      return kept.length === elements.length ? elements : kept
    }
    case 'patch': {
      let changed = false
      const out: Array<unknown> = []
      for (const index of indices) {
        const element = elements[index]
        const passed = passes(index)
        if (Node.isRefusal(passed)) return passed
        if (!passed) {
          out.push(element)
          continue
        }
        if (!isRecord(element)) return Node.illTyped(at(rows), 'a record', element)
        const entries: Array<readonly [string, unknown]> = []
        for (const [field] of rows.set) {
          const value = answers.set(index, field)
          if (Node.isRefusal(value)) return value
          entries.push([field, value === undefined ? null : value])
        }
        const next = writeFields(element, entries)
        changed ||= next !== element
        out.push(next)
      }
      return changed ? out : elements
    }
  }
}

/** The answers of `rows`'s body for each element, by evaluating it with the element under `each`. */
export const answersBy = (
  rows: Node.Rows,
  elements: ReadonlyArray<unknown>,
  env: unknown,
  run: (node: Node.Node, env: unknown) => unknown,
): Answers => {
  const envs = new Map<number, unknown>()
  const envOf = (index: number): unknown => {
    let known = envs.get(index)
    if (known === undefined) {
      known = withEach(env, elements[index])
      envs.set(index, known)
    }
    return known
  }
  const sets = new Map(rows.set)
  return {
    where: index =>
      Option.match(rows.where, { onNone: () => true, onSome: n => run(n, envOf(index)) }),
    value: index =>
      Option.match(rows.value, { onNone: () => null, onSome: n => run(n, envOf(index)) }),
    set: (index, field) => run(sets.get(field)!, envOf(index)),
  }
}
