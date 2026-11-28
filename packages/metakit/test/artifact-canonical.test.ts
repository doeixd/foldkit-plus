import { Effect } from 'effect'
import { expect, it } from 'vitest'
import * as Artifact from '../src/artifact.js'

const rows = (head: string): Artifact.PortableArtifactV1 => ({
  codecVersion: 1,
  node: {
    _tag: 'Rows',
    fold: 'any',
    over: { _tag: 'List', list: { _tag: 'Path', segments: ['rows'] } },
    where: { _tag: 'Path', segments: [head, 'selected'] },
    set: [],
    each: 'item',
  },
  requiredOps: [],
})

it('distinguishes a bound path from free dollar-prefixed paths in canonical forms and fingerprints', async () => {
  const bound = rows('item')
  const free = rows('$r0')
  expect(Artifact.canonicalizeNode(bound.node)).toMatchObject({
    each: '$r0',
    where: { segments: ['$r0', 'selected'] },
  })
  expect.soft(Artifact.canonicalizeNode(free.node)).toMatchObject({
    where: { segments: ['$$r0', 'selected'] },
  })
  expect.soft(Artifact.canonicalizeNode(rows('$$r0').node)).toMatchObject({
    where: { segments: ['$$$r0', 'selected'] },
  })
  const [boundHash, freeHash] = await Effect.runPromise(
    Effect.all([Artifact.fingerprint(bound), Artifact.fingerprint(free)]),
  )
  expect(boundHash).not.toBe(freeHash)
})

it('preserves the fingerprint of a rule without dollar-prefixed path heads', async () => {
  expect(await Effect.runPromise(Artifact.fingerprint(rows('item')))).toBe(
    'sha256:f8c93baff4e8929ead96ea620a42ad4533262399ce6f63b78fcf5363d1f87820',
  )
})
