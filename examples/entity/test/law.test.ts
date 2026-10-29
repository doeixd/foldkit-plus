// @vitest-environment node
/**
 * The law over the declared edit: run through the page's own `Data.mutate` and
 * through the server, the page holding every post and author. What the page
 * shows while the edit is pending must be what SQLite then stores, the editor
 * relation and each list's order included.
 */
import { Effect, Layer, Option } from 'effect'
import { Remote } from 'foldkit-remote'
import { Law } from 'foldkit-remote/testing'
import { RemoteServer } from 'foldkit-remote-server'
import { afterEach, describe, expect, it } from 'vitest'
import { Data, initial } from '../src/app.js'
import { AuthorId, Blog, PostId } from '../src/domain.js'
import { EditPostMutation, PostSort, PostsQuery } from '../src/operations.js'
import { openServer } from '../src/server.js'

const opened: Array<ReturnType<typeof openServer>> = []
afterEach(() => {
  for (const backend of opened.splice(0)) backend.close()
})

const byTitle = PostsQuery.ref({ search: '', sort: { by: 'title', direction: 'asc' } })
const unsorted = PostsQuery.ref({ search: '', sort: PostSort.none })

const checked = (input: typeof EditPostMutation.Input.Type) => {
  const backend = openServer()
  opened.push(backend)
  return Effect.runPromise(
    Law.check(Data, {
      model: initial(),
      holds: [
        { entity: Blog.Post, ids: ['p1', 'p2'] },
        { entity: Blog.Author, ids: ['a1', 'a2'] },
      ],
      lists: [byTitle, unsorted],
      mutation: EditPostMutation,
      input,
      // When the reader acted: nothing in this domain is set from it.
      now: 0,
    }).pipe(
      Effect.provide(
        Remote.clientLayer(RemoteServer.handlers(backend.server, Option.none())).pipe(
          Layer.provide(backend.layer),
        ),
      ),
    ),
  )
}

describe('the law over the declared edit', () => {
  it.each([
    {
      what: 'a rename, which moves the post in the list sorted by title',
      input: {
        id: PostId.make('p2'),
        title: 'about engines',
        published: false,
        editorId: AuthorId.make('a2'),
      },
      compares: ['Post:p2.title', 'Post:p2.published', 'Post:p2.editor', byTitle.identity],
    },
    {
      what: 'the editor taken away, and the post published',
      input: { id: PostId.make('p2'), title: 'Compilers', published: true, editorId: null },
      compares: ['Post:p2.editor', 'Post:p2.published'],
    },
  ])('$what', async ({ input, compares }) => {
    const report = await checked(input)
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toEqual(expect.arrayContaining(compares))
  })
})
