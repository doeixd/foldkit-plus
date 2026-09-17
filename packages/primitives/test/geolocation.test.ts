// @vitest-environment jsdom
/**
 * Geolocation: pure transitions, the watch stream against a fake (fix,
 * denial, transient failure, teardown), the missing-API fallback, and
 * placement through a real assembly.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { afterEach, describe, expect, it } from 'vitest'
import { Geolocation, GeolocationMessage, type GeolocationModel } from '../src/device/index.js'
import { takeMessages } from './support.js'

type Success = (position: {
  readonly coords: {
    readonly latitude: number
    readonly longitude: number
    readonly accuracy: number
  }
}) => void
type Failure = (error: { readonly code: number; readonly message: string }) => void

const installGeolocation = () => {
  let nextId = 0
  const watches = new Map<number, { readonly success: Success; readonly failure: Failure }>()
  const cleared: Array<number> = []
  Object.defineProperty(window.navigator, 'geolocation', {
    value: {
      watchPosition: (success: Success, failure?: Failure | null) => {
        const id = ++nextId
        watches.set(id, {
          success,
          failure: failure ?? (() => undefined),
        })
        return id
      },
      clearWatch: (id: number) => {
        watches.delete(id)
        cleared.push(id)
      },
    },
    configurable: true,
  })
  return { watches, cleared }
}

afterEach(() => {
  Reflect.deleteProperty(window.navigator as unknown as Record<string, unknown>, 'geolocation')
})

const Here = Bundle.declare(Geolocation, 'here')
const Model = Schema.Struct({ ...Here.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Here.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Here)

const fold = (model: Model, message: Parameters<typeof Here.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, Here.wrapper.make(message))).model.here
const fresh: Model = { here: { status: 'unknown', coords: null, lastError: null } }

describe('Geolocation transitions', () => {
  it('starts unknown, takes a fix, and separates denial from failure', () => {
    expect(placed.init(fresh).model.here).toEqual(fresh.here)
    const ready = fold(
      fresh,
      GeolocationMessage.Located({ latitude: 1, longitude: 2, accuracy: 3 }),
    )
    expect(ready).toEqual({
      status: 'ready',
      coords: { latitude: 1, longitude: 2, accuracy: 3 },
      lastError: null,
    })
    expect(fold(fresh, GeolocationMessage.Denied())).toEqual({
      status: 'denied',
      coords: null,
      lastError: null,
    })
    expect(fold({ here: ready }, GeolocationMessage.Failed({ message: 'timeout' }))).toEqual({
      ...ready,
      lastError: 'timeout',
    })
  })
})

describe('Geolocation stream', () => {
  const streamFor = (model: GeolocationModel) => {
    const entry = Geolocation.subscriptions!().watch!
    return entry.dependenciesToStream(entry.modelToDependencies(model), () => ({}))
  }

  it('flows fixes, denial, and failure, and clears the watch on end', async () => {
    const { watches, cleared } = installGeolocation()
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(streamFor(fresh.here), 3))
        for (let i = 0; i < 100 && watches.size === 0; i++) {
          yield* Effect.yieldNow
        }
        expect([...watches.keys()]).toHaveLength(1)
        const id = [...watches.keys()][0]!
        watches.get(id)!.success({ coords: { latitude: 1, longitude: 2, accuracy: 3 } })
        watches.get(id)!.failure({ code: 1, message: 'denied' })
        watches.get(id)!.failure({ code: 2, message: 'unavailable' })
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      GeolocationMessage.Located({ latitude: 1, longitude: 2, accuracy: 3 }),
      GeolocationMessage.Denied(),
      GeolocationMessage.Failed({ message: 'unavailable' }),
    ])
    expect(cleared).toHaveLength(1)
    expect(watches.size).toBe(0)
  })

  it('is empty without a geolocation API', async () => {
    const entry = Geolocation.subscriptions!().watch!
    const stream = entry.dependenciesToStream(
      entry.modelToDependencies({ status: 'unknown', coords: null, lastError: null }),
      () => ({}),
    )
    expect(await Effect.runPromise(Stream.runCollect(stream))).toEqual([])
  })
})

describe('Geolocation in an assembly', () => {
  it('routes its Messages', () => {
    const assembly = Page.assemble(Page.at(Here))
    const update = assembly.update(model => ({ model }))
    const located = update(
      fresh,
      Here.wrapper.make(GeolocationMessage.Located({ latitude: 1, longitude: 2, accuracy: 3 })),
    )
    expect(located.model.here.status).toBe('ready')
    expect(Object.keys(assembly.subscriptions())).toEqual(['Geolocation@here/watch'])
  })
})
