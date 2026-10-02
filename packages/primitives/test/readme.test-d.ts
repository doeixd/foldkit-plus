/**
 * The examples from this package's README, type-checked so the documentation
 * cannot drift from the API. Imports are relative, as in every package's
 * fixture; the README shows the published subpaths. Each subpath README has
 * its own fixture under `test/readme/`.
 */
import { Schema, Stream } from 'effect'
import { mapMessage } from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { copyText, ClipboardMessage } from '../src/dom/index.js'
import { keyboardEvents } from '../src/events/index.js'
import { MediaQuery } from '../src/media/index.js'
import { Resize } from '../src/observers/index.js'

// Sixty seconds: follow the color scheme
const Page = Bundle.compose({ theme: Schema.String }).pipe(
  Bundle.withMessages({ ThemeSet: { theme: Schema.String } }),
  Bundle.withChild('dark', MediaQuery, { args: { query: '(prefers-color-scheme: dark)' } }),
)
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type

const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({ theme: 'light' }),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.div([], [model.dark.matches ? 'Dark mode' : 'Light mode']),
  subscriptions: placements.subscriptions(),
})
void config

// An entry
type GameModel = { readonly playing: boolean }
const GameMessage = defineMessageUnion({ PressedKey: { key: Schema.String } })
type GameMessage = typeof GameMessage.Type

const subscriptions = Subscription.make<GameModel, GameMessage>()(() => ({
  keys: Subscription.persistent(
    keyboardEvents({ preventDefault: press => press.key.startsWith('Arrow') }).pipe(
      Stream.filter(event => event._tag === 'Pressed'),
      Stream.map(({ key }) => GameMessage.PressedKey({ key })),
    ),
  ),
}))
void subscriptions

// A Mount
type PanelModel = { readonly width: number; readonly height: number }
const PanelMessage = defineMessageUnion({
  Resized: { width: Schema.Number, height: Schema.Number },
})
type PanelMessage = typeof PanelMessage.Type

const panel = (model: PanelModel, h: HtmlBuilder<PanelMessage>): Html =>
  h.div([h.OnMount(Resize())], [`${model.width} × ${model.height}`])
void panel

// A Command
type NoteModel = { readonly text: string }
const NoteMessage = defineMessageUnion({ Clipboard: { message: ClipboardMessage } })
type NoteMessage = typeof NoteMessage.Type

const copy = (model: NoteModel): Update.Return<NoteModel, NoteMessage> => ({
  model,
  commands: [mapMessage(copyText(model.text), message => NoteMessage.Clipboard({ message }))],
})
void copy
