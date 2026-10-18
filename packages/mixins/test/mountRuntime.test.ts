import { describe, expect, it, vi } from 'vitest'
import { Cause, Effect, Fiber, Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { liveViewStateChanges, type MountAction } from 'foldkit/mount'
import { Attributes, Behavior, Capability, Resolver, Slot, SlotView, Slots } from '../src/index.js'

type TestMessage = { readonly _tag: 'GotA' } | { readonly _tag: 'GotB' }

const emitA: MountAction<TestMessage> = { name: 'A', f: () => Stream.succeed({ _tag: 'GotA' }) }
const emitB: MountAction<TestMessage> = { name: 'B', f: () => Stream.succeed({ _tag: 'GotB' }) }

const collect = <A>(stream: Stream.Stream<A, unknown>): Promise<ReadonlyArray<A>> =>
  Effect.runPromise(Stream.runCollect(stream).pipe(Effect.map(chunk => Array.from(chunk))))

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

const element = {} as Element

describe('Mount composition at runtime', () => {
  it('merges the streams of every composed mount', async () => {
    const mount = composed([emitA, emitB])
    expect(mount.name).toBe('Mixins[root](A,B)')
    expect(await collect(mount.f(element, liveViewStateChanges))).toEqual(
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
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const failing: MountAction<TestMessage, Error> = { name: 'Failing', f: () => stream }
      expect(await collect(composed([failing, emitA]).f(element, liveViewStateChanges))).toEqual([
        { _tag: 'GotA' },
      ])
      expect(errors).toHaveBeenCalledOnce()
      expect(errors.mock.calls[0]![0]).toBe('[OnMount Failing] unhandled failure')
    } finally {
      errors.mockRestore()
    }
  })

  it('reports nothing when the composed mount is torn down', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const waiting: MountAction<TestMessage> = { name: 'Waiting', f: () => Stream.never }
      const fiber = Effect.runFork(
        Stream.runDrain(composed([waiting, emitA]).f(element, liveViewStateChanges)),
      )
      await Effect.runPromise(Effect.yieldNow)
      await Effect.runPromise(Fiber.interrupt(fiber))
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
    }
  })

  // A Mount whose element is removed ends interrupted from inside, as a page
  // that drops a component's elements shows; that is a teardown, not a fault.
  it('reports nothing for a mount that ends interrupted', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const interrupted: MountAction<TestMessage> = {
        name: 'Interrupted',
        f: () => Stream.failCause(Cause.interrupt()),
      }
      expect(
        await collect(composed([interrupted, emitA]).f(element, liveViewStateChanges)),
      ).toEqual([{ _tag: 'GotA' }])
      expect(errors).not.toHaveBeenCalled()
    } finally {
      errors.mockRestore()
    }
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
