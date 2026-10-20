// @vitest-environment node
/**
 * Who the worker lets upload: a request bearing its secret, and nobody while
 * the secret is unset, whatever it sends.
 */
import { Effect, Exit } from 'effect'
import { HttpServerRequest } from 'effect/http'
import { UploadPolicy } from 'foldkit-media/server'
import { describe, expect, it } from 'vitest'
import { uploadPolicy } from '../src/uploadPolicy.js'

const admits = (token: string | undefined, headers: Record<string, string>) =>
  Effect.runPromise(
    UploadPolicy.use(policy =>
      policy.admit(HttpServerRequest.fromWeb(new Request('http://worker.test/', { headers }))),
    ).pipe(Effect.provide(uploadPolicy(token)), Effect.exit, Effect.map(Exit.isSuccess)),
  )

describe('uploadPolicy', () => {
  it.each([
    ['the secret', 'secret', { authorization: 'Bearer secret' }, true],
    ['another token', 'secret', { authorization: 'Bearer guess' }, false],
    ['a name alone', 'secret', { 'x-actor': 'editor' }, false],
    [
      'the unset secret spelt out, with none set',
      undefined,
      { authorization: 'Bearer undefined' },
      false,
    ],
    ['an empty bearer, with an empty secret', '', { authorization: 'Bearer ' }, false],
  ])('given %s, admits it: %s', async (_, token, headers, admitted) => {
    expect(await admits(token, headers)).toBe(admitted)
  })
})
