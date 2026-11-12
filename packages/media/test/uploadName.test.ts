import { Cause, Effect, Exit, Stream } from 'effect'
import { expect, it } from 'vitest'
import { uploadFile } from '../src/browser/index.js'

it('fails the stream, not the call, for a file name holding a lone surrogate', async () => {
  // `File`'s constructor repairs a lone surrogate in a name; a File-like object keeps it.
  const file = Object.defineProperty(new File([new Uint8Array(1)], 'x.pdf'), 'name', {
    value: 'a\uD83D.pdf',
  })
  const exit = await Effect.runPromiseExit(Stream.runCollect(uploadFile(file)))
  if (!Exit.isFailure(exit)) throw new Error('the upload did not fail')
  expect(Cause.squash(exit.cause)).toMatchObject({
    _tag: 'UploadFailed',
    reason: 'Malformed',
    status: 0,
  })
})
