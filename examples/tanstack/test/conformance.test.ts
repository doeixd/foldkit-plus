/**
 * The conformance suite, run through an engine nobody here designed.
 *
 * Two interpreters written in this repository against one reading of the
 * semantics is not portability — §33.1 says so. This is the third, and the
 * question it answers is whether §6.0.1 says enough for someone else's engine
 * to agree.
 */
import {
  createCollection,
  createLiveQueryCollection,
  localOnlyCollectionOptions,
} from '@tanstack/db'
import { supported as reference } from 'foldkit-remote-server'
import { cases, rows } from 'foldkit-entity/conformance'
import { Query } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { run, supported, TanstackCompileError } from '../src/interpreter.js'

const collection = () => {
  const made = createCollection(
    localOnlyCollectionOptions<Record<string, unknown> & { id: string }, string>({
      getKey: row => row.id,
      initialData: rows.map(row => ({ ...row })) as Array<Record<string, unknown> & { id: string }>,
    }) as never,
  )
  return made as never
}

/** The cases this engine declares it can run. */
const runnable = cases.filter(c => Query.unsupported(c.body, supported).length === 0)
const refused = cases.filter(c => Query.unsupported(c.body, supported).length > 0)

describe('A third interpreter, on the cases it declares it runs', () => {
  it.each(runnable.map(c => ({ ...c, name: c.what })))(
    '$name',
    async ({ body, input, expected }) => {
      const live: any = createLiveQueryCollection(q => run(body, input, collection(), q) as never)
      // A collection is lazy: nothing is computed until it is started.
      const got = (await live.toArrayWhenReady()).map((row: { id: string }) => row.id)

      expect(got).toEqual(expected)
    },
  )
})

describe('What it refuses, and why that is the point', () => {
  it('declares a narrower set than the reference interpreter', () => {
    expect([...reference].sort()).not.toEqual([...supported].sort())
    expect(supported).not.toContain('contains')
  })

  it('refuses every case needing an operation it does not run, rather than answering it', () => {
    expect(refused.length).toBeGreaterThan(0)

    for (const { body, input } of refused) {
      expect(() => run(body, input, collection(), undefined)).toThrow(TanstackCompileError)
    }
  })

  it('would have answered a different question if it had tried', () => {
    // `ilike` has no ESCAPE, so `%` in a search is a wildcard there and a
    // percent sign here. Every case whose search is ordinary text would still
    // pass — which is exactly why the refusal has to be declared rather than
    // discovered by a test that happens to use one.
    const wildcards = cases.filter(
      c => typeof c.input.label === 'string' && /[%_]/.test(c.input.label as string),
    )

    expect(wildcards.length).toBeGreaterThan(0)
    expect(Query.unsupported(wildcards[0]!.body, supported)).toEqual(['contains'])
  })
})
