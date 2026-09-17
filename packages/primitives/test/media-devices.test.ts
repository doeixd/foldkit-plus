// @vitest-environment node
/**
 * MediaDevices: init scans on placement, devicechange re-scans, denial
 * empties with a status (not a throw), other failures note the error, and
 * the missing-API fallback stays silent.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MediaDevicesMessage,
  mediaDevices,
  type MediaDevice,
  type MediaDevicesHandle,
} from '../src/device/index.js'
import { takeMessages } from './support.js'

class DeniedError extends Error {
  override readonly name = 'NotAllowedError'
}

const mic: MediaDevice = { deviceId: 'mic-1', groupId: 'g', kind: 'audioinput', label: 'Mic' }

interface RawDevice {
  readonly deviceId: string
  readonly groupId: string
  readonly kind: string
  readonly label: string
}

class FakeDevices implements MediaDevicesHandle {
  listeners = new Set<() => void>()
  constructor(
    private readonly list: RawDevice | null = mic,
    private readonly failure: unknown = null,
  ) {}
  enumerateDevices(): Promise<ReadonlyArray<RawDevice>> {
    if (this.failure !== null) return Promise.reject(this.failure)
    return Promise.resolve(this.list === null ? [] : [this.list])
  }
  addEventListener(_type: string, listener: () => void): void {
    this.listeners.add(listener)
  }
  removeEventListener(_type: string, listener: () => void): void {
    this.listeners.delete(listener)
  }
  fireChange(): void {
    for (const listener of [...this.listeners]) listener()
  }
}

let fake: FakeDevices = new FakeDevices()
const Cameras = mediaDevices({ name: 'Cameras', create: () => fake })
const Shell = Bundle.declare(Cameras, 'cameras')
const Model = Schema.Struct({ ...Shell.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Shell.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Shell)
const fresh: Model = { cameras: { status: 'unknown', devices: [], lastError: null } }

const fold = (model: Model, message: Parameters<typeof Shell.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, Shell.wrapper.make(message)))

afterEach(() => {
  fake = new FakeDevices()
  vi.unstubAllGlobals()
})

describe('MediaDevices transitions', () => {
  it('scans on init and refreshes through the fake', async () => {
    const started = placed.init(fresh)
    expect(started.model.cameras).toEqual({ status: 'unknown', devices: [], lastError: null })
    expect(started.commands).toHaveLength(1)
    const fact = await Effect.runPromise(started.commands![0]!.effect)
    expect(fact).toEqual(Shell.wrapper.make(MediaDevicesMessage.Refreshed({ devices: [mic] })))
    expect(fold(fresh, MediaDevicesMessage.Refreshed({ devices: [mic] })).model.cameras).toEqual({
      status: 'ready',
      devices: [mic],
      lastError: null,
    })
  })

  it('re-scans on Scan and on DevicesChanged', () => {
    for (const message of [MediaDevicesMessage.Scan(), MediaDevicesMessage.DevicesChanged()]) {
      expect(fold(fresh, message).commands).toHaveLength(1)
    }
  })

  it('denial keeps the list with a status; other failures note the error', async () => {
    fake = new FakeDevices(mic, new DeniedError('denied'))
    const denied = await Effect.runPromise(
      fold(fresh, MediaDevicesMessage.Scan()).commands![0]!.effect,
    )
    expect(denied).toEqual(Shell.wrapper.make(MediaDevicesMessage.Denied()))
    // Denial keeps a populated list: actionable UI over stale data.
    const populated: Model = { cameras: { status: 'ready', devices: [mic], lastError: null } }
    expect(fold(populated, MediaDevicesMessage.Denied()).model.cameras).toEqual({
      status: 'denied',
      devices: [mic],
      lastError: null,
    })

    fake = new FakeDevices(mic, new Error('boom'))
    const failed = await Effect.runPromise(
      fold(fresh, MediaDevicesMessage.Scan()).commands![0]!.effect,
    )
    expect(failed).toEqual(Shell.wrapper.make(MediaDevicesMessage.Failed({ message: 'boom' })))
    const ready: Model = { cameras: { status: 'ready', devices: [mic], lastError: null } }
    expect(fold(ready, MediaDevicesMessage.Failed({ message: 'boom' })).model.cameras).toEqual({
      ...ready.cameras,
      lastError: 'boom',
    })
  })

  it('rejects an unknown device kind at the boundary', async () => {
    fake.enumerateDevices = () =>
      Promise.resolve([{ deviceId: 'x', groupId: 'g', kind: 'weird', label: '' }])
    const fact = await Effect.runPromise(
      fold(fresh, MediaDevicesMessage.Scan()).commands![0]!.effect,
    )
    expect(fact).toEqual(
      Shell.wrapper.make(MediaDevicesMessage.Failed({ message: 'unknown device kind: weird' })),
    )
  })
})

describe('MediaDevices stream', () => {
  const streamFor = () => {
    const entry = Cameras.subscriptions!().changes!
    return entry.dependenciesToStream(
      entry.modelToDependencies({ status: 'unknown', devices: [], lastError: null }),
      () => ({}),
    )
  }

  it('emits DevicesChanged on devicechange and disconnects after', async () => {
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(streamFor(), 1))
        for (let i = 0; i < 100 && fake.listeners.size === 0; i++) {
          yield* Effect.yieldNow
        }
        expect(fake.listeners.size).toBe(1)
        fake.fireChange()
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([MediaDevicesMessage.DevicesChanged()])
    expect(fake.listeners.size).toBe(0)
  })

  it('is empty without a media-devices API, instead of throwing', async () => {
    const Bare = mediaDevices({ name: 'Bare' })
    const entry = Bare.subscriptions!().changes!
    const stream = entry.dependenciesToStream(
      entry.modelToDependencies({ status: 'unknown', devices: [], lastError: null }),
      () => ({}),
    )
    expect(await Effect.runPromise(Stream.runCollect(stream))).toEqual([])
    const fact = await Effect.runPromise(Bare.init(undefined).commands![0]!.effect)
    expect(fact).toEqual(MediaDevicesMessage.Failed({ message: 'media devices are unavailable' }))
  })
})

describe('MediaDevices in an assembly', () => {
  it('routes its Messages and carries init with a scan', () => {
    const assembly = Page.assemble(Page.at(Shell))
    const update = assembly.update(model => ({ model }))
    const scanned = update(fresh, Shell.wrapper.make(MediaDevicesMessage.Scan()))
    expect(scanned.commands).toHaveLength(1)
    expect(Object.keys(assembly.subscriptions())).toEqual(['Cameras@cameras/changes'])
  })
})
