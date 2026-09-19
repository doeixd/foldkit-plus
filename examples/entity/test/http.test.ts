import { Effect } from 'effect'
import { Remote, type RemoteClient } from 'foldkit-remote'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Data, EditForm, Message, PostEditor, Posts, initial, update } from '../src/app.js'
import { EditPostForm } from '../src/editForm.js'
import { startHttpServer } from '../src/http.js'
import { httpClient } from '../src/transport.js'

let server: Awaited<ReturnType<typeof startHttpServer>>
beforeAll(async () => {
  server = await startHttpServer(0)
})
afterAll(() => server.close())

describe('the HTTP transport the browser uses', () => {
  it('reads a list, saves an edit, and reports a server failure, over real HTTP', async () => {
    const client = Remote.clientLayer(httpClient(server.url))
    const run = <A, E>(effect: Effect.Effect<A, E, RemoteClient>) =>
      Effect.runPromise(effect.pipe(Effect.provide(client)))

    const listed = await run(Data.prefetch(initial(), Posts.active.projectionOf(initial())!))
    const page = Posts.page(listed)
    expect(page._tag === 'Ready' && page.value.items.map(row => row.title)).toEqual([
      'Notes on the Engine',
      'Compilers',
    ])

    const opened = EditForm.helpers.open('p2')(listed).model
    const loaded = PostEditor.sync(
      await run(Data.prefetch(opened, PostEditor.active.projectionOf(opened)!)),
    ).model
    const form = (model: typeof loaded, message: typeof EditPostForm.Message.Type) =>
      update(model, Message.GotEditPostMessage({ message }))

    const typed = form(loaded, EditPostForm.Message.Changed({ key: 'title', value: 'Over HTTP' }))
    const submitted = form(typed.model, EditPostForm.Message.Submitted())
    expect(PostEditor.status(submitted.model)).toBe('Saving')

    const settled = await run(submitted.commands![0]!.effect)
    const saved = update(submitted.model, settled as Message).model
    expect(PostEditor.status(saved)).toBe('Saved')
    const after = Posts.page(saved)
    expect(after._tag === 'Ready' && after.value.items[1]?.title).toBe('Over HTTP')
  })

  it('turns a failure on the server into the client’s own error', async () => {
    const client = Remote.clientLayer(httpClient(server.url.replace('/remote', '/nowhere')))
    const failed = await Effect.runPromise(
      Data.prefetch(initial(), Posts.active.projectionOf(initial())!).pipe(
        Effect.provide(client),
        Effect.flip,
      ),
    )
    expect(failed._tag).toBe('RemoteQueryError')
  })
})
