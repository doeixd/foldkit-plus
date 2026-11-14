import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { Evidence } from '../src/index.js'

const producer = Evidence.issuer('test/producer')
const pair = { transition: 'write:Sell', law: 'Product.reservedWithinStock' }

describe('Evidence', () => {
  it('names the producer that issued a record', () => {
    const issued = producer.issue(Evidence.Enumerated(pair))
    expect(Evidence.issuedBy(issued)).toEqual(Option.some('test/producer'))
    expect(issued).toMatchObject({ _tag: 'Enumerated', ...pair })
  })

  it.each([
    ['built by the constructor', () => Evidence.Enumerated(pair)],
    ['spread from an issued one', () => ({ ...producer.issue(Evidence.Enumerated(pair)) })],
    [
      'structurally cloned from an issued one',
      () => structuredClone(producer.issue(Evidence.Enumerated(pair))),
    ],
  ])('has no issuer for a record %s', (_, record) => {
    expect(Evidence.issuedBy(record())).toEqual(Option.none())
  })

  it('leaves the record it was handed unissued, and freezes the copy', () => {
    const record = Evidence.Enumerated(pair)
    const issued = producer.issue(record)
    expect(Evidence.issuedBy(record)).toEqual(Option.none())
    expect(Object.isFrozen(issued)).toBe(true)
  })

  it('stamps runtimeOnly records as its own', () => {
    const record = Evidence.runtimeOnly({ ...pair, why: 'the writer refuses an oversell' })
    expect(Evidence.issuedBy(record)).toEqual(Option.some('foldkit-metadata/runtimeOnly'))
    expect(record).toMatchObject({ _tag: 'RuntimeOnly', why: 'the writer refuses an oversell' })
  })

  it.each(['', '   '])('refuses runtimeOnly with the reason %j', why => {
    expect(() => Evidence.runtimeOnly({ ...pair, why })).toThrow(
      'write:Sell x Product.reservedWithinStock needs a reason',
    )
  })

  it('refuses an issuer with no name', () => {
    expect(() => Evidence.issuer(' ')).toThrow('a name is required')
  })
})
