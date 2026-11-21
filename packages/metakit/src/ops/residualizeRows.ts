/**
 * Partial evaluation of a `Rows` node: folded where its elements and every
 * answer its body gives for them are known, decided early where a property
 * of its fold says so, and kept, with its body partly evaluated, otherwise.
 */
import { Option } from 'effect'
import * as Node from '../node.js'
import { foldProperties } from '../properties.js'
import { Elements, elementsOf, foldAnswers, passing, withEach } from './rows.js'

/** `env` without a value under `each`, which inside a body is the body's element. */
const withoutEach = (env: unknown): unknown => {
  if (env === null || typeof env !== 'object' || !Object.hasOwn(env, Node.EACH)) return env
  const { [Node.EACH]: _, ...rest } = env as Record<string, unknown>
  return rest
}

/**
 * An answer some held element's test gives that decides the fold whatever
 * the others give: over every element, the value its fold is `absorbing` in;
 * over some of the related rows, a held answer a `monotone` fold cannot move
 * away from (a pass for `any`, which more rows never make false; a failure
 * for `every`, which more rows never make true).
 */
const decidedBy = (
  rows: Node.Rows,
  whole: boolean,
  tests: ReadonlyArray<Node.Node>,
): Option.Option<unknown> => {
  const properties = foldProperties[rows.fold]
  const decisive = whole
    ? Option.map(Option.fromUndefinedOr(properties.absorbing), ({ value, result }) => ({
        value,
        result,
      }))
    : Option.flatMap(Option.fromUndefinedOr(properties.monotone), direction =>
        // The answer a held element gives is a bound the whole cannot pass.
        rows.fold === 'any' || rows.fold === 'every'
          ? Option.some({ value: direction === 'up', result: direction === 'up' })
          : Option.none(),
      )
  return Option.flatMap(decisive, ({ value, result }) =>
    tests.some(test => Node.$is('Lit')(test) && passing(test.value) === value)
      ? Option.some(result)
      : Option.none(),
  )
}

/**
 * Partially evaluate `rows` against `partialEnv`. `residualize` is the
 * partial evaluator of any node; `lookup` reads a value the environment holds
 * at a path, which is how related rows are found under a row only part of
 * which is known.
 */
export const residualizeRows = (
  rows: Node.Rows,
  partialEnv: unknown,
  residualize: (node: Node.Node, env: unknown) => Node.Node,
  lookup: (segments: ReadonlyArray<string>) => Option.Option<unknown>,
): Node.Node => {
  const source = residualize(Node.rowsSource(rows.over), partialEnv)
  const outer = withoutEach(partialEnv)
  const kept = (): Node.Node =>
    Node.mapRows(
      rows,
      () => source,
      body => residualize(body, outer),
    )
  const held: Option.Option<Elements> = Node.$is('Lit')(source)
    ? Option.some(elementsOf(rows, source.value))
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
  return Elements.$match(held.value, {
    Value: ({ value }) => Node.Lit({ value }),
    Absent: kept,
    Held: ({ elements, whole }) => {
      const answer = (node: Node.Node, index: number): Node.Node =>
        residualize(node, withEach(outer, elements[index]))
      const tests = Option.match(rows.where, {
        onNone: () => elements.map(() => Node.Lit({ value: true })),
        onSome: where => elements.map((_, index) => answer(where, index)),
      })
      const values = Option.match(rows.value, {
        onNone: () => [],
        onSome: value => elements.map((_, index) => answer(value, index)),
      })
      const sets = elements.map((_, index) =>
        rows.set.map(([field, value]) => [field, answer(value, index)] as const),
      )
      const known = [...tests, ...values, ...sets.flat().map(([, value]) => value)].every(
        Node.$is('Lit'),
      )
      if (whole && known) {
        const litOf = (node: Node.Node | undefined): unknown =>
          node !== undefined && Node.$is('Lit')(node) ? node.value : null
        return Node.Lit({
          value: foldAnswers(rows, elements, {
            where: index => litOf(tests[index]),
            value: index => litOf(values[index]),
            set: (index, field) => litOf(sets[index]!.find(([name]) => name === field)?.[1]),
          }),
        })
      }
      return Option.match(decidedBy(rows, whole, tests), {
        onNone: kept,
        onSome: value => Node.Lit({ value }),
      })
    },
  })
}
