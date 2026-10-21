// @vitest-environment node
/**
 * `foldkit-guard/media`: the upload routes' policy decided by principal
 * guards, for who the application's resolver says is asking. The resolver
 * sees the request's URL, method and headers and never its body, so a
 * refused upload reads no byte; a resolver that cannot tell is a 401.
 */
import { Data, Effect, Layer, Option, Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { HttpRouter, HttpServer, HttpServerRequest } from 'effect/http'
import { KeyValueStore } from 'effect/persistence'
import { Inspector } from 'foldkit-media'
import {
  UploadPolicy,
  uploadLayer,
  uploadsKeyValueStore,
  type UploadRoute,
} from 'foldkit-media/server'
import { describe, expect, it } from 'vitest'
import { Guards } from '../src/index.js'
import { GuardMedia } from '../src/media.js'

const User = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(['admin', 'editor', 'reader']),
})
type User = typeof User.Type

const Asset = Entity.define('Asset', Schema.Struct({ id: Schema.String, ownerId: Schema.String }))

const G = Guards.declare(
  'Media',
  User,
  guard => ({
    isEditor: guard.principal(),
    isAdmin: guard.principal(),
    isOwner: guard.row(Asset, p => Expr.eq(Asset.fields.ownerId, p.id)),
  }),
  { key: user => user.id, unguarded: 'deny' },
)

const Policy = G.implement({
  isEditor: principal =>
    Option.exists(principal, user => user.role === 'editor') || {
      allowed: false,
      reason: 'Only an editor may upload.',
    },
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

class SessionEnded extends Data.TaggedError('SessionEnded')<{}> {}

/** Who `x-user` names; `ended` is a session that ended; what it was given, kept. */
const resolver = () => {
  const seen: Array<{ url: string; method: string; body: boolean; user: string | null }> = []
  const resolve = (request: Request) =>
    Effect.suspend(() => {
      const user = request.headers.get('x-user')
      seen.push({ url: request.url, method: request.method, body: request.body !== null, user })
      if (user === 'ended') return Effect.fail(new SessionEnded())
      if (user === 'broken') return Effect.die('the session store is down')
      return Effect.succeed(
        Option.map(Option.fromNullishOr(user), role =>
          Schema.decodeUnknownSync(User)({ id: role, role }),
        ),
      )
    })
  return { seen, resolve }
}

const routes = { Upload: [G.isEditor, G.isAdmin], DescribeUrl: [G.isAdmin] }

/** What the policy answers `user` for `route`: admitted, the refusal's tag, or a defect. */
const admit = (
  route: UploadRoute,
  user: string | null,
  config: Partial<typeof routes> = routes,
) => {
  const { resolve } = resolver()
  const headers: Record<string, string> = user === null ? {} : { 'x-user': user }
  return Effect.runPromise(
    UploadPolicy.use(policy =>
      policy.admit(
        HttpServerRequest.fromWeb(new Request('https://media.test/_media/upload', { headers })),
        route,
      ),
    ).pipe(
      Effect.as('admitted'),
      Effect.catch(error => Effect.succeed(error._tag)),
      Effect.catchDefect(() => Effect.succeed('defect')),
      Effect.provide(GuardMedia.uploadPolicy(Policy, { resolve, ...config })),
    ),
  )
}

describe('GuardMedia.uploadPolicy', () => {
  it.each([
    ['a visitor', 'Upload', null, 'UploadForbidden'],
    ['a reader', 'Upload', 'reader', 'UploadForbidden'],
    ['an editor', 'Upload', 'editor', 'admitted'],
    ['an admin, by the second guard', 'Upload', 'admin', 'admitted'],
    ['an editor, describing a URL only an admin may', 'DescribeUrl', 'editor', 'UploadForbidden'],
    ['an admin describing a URL', 'DescribeUrl', 'admin', 'admitted'],
    ['a session that ended', 'Upload', 'ended', 'UploadUnauthenticated'],
  ] as const)('answers %s', async (_, route, user, expected) => {
    expect(await admit(route, user)).toBe(expected)
  })

  it('refuses a route it is given no guards for, whoever asks', async () => {
    expect(await admit('DescribeUrl', 'admin', { Upload: routes.Upload })).toBe('UploadForbidden')
  })

  it('lets a resolver that breaks be a defect, not a refusal', async () => {
    expect(await admit('Upload', 'broken')).toBe('defect')
  })

  it('gives the resolver the URL, method and headers, and no body', async () => {
    const { seen, resolve } = resolver()
    await Effect.runPromise(
      UploadPolicy.use(policy =>
        policy.admit(
          HttpServerRequest.fromWeb(
            new Request('https://media.test/_media/upload', {
              method: 'POST',
              body: new Uint8Array([1, 2, 3]),
              headers: { 'x-user': 'editor', 'content-type': 'image/png' },
            }),
          ),
          'Upload',
        ),
      ).pipe(Effect.provide(GuardMedia.uploadPolicy(Policy, { resolve, ...routes }))),
    )
    expect(seen).toEqual([
      { url: 'https://media.test/_media/upload', method: 'POST', body: false, user: 'editor' },
    ])
  })

  it('takes principal guards, for the routes there are (type checks)', () => {
    const { resolve } = resolver()
    GuardMedia.uploadPolicy(Policy, {
      resolve,
      // @ts-expect-error: a row guard has no row to read before an upload.
      Upload: [G.isOwner],
    })
    GuardMedia.uploadPolicy(Policy, {
      resolve,
      // @ts-expect-error: no route is named `Uploads`.
      Uploads: [G.isAdmin],
    })
  })
})

describe('through the upload route', () => {
  const route = () => {
    const { resolve } = resolver()
    const { handler } = HttpRouter.toWebHandler(
      uploadLayer().pipe(
        Layer.provide(
          Layer.mergeAll(
            uploadsKeyValueStore(),
            Layer.succeed(Inspector, { inspect: () => Effect.die('no upload is admitted here') }),
            GuardMedia.uploadPolicy(Policy, { resolve, ...routes }),
          ),
        ),
        Layer.provide(KeyValueStore.layerMemory),
        Layer.provide(HttpServer.layerServices),
      ),
      { disableLogger: true },
    )
    return handler
  }

  it.each([
    ['a reader', 'reader', 403, 'Forbidden'],
    ['a session that ended', 'ended', 401, 'Unauthenticated'],
  ])('answers %s with its kind alone, reading no byte', async (_, user, status, error) => {
    let pulled = false
    const body = new ReadableStream<Uint8Array>(
      {
        pull: controller => {
          pulled = true
          controller.close()
        },
      },
      { highWaterMark: 0 },
    )
    const response = await route()(
      new Request('https://media.test/_media/upload', {
        method: 'POST',
        body,
        headers: { 'x-user': user, 'content-type': 'image/png' },
        // A stream body needs this in Node's fetch.
        ...{ duplex: 'half' },
      }),
    )
    expect([response.status, await response.json(), pulled]).toEqual([status, { error }, false])
  })
})
