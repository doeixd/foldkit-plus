// @vitest-environment node
/**
 * The server as the page reaches it, over Remote's handlers: the timeline,
 * posting, and editing, each asked as one person. The guards decide who may
 * write a post; the body's rule refuses one too long.
 */
import { Effect } from 'effect'
import { REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { openServer, principalOf } from '../src/server/server.js'
import type { Person } from '../src/server/seed.js'
import { memorySqlite } from '../src/server/sqlite-node.js'

/** A fresh seeded server, and Remote's handlers as `person` on it. */
const sandbox = () => {
  const { server, database } = openServer(memorySqlite())
  const as = (person: Person) => {
    const handlers = RemoteServer.handlers(server, principalOf(person))
    return {
      timeline: () =>
        Effect.runPromise(
          handlers
            .FoldkitRemoteQuery({ query: 'Timeline', input: {}, window: { first: 25 } })
            .pipe(Effect.provide(database)),
        ).then(page => page.edges.map(edge => edge.id)),
      read: (id: string, fields: ReadonlyArray<string>) =>
        Effect.runPromise(
          handlers
            .FoldkitRemoteRead({
              version: REMOTE_PROTOCOL_VERSION,
              requests: [{ entity: 'Post', id, fields }],
            })
            .pipe(Effect.provide(database)),
        ).then(answer => answer.entities[0]?.values),
      mutate: (mutation: 'PostChirp' | 'EditPost', input: object) =>
        Effect.runPromise(
          handlers
            .FoldkitRemoteMutate({ requestId: `r-${mutation}`, mutation, input })
            .pipe(Effect.result, Effect.provide(database)),
        ),
    }
  }
  return as
}

describe('the timeline', () => {
  it('lists every post, the newest first', async () => {
    expect(await sandbox()('you').timeline()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
  })

  it('counts each post’s likes on the server', async () => {
    const read = sandbox()('grace').read
    expect(await read('p1', ['likeCount'])).toEqual({ likeCount: 3 })
    expect(await read('p4', ['likeCount'])).toEqual({ likeCount: 0 })
  })
})

describe('posting', () => {
  it('puts a chirp written as yourself at the top', async () => {
    const you = sandbox()('you')
    expect((await you.mutate('PostChirp', { id: 'n1', authorId: 'you', body: 'Hi' }))._tag).toBe(
      'Success',
    )
    expect((await you.timeline())[0]).toBe('n1')
  })

  it('refuses a chirp written in someone else’s name', async () => {
    const you = sandbox()('you')
    expect(await you.mutate('PostChirp', { id: 'n1', authorId: 'ada', body: 'Hi' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(await you.timeline()).not.toContain('n1')
  })

  it('refuses a body over 280 characters', async () => {
    const you = sandbox()('you')
    const result = await you.mutate('PostChirp', {
      id: 'n1',
      authorId: 'you',
      body: 'x'.repeat(281),
    })
    expect(result._tag).toBe('Failure')
    expect(await you.timeline()).not.toContain('n1')
  })
})

describe('editing', () => {
  it('lets an author edit their own post', async () => {
    const you = sandbox()('you')
    expect((await you.mutate('EditPost', { id: 'p4', body: 'Edited' }))._tag).toBe('Success')
    expect(await you.read('p4', ['body'])).toEqual({ body: 'Edited' })
  })

  it('refuses an edit of someone else’s post', async () => {
    const you = sandbox()('you')
    expect(await you.mutate('EditPost', { id: 'p1', body: 'Mine now' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(await you.read('p1', ['body'])).toEqual({
      body: 'The engine weaves algebraic patterns as the loom weaves flowers.',
    })
  })

  it('lets an admin edit anyone’s post', async () => {
    const ada = sandbox()('ada')
    expect((await ada.mutate('EditPost', { id: 'p2', body: 'Moderated' }))._tag).toBe('Success')
    expect(await ada.read('p2', ['body'])).toEqual({ body: 'Moderated' })
  })
})
