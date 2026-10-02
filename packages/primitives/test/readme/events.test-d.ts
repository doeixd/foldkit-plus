import { Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Bundle } from 'foldkit-bundle'
import { Visibility, keyboardEvents, matchHotkey } from '../../src/events/index.js'

const Page = Bundle.compose({}).pipe(Bundle.withChild('tab', Visibility))
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.div([], [model.tab.visible ? 'Watching' : 'Paused']),
  subscriptions: placements.subscriptions(),
})
void config

type EditorModel = { readonly text: string }
const EditorMessage = defineMessageUnion({ SaveRequested: {} })
type EditorMessage = typeof EditorMessage.Type

const subscriptions = Subscription.make<EditorModel, EditorMessage>()(() => ({
  keys: Subscription.persistent(
    keyboardEvents({ preventDefault: press => matchHotkey('ctrl+s', press) }).pipe(
      Stream.filter(event => event._tag === 'Pressed' && matchHotkey('ctrl+s', event)),
      Stream.map(() => EditorMessage.SaveRequested()),
    ),
  ),
}))
void subscriptions

keyboardEvents({ preventDefault: press => press.key === 'ArrowUp' })
// @ts-expect-error: the decision reads the press, not the DOM event
keyboardEvents({ preventDefault: press => press.defaultPrevented })
