// @vitest-environment node
/**
 * The server as the page reaches it, over Remote's handlers: the timeline,
 * posting, and editing, each asked as one person. The guards decide who may
 * write a post; the body's rule refuses one too long.
 */
import { Effect, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { May } from 'foldkit-guard'
import { REMOTE_PROTOCOL_VERSION, Selection, relationOf, type MutationResult } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { Post } from '../src/guard.js'
import { TimelinePost } from '../src/operations.js'
import { openServer, principalOf } from '../src/server/server.js'
import type { Person } from '../src/server/seed.js'
import { memorySqlite } from '../src/server/sqlite-node.js'

/** What the timeline shows of a post: its row, and its author's name and handle. */
const shown = relationOf(Selection.from(TimelinePost))

type Asker = ReturnType<ReturnType<typeof sandbox>>

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
      byAuthor: (authorId: string) =>
        Effect.runPromise(
          handlers
            .FoldkitRemoteQuery({ query: 'ByAuthor', input: { authorId }, window: { first: 25 } })
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
      /** A read of what the timeline shows of post `id`, as the page asks it. */
      readShown: (id: string) =>
        Effect.runPromise(
          handlers
            .FoldkitRemoteRead({ version: REMOTE_PROTOCOL_VERSION, requests: [{ ...shown, id }] })
            .pipe(Effect.provide(database)),
        ),
      mutate: (mutation: 'PostChirp' | 'EditPost' | 'ToggleLike', input: object) =>
        Effect.runPromise(
          handlers
            .FoldkitRemoteMutate({ requestId: `r-${mutation}`, mutation, input })
            .pipe(Effect.result, Effect.provide(database)),
        ),
      /** The mutation as the page sends it, saying what its timeline shows of a post. */
      mutateShown: (mutation: 'PostChirp' | 'EditPost' | 'ToggleLike', input: object) =>
        Effect.runPromise(
          handlers
            .FoldkitRemoteMutate({
              requestId: `r-${mutation}`,
              mutation,
              input,
              shown: [shown],
            })
            .pipe(Effect.provide(database)),
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
  it('puts a new chirp at the top, written by whoever posted it', async () => {
    const you = sandbox()('you')
    expect((await you.mutate('PostChirp', { id: 'n1', body: 'Hi' }))._tag).toBe('Success')
    expect((await you.timeline())[0]).toBe('n1')
    expect(await you.read('n1', ['authorId'])).toEqual({ authorId: 'you' })
  })

  it('keeps the poster as the author, whatever the browser names', async () => {
    const you = sandbox()('you')
    await you.mutate('PostChirp', { id: 'n1', authorId: 'ada', body: 'Hi' })
    expect(await you.read('n1', ['authorId'])).toEqual({ authorId: 'you' })
  })

  it('refuses a body over 280 characters', async () => {
    const you = sandbox()('you')
    const result = await you.mutate('PostChirp', { id: 'n1', body: 'x'.repeat(281) })
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

const decodeMay = Schema.decodeUnknownSync(Entity.select(Post, { may: true }).schema)

describe('what each reader may do', () => {
  it('lists one person’s posts on their profile', async () => {
    expect(await sandbox()('you').byAuthor('ada')).toEqual(['p1', 'p5'])
  })

  it('tells an author they may edit their own posts and no one else’s', async () => {
    const you = sandbox()('you')
    const may = async (id: string) => May.can(decodeMay(await you.read(id, ['may'])).may, 'Update')
    expect(await may('p4')).toBe(true)
    expect(await may('p1')).toBe(false)
  })

  it('tells the admin they may edit every post', async () => {
    const ada = sandbox()('ada')
    const may = async (id: string) => May.can(decodeMay(await ada.read(id, ['may'])).may, 'Update')
    expect(await may('p2')).toBe(true)
    expect(await may('p4')).toBe(true)
  })
})

describe('liking', () => {
  it('counts a like, and answers the post as it now reads', async () => {
    const you = sandbox()('you')
    const answer = await you.mutateShown('ToggleLike', { postId: 'p2' })
    expect(answer.output).toEqual({ liked: true })
    expect(answer.read?.result.entities).toContainEqual(
      expect.objectContaining({
        entity: 'Post',
        id: 'p2',
        values: expect.objectContaining({ likeCount: 3 }),
      }),
    )
    expect(await you.read('p2', ['likeCount'])).toEqual({ likeCount: 3 })
  })

  it('takes a like back when pressed again', async () => {
    const you = sandbox()('you')
    await you.mutate('ToggleLike', { postId: 'p2' })
    expect(await you.mutate('ToggleLike', { postId: 'p2' })).toMatchObject({
      _tag: 'Success',
      success: { output: { liked: false } },
    })
    expect(await you.read('p2', ['likeCount'])).toEqual({ likeCount: 2 })
  })

  it('keeps each person’s like their own', async () => {
    const as = sandbox()
    // You liked p1 in the seed; Ada's like is another one.
    await as('ada').mutate('ToggleLike', { postId: 'p1' })
    expect(await as('you').read('p1', ['likeCount'])).toEqual({ likeCount: 4 })
    await as('you').mutate('ToggleLike', { postId: 'p1' })
    expect(await as('ada').read('p1', ['likeCount'])).toEqual({ likeCount: 3 })
  })
})

/**
 * The law #245 keeps: a write's answer, on what the timeline shows of the
 * rows it names, is what a fresh read of them says after the write.
 */
describe('each write answers what the timeline shows', () => {
  /** What the answer says of `id`: its patch, then its read, field by field. */
  const answered = (answer: typeof MutationResult.Type, id: string) =>
    Object.assign(
      {},
      ...[...answer.entities, ...(answer.read?.result.entities ?? [])]
        .filter(row => row.entity === 'Post' && row.id === id)
        .map(row => row.values),
    )
  /** A fresh read of `id`, on the fields the timeline shows. */
  const fresh = async (you: Asker, id: string) =>
    (await you.readShown(id)).entities.find(row => row.entity === 'Post' && row.id === id)?.values

  it.each([
    ['PostChirp', { id: 'n1', body: 'Hi' }, 'n1'],
    ['EditPost', { id: 'p4', body: 'Edited' }, 'p4'],
    ['ToggleLike', { postId: 'p2' }, 'p2'],
  ] as const)('%s', async (mutation, input, id) => {
    const you = sandbox()('you')
    const answer = await you.mutateShown(mutation, input)
    const reference = await fresh(you, id)
    expect(Object.keys(reference ?? {}).sort()).toEqual([...shown.fields].sort())
    expect(answered(answer, id)).toMatchObject(reference ?? {})
  })
})
