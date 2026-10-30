// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Cause, Effect, Exit, Fiber, Layer, Option, Scope, Stream } from 'effect'
import { Diagnostics as Reported } from 'foldkit-surface'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { liveViewStateChanges, type MountAction } from 'foldkit/mount'
import { Attributes, Behavior, Capability, Resolver, Slot, SlotView, Slots } from '../src/index.js'

type TestMessage = { readonly _tag: 'GotA' } | { readonly _tag: 'GotB' }

const emitA: MountAction<TestMessage> = { name: 'A', f: () => Stream.succeed({ _tag: 'GotA' }) }
const emitB: MountAction<TestMessage> = { name: 'B', f: () => Stream.succeed({ _tag: 'GotB' }) }

/** What `stream` emits, and what it reported through the diagnostics channel. */
const run = async <A>(stream: Stream.Stream<A, unknown>) => {
  const collected = Reported.collect()
  const emitted = await Effect.runPromise(
    Stream.runCollect(stream).pipe(
      Effect.map(chunk => Array.from(chunk)),
      Effect.provideService(Reported.Reporter, collected.report),
    ),
  )
  return { emitted, reported: collected.reported }
}

/** Resolve two per-slot contributions and return the one composed OnMount. */
const composed = (
  mounts: ReadonlyArray<MountAction<TestMessage, any>>,
): MountAction<TestMessage, any> => {
  const attributes = Resolver.resolve(
    [],
    mounts.map(mount => ({ mounts: [mount] })),
    { slot: 'root' },
  )
  const onMount = Attributes.find(attributes, 'OnMount')
  if (onMount === undefined) throw new Error('expected a composed OnMount')
  return onMount.action
}

const element = document.createElement('div')

describe('Mount composition at runtime', () => {
  it('merges the streams of every composed mount', async () => {
    const mount = composed([emitA, emitB])
    expect(mount.name).toBe('Mixins[root](A,B)')
    expect((await run(mount.f(element, liveViewStateChanges))).emitted).toEqual(
      expect.arrayContaining([{ _tag: 'GotA' }, { _tag: 'GotB' }]),
    )
  })

  it.each([
    ['fails', Stream.fail(new Error('boom'))],
    // Measure's shape: a constructor jsdom lacks, thrown as the Mount attaches.
    [
      'dies',
      Stream.callback<TestMessage>(() =>
        Effect.sync(() => {
          throw new Error('ResizeObserver is not defined')
        }),
      ),
    ],
  ])('reports a mount that %s and runs the rest', async (_, stream) => {
    const failing: MountAction<TestMessage, Error> = { name: 'Failing', f: () => stream }
    const { emitted, reported } = await run(
      composed([failing, emitA]).f(element, liveViewStateChanges),
    )
    expect(emitted).toEqual([{ _tag: 'GotA' }])
    expect(reported).toEqual([
      expect.objectContaining({
        _tag: 'MountFailed',
        source: 'foldkit-mixins',
        level: 'error',
        mount: 'Failing',
        slot: Option.some('root'),
      }),
    ])
    expect(reported[0]!.message).toContain('the Mount Failing on slot root failed')
  })

  // Foldkit runs a Mount outside the application's resources, so its
  // reporter reaches a Mount through the document (#237).
  it("reports a mount that fails to the application's reporter when one claims it", async () => {
    const [application, fallback] = [Reported.collect(), Reported.collect()]
    const scope = Effect.runSync(Scope.make())
    Effect.runSync(Layer.buildWithScope(Reported.layer(application.report), scope))
    const failing: MountAction<TestMessage, Error> = {
      name: 'Failing',
      f: () => Stream.fail(new Error('boom')),
    }
    const attached = document.body.appendChild(document.createElement('div'))
    await Effect.runPromise(
      Stream.runDrain(composed([failing, emitA]).f(attached, liveViewStateChanges)).pipe(
        Effect.provideService(Reported.Reporter, fallback.report),
      ),
    )
    await new Promise(resolve => setTimeout(resolve, 0))
    Effect.runSync(Scope.close(scope, Exit.void))
    attached.remove()
    expect(fallback.reported).toEqual([])
    expect(application.reported).toEqual([
      expect.objectContaining({ _tag: 'MountFailed', mount: 'Failing' }),
    ])
  })

  it('reports nothing when the composed mount is torn down', async () => {
    const collected = Reported.collect()
    const waiting: MountAction<TestMessage> = { name: 'Waiting', f: () => Stream.never }
    const fiber = Effect.runFork(
      Stream.runDrain(composed([waiting, emitA]).f(element, liveViewStateChanges)).pipe(
        Effect.provideService(Reported.Reporter, collected.report),
      ),
    )
    await Effect.runPromise(Effect.yieldNow)
    await Effect.runPromise(Fiber.interrupt(fiber))
    expect(collected.reported).toEqual([])
  })

  // A Mount whose element is removed ends interrupted from inside, as a page
  // that drops a component's elements shows; that is a teardown, not a fault.
  it('reports nothing for a mount that ends interrupted', async () => {
    const interrupted: MountAction<TestMessage> = {
      name: 'Interrupted',
      f: () => Stream.failCause(Cause.interrupt()),
    }
    expect(await run(composed([interrupted, emitA]).f(element, liveViewStateChanges))).toEqual({
      emitted: [{ _tag: 'GotA' }],
      reported: [],
    })
  })

  it('is observed by Scene as exactly one Mount', () => {
    const RootSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
    const ObserveA = Behavior.forSlots(RootSlots)<undefined, TestMessage>({
      root: Behavior.slot({ mount: () => emitA }),
    })
    const ObserveB = Behavior.forSlots(RootSlots)<undefined, TestMessage>({
      root: Behavior.slot({ mount: () => emitB }),
    })
    const View = SlotView.define(
      RootSlots,
      (_input: undefined, slots, h: HtmlBuilder<TestMessage>) => h.div(slots.root.attrs(), []),
    ).pipe(Behavior.attach(ObserveA), Behavior.attach(ObserveB))

    Scene.scene(
      {
        update: (model: undefined, _message: TestMessage) => ({ model }),
        view: (model, h) => View(model, h),
      },
      Scene.given(undefined),
      Scene.Mount.expectExact({ name: 'Mixins[root](A,B)' }),
      Scene.Mount.resolve({ name: 'Mixins[root](A,B)' }, { _tag: 'GotA' }),
    )
  })
})
