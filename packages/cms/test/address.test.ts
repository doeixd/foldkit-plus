/**
 * The check that says, while the author types, what a publish would refuse.
 * `RemoteClient` is a stub: what matters is which edges come back and what the
 * check makes of them.
 */
import { Effect } from 'effect'
import { RemoteClient } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { Cms } from '../src/index.js'

const free = Cms.addressFree('posts')

/** Runs the check against a server that holds these rows, by id, at that slug. */
const ask = (
  slug: string,
  subject: Readonly<Record<string, string>>,
  held: ReadonlyArray<string>,
  fail?: boolean,
) => {
  const asked: Array<unknown> = []
  const client = {
    read: () => Effect.die('not read here'),
    query: (request: unknown) => {
      asked.push(request)
      return fail === true
        ? Effect.fail({ _tag: 'RemoteQueryError', message: 'offline' } as never)
        : Effect.succeed({
            edges: held.map(id => ({ entity: 'Post', id, key: id })),
            start: null,
            end: null,
          } as never)
    },
    mutate: () => Effect.die('not mutated here'),
    live: () => Effect.die('not lived here'),
  }
  return Effect.runPromise(
    free(slug, { subject }).pipe(Effect.provideService(RemoteClient, client as never)),
  ).then(answer => ({ answer, asked }))
}

describe('addressFree', () => {
  it('says nothing when no row holds the address', async () => {
    expect((await ask('fresh', {}, [])).answer).toBeUndefined()
  })

  it('says it is used when another row holds it', async () => {
    expect((await ask('live', {}, ['p1'])).answer).toBe('"live" is already used')
  })

  it('lets the row being edited keep its own address', async () => {
    expect((await ask('live', { id: 'p1' }, ['p1'])).answer).toBeUndefined()
  })

  it('still refuses when someone else holds it, whoever is editing', async () => {
    expect((await ask('live', { id: 'p2' }, ['p1'])).answer).toBe('"live" is already used')
  })

  it('asks the content type’s own bySlug query, with the slug', async () => {
    const { asked } = await ask('live', {}, [])
    expect(asked).toEqual([
      expect.objectContaining({ query: 'postsBySlug', input: { slug: 'live' } }),
    ])
  })

  it('says nothing when it cannot ask: the publish is still the rule', async () => {
    expect((await ask('live', {}, ['p1'], true)).answer).toBeUndefined()
  })
})
