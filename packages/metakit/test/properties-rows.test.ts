/**
 * `foldProperties` and `writeProperties`: each declared property confirmed by
 * a generated check against the evaluator, and a false one caught.
 */
import { Struct } from 'effect'
import { describe, expect, it } from 'vitest'
import { foldProperties, writeProperties } from 'metakit'
import * as Conformance from 'metakit/conformance'

describe('foldProperties', () => {
  const reports = Conformance.checkAllFoldProperties()

  it.each(reports)('every property declared of $op holds over the awkward lists', report => {
    expect(report.failures.slice(0, 3)).toEqual([])
  })

  it('checks each fold that declares something', () => {
    for (const fold of Struct.keys(foldProperties)) {
      const report = reports.find(each => each.op === `rows.${fold}`)
      const declares = Object.keys(foldProperties[fold]).length > 0
      expect(report !== undefined && (!declares || report.checked > 30)).toBe(true)
    }
  })

  it.each([
    // Doubles round: 0.5 + MAX is not MAX + 0.5 as a running total.
    ['sum commutative over every value', 'sum', { commutative: { over: 'all' } }],
    ['sum invertible over every value', 'sum', { from: 'num.add', invertible: { over: 'all' } }],
    ['count monotone down', 'count', { monotone: 'down' }],
    ['every monotone up', 'every', { monotone: 'up' }],
    ['any absorbing in a failure', 'any', { absorbing: { value: false, result: false } }],
    ['every absorbing in a pass', 'every', { absorbing: { value: true, result: true } }],
    ['count identity 1', 'count', { identity: { value: 1 } }],
    [
      'sum associative over integers with refusals',
      'sum',
      { from: 'num.add', associative: { over: 'integers', unlessRefused: false } },
    ],
    ['min invertible', 'min', { from: 'num.add', invertible: { over: 'integers' } }],
  ] as const)('a false declaration is caught: %s', (_, fold, properties) => {
    expect(Conformance.checkFoldProperties(fold, properties).ok).toBe(false)
  })
})

describe('writeProperties', () => {
  const reports = Conformance.checkAllWriteProperties()

  it.each(reports)('every pair listed of $way commutes on seeded states', report => {
    expect(report.failures.slice(0, 3)).toEqual([])
    if (Object.keys(writeProperties[report.way].commutes).length > 0) {
      expect(report.checked).toBeGreaterThan(50)
    }
  })

  it('lists each pair both ways, on one condition', () => {
    for (const way of Struct.keys(writeProperties)) {
      const { commutes } = writeProperties[way]
      for (const other of Struct.keys(commutes)) {
        expect(writeProperties[other].commutes[way]).toBe(commutes[other])
      }
    }
  })

  it('declares idempotent the ways that leave twice as once, and only those', () => {
    expect(
      Struct.keys(writeProperties).filter(way => writeProperties[way].idempotent !== undefined),
    ).toEqual([
      'set',
      'combine',
      'insert',
      'remove',
      'removeWhere',
      'patch',
      'patchWhere',
      'include',
      'exclude',
    ])
  })

  it.each([
    'set',
    'combine',
    'insert',
    'remove',
    'removeWhere',
    'patch',
    'patchWhere',
    'include',
    'exclude',
  ] as const)('checks a write of %s run twice against once', way => {
    expect(writeProperties[way].idempotent).toBeDefined()
    const report = Conformance.checkWriteProperties(way, writeProperties[way])
    expect(report.failures).toEqual([])
    expect(report.checked).toBeGreaterThan(50)
  })

  it.each([
    ['an add', 'add', 'always'],
    ['an append', 'append', 'always'],
    ['a patch that may set a field from itself', 'patch', 'always'],
    ['a patch where it is picked by a test', 'patchWhere', 'always'],
  ] as const)('a false idempotent listing is caught: %s', (_, way, idempotent) => {
    expect(Conformance.checkWriteProperties(way, { commutes: {}, idempotent }).ok).toBe(false)
  })

  it.each([
    ['two appends', 'append', { append: 'always' }],
    ['two inserts', 'insert', { insert: 'always' }],
    ['two sets', 'set', { set: 'always' }],
    ['two patches of one field', 'patch', { patch: 'always' }],
    ['an include and an exclude of one value', 'include', { exclude: 'always' }],
  ] as const)('a false listing is caught: %s', (_, way, commutes) => {
    expect(Conformance.checkWriteProperties(way, { commutes }).ok).toBe(false)
  })
})
