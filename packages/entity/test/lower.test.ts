/**
 * The differential test of the translation (`src/lower.ts`, step 4 of the
 * kernel convergence note): every conformance case run through today's judge
 * over the old nodes and through metakit's evaluation of the translated
 * nodes, predicate by predicate and row by row, and the whole query against
 * the case's `expected`. The two must give one answer, except where
 * `differences` names the case and says why.
 */
import { Verdict } from 'metakit'
import { describe, expect, it } from 'vitest'
import {
  Held,
  Judge,
  Query,
  QueryEvaluateError,
  evaluate,
  type AnyQuery,
  type ExprContext,
  type HeldRows,
} from '../src/index.js'
import {
  cases,
  heldWorlds,
  primitiveCases,
  primitiveRefusals,
  refusals,
  relationalCases,
  relationalContext,
  rows,
  variantCases,
  variantRows,
  type ConformanceCase,
} from '../src/conformance/index.js'
import { compared, entityJudged, idOf, metakitJudged, metakitQuery } from './lowerHarness.js'
import { differences, type Difference } from './lowerDifferences.js'
import { kindCases } from './lowerKindCases.js'

/** Each row where the two judges part, by predicate. */
const parted = (
  body: AnyQuery,
  holder: HeldRows,
  input: Readonly<Record<string, unknown>>,
  context?: ExprContext,
): ReadonlyArray<Pick<Difference, 'row' | 'at' | 'entity' | 'metakit'>> =>
  holder.rows(body.entity).flatMap(row =>
    body.where.flatMap((predicate, at) => {
      const { entity, metakit } = compared(predicate, {
        entity: body.entity,
        row,
        input,
        context,
        rows: holder,
      })
      return entity === metakit ? [] : [{ row: idOf(row), at, entity, metakit }]
    }),
  )

const expectedOf = (what: string) =>
  differences
    .filter(difference => difference.what === what)
    .map(({ row, at, entity, metakit }) => ({ row, at, entity, metakit }))

const listed = (what: string) => expectedOf(what).length > 0

const evaluated = (c: ConformanceCase, given: ReadonlyArray<Readonly<Record<string, unknown>>>) => {
  try {
    return evaluate(c.body, c.input, given).map(row => String(row.id))
  } catch (error) {
    if (error instanceof QueryEvaluateError) return 'refused' as const
    throw error
  }
}

const flat = [
  ...[...cases, ...primitiveCases].map(c => ({ c, given: rows })),
  ...variantCases.map(c => ({ c, given: variantRows })),
]

describe('every flat conformance case, through both judges', () => {
  it.each(flat)('$c.what', ({ c, given }) => {
    const holder = Held.rows([{ entity: c.body.entity, rows: given }])
    expect(parted(c.body, holder, c.input)).toEqual(expectedOf(c.what))
    const ids = metakitQuery(
      c.body.entity,
      c.body.where,
      Query.orderFor(c.body, c.input),
      holder.rows(c.body.entity),
      { input: c.input },
    )
    expect(evaluated(c, given)).toEqual(c.expected)
    // A case whose rows part is pinned above, row by row.
    if (!listed(c.what)) expect(ids).toEqual(c.expected)
  })
})

describe('every refusal, through both judges', () => {
  it.each([...refusals, ...primitiveRefusals])('$what', c => {
    const holder = Held.rows([{ entity: c.body.entity, rows }])
    expect(parted(c.body, holder, c.input)).toEqual(expectedOf(c.what))
    expect(() => evaluate(c.body, c.input, rows)).toThrow(QueryEvaluateError)
    const ids = metakitQuery(c.body.entity, c.body.where, [], holder.rows(c.body.entity), {
      input: c.input,
    })
    if (!listed(c.what)) expect(ids).toBe('refused')
  })
})

const [everything, ...partial] = heldWorlds

describe('every relational case, over everything the reader may see', () => {
  it.each(relationalCases)('$what', c => {
    const holder = Held.rows(everything!.tables)
    const context = relationalContext(c)
    expect(parted(c.body, holder, c.input, context)).toEqual(expectedOf(c.what))
    const kept = holder
      .rows(c.body.entity)
      .filter(row => Verdict.isTrue(Judge.query(c.body, c.input, row, { context, rows: holder })))
      .map(idOf)
    expect(kept).toEqual(c.expected)
    expect(
      metakitQuery(c.body.entity, c.body.where, [], holder.rows(c.body.entity), {
        input: c.input,
        context,
        rows: holder,
      }),
    ).toEqual(c.expected)
  })
})

describe('every relational case, over less than the reader may see', () => {
  const pairs = partial.flatMap(world =>
    relationalCases.map(c => ({ c, world, name: `${world.what}: ${c.what}` })),
  )
  it.each(pairs)('$name', ({ c, world, name }) => {
    const holder = Held.rows(world.tables)
    const context = relationalContext(c)
    const judged = holder.rows(c.body.entity).flatMap(row =>
      c.body.where.map((predicate, at) => {
        const over = { entity: c.body.entity, row, input: c.input, context, rows: holder }
        const entity = entityJudged(predicate, over)
        const metakit = metakitJudged(predicate, over)
        return { row: idOf(row), at, entity, metakit }
      }),
    )
    expect(judged.filter(({ entity, metakit }) => entity !== metakit)).toEqual(expectedOf(name))
  })

  it('leaves no difference a decision does not cover', () => {
    expect(differences.filter(({ kind }) => kind === 'uncovered')).toEqual([])
  })

  it('names in each difference a case this test or lowerKinds.test.ts runs', () => {
    const names = new Set([
      ...flat.map(({ c }) => c.what),
      ...[...refusals, ...primitiveRefusals].map(c => c.what),
      ...relationalCases.map(c => c.what),
      ...pairs.map(({ name }) => name),
      ...kindCases.map(c => c.what),
    ])
    expect(differences.filter(({ what }) => !names.has(what))).toEqual([])
  })

  it('decides some rows in every partial world, and leaves some undecided, so the check checks', () => {
    for (const world of partial) {
      const holder = Held.rows(world.tables)
      const judged = relationalCases.flatMap(c =>
        holder.rows(c.body.entity).flatMap(row =>
          c.body.where.map(predicate =>
            metakitJudged(predicate, {
              entity: c.body.entity,
              row,
              input: c.input,
              context: relationalContext(c),
              rows: holder,
            }),
          ),
        ),
      )
      expect([world.what, judged.includes('unknown'), judged.includes('true')]).toEqual([
        world.what,
        true,
        true,
      ])
    }
  })
})
