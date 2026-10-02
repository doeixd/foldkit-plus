import { Duration, Effect } from 'effect'
import { Command } from 'foldkit'

import { ApplicationPayload } from './application.js'
import { Message } from './message.js'

// COMMAND

/**
 * The request the fake server reads. Its `application` is the payload the
 * submit captured, so what goes out cannot change under it.
 */
export const SubmitApplication = Command.define('SubmitApplication', {
  args: { application: ApplicationPayload },
  messages: [Message.SucceededSubmitApplication, Message.FailedSubmitApplication],
  execute: ({ application }) =>
    Effect.gen(function* () {
      yield* Effect.sleep(Duration.millis(1500))
      yield* Effect.log(`Received application from ${application.applicant.email}`)
      return Message.SucceededSubmitApplication()
    }).pipe(
      Effect.catch(() =>
        Effect.succeed(Message.FailedSubmitApplication({ error: 'Submission failed' })),
      ),
    ),
})
