// @vitest-environment jsdom
/**
 * The documented cold-load path on the real runtime: `Mirror.fold(...).init`
 * runs `restore` while the write Subscription already holds the initial
 * slice. A store slower to answer the restore than the throttle must not lose
 * what it holds to that first write.
 */
import { Effect, Layer, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Projection, Surface } from 'foldkit-surface'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Mirror } from '../src/index.js'

const Model = Schema.Struct({ sidebar: Schema.Literals(['open', 'closed']), draft: Schema.String })
type Model = typeof Model.Type
const initial: Model = { sidebar: 'open', draft: '' }
const Message = defineMessageUnion({
  GotPrefsMessage: { message: Mirror.Message },
  TypedDraft: { draft: Schema.String },
})
type Message = typeof Message.Type
type Return = Update.Return<Model, Message, KeyValueStore.KeyValueStore>

const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })
const Prefs = Mirror.kv(App, {
  key: 'prefs',
  fields: Projection.pick(App.model.sidebar, App.model.draft),
  throttle: '10 millis',
})
const foldPrefs = Mirror.fold(Prefs, message => Message.GotPrefsMessage({ message }))

const update = (model: Model, message: Message): Return =>
  Message.match(message, {
    GotPrefsMessage: ({ message }) => foldPrefs(model, message),
    TypedDraft: ({ draft }) => ({ model: { ...model, draft } }),
  })

const subscriptions = Subscription.make<Model, Message, KeyValueStore.KeyValueStore>()(() => ({
  ...Prefs.subscriptions,
}))

const stored = (keys: Record<string, string>) => JSON.stringify({ version: 1, keys })

/**
 * A store whose first read (the restore's) answers only when `answer` is
 * called, reading what it holds then, or failing when `fails`; every other
 * call is immediate, as the write's own read is.
 */
const slowStore = (held: Map<string, string>, fails = false) => {
  let answer = () => {}
  const answered = new Promise<void>(resolve => (answer = resolve))
  let reads = 0
  const store = KeyValueStore.makeStringOnly({
    get: key =>
      reads++ === 0
        ? Effect.promise(() => answered).pipe(
            Effect.andThen(
              fails
                ? Effect.fail(
                    new KeyValueStore.KeyValueStoreError({ message: 'down', method: 'get' }),
                  )
                : Effect.sync(() => held.get(key)),
            ),
          )
        : Effect.sync(() => held.get(key)),
    set: (key, value) => Effect.sync(() => void held.set(key, value)),
    remove: key => Effect.sync(() => void held.delete(key)),
    clear: Effect.sync(() => held.clear()),
    size: Effect.sync(() => held.size),
  })
  return { layer: Layer.succeed(KeyValueStore.KeyValueStore, store), answer }
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
})

const running: Array<() => void> = []
afterEach(() => {
  for (const dispose of running.splice(0)) dispose()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

const mount = (layer: Layer.Layer<KeyValueStore.KeyValueStore>) => {
  const container = document.createElement('div')
  container.id = 'mirror-restore'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      init: () => foldPrefs.init(initial),
      update,
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [
            h.div([h.Id('shown')], [`${model.sidebar}|${model.draft}`]),
            h.button([h.Id('type'), h.OnClick(Message.TypedDraft({ draft: 'kept' }))], ['type']),
          ],
        ),
      subscriptions,
      container,
      resources: layer,
    }),
  )
  running.push(() => handle.dispose())
}

const shown = () => document.getElementById('shown')?.textContent ?? ''
const type = () => document.getElementById('type')?.click()
const settle = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

it('keeps the stored document while a slow restore is in flight', async () => {
  const held = new Map([['prefs', stored({ sidebar: 'closed', draft: 'saved' })]])
  const { layer, answer } = slowStore(held)
  mount(layer)
  await vi.waitFor(() => expect(shown()).toBe('open|'))
  await settle(60) // several throttles
  expect(held.get('prefs')).toBe(stored({ sidebar: 'closed', draft: 'saved' }))
  answer()
  await vi.waitFor(() => expect(shown()).toBe('closed|saved'))
  await settle(60)
  expect(held.get('prefs')).toBe(stored({ sidebar: 'closed', draft: 'saved' }))
})

it('an edit made before a slow restore answers is written with what the store restores', async () => {
  const held = new Map([['prefs', stored({ sidebar: 'closed', draft: 'saved' })]])
  const { layer, answer } = slowStore(held)
  mount(layer)
  await vi.waitFor(() => expect(shown()).toBe('open|'))
  type()
  await vi.waitFor(() => expect(shown()).toBe('open|kept'))
  await settle(60)
  expect(held.get('prefs')).toBe(stored({ sidebar: 'closed', draft: 'saved' }))
  answer()
  await vi.waitFor(() => expect(shown()).toBe('closed|kept'))
  await vi.waitFor(() =>
    expect(held.get('prefs')).toBe(stored({ sidebar: 'closed', draft: 'kept' })),
  )
})

it('an empty store holds back no write, even before the restore answers', async () => {
  const held = new Map<string, string>()
  const { layer, answer } = slowStore(held)
  mount(layer)
  await vi.waitFor(() => expect(shown()).toBe('open|'))
  type()
  await vi.waitFor(() => expect(held.get('prefs')).toBe(stored({ draft: 'kept' })))
  answer()
  await settle(60)
  expect(shown()).toBe('open|kept')
  expect(held.get('prefs')).toBe(stored({ draft: 'kept' }))
})

it('a restore that fails counts as an empty store: edits are written after it', async () => {
  const held = new Map([['prefs', stored({ sidebar: 'closed' })]])
  const { layer, answer } = slowStore(held, true)
  mount(layer)
  await vi.waitFor(() => expect(shown()).toBe('open|'))
  answer()
  type()
  await vi.waitFor(() => expect(held.get('prefs')).toBe(stored({ draft: 'kept' })))
  expect(shown()).toBe('open|kept')
})
