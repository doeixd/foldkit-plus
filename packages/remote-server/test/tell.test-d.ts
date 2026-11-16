/**
 * `RemoteServer.tell` takes words written for the caller, never what was
 * caught: a caught value is `unknown`, and an `Error` is not text (#573).
 */
import { Effect } from 'effect'
import { expectTypeOf } from 'vitest'
import { RemoteServer, RemoteServerError } from '../src/index.js'

expectTypeOf(
  RemoteServer.tell('That report is still being built'),
).toEqualTypeOf<RemoteServerError>()

Effect.try({
  try: () => 1,
  // @ts-expect-error what was caught is unknown, and may say anything
  catch: caught => RemoteServer.tell(caught),
})

// @ts-expect-error an Error is not words for the caller
RemoteServer.tell(new Error('SQLITE_CONSTRAINT: users.email'))

// What was caught goes with a failure of this side, which no caller reads.
Effect.try({
  try: () => 1,
  catch: cause => new RemoteServerError({ message: 'The statement failed', cause }),
})
