// @vitest-environment jsdom
/**
 * Breakpoints: derived names from width, deterministic ties, SSR init,
 * resize stream with cleanup, and placement through a real assembly.
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Breakpoints, BreakpointsMessage, breakpointFor } from '../src/media/index.js'
import { takeMessages } from './support.js'

const bp = { sm: 640, md: 768, lg: 1024 }

const Shell = Bundle.declare(Breakpoints, 'shell')
const Model = Schema.Struct({ ...Shell.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Shell.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Shell, { args: { breakpoints: bp } })

const fold = (model: Model, message: Parameters<typeof Shell.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, Shell.wrapper.make(message))).model.shell

describe('breakpointFor', () => {
  it('picks the largest threshold at or below the width', () => {
    expect(breakpointFor(0, bp)).toBe(null)
    expect(breakpointFor(640, bp)).toBe('sm')
    expect(breakpointFor(800, bp)).toBe('md')
    expect(breakpointFor(2000, bp)).toBe('lg')
  })

  it('is deterministic on duplicate thresholds and empty input', () => {
    expect(breakpointFor(100, { b: 100, a: 100 })).toBe('b')
    expect(breakpointFor(100, {})).toBe(null)
  })
})

describe('Breakpoints transitions', () => {
  it('starts at width 0 and derives names on change', () => {
    expect(placed.init({ shell: { width: 999, breakpoint: 'lg' } }).model.shell).toEqual({
      width: 0,
      breakpoint: null,
    })
    expect(
      fold({ shell: { width: 0, breakpoint: null } }, BreakpointsMessage.Changed({ width: 800 })),
    ).toEqual({
      width: 800,
      breakpoint: 'md',
    })
  })
})

describe('Breakpoints stream', () => {
  const streamFor = () => {
    const entry = Breakpoints.subscriptions!({ breakpoints: bp }).changes!
    return entry.dependenciesToStream(
      entry.modelToDependencies({ width: 0, breakpoint: null }),
      () => ({}),
    )
  }

  it('emits the current width, then resizes, with one listener', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true })
    let added = 0
    let removed = 0
    const origAdd = window.addEventListener
    const origRemove = window.removeEventListener
    window.addEventListener = ((...args: Array<unknown>) => {
      added++
      return (origAdd as (...a: Array<unknown>) => void)(...args)
    }) as typeof window.addEventListener
    window.removeEventListener = ((...args: Array<unknown>) => {
      removed++
      return (origRemove as (...a: Array<unknown>) => void)(...args)
    }) as typeof window.removeEventListener
    try {
      const values = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(takeMessages(streamFor(), 2))
          for (let i = 0; i < 100 && added === 0; i++) {
            yield* Effect.yieldNow
          }
          window.dispatchEvent(new window.Event('resize'))
          return yield* Fiber.join(fiber)
        }),
      )
      expect(values).toEqual([
        BreakpointsMessage.Changed({ width: 800 }),
        BreakpointsMessage.Changed({ width: 800 }),
      ])
      expect(added).toBe(1)
      expect(removed).toBe(1)
    } finally {
      window.addEventListener = origAdd
      window.removeEventListener = origRemove
    }
  })

  it('emits the current width on subscribe', async () => {
    const entry = Breakpoints.subscriptions!({ breakpoints: bp }).changes!
    const stream = entry.dependenciesToStream(
      entry.modelToDependencies({ width: 0, breakpoint: null }),
      () => ({}),
    )
    expect(await Effect.runPromise(Stream.runCollect(Stream.take(stream, 1)))).toEqual([
      BreakpointsMessage.Changed({ width: window.innerWidth }),
    ])
  })
})

describe('Breakpoints in an assembly', () => {
  it('routes Changed and carries init', () => {
    const assembly = Page.assemble(Page.at(Shell, { args: { breakpoints: bp } }))
    const update = assembly.update(model => ({ model }))
    const changed = update(
      { shell: { width: 0, breakpoint: null } },
      Shell.wrapper.make(BreakpointsMessage.Changed({ width: 1100 })),
    )
    expect(changed.model.shell).toEqual({ width: 1100, breakpoint: 'lg' })
    expect(Object.keys(assembly.subscriptions())).toEqual(['Breakpoints@shell/changes'])
  })
})
