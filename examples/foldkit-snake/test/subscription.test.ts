// @vitest-environment jsdom
/**
 * The two Subscriptions upstream keeps: the game clock, whose speed follows
 * the points, under the TestClock; and the keyboard, which cancels the
 * browser's default so arrows and Space steer rather than scroll.
 */
import { Effect, Fiber, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { Snake } from '../src/domain/index.js'
import { Message, type Model, subscriptions } from '../src/main.js'

const playingModel: Model = {
  snake: Snake.create({ x: 10, y: 10 }),
  apple: { x: 15, y: 15 },
  direction: 'Right',
  nextDirection: 'Right',
  gameState: 'Playing',
  points: 0,
  highScore: 0,
}

/**
 * What an entry emits for `model` within `millis` of virtual time, after
 * `act` runs. The fiber settles before the clock moves, so its listeners are
 * attached and its sleep is scheduled on the TestClock.
 */
const emittedWithin = <Dependencies>(
  entry: {
    readonly modelToDependencies: (model: Model) => Dependencies
    readonly dependenciesToStream: (dependencies: Dependencies) => Stream.Stream<Message>
  },
  model: Model,
  millis: number,
  act: () => void = () => {},
): Promise<ReadonlyArray<Message>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const emitted: Array<Message> = []
      const fiber = yield* Effect.forkChild(
        Stream.runForEach(entry.dependenciesToStream(entry.modelToDependencies(model)), message =>
          Effect.sync(() => void emitted.push(message)),
        ),
      )
      for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      act()
      yield* TestClock.adjust(millis)
      yield* Fiber.interrupt(fiber)
      return emitted
    }).pipe(Effect.provide(TestClock.layer())),
  )

describe('the game clock', () => {
  test.each([
    { points: 0, interval: 150 },
    { points: 30, interval: 120 },
    { points: 70, interval: 80 },
    { points: 200, interval: 80 },
  ])('ticks every $interval ms at $points points', async ({ points, interval }) => {
    const model = modifyFields(playingModel, { points: () => points })
    const ticks = async (millis: number) =>
      (await emittedWithin(subscriptions.gameClock, model, millis)).length
    // A tick is due at once and then every interval.
    expect(await ticks(3 * interval)).toBe(4)
    expect(await ticks(3 * interval - 1)).toBe(3)
  })

  test.each(['NotStarted', 'Paused', 'GameOver'] as const)(
    'is silent while %s',
    async gameState => {
      const model = modifyFields(playingModel, { gameState: () => gameState })
      expect(await emittedWithin(subscriptions.gameClock, model, 1_000)).toEqual([])
    },
  )

  test('emits TickedClock', async () => {
    const [tick] = await emittedWithin(subscriptions.gameClock, playingModel, 0)
    expect(tick).toEqual(Message.TickedClock())
  })
})

describe('the keyboard', () => {
  test('reports every key on the document and cancels its default', async () => {
    const events = ['ArrowUp', ' ', 'x'].map(
      key => new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true }),
    )
    const emitted = await emittedWithin(subscriptions.keyboard, playingModel, 0, () =>
      events.forEach(event => document.body.dispatchEvent(event)),
    )
    expect(emitted).toEqual([
      Message.PressedKey({ key: 'ArrowUp' }),
      Message.PressedKey({ key: ' ' }),
      Message.PressedKey({ key: 'x' }),
    ])
    expect(events.map(event => event.defaultPrevented)).toEqual([true, true, true])
  })
})
