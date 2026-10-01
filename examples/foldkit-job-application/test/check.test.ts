/**
 * The Commands as the runtime runs them, on the TestClock: the email check the
 * form returns for a well-formed email answers after the fake API's 600ms and
 * not before, and the application goes out after 1.5s.
 */
import { Effect, Exit, Fiber, Option } from 'effect'
import { TestClock } from 'effect/testing'
import type { Command } from 'foldkit/command'
import { describe, expect, test } from 'vitest'

import { applicationPayload } from '../src/application.js'
import { SubmitApplication } from '../src/command.js'
import { Message } from '../src/message.js'
import { PersonalInfo } from '../src/step/index.js'
import { update } from '../src/update.js'
import { checkedEmail, completeModel, initialModel, typedPersonalInfo } from './fixtures.js'

/** What `command` has answered once `millis` of virtual time have passed. */
const answerWithin = (
  command: { readonly effect: Effect.Effect<Message> },
  millis: number,
): Promise<Option.Option<Message>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(command.effect)
      for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      yield* TestClock.adjust(millis)
      const answer = fiber.pollUnsafe()
      yield* Fiber.interrupt(fiber)
      return Option.flatMap(Option.fromUndefinedOr(answer), Exit.getSuccess)
    }).pipe(Effect.provide(TestClock.layer())),
  )

const emailCheck = (email: string): Command<Message> => {
  const { commands = [] } = update(
    initialModel,
    Message.GotPersonalInfoMessage({ message: typedPersonalInfo('email', email) }),
  )
  expect(commands.map(command => command.name)).toEqual(['PersonalInfo.check'])
  return commands[0]!
}

describe('the email check', () => {
  test.each([
    ['jane@example.com', Option.none()],
    ['test@example.com', Option.some('This email is already in use')],
    ['Admin@Foldkit.dev', Option.some('This email is already in use')],
  ])('answers %j after the fake API delay', async (email, error) => {
    expect(await answerWithin(emailCheck(email), 599)).toEqual(Option.none())
    expect(await answerWithin(emailCheck(email), 600)).toEqual(
      Option.some(
        Message.GotPersonalInfoMessage({
          message: PersonalInfo.Message.GotFormMessage({ message: checkedEmail(email, error) }),
        }),
      ),
    )
  })
})

describe('submitting the application', () => {
  const application = Option.getOrThrowWith(
    applicationPayload(completeModel),
    () => new Error('the complete fixture must produce a payload'),
  )

  test('succeeds after 1.5s and not before', async () => {
    const command = SubmitApplication({ application })
    expect(await answerWithin(command, 1499)).toEqual(Option.none())
    expect(await answerWithin(command, 1500)).toEqual(
      Option.some(Message.SucceededSubmitApplication()),
    )
  })
})
