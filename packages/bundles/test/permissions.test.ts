// @vitest-environment node
/**
 * Permissions: snapshot on acquire, live changes through the queue, release
 * detaches and clears, unknown names and states fail instead of entering
 * the Model, and one assembly holds one watch.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it, afterEach } from 'vitest'
import { PermissionsMessage, permissions, type PermissionsHandle } from '../src/device/index.js'
import { takeMessages } from './support.js'

class FakeStatus {
  onchange: (() => void) | null = null
  detached = false
  constructor(public state: string) {}
}

class FakePermissions implements PermissionsHandle {
  readonly queried: Array<string> = []
  readonly instances: Array<FakeStatus> = []
  constructor(private readonly states: Readonly<Record<string, string>>) {}
  query(descriptor: { readonly name: string }): Promise<FakeStatus> {
    this.queried.push(descriptor.name)
    const state = this.states[descriptor.name]
    if (state === undefined) {
      const error = new TypeError(`unknown permission: ${descriptor.name}`)
      return Promise.reject(error)
    }
    const status = new FakeStatus(state)
    this.instances.push(status)
    return Promise.resolve(status)
  }
}

let api = new FakePermissions({ camera: 'prompt', microphone: 'granted' })

const Site = permissions({
  name: 'Site',
  create: () => api,
})
const Shell = Bundle.declare(Site, 'site')
const Model = Schema.Struct({ ...Shell.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Shell.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const args = { names: ['camera', 'microphone'] }
const placed = Page.at(Shell, { args })
const fresh: Model = { site: { states: {}, lastError: null } }

afterEach(() => {
  api = new FakePermissions({ camera: 'prompt', microphone: 'granted' })
})

const fold = (model: Model, message: Parameters<typeof Shell.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, Shell.wrapper.make(message))).model.site

describe('Permissions transitions', () => {
  it('starts empty and folds Snapshot, Changed, Cleared, Failed', () => {
    expect(placed.init(fresh).model.site).toEqual({ states: {}, lastError: null })
    const snapped = fold(fresh, PermissionsMessage.Snapshot({ states: { camera: 'prompt' } }))
    expect(snapped).toEqual({ states: { camera: 'prompt' }, lastError: null })
    const changed = fold(
      { site: snapped },
      PermissionsMessage.Changed({ name: 'camera', state: 'granted' }),
    )
    expect(changed).toEqual({ states: { camera: 'granted' }, lastError: null })
    // Changed merges: sibling keys survive.
    const two = fold(
      fresh,
      PermissionsMessage.Snapshot({ states: { camera: 'prompt', microphone: 'denied' } }),
    )
    expect(
      fold({ site: two }, PermissionsMessage.Changed({ name: 'camera', state: 'granted' })),
    ).toEqual({ states: { camera: 'granted', microphone: 'denied' }, lastError: null })
    expect(fold({ site: changed }, PermissionsMessage.Cleared())).toEqual({
      states: {},
      lastError: null,
    })
    expect(fold(fresh, PermissionsMessage.Failed({ message: 'boom' }))).toEqual({
      states: {},
      lastError: 'boom',
    })
  })
})

describe('Permissions acquire and stream', () => {
  it('snapshots on acquire, streams changes, detaches on release', async () => {
    const entry = Site.resources!({ names: ['camera'] }).watch!
    const acquired = await Effect.runPromise(Effect.scoped(entry.acquire(['camera'])))
    expect(entry.onAcquired(acquired)).toEqual(
      PermissionsMessage.Snapshot({ states: { camera: 'prompt' } }),
    )
    const status = api.instances[0]!
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(Stream.fromQueue(acquired.events), 1))
        for (let i = 0; i < 100; i++) {
          yield* Effect.yieldNow
        }
        status.state = 'granted'
        status.onchange!()
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([PermissionsMessage.Changed({ name: 'camera', state: 'granted' })])
    await Effect.runPromise(entry.release(acquired))
    expect(status.onchange).toBe(null)
    expect(fold(fresh, entry.onReleased())).toEqual({ states: {}, lastError: null })
  })

  it('fails acquire on an unknown permission name', async () => {
    const entry = Site.resources!({ names: ['camera'] }).watch!
    await expect(Effect.runPromise(Effect.scoped(entry.acquire(['teapot'])))).rejects.toThrow(
      'unknown permission: teapot',
    )
    expect(entry.onAcquireError(new TypeError('unknown permission: teapot'))).toEqual(
      PermissionsMessage.Failed({ message: 'unknown permission: teapot' }),
    )
  })

  it('a later name failing attaches nothing to the earlier ones', async () => {
    const entry = Site.resources!({ names: ['camera', 'microphone'] }).watch!
    const before = api.instances.length
    await expect(
      Effect.runPromise(Effect.scoped(entry.acquire(['camera', 'teapot']))),
    ).rejects.toThrow('unknown permission: teapot')
    const added = api.instances.slice(before)
    expect(added).toHaveLength(1)
    expect(added[0]!.onchange).toBe(null)
  })

  it('fails acquire on an unknown state string', async () => {
    const Odd = permissions({
      name: 'Odd',
      create: () => new FakePermissions({ camera: 'maybe' }),
    })
    const entry = Odd.resources!({ names: ['camera'] }).watch!
    await expect(Effect.runPromise(Effect.scoped(entry.acquire(['camera'])))).rejects.toThrow(
      'unknown permission state for camera: maybe',
    )
  })

  it('fails acquire without a permissions API', async () => {
    const Bare = permissions({ name: 'Bare' })
    const entry = Bare.resources!({ names: ['camera'] }).watch!
    await expect(Effect.runPromise(Effect.scoped(entry.acquire(['camera'])))).rejects.toThrow(
      'permissions are unavailable',
    )
  })
})

describe('Permissions assembly', () => {
  it('routes its Messages and refuses a second watch in one assembly', () => {
    const assembly = Page.assemble(placed)
    const update = assembly.update(model => ({ model }))
    const snapped = update(
      fresh,
      Shell.wrapper.make(PermissionsMessage.Snapshot({ states: { camera: 'denied' } })),
    )
    expect(snapped.model.site.states).toEqual({ camera: 'denied' })
    expect(Object.keys(assembly.subscriptions())).toEqual(['Site@site/changes'])

    const PermA = Bundle.declare(Site, 'permA')
    const PermB = Bundle.declare(Site, 'permB')
    const TwoModel = Schema.Struct({ ...PermA.fields, ...PermB.fields })
    type TwoModel = typeof TwoModel.Type
    const TwoMessage = defineMessageUnion({ ...PermA.cases, ...PermB.cases })
    const TwoPage = Bundle.parent({ Model: TwoModel, Message: TwoMessage })
    expect(() =>
      TwoPage.assemble(
        TwoPage.at(PermA, { args: { names: ['camera'] } }),
        TwoPage.at(PermB, { args: { names: ['microphone'] } }),
      ),
    ).toThrow(/both use the Managed Resource "permissions"/)
  })
})
