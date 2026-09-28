/**
 * The waitlist check as the runtime runs it: the Command the form returns for
 * a well-formed email, on the TestClock. It answers after the fake API's 500ms
 * and not before, wrapped for the page, in the form's words.
 */
import { Effect, Exit, Fiber, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, test } from 'vitest'

import { Message, initialModel, update } from '../src/main.js'
import { checked, typed } from './fixtures.js'

/** What the check for `email` has answered once `millis` of virtual time have passed. */
const answerWithin = (email: string, millis: number): Promise<Option.Option<Message>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const [check, ...rest] = update(initialModel, typed('email', email)).commands ?? []
      expect(rest).toEqual([])
      const fiber = yield* Effect.forkChild(check!.effect)
      for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      yield* TestClock.adjust(millis)
      const answer = fiber.pollUnsafe()
      yield* Fiber.interrupt(fiber)
      return Option.flatMap(Option.fromUndefinedOr(answer), Exit.getSuccess)
    }).pipe(Effect.provide(TestClock.layer())),
  )

describe('the waitlist check', () => {
  test.each([
    ['alice@example.com', Option.none()],
    ['test@example.com', Option.some('This email is already on our waitlist')],
    ['Demo@Email.com', Option.some('This email is already on our waitlist')],
  ])('answers %j after the fake API delay', async (email, error) => {
    expect(await answerWithin(email, 499)).toEqual(Option.none())
    expect(await answerWithin(email, 500)).toEqual(
      Option.some(Message.GotFormMessage({ message: checked(email, error) })),
    )
  })
})
