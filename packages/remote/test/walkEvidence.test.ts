/**
 * What `Walk.run` issues (#537): a `Walked` record for each transition it drew
 * against each law it judged, and nothing once any walk failed.
 */
import { Option } from 'effect'
import { Evidence } from 'foldkit-metadata'
import { describe, expect, it } from 'vitest'
import { Walk, type WalkOptions } from '../src/testing.js'

type Message = { readonly _tag: 'Up' } | { readonly _tag: 'Down' }

const { list: cases } = Walk.cases<number, Message>()({
  Up: { 'one up': () => ({ _tag: 'Up' }) },
  Down: { 'one down': () => ({ _tag: 'Down' }) },
})

const walk = (overrides: Partial<WalkOptions<number, Message>> = {}) =>
  Walk.run<number, Message>({
    cases,
    from: [
      { name: 'ten', start: () => 10 },
      { name: 'twenty', start: () => 20 },
    ],
    step: (model, message) => (message._tag === 'Up' ? model + 1 : model - 1),
    violations: (_, __, after) =>
      after < 0 ? [{ law: 'Counter.nonNegative', message: `${after}` }] : [],
    laws: ['Counter.nonNegative', 'Counter.whole'],
    seeds: 5,
    steps: 4,
    ...overrides,
  })

describe('Walk.run evidence', () => {
  it('issues a Walked record per drawn transition per law, all from every start passing', async () => {
    const result = await walk({ transition: tag => `write:${tag}` })
    expect(result.failures).toEqual([])
    expect(result.evidence).toEqual(
      // In the order each was first drawn.
      ['Down', 'Up'].flatMap(tag =>
        ['Counter.nonNegative', 'Counter.whole'].map(law =>
          Evidence.Walked({
            transition: `write:${tag}`,
            law,
            seeds: 5,
            steps: 4,
            starts: ['ten', 'twenty'],
          }),
        ),
      ),
    )
    for (const record of result.evidence)
      expect(Evidence.issuedBy(record)).toEqual(Option.some('foldkit-remote/walk'))
  })

  it('names only what a walk drew, by its tag when no transition is given', async () => {
    const result = await walk({ seeds: 1, steps: 1 })
    // Seed 1's first draw of two cases.
    expect(result.evidence.map(record => record.transition)).toEqual(['Down', 'Down'])
  })

  it('issues nothing once a walk fails', async () => {
    const result = await walk({ from: [{ name: 'zero', start: () => 0 }], seeds: 20 })
    expect(result.failures).not.toEqual([])
    expect(result.evidence).toEqual([])
  })

  it('issues nothing once a regression fails', async () => {
    const result = await walk({
      regressions: [{ name: 'down from zero', from: () => 0, case: () => ({ _tag: 'Down' }) }],
    })
    expect(result.failures.map(failure => failure.start)).toEqual(['regression: down from zero'])
    expect(result.evidence).toEqual([])
  })

  it('refuses a violation naming a law it does not list, and an empty list', async () => {
    await expect(
      walk({ from: [{ name: 'zero', start: () => 0 }], laws: ['Counter.whole'] }),
    ).rejects.toThrow('a violation names "Counter.nonNegative", which `laws` does not list')
    await expect(walk({ laws: [] })).rejects.toThrow('`laws` names nothing it judges')
  })
})
