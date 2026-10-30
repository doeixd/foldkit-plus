// @vitest-environment node
/**
 * The server as the page reaches it, over Remote's handlers: the timeline,
 * posting, and editing, each asked as one person. The guards decide who may
 * write a post; the body's rule refuses one too long.
 */
import { Effect, Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { May } from 'foldkit-guard'
import { REMOTE_PROTOCOL_VERSION, Selection, relationOf, type MutationResult } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { Post } from '../src/guard.js'
import { TimelinePost, UserCard, likeOf } from '../src/operations.js'
import { openServer, principalOf, server as served } from '../src/server/server.js'
import type { Person } from '../src/server/seed.js'
import { memorySqlite } from '../src/server/sqlite-node.js'

/** What the timeline shows of a post: its row, and its author's name and handle. */
const shown = relationOf(Selection.from(TimelinePost))

type Asker = ReturnType<ReturnType<typeof sandbox>>
type Mutation = 'PostChirp' | 'EditPost' | 'DeletePost' | 'LikePost' | 'Unlike'

/** A fresh seeded server, and Remote's handlers as `person` on it. */
const sandbox = () => {
  const { server, database } = openServer(memorySqlite())
  /** Remote's handlers as `person`, or as a visitor who signed in as no one. */
  const as = (person: Person | 'visitor') => {
    const handlers = RemoteServer.handlers(
      server,
      person === 'visitor' ? Option.none() : principalOf(person),
    )
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
      /** The mutation as the page sends it, under `operation` when given, as `Data.retry` repeats. */
      mutate: (mutation: Mutation, input: object, operation?: string) =>
        Effect.runPromise(
          handlers
            .FoldkitRemoteMutate({
              requestId: `r-${mutation}`,
              mutation,
              input,
              ...(operation === undefined ? {} : { operation }),
            })
            .pipe(Effect.result, Effect.provide(database)),
        ),
      /** A read of what a profile's header shows of `id`. */
      readCard: (id: string) =>
        Effect.runPromise(
          handlers
            .FoldkitRemoteRead({
              version: REMOTE_PROTOCOL_VERSION,
              requests: [{ ...relationOf(Selection.from(UserCard)), id }],
            })
            .pipe(Effect.provide(database)),
        ).then(answer => answer.entities[0]?.values),
      /** The mutation as a profile page sends it, saying what its header shows of a person. */
      mutateCard: (mutation: 'PostChirp' | 'EditPost', input: object) =>
        Effect.runPromise(
          handlers
            .FoldkitRemoteMutate({
              requestId: `r-${mutation}`,
              mutation,
              input,
              shown: [shown, relationOf(Selection.from(UserCard))],
            })
            .pipe(Effect.provide(database)),
        ),
      /** The mutation as the page sends it, saying what its timeline shows of a post. */
      mutateShown: (mutation: Mutation, input: object) =>
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
    expect(await you.read('n1', ['author'])).toEqual({ author: 'User:you' })
  })

  it('keeps the poster as the author, whatever the browser names', async () => {
    const you = sandbox()('you')
    await you.mutate('PostChirp', { id: 'n1', author: 'User:ada', body: 'Hi' })
    expect(await you.read('n1', ['author'])).toEqual({ author: 'User:you' })
  })

  it('answers a chirp sent again under its operation with its row, and refuses another', async () => {
    const as = sandbox()
    const first = await as('you').mutate('PostChirp', { id: 'n1', body: 'Hi' }, 'op-1')
    expect(first._tag).toBe('Success')
    // Its answer lost, the page sends it again as itself.
    expect(await as('you').mutate('PostChirp', { id: 'n1', body: 'Hi' }, 'op-1')).toEqual(first)
    // Another create of the id, or another person's under the same operation, is no retry.
    for (const [person, operation] of [
      ['you', 'op-2'],
      ['ada', 'op-1'],
    ] as const) {
      expect((await as(person).mutate('PostChirp', { id: 'n1', body: 'Hi' }, operation))._tag).toBe(
        'Failure',
      )
    }
  })

  it('refuses a body over 280 characters', async () => {
    const you = sandbox()('you')
    const result = await you.mutate('PostChirp', { id: 'n1', body: 'x'.repeat(281) })
    expect(result._tag).toBe('Failure')
    expect(await you.timeline()).not.toContain('n1')
  })
})

describe('the database', () => {
  // Raw SQL passes the server's checks; the tables' CHECKs, compiled from the domain, do not.
  it("holds the domain's rules against a write that skips the server", () => {
    const sqlite = memorySqlite()
    openServer(sqlite)
    const insert = (statement: string) => () => sqlite.exec(statement)
    expect(insert(`insert into posts values ('n1', 'you', '${'x'.repeat(281)}', 0)`)).toThrow(
      'CHECK constraint failed: posts_body_check',
    )
    // 280 characters, each two UTF-16 units: the rule counts characters, as SQL does.
    expect(insert(`insert into posts values ('n2', 'you', '${'😀'.repeat(280)}', 0)`)).not.toThrow()
    expect(insert("insert into users values ('u1', 'ab', 'Al')")).toThrow('users_handle_check')
    expect(insert("insert into users values ('u2', 'Bad handle', 'Bo')")).toThrow(
      'users_handle_check',
    )
    expect(insert("insert into users values ('u3', 'cy_3', 'Cy')")).not.toThrow()
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

describe('deleting', () => {
  it('lets an author take down their own post, its likes with it, and counts one fewer', async () => {
    const grace = sandbox()('grace')
    // Grace's own post, which Ada and Linus like.
    expect((await grace.mutate('DeletePost', { id: 'p2' }))._tag).toBe('Success')
    expect(await grace.timeline()).not.toContain('p2')
    expect(await grace.read('p2', ['body'])).toBeUndefined()
    expect(await grace.readCard('grace')).toMatchObject({ postCount: 1 })
    // Its likes went with it: a new post under its id counts none of them.
    expect((await grace.mutate('PostChirp', { id: 'p2', body: 'Again' }))._tag).toBe('Success')
    expect(await grace.read('p2', ['likeCount'])).toEqual({ likeCount: 0 })
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

  it('tells each reader they may take down their own posts alone, the admin too', async () => {
    const as = sandbox()
    const may = async (person: Person, id: string) =>
      May.can(decodeMay(await as(person).read(id, ['may'])).may, 'Delete')
    expect(await may('you', 'p4')).toBe(true)
    expect(await may('you', 'p1')).toBe(false)
    expect(await may('ada', 'p1')).toBe(true)
    expect(await may('ada', 'p2')).toBe(false)
  })
})

describe('liking', () => {
  const like = (postId: string, userId: Person) => ({ id: likeOf(postId, userId), postId })

  it('counts a like, and answers the post as it now reads to the liker', async () => {
    const you = sandbox()('you')
    const answer = await you.mutateShown('LikePost', like('p2', 'you'))
    expect(answer.read?.result.entities).toContainEqual(
      expect.objectContaining({
        entity: 'Post',
        id: 'p2',
        values: expect.objectContaining({ likeCount: 3, liked: likeOf('p2', 'you') }),
      }),
    )
    expect(await you.read('p2', ['likeCount', 'liked'])).toEqual({
      likeCount: 3,
      liked: likeOf('p2', 'you'),
    })
  })

  it('takes a like back by the id the post shows', async () => {
    const you = sandbox()('you')
    expect(await you.read('p1', ['liked'])).toEqual({ liked: likeOf('p1', 'you') })
    expect((await you.mutate('Unlike', { id: likeOf('p1', 'you') }))._tag).toBe('Success')
    expect(await you.read('p1', ['likeCount', 'liked'])).toEqual({ likeCount: 2, liked: null })
  })

  it('answers whether you liked it for each reader', async () => {
    const as = sandbox()
    expect(await as('you').read('p3', ['liked'])).toEqual({ liked: likeOf('p3', 'you') })
    expect(await as('linus').read('p3', ['liked'])).toEqual({ liked: null })
  })

  it('makes a like its asker’s, whatever the browser names', async () => {
    const you = sandbox()('you')
    await you.mutate('LikePost', { ...like('p2', 'you'), user: 'User:grace' })
    expect(await you.read('p2', ['liked'])).toEqual({ liked: likeOf('p2', 'you') })
  })

  it('refuses a like under another’s id, so theirs still lands', async () => {
    const as = sandbox()
    expect(await as('grace').mutate('LikePost', like('p4', 'ada'))).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(await as('grace').mutate('LikePost', { id: 'mine', postId: 'p4' })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect((await as('ada').mutate('LikePost', like('p4', 'ada')))._tag).toBe('Success')
    expect(await as('ada').read('p4', ['likeCount', 'liked'])).toEqual({
      likeCount: 1,
      liked: likeOf('p4', 'ada'),
    })
  })

  it('answers a like sent again under its operation with its row', async () => {
    const you = sandbox()('you')
    const first = await you.mutate('LikePost', like('p2', 'you'), 'op-1')
    expect(first._tag).toBe('Success')
    expect(await you.mutate('LikePost', like('p2', 'you'), 'op-1')).toEqual(first)
    expect(await you.read('p2', ['likeCount'])).toEqual({ likeCount: 3 })
    expect((await you.mutate('LikePost', like('p2', 'you'), 'op-2'))._tag).toBe('Failure')
  })

  it('refuses a like taken back by someone else', async () => {
    const as = sandbox()
    expect(await as('ada').mutate('Unlike', { id: likeOf('p1', 'you') })).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(await as('you').read('p1', ['likeCount', 'liked'])).toEqual({
      likeCount: 3,
      liked: likeOf('p1', 'you'),
    })
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
    ['LikePost', { id: likeOf('p2', 'you'), postId: 'p2' }, 'p2'],
  ] as const)('%s', async (mutation, input, id) => {
    const you = sandbox()('you')
    const answer = await you.mutateShown(mutation, input)
    const reference = await fresh(you, id)
    expect(Object.keys(reference ?? {}).sort()).toEqual([...shown.fields].sort())
    expect(answered(answer, id)).toMatchObject(reference ?? {})
  })
})

/**
 * A person's post count is a `Derived.count` of the posts naming them as
 * author: the server counts it with no binding entry, and a chirp's answer
 * reads it, though the chirp names only itself (#233).
 */
describe('a person’s post count', () => {
  it('counts the posts naming them as author', async () => {
    const you = sandbox()('you')
    expect(await you.readCard('ada')).toMatchObject({ postCount: 2 })
    expect(await you.readCard('linus')).toMatchObject({ postCount: 1 })
  })

  it('comes back with a chirp, read after it lands', async () => {
    const you = sandbox()('you')
    const answer = await you.mutateCard('PostChirp', { id: 'n1', body: 'Hi' })
    const card = answer.read?.result.entities.find(row => row.entity === 'User' && row.id === 'you')
    expect(card?.values).toMatchObject({ postCount: 2 })
    expect(answer.entities.map(patch => `${patch.entity}:${patch.id}`)).toEqual(['Post:n1'])
  })
})

/**
 * `may` is a hint for which buttons a page draws (#284): the server decides
 * every write, whatever the page holds or sends. Each write it serves, sent as
 * no button would send it (another's row, a visitor, a `may` forged in the
 * input), is refused, and nothing changes.
 */
describe('a write no button would send', () => {
  /** A `may` saying yes to everything, as a page that edited its cache would hold it. */
  const forged = { row: { Update: true, Delete: true }, reasons: {}, members: {}, relations: {} }
  const refusals: ReadonlyArray<{
    readonly what: string
    readonly as: Person | 'visitor'
    readonly mutation: Mutation
    readonly input: object
  }> = [
    {
      what: 'a visitor posts',
      as: 'visitor',
      mutation: 'PostChirp',
      input: { id: 'n1', body: 'Hi', may: forged },
    },
    {
      what: 'you edit Ada’s chirp, claiming it',
      as: 'you',
      mutation: 'EditPost',
      input: { id: 'p1', body: 'Mine now', author: 'User:you', may: forged },
    },
    {
      what: 'a visitor edits your chirp',
      as: 'visitor',
      mutation: 'EditPost',
      input: { id: 'p4', body: 'Edited', may: forged },
    },
    {
      what: 'you take down Ada’s chirp',
      as: 'you',
      mutation: 'DeletePost',
      input: { id: 'p1', may: forged },
    },
    {
      what: 'Ada, the admin, takes down your chirp',
      as: 'ada',
      mutation: 'DeletePost',
      input: { id: 'p4', may: forged },
    },
    {
      what: 'a visitor takes down your chirp',
      as: 'visitor',
      mutation: 'DeletePost',
      input: { id: 'p4' },
    },
    {
      what: 'Grace likes as Ada',
      as: 'grace',
      mutation: 'LikePost',
      input: { id: likeOf('p4', 'ada'), postId: 'p4', user: 'User:ada' },
    },
    {
      what: 'a visitor likes',
      as: 'visitor',
      mutation: 'LikePost',
      input: { id: likeOf('p4', 'you'), postId: 'p4' },
    },
    {
      what: 'Ada takes back your like',
      as: 'ada',
      mutation: 'Unlike',
      input: { id: likeOf('p1', 'you') },
    },
    {
      what: 'a visitor takes back your like',
      as: 'visitor',
      mutation: 'Unlike',
      input: { id: likeOf('p1', 'you') },
    },
  ]

  /** Everything a write could change, as you read it. */
  const state = async (you: Asker) => {
    const ids = await you.timeline()
    const posts = await Promise.all(ids.map(id => you.read(id, ['body', 'author', 'likeCount'])))
    return { ids, posts }
  }

  it('covers every write the server serves', () => {
    expect([...new Set(refusals.map(refusal => refusal.mutation))].sort()).toEqual(
      [...served.mutations.keys()].sort(),
    )
  })

  it.each(refusals)('refuses it when $what', async ({ as: person, mutation, input }) => {
    const as = sandbox()
    const before = await state(as('you'))
    expect(await as(person).mutate(mutation, input)).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'Forbidden' },
    })
    expect(await state(as('you'))).toEqual(before)
  })
})
