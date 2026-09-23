/**
 * `Mirror.fold`: a key-value mirror under one wrapper variant of the
 * application's union, so `update` matches that union exhaustively and the
 * mirror's answer arrives wrapped, with the lift recorded for Story.
 */
import { Effect, Schema } from 'effect'
import { KeyValueStore } from 'effect/unstable/persistence'
import { defineMessageUnion } from 'foldkit/message'
import { Story } from 'foldkit/test'
import type * as Update from 'foldkit/update'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mirror } from '../src/index.js'

const Model = Schema.Struct({ sidebar: Schema.Literals(['open', 'closed']), draft: Schema.String })
type Model = typeof Model.Type
const initial: Model = { sidebar: 'open', draft: '' }

// The application's own union: Mirror's Messages arrive inside one variant.
const Message = defineMessageUnion({
  Started: {},
  GotPrefsMessage: { message: Mirror.Message },
  TypedDraft: { draft: Schema.String },
})
type Message = typeof Message.Type
type Return = Update.Return<Model, Message, KeyValueStore.KeyValueStore>

const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })
const Prefs = Mirror.kv(App, {
  key: 'todo/prefs',
  fields: Projection.pick(App.model.sidebar, App.model.draft),
  throttle: 0,
})
const foldPrefs = Mirror.fold(Prefs, message => Message.GotPrefsMessage({ message }))

// Exhaustive: TypeScript would reject a missing variant here.
const update = (model: Model, message: Message): Return =>
  Message.match(message, {
    Started: () => foldPrefs.init(model),
    GotPrefsMessage: ({ message }) => foldPrefs(model, message),
    TypedDraft: ({ draft }) => ({ model: { ...model, draft } }),
  })

describe('Mirror.fold', () => {
  it('reduces the wrapped MirrorRestored exactly as Prefs.reduce does', () => {
    const restored = Message.GotPrefsMessage({
      message: { _tag: 'MirrorRestored', name: 'todo/prefs', keys: { sidebar: 'closed' } },
    })
    const { model } = update(initial, restored)
    expect(model).toEqual(Prefs.reduce(initial, restored.message))
    expect(model.sidebar).toBe('closed')
  })

  it('restore yields the wrapper Message, not a bare MirrorRestored', async () => {
    const message = await Effect.runPromise(
      foldPrefs.restore.effect.pipe(Effect.provide(KeyValueStore.layerMemory)),
    )
    expect(message).toEqual({
      _tag: 'GotPrefsMessage',
      message: { _tag: 'MirrorRestored', name: 'todo/prefs', keys: {} },
    })
    expect(foldPrefs.restore.name).toBe(Prefs.restore.name)
  })

  it('init runs restore and leaves the Model as given', () => {
    const started = foldPrefs.init(initial)
    expect(started.model).toBe(initial)
    expect(started.commands?.map(command => command.name)).toEqual([Prefs.restore.name])
  })

  it('records the lift, so a Story resolves restore with what the store answers', () => {
    Story.story(
      update,
      Story.given(initial),
      // A draft typed before the store answers is kept; the sidebar is restored.
      Story.message(Message.TypedDraft({ draft: 'kept' })),
      Story.message(Message.Started()),
      // Resolved by the mirror's own answer: the recorded lift wraps it.
      Story.Command.resolve(Prefs.restore, {
        _tag: 'MirrorRestored',
        name: 'todo/prefs',
        keys: { sidebar: 'closed', draft: 'stale' },
      }),
      Story.model(model => {
        expect(model).toEqual({ sidebar: 'closed', draft: 'kept' })
      }),
    )
  })
})
