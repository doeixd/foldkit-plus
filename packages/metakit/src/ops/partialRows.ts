/**
 * A `Rows` node over a partly known environment, for both readers of one: a
 * value where its elements and every answer its body gives for them are
 * known, decided early where a law of its fold says so (`foldLaws`), and left
 * to the reader otherwise, which keeps it with its body partly evaluated
 * (`residualizeNode`) or as what stands open (`judgeNode`).
 */
import { Option } from 'effect'
import * as Node from '../node.js'
import type { ForeignImplementations } from './eval.js'
import { foldLaws } from './laws.js'
import { Elements, elementsOf, foldAnswers, passing, withEach } from './rows.js'

/** How a reader evaluates a body, shows a value, and keeps a `Rows` node it cannot decide. */
export interface RowsReader<T> {
  readonly judge: (node: Node.Node, env: unknown) => T
  readonly known: (judged: T) => Option.Option<unknown>
  readonly value: (value: unknown) => T
  readonly kept: (rows: Node.Rows, source: T, outer: unknown) => T
}

/** `env` without a value under `each`, which inside a body is the body's element. */
const withoutEach = (env: unknown, each: string): unknown => {
  if (env === null || typeof env !== 'object' || !Object.hasOwn(env, each)) return env
  const { [each]: _, ...rest } = env as Record<string, unknown>
  return rest
}

/**
 * An answer some held element's test gives that decides the fold whatever
 * the others give: over every element, the value its fold is `absorbing` in;
 * over some of the related rows, a held answer a `monotone` fold cannot move
 * away from (a pass for `any`, which more rows never make false; a failure
 * for `every`, which more rows never make true).
 */
const decidedBy = <T>(
  rows: Node.Rows,
  whole: boolean,
  tests: ReadonlyArray<T>,
  known: RowsReader<T>['known'],
): Option.Option<unknown> => {
  const laws =
    rows.fold === 'any' || rows.fold === 'every' ? Option.some(foldLaws[rows.fold]) : Option.none()
  const decisive = Option.flatMap(laws, ({ absorbing, monotone }) =>
    whole
      ? Option.fromUndefinedOr(absorbing)
      : // The answer a held element gives is a bound the whole cannot pass.
        Option.some({ value: monotone === 'up', result: monotone === 'up' }),
  )
  return Option.flatMap(decisive, ({ value, result }) =>
    tests.some(test => Option.exists(known(test), answer => passing(answer) === value))
      ? Option.some(result)
      : Option.none(),
  )
}

/**
 * `rows` over `partialEnv` as `reader` judges it. `lookup` reads a value the
 * environment holds at a path, which is how related rows are found under a
 * row only part of which is known.
 */
export const partialRows = <T>(
  rows: Node.Rows,
  partialEnv: unknown,
  reader: RowsReader<T>,
  lookup: (segments: ReadonlyArray<string>) => Option.Option<unknown>,
  foreign?: ForeignImplementations,
): T => {
  const each = Node.rowsEach(rows)
  const source = reader.judge(Node.rowsSource(rows.over), partialEnv)
  const outer = withoutEach(partialEnv, each)
  const kept = (): T => reader.kept(rows, source, outer)
  const sourceValue = reader.known(source)
  const held: Option.Option<Elements> = Option.isSome(sourceValue)
    ? Option.some(elementsOf(rows, sourceValue.value))
    : Node.RowsOver.$match(rows.over, {
        List: () => Option.none(),
        // The row may be known only in part: its related rows can be held all the same.
        Related: ({ of, relation }) =>
          Node.$is('Path')(of)
            ? Option.map(lookup([...of.segments, Node.relatedSegment(relation)]), slot =>
                elementsOf(rows, { [Node.relatedSegment(relation)]: slot }),
              )
            : Option.none(),
      })
  if (Option.isNone(held)) return kept()
  // Narrowed, not matched: `$match` over a reader's own type does not unify to it.
  if (Elements.$is('Value')(held.value)) return reader.value(held.value.value)
  if (Elements.$is('Absent')(held.value)) return kept()
  const { elements, whole } = held.value
  const answer = (node: Node.Node, index: number): T =>
    reader.judge(node, withEach(outer, elements[index], each))
  const tests = Option.match(rows.where, {
    onNone: () => elements.map(() => reader.value(true)),
    onSome: where => elements.map((_, index) => answer(where, index)),
  })
  const values = Option.match(rows.value, {
    onNone: (): ReadonlyArray<T> => [],
    onSome: value => elements.map((_, index) => answer(value, index)),
  })
  const sets = elements.map((_, index) =>
    rows.set.map(([field, value]) => [field, answer(value, index)] as const),
  )
  const answers = [...tests, ...values, ...sets.flat().map(([, value]) => value)]
  const missingOp =
    rows.op !== undefined &&
    (foreign === undefined || !Object.hasOwn(foreign, Node.foreignName(rows.op)))
  if (whole && !missingOp && answers.every(each => Option.isSome(reader.known(each)))) {
    const valueOf = (judged: T | undefined): unknown =>
      judged === undefined ? null : Option.getOrNull(reader.known(judged))
    return reader.value(
      foldAnswers(
        rows,
        elements,
        {
          where: index => valueOf(tests[index]),
          value: index => valueOf(values[index]),
          set: (index, field) => valueOf(sets[index]!.find(([name]) => name === field)?.[1]),
        },
        foreign,
      ),
    )
  }
  return Option.match(decidedBy(rows, whole, tests, reader.known), {
    onNone: kept,
    onSome: value => reader.value(value),
  })
}
