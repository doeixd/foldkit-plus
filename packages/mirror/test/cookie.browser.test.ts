/**
 * A cookie mirror's write goes through `document.cookie`, which the browser
 * parses: its attributes must be ones it takes, and its value one it keeps
 * whole. Written by the mirror's Subscription, read back as a server would
 * read the `Cookie` header.
 */
import { Effect, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Diagnostics, Surface } from 'foldkit-surface'
import { afterEach, expect, test } from 'vitest'
import { Mirror } from '../src/index.js'

const Model = Schema.Struct({ names: Schema.Array(Schema.String), theme: Schema.String })
type Model = typeof Model.Type
const initial: Model = { names: [], theme: 'light' }
const App = Surface.application({
  Model,
  Message: defineMessageUnion({}),
  initial,
  update: model => ({ model }),
})
const Prefs = Mirror.cookie(App, {
  name: 'prefs',
  fields: [App.model.names, App.model.theme],
  maxBytes: 600,
})
const entry = Prefs.subscriptions['prefs.mirror']
const write = (model: Model, collected = Diagnostics.collect()) =>
  Effect.runPromise(
    Stream.runDrain(entry.dependenciesToStream(entry.modelToDependencies(model))).pipe(
      Effect.provideService(Diagnostics.Reporter, collected.report),
    ),
  )
const held = (): Model => Mirror.bootstrap(initial, Prefs.bootstrap(Prefs.keysOf(document.cookie)))

afterEach(() => {
  document.cookie = 'prefs=; Path=/; Max-Age=0'
})

test('the browser keeps the slice whole, whatever its text holds', async () => {
  const model: Model = { names: ['a; b', 'c,d', 'é=1', '"q"\\', ' sp ', '%41+'], theme: 'x&y=z' }
  await write(model)
  expect(document.cookie).toMatch(/(^|; )prefs=/)
  expect(held()).toEqual(model)
})

test('a slice back at its defaults removes the cookie', async () => {
  await write({ ...initial, theme: 'dark' })
  expect(held().theme).toBe('dark')
  await write(initial)
  expect(document.cookie).not.toMatch(/(^|; )prefs=/)
})

test('a slice past maxBytes is not written, the cookie keeps what it held, and it is reported', async () => {
  await write({ ...initial, theme: 'dark' })
  const collected = Diagnostics.collect()
  await write(
    { names: Array.from({ length: 100 }, (_, i) => `name-${i}`), theme: 'dark' },
    collected,
  )
  expect(held()).toEqual({ ...initial, theme: 'dark' })
  expect(collected.reported.map(diagnostic => diagnostic._tag)).toEqual(['CookieTooLarge'])
})
