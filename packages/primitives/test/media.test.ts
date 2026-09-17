// @vitest-environment jsdom
/**
 * MediaQuery: pure transitions, presets that need no args, the matchMedia
 * stream against a fake, the no-window fallback, and placement through a real
 * assembly (the parity surface: the same update and init the hand-wiring
 * would run).
 */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MediaQuery,
  MediaQueryMessage,
  type MediaQueryModel,
  PrefersDark,
} from '../src/media/index.js'
import { takeMessages } from './support.js'

type Listener = (event: { matches: boolean }) => void

const installMatchMedia = () => {
  const listeners = new Set<Listener>()
  const seen: Array<string> = []
  const list = {
    matches: false,
    media: '',
    addEventListener: (_type: string, listener: Listener) => {
      listeners.add(listener)
    },
    removeEventListener: (_type: string, listener: Listener) => {
      listeners.delete(listener)
    },
  }
  Object.defineProperty(window, 'matchMedia', {
    value: (query: string) => {
      seen.push(query)
      list.media = query
      return list
    },
    configurable: true,
    writable: true,
  })
  const fire = (matches: boolean) => {
    list.matches = matches
    for (const listener of [...listeners]) listener({ matches })
  }
  return { list, seen, listeners, fire }
}

afterEach(() => {
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, 'matchMedia')
})

const Dark = Bundle.declare(MediaQuery, 'dark')
const Model = Schema.Struct({ ...Dark.fields, theme: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Dark.cases, ThemeSet: { theme: Schema.String } })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

describe('MediaQuery transitions', () => {
  it('starts unmatched and follows Changed', () => {
    const placed = Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } })
    const started = placed.init({ dark: { matches: true }, theme: 'light' })
    expect(started.model.dark).toEqual({ matches: false })
    expect(started.commands).toEqual([])
    const changed = placed.update(
      { dark: { matches: false }, theme: 'light' },
      Dark.wrapper.make(MediaQueryMessage.Changed({ matches: true })),
    )
    expect(Option.getOrThrow(changed).model.dark).toEqual({ matches: true })
  })
})

describe('MediaQuery presets', () => {
  it('place with no args', () => {
    const assembly = Page.assemble(Page.place(PrefersDark, 'dark'))
    const started = assembly.initial({ theme: 'light' })
    expect(started.model.dark).toEqual({ matches: false })
  })
})

describe('MediaQuery stream', () => {
  const changes = () =>
    MediaQuery.subscriptions!({ query: '(prefers-color-scheme: dark)' }).changes!
  const streamFor = (model: MediaQueryModel) => {
    const entry = changes()
    return entry.dependenciesToStream(entry.modelToDependencies(model), () => ({}))
  }

  it('emits the current value, then changes', async () => {
    const { seen, listeners, fire } = installMatchMedia()
    const stream = streamFor({ matches: false })
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(stream, 2))
        for (let i = 0; i < 100 && listeners.size === 0; i++) {
          yield* Effect.yieldNow
        }
        expect(seen).toEqual(['(prefers-color-scheme: dark)'])
        fire(true)
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      MediaQueryMessage.Changed({ matches: false }),
      MediaQueryMessage.Changed({ matches: true }),
    ])
  })

  it('disconnects the listener when the stream ends', async () => {
    const { listeners } = installMatchMedia()
    await Effect.runPromise(takeMessages(streamFor({ matches: false }), 1))
    expect(listeners.size).toBe(0)
  })

  it('is empty without matchMedia, instead of throwing', async () => {
    expect(await Effect.runPromise(Stream.runCollect(streamFor({ matches: false })))).toEqual([])
  })
})

describe('MediaQuery in an assembly', () => {
  it('routes Changed through update and carries init', () => {
    const assembly = Page.assemble(
      Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }),
    )
    const update = assembly.update(model => ({ model }))
    const changed = update(
      { dark: { matches: false }, theme: 'light' },
      Dark.wrapper.make(MediaQueryMessage.Changed({ matches: true })),
    )
    expect(changed.model.dark).toEqual({ matches: true })
    expect(Object.keys(assembly.subscriptions())).toEqual(['MediaQuery@dark/changes'])
  })
})
