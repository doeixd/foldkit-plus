// @vitest-environment node
/**
 * The Worker as deployed, on a local workerd from `wrangler.toml`, over real
 * HTTP: members sign up and sign in through Yielded's routes, each page is
 * rendered as its reader or sent on, and every write is judged by the
 * guard, the decode and the table's CHECKs.
 */
import { request } from 'node:http'
import { Effect, Option, Result, type Layer } from 'effect'
import { fromString } from 'foldkit/url'
import { Remote, type RemoteClient, type RemoteMessage } from 'foldkit-plus/remote'
import { Surface } from 'foldkit-plus/surface'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  Data,
  NotebookPage,
  actives,
  initial,
  unreadAt,
  viewerOf,
  type Model,
} from '../src/main.js'
import { AddNote, DeleteNote, EditNote } from '../src/operations.js'
import { buildPage, startStack, type ReferenceStack } from '../src/stack.js'

let stack: ReferenceStack

beforeAll(async () => {
  await buildPage()
  stack = await startStack()
}, 180_000)

afterAll(async () => {
  await stack?.stop()
}, 60_000)

/** What the page sends with every call it scripts. */
const scripted = () => ({ origin: stack.origin, 'x-effect-auth-csrf': '1' })

const postAuth = (path: string, body: unknown) =>
  fetch(`${stack.origin}/auth/${path}`, {
    method: 'POST',
    headers: { ...scripted(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

/** Signs a new member up, then in, once: the session cookie, as `name=value`. */
const member = async (name: string): Promise<string> => {
  const email = `${name.toLowerCase()}@example.invalid`
  const password = `${name} keeps a careful notebook`
  const registered = await postAuth('register', {
    payload: { requestId: `sign-up-${name}`, email, newPassword: password, registration: { name } },
  })
  expect(registered.status).toBe(200)
  const signedIn = await postAuth('signIn', { payload: { email, password } })
  expect(signedIn.status).toBe(200)
  const cookie = signedIn.headers.getSetCookie().find(each => each.includes('-session='))
  if (cookie === undefined) throw new Error(`${name} was signed in with no session cookie`)
  return cookie.split(';')[0]!
}

/**
 * A page as a browser navigates to it: a `GET` with the cookie, no CSRF
 * header, and the `Sec-Fetch-Mode` a navigation has. Sent with `node:http`,
 * since Node's `fetch` sends `Sec-Fetch-Mode: cors` whatever it is given,
 * which the page's resolver refuses as no navigation.
 */
const page = (path: string, cookie?: string) =>
  new Promise<Response>((resolve, reject) => {
    const asked = request(
      `${stack.origin}${path}`,
      {
        headers: {
          accept: 'text/html',
          'sec-fetch-mode': 'navigate',
          ...(cookie === undefined ? {} : { cookie }),
        },
      },
      answer => {
        const chunks: Array<Buffer> = []
        answer.on('data', (chunk: Buffer) => chunks.push(chunk))
        answer.on('error', reject)
        answer.on('end', () => {
          const headers = new Headers()
          for (const [name, value] of Object.entries(answer.headers))
            for (const each of [value ?? []].flat()) headers.append(name, each)
          resolve(new Response(Buffer.concat(chunks), { status: answer.statusCode ?? 0, headers }))
        })
      },
    )
    asked.on('error', reject)
    asked.end()
  })

/** The page's own Remote client, as `cookie`'s member. */
const remoteAs = (cookie: string): Layer.Layer<RemoteClient> =>
  Remote.clientLayer(
    Remote.http(`${stack.origin}/remote`, { headers: () => ({ ...scripted(), cookie }) }),
  )

/** A write as the page sends it: what the server answered, as a Remote Message. */
const write = (
  cookie: string,
  started: {
    readonly command: { readonly effect: Effect.Effect<RemoteMessage, never, RemoteClient> }
  },
) => Effect.runPromise(started.command.effect.pipe(Effect.provide(remoteAs(cookie))))

/** Every page's reads, as `cookie`'s member makes them through `/remote`. */
const readAs = (cookie: string): Promise<Model> =>
  Effect.runPromise(
    Data.satisfy(unreadAt(Option.getOrThrow(fromString(`${stack.origin}/`))), actives).pipe(
      Effect.provide(remoteAs(cookie)),
    ),
  )

/** Who a session's member is, as the server says. */
const idOf = async (cookie: string): Promise<string> =>
  Option.getOrThrow(viewerOf(await readAs(cookie)))

const added = (id: string, title: string, body = '') =>
  Data.mutate(initial, AddNote, { id, title, body })

/** The classes a rendered page draws, and those no `<style>` in it has a rule for. */
const styling = (html: string) => {
  const drawn = [
    ...new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap(match => match[1]!.split(' '))),
  ]
  const styled = [...html.matchAll(/<style>([^<]*)<\/style>/g)].map(match => match[1]).join('')
  return { drawn, unstyled: drawn.filter(name => !styled.includes(`.${name}`)) }
}

describe('pages', () => {
  it('sends a visitor to sign in, naming the page they asked for', async () => {
    const response = await page('/notes/n1')
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/sign-in?returnTo=%2Fnotes%2Fn1')
  }, 60_000)

  it("renders a member's notebook as them, into the build's template", async () => {
    const cookie = await member('Ada')
    const response = await page('/', cookie)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const html = await response.text()
    expect(html).toContain('Ada, you have written 0 notes.')
    expect(html).toContain('No notes yet.')
    // The build's own script, and the id hydration compares with it.
    expect(html).toMatch(/<script type="module" crossorigin src="\/assets\/[^"]+\.js">/)
    expect(html).toMatch(/data-foldkit-build="[0-9a-f-]{36}"/)
    // Styled before any script runs: every compiled class it draws has its rule in the page.
    const { drawn, unstyled } = styling(html)
    expect(drawn.filter(name => name.startsWith('style-')).length).toBeGreaterThan(0)
    expect(unstyled.filter(name => name.startsWith('style-'))).toEqual([])
  }, 60_000)

  // #271: `Style.usedIn` leaves out the global rules a Style needs, such as
  // `raise`'s `.fk-raised` depth rules. Red once that is fixed: make it an `it`.
  it.fails('styles every class a page draws, before any script runs', async () => {
    const html = await (await page('/', await member('Mary'))).text()
    expect(styling(html).unstyled).toEqual([])
  }, 60_000)

  it('sends a member away from the sign-in page', async () => {
    const cookie = await member('Barbara')
    const response = await page('/sign-in', cookie)
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/')
  }, 60_000)
})

describe('writes', () => {
  it("adds a member's note, counts it, and renders it on the notebook and its own page", async () => {
    const cookie = await member('Grace')
    const answer = await write(cookie, added('grace-1', 'Nanoseconds', 'A foot of wire.'))
    expect(answer._tag).toBe('MutationSucceeded')

    const notebook = await (await page('/', cookie)).text()
    expect(notebook).toContain('Nanoseconds')
    expect(notebook).toContain('Grace, you have written 1 note.')
    const note = await (await page('/notes/grace-1', cookie)).text()
    expect(note).toContain('A foot of wire.')
  }, 60_000)

  it("makes a note its writer's, whatever the request names, and refuses an edit or a delete of another's", async () => {
    const owner = await member('Hedy')
    const hedy = await idOf(owner)
    expect((await write(owner, added('hedy-1', 'Frequency hopping')))._tag).toBe(
      'MutationSucceeded',
    )
    const other = await member('Joan')

    // A request naming Hedy as the author: the server stamps whoever asks.
    const forged = await Effect.runPromise(
      Remote.http(`${stack.origin}/remote`, {
        headers: () => ({ ...scripted(), cookie: other }),
      }).FoldkitRemoteMutate({
        requestId: 'forged',
        mutation: 'AddNote',
        input: { id: 'joan-1', title: 'In Hedy’s name', body: '', authorId: hedy, author: hedy },
      }),
    )
    expect(forged.entities[0]?.values).toMatchObject({ authorId: await idOf(other) })
    const edited = await write(
      other,
      Data.mutate(initial, EditNote, { id: 'hedy-1', title: 'Mine now', body: '' }),
    )
    const deleted = await write(other, Data.mutate(initial, DeleteNote, { id: 'hedy-1' }))
    for (const answer of [edited, deleted]) {
      expect(answer._tag).toBe('MutationFailed')
      if (answer._tag === 'MutationFailed') expect(answer.error._tag).toBe('Forbidden')
    }
    const { notes } = Surface.read(NotebookPage, await readAs(owner), { viewer: hedy })
    expect(
      notes._tag === 'Ready' &&
        notes.value.items
          .filter(note => note.id.startsWith('hedy') || note.id.startsWith('joan'))
          .map(note => [note.title, note.author.name]),
    ).toEqual([
      ['In Hedy’s name', 'Joan'],
      ['Frequency hopping', 'Hedy'],
    ])
  }, 60_000)

  it("refuses a title the Entity refuses, in the server's decode and in the table's CHECK", async () => {
    const cookie = await member('Katherine')
    const katherine = await idOf(cookie)
    // The page's own encode refuses it first; this is a request it never sends.
    const forged = await Effect.runPromise(
      Effect.result(
        Remote.http(`${stack.origin}/remote`, {
          headers: () => ({ ...scripted(), cookie }),
        }).FoldkitRemoteMutate({
          requestId: 'forged',
          mutation: 'AddNote',
          input: { id: 'kj-1', title: '', body: '' },
        }),
      ),
    )
    expect(Result.isFailure(forged) && forged.failure._tag).toBe('RemoteMutationError')
    const env = await stack.env()
    await expect(
      env.DB.prepare(
        "insert into notes (id, author_id, title, body, created_at) values ('kj-2', ?, '', '', 0)",
      )
        .bind(katherine)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed: notes_title_check/)
    const { notes } = Surface.read(NotebookPage, await readAs(cookie), { viewer: katherine })
    expect(
      notes._tag === 'Ready' && notes.value.items.filter(note => note.id.startsWith('kj')),
    ).toEqual([])
  }, 60_000)
})
