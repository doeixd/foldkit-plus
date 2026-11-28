/**
 * The node kinds and operator sorts no conformance case reaches, through both
 * judges, as `lower.test.ts` runs the conformance cases (`lowerKindCases.ts`).
 */
import { Node } from '@doeixd/metakit'
import { evalNode } from '@doeixd/metakit/build'
import { describe, expect, it } from 'vitest'
import { envOf } from '../src/environment.js'
import { foreignOf, readingOf } from '../src/reading.js'
import { differences } from './lowerDifferences.js'
import { compared, entityJudged, idOf, metakitJudged } from './lowerHarness.js'
import { Item, judgedRows, kindCases, operators, serverOnly } from './lowerKindCases.js'

describe('each node kind and operator sort no conformance case reaches, through both judges', () => {
  it.each(kindCases)('$what', c => {
    const answers = judgedRows(c).map(over => ({
      row: idOf(over.row),
      ...compared(c.predicate, over),
    }))
    // A case the switch changed answers as metakit does at each listed row.
    const now = Object.fromEntries(
      differences
        .filter(difference => difference.what === c.what)
        .map(({ row, now }) => [row, now]),
    )
    expect(Object.fromEntries(answers.map(({ row, entity }) => [row, entity]))).toEqual({
      ...c.answers,
      ...now,
    })
    expect(answers.filter(({ entity, metakit }) => entity !== metakit)).toEqual([])
  })
})

describe('a primitive operator the holder does not run', () => {
  const predicate = serverOnly(Item.fields.name)
  const over = judgedRows({ predicate })

  it('is not known to either judge', () => {
    for (const each of over) {
      expect([entityJudged(predicate, each), metakitJudged(predicate, each)]).toEqual([
        'unknown',
        'unknown',
      ])
    }
  })

  it('is refused by name by metakit evaluation, as the note says', () => {
    const lowered = readingOf([predicate])
    const [first] = over
    const value = evalNode(
      lowered.nodes[0]!,
      envOf(lowered, { row: first!.row, owner: Item.identity }),
      foreignOf(lowered, operators),
    )
    expect(Node.isRefusal(value) && [value.reason, value.at]).toEqual([
      'unsupported',
      'lower.serverOnly',
    ])
  })
})
