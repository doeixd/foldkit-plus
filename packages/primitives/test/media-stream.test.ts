// @vitest-environment node
/**
 * MediaStream: request/release transitions, acquire through a fake camera
 * (tracks stop on release), denial vs failure, the missing-API fallback,
 * one stream per assembly, and placement through a real assembly.
 */
import { Effect, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it, afterEach } from 'vitest'
import { MediaStreamMessage, mediaStream, type MediaStreamHandle } from '../src/device/index.js'

class DeniedError extends Error {
  override readonly name = 'NotAllowedError'
}

class FakeTrack {
  stopped = false
  stop(): void {
    this.stopped = true
  }
}

class FakeStream implements MediaStreamHandle {
  readonly tracks = [new FakeTrack(), new FakeTrack()]
  seen: unknown = null
  getTracks(): ReadonlyArray<FakeTrack> {
    return this.tracks
  }
}

let stream = new FakeStream()
let failure: unknown = null
const Camera = mediaStream({
  name: 'Camera',
  request: constraints => {
    stream.seen = constraints
    if (failure !== null) return Promise.reject(failure)
    return Promise.resolve(stream)
  },
})
const Shell = Bundle.declare(Camera, 'camera')
const Model = Schema.Struct({ ...Shell.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Shell.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args = { audio: false, video: true }
const placed = Page.at(Shell, { args })
const fresh: Model = { camera: { status: 'idle', lastError: null } }

afterEach(() => {
  stream = new FakeStream()
  failure = null
})

const fold = (model: Model, message: Parameters<typeof Shell.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, Shell.wrapper.make(message))).model.camera

describe('MediaStream transitions', () => {
  it('requests on Started and releases on Stopped and Ended', () => {
    expect(placed.init(fresh).model.camera).toEqual({ status: 'idle', lastError: null })
    expect(fold(fresh, MediaStreamMessage.Started())).toEqual({
      status: 'requesting',
      lastError: null,
    })
    expect(fold(fresh, MediaStreamMessage.Live())).toEqual({ status: 'live', lastError: null })
    const live: Model = { camera: { status: 'live', lastError: null } }
    expect(fold(live, MediaStreamMessage.Stopped())).toEqual({ status: 'idle', lastError: null })
    expect(fold(live, MediaStreamMessage.Ended())).toEqual({ status: 'idle', lastError: null })
  })

  it('denial parks; other failures park idle with the error noted', () => {
    expect(fold(fresh, MediaStreamMessage.Denied())).toEqual({ status: 'denied', lastError: null })
    expect(fold(fresh, MediaStreamMessage.Failed({ message: 'boom' }))).toEqual({
      status: 'idle',
      lastError: 'boom',
    })
  })
})

describe('MediaStream acquire and release', () => {
  it('acquires with the placed constraints and stops tracks on release', async () => {
    const entry = Camera.resources!({ audio: false, video: true }).stream!
    const acquired = await Effect.runPromise(
      Effect.scoped(entry.acquire({ audio: false, video: true })),
    )
    expect(stream.seen).toEqual({ audio: false, video: true })
    await Effect.runPromise(entry.release(acquired))
    expect(stream.tracks.every(track => track.stopped)).toBe(true)
  })

  it('maps acquire outcomes to lifecycle Messages', async () => {
    const entry = Camera.resources!({ audio: false, video: true }).stream!
    const acquired = await Effect.runPromise(
      Effect.scoped(entry.acquire({ audio: false, video: true })),
    )
    expect(entry.onAcquired()).toEqual(MediaStreamMessage.Live())
    expect(entry.onAcquireError(new DeniedError('denied'))).toEqual(MediaStreamMessage.Denied())
    expect(entry.onAcquireError(new Error('boom'))).toEqual(
      MediaStreamMessage.Failed({ message: 'boom' }),
    )
    await Effect.runPromise(entry.release(acquired))
  })

  it('maps denial and failure without throwing', async () => {
    const entry = Camera.resources!({ audio: false, video: true }).stream!
    failure = new DeniedError('denied')
    await expect(
      Effect.runPromise(Effect.scoped(entry.acquire({ audio: true, video: true }))),
    ).rejects.toThrow('denied')
    failure = new Error('boom')
    await expect(
      Effect.runPromise(Effect.scoped(entry.acquire({ audio: true, video: true }))),
    ).rejects.toThrow('boom')
  })

  it('fails acquire without a media-devices API', async () => {
    const Bare = mediaStream({ name: 'Bare' })
    const entry = Bare.resources!({ audio: false, video: true }).stream!
    await expect(
      Effect.runPromise(Effect.scoped(entry.acquire({ audio: false, video: true }))),
    ).rejects.toThrow('media devices are unavailable')
  })
})

describe('MediaStream assembly', () => {
  it('routes its Messages and refuses a second stream in one assembly', () => {
    const assembly = Page.assemble(placed)
    const update = assembly.update(model => ({ model }))
    expect(
      update(fresh, Shell.wrapper.make(MediaStreamMessage.Started())).model.camera.status,
    ).toBe('requesting')
    expect(Object.keys(assembly.subscriptions())).toEqual([])

    const CamA = Bundle.declare(Camera, 'camA')
    const CamB = Bundle.declare(Camera, 'camB')
    const TwoModel = Schema.Struct({ ...CamA.fields, ...CamB.fields })
    type TwoModel = typeof TwoModel.Type
    const TwoMessage = defineMessageUnion({ ...CamA.cases, ...CamB.cases })
    const TwoPage = Bundle.parent({ Model: TwoModel, Message: TwoMessage })
    expect(() =>
      TwoPage.assemble(
        TwoPage.at(CamA, { args: { audio: true, video: false } }),
        TwoPage.at(CamB, { args: { audio: false, video: true } }),
      ),
    ).toThrow(/both use the Managed Resource "media-stream"/)
  })
})
