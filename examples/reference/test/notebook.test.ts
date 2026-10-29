// @vitest-environment node
/**
 * The page's `update`, over what the real server reads: the migrations on
 * Node's SQLite, read through `pageReader` as a member or a visitor. A note
 * added shows in the notebook and in its author's count before the server
 * answers, and leaves both if the server refuses it; a reader is sent to the
 * page they may see; a sign-in goes on only to a path of this site; a note
 * opened while it is being added learns, once it is answered, that its author
 * may delete it.
 */
import { drizzle } from 'drizzle-orm/node-sqlite'
import { Effect, Layer, Option } from 'effect'
import { fromString } from 'foldkit/url'
import { Resource } from 'foldkit-plus/bundle'
import { Remote } from 'foldkit-plus/remote'
import { databaseLayer } from 'foldkit-plus/remote-drizzle'
import { RemoteServer } from 'foldkit-plus/remote-server'
import { pageReader } from 'foldkit-plus/remote-server/fetch'
import { Surface } from 'foldkit-plus/surface'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  AppClient,
  AppRoute,
  Data,
  Message,
  NotePage,
  NotebookPage,
  accessOf,
  actives,
  unreadAt,
  update,
  type Model,
} from '../src/main.js'
import { server } from '../src/server.js'
import { failedWriteWords } from '../src/view.js'

const sqlite = new DatabaseSync(':memory:')
for (const file of ['0001_accounts.sql', '0002_notes.sql', '0003_write_ledger.sql'])
  sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
sqlite.exec(`
  insert into accounts values ('ada', 'active', 'r1', 'ada@example.invalid', 'Ada');
  insert into accounts values ('grace', 'active', 'r2', 'grace@example.invalid', 'Grace');
  insert into notes (id, author_id, title, body, created_at) values ('g1', 'grace', 'Wire', '', 100);
`)

/** The page at `path` as `reader` (none: a visitor) opens it, everything it shows read. */
const opened = (path: string, reader: Option.Option<string>): Promise<Model> =>
  Effect.runPromise(
    Data.satisfy(
      unreadAt(Option.getOrThrow(fromString(`https://notebook.example${path}`))),
      actives,
    ).pipe(
      Effect.provide(
        pageReader({
          server,
          resolvePrincipal: () => Effect.succeed(Option.map(reader, id => ({ id }))),
          layer: () => databaseLayer(drizzle({ client: sqlite })),
        })(new Request(`https://notebook.example${path}`), undefined),
      ),
    ),
  )

/** The notebook as Ada sees it: each title in order, and her count. */
const notebook = (model: Model) => {
  const { notes, mine } = Surface.read(NotebookPage, model, { viewer: 'ada' })
  return {
    titles: notes._tag === 'Ready' ? notes.value.items.map(note => note.title) : notes._tag,
    count: mine._tag === 'Ready' ? mine.value.noteCount : mine._tag,
  }
}

let ada: Model

beforeAll(async () => {
  ada = await opened('/', Option.some('ada'))
})

describe('a note added', () => {
  const added = () =>
    update(ada, Message.NamedNote({ id: 'a1', title: 'First light', body: '', now: 200 }))

  it('shows first in the notebook, and in its author’s count, before the server answers', () => {
    expect(notebook(ada)).toEqual({ titles: ['Wire'], count: 0 })
    expect(notebook(added().model)).toEqual({ titles: ['First light', 'Wire'], count: 1 })
  })

  it('leaves both when the server refuses it, and is listed as failed', () => {
    const { model, commands } = added()
    const requestId = String(commands?.[0]?.args?.['requestId'])
    const refused = update(
      model,
      Message.MutationFailed({
        requestId,
        error: { _tag: 'Forbidden', message: 'Forbidden' },
        operation: 'op-1',
      }),
    ).model
    expect(notebook(refused)).toEqual({ titles: ['Wire'], count: 0 })
    expect(Data.failedWrites(refused).map(failed => failed.requestId)).toEqual([requestId])
    expect(Data.failedWrites(refused).map(failedWriteWords)).toEqual(['AddNote failed: Forbidden'])
  })

  it('says a write nothing answered may have landed, and that a retry saves it once', () => {
    const { model, commands } = added()
    const requestId = String(commands?.[0]?.args?.['requestId'])
    const unanswered = update(
      model,
      Message.MutationFailed({
        requestId,
        error: { _tag: 'Unreachable', message: 'Failed to fetch' },
        operation: 'op-1',
      }),
    ).model
    expect(Data.failedWrites(unanswered).map(failedWriteWords)).toEqual([
      'AddNote may not have reached the server. Retry sends it again, and it is saved once.',
    ])
  })
})

describe('who is shown which page', () => {
  it('sends a visitor from the notebook to sign in, and back after', async () => {
    const visitor = await opened('/', Option.none())
    expect(accessOf(visitor)).toEqual({ _tag: 'Denied', url: '/sign-in?returnTo=%2F' })
  })

  it('sends a member from the sign-in page to the notebook', async () => {
    const member = await opened('/sign-in', Option.some('ada'))
    expect(accessOf(member)).toEqual({ _tag: 'Denied', url: '/' })
    expect(accessOf(ada)).toEqual({ _tag: 'Allowed' })
  })
})

describe('a sign-in', () => {
  /** Where a sign-in from the page at `returnTo` goes on to. */
  const next = (returnTo: string) => {
    const model: Model = {
      ...ada,
      route: AppRoute.SignIn({ returnTo: Option.some(returnTo) }),
      email: 'ada@example.invalid',
      password: 'a long password',
    }
    return update(model, Message.SubmittedAuth()).commands?.[0]?.args?.['next']
  }

  it('goes on to the page that sent the reader, on this site', () => {
    expect(next('/notes/g1')).toBe('/notes/g1')
  })

  it('goes to the notebook for an address that leaves the site', () => {
    expect(next('//evil.example/')).toBe('/')
    expect(next('https://evil.example/')).toBe('/')
    expect(next('/\\evil.example')).toBe('/')
    expect(next('javascript:alert(1)')).toBe('/')
  })
})

describe('a note opened while it is being added', () => {
  /** Ada's browser: the server's own handlers, which write, and an auth client no add loads. */
  const browser = Layer.mergeAll(
    Remote.clientLayer(RemoteServer.handlers(server, Option.some({ id: 'ada' }))).pipe(
      Layer.provide(databaseLayer(drizzle({ client: sqlite }))),
    ),
    Resource.lazy(AppClient, () => Promise.reject(new Error('an add signs no one in'))),
  )

  // The e2e opens a note before its add is answered, then presses Delete. The
  // read entry restarts only when its plan changes: had it asked the server
  // for the note's `may` while only the add held it, the answer would have
  // left that plan as it was, and Delete would never have been drawn.
  it('reads whether its author may delete it once the add is answered', async () => {
    const { model, commands } = update(
      ada,
      Message.NamedNote({ id: 'a2', title: 'Second light', body: '', now: Date.now() }),
    )
    const add = commands?.[0]
    if (add === undefined) throw new Error('the add sent no write')
    const opened = { ...model, route: AppRoute.NotePage({ id: 'a2' }) }
    const note = NotePage.projection({ id: 'a2' })
    expect(Data.plan(opened, note)).toEqual([])

    const answer = await Effect.runPromise(add.effect.pipe(Effect.provide(browser)))
    const answered = update(opened, answer).model
    expect(Data.plan(answered, note)).toEqual([{ entity: 'Note', id: 'a2', fields: ['may'] }])

    const read = await Effect.runPromise(
      Data.satisfy(answered, actives).pipe(Effect.provide(browser)),
    )
    expect(Surface.read(NotePage, read, { id: 'a2' }).note).toMatchObject({
      _tag: 'Ready',
      value: { may: { row: { Update: true, Delete: true } } },
    })
  })
})
