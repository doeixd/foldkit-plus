/**
 * The application Phase A's tests render with the resumable builder: a like
 * button whose Message carries the post's id, a search box and a title field
 * whose Messages have a hole the event fills, a key handler, and one closure
 * handler, which no marker can name.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { Resume, SSR } from 'foldkit-ssr'

export const Model = Schema.Struct({
  id: Schema.String,
  likes: Schema.Number,
  search: Schema.String,
  pressed: Schema.String,
})
export type Model = typeof Model.Type

const Modifiers = Schema.Struct({
  shiftKey: Schema.Boolean,
  ctrlKey: Schema.Boolean,
  altKey: Schema.Boolean,
  metaKey: Schema.Boolean,
})

export const Message = defineMessageUnion({
  Liked: { id: Schema.String },
  ChangedSearch: { value: Schema.String },
  Renamed: { id: Schema.String, title: Schema.String },
  Pressed: { key: Schema.String, modifiers: Modifiers },
  Counted: { count: Schema.Number },
})
export type Message = typeof Message.Type

export const initial: Model = { id: '', likes: 0, search: '', pressed: '' }
export const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

export const config = {
  Model,
  init: () => ({ model: { id: 'p1', likes: 0, search: '', pressed: '' } }),
  update: (model: Model, message: Message) =>
    Message.match(message, {
      Liked: () => ({ model: { ...model, likes: model.likes + 1 } }),
      ChangedSearch: ({ value }) => ({ model: { ...model, search: value } }),
      Renamed: () => ({ model }),
      Pressed: ({ key }) => ({ model: { ...model, pressed: key } }),
      Counted: ({ count }) => ({ model: { ...model, likes: model.likes + count } }),
    }),
  view: (model: Model, h: HtmlBuilder<Message>) => {
    const rh = Resume.builder(h)
    return {
      title: 'Post',
      body: rh.main(
        [],
        [
          rh.button(
            [rh.Id('like'), rh.OnClick(Message.Liked({ id: model.id }), { propagation: 'Stop' })],
            [String(model.likes)],
          ),
          rh.input([rh.Id('search'), rh.Value(model.search), rh.OnInput(Message.ChangedSearch)]),
          rh.p([rh.Id('echo')], [model.search]),
          rh.input([rh.Id('title'), rh.OnChange(Message.Renamed, { id: model.id })]),
          rh.div([rh.Id('keys'), rh.Tabindex(0), rh.OnKeyDown(Message.Pressed)], [model.pressed]),
          rh.input([
            rh.Id('closure'),
            rh.OnInput(value => Message.ChangedSearch({ value: value.toUpperCase() })),
          ]),
          // Bubbles, unlike #like: the live page would answer it too.
          rh.button([rh.Id('plain'), rh.OnClick(Message.Liked({ id: model.id }))], ['Like']),
          // A handler no marker can name: the live page alone answers it.
          rh.button(
            [rh.Id('point'), rh.OnPointerDown(() => Option.some(Message.Counted({ count: 1 })))],
            [],
          ),
          rh.keyed('button')(
            'item',
            [rh.Id('item'), rh.OnClick(Message.Liked({ id: model.id }))],
            ['Like this item'],
          ),
        ],
      ),
    }
  },
  container: null,
}

/** Sends everything the bindings read, so both server renders agree. */
export const plan = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.id, App.model.likes, App.model.search, App.model.pressed),
})

export const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

export const load = (page: string) => {
  const parsed = new DOMParser().parseFromString(page, 'text/html')
  document.documentElement.innerHTML = parsed.documentElement.innerHTML
}

export const settle = () => new Promise(resolve => setTimeout(resolve, 20))
