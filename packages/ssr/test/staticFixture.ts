/**
 * The application Phase 4's tests render: a post whose title and body are a
 * static region the server owns, beside a like button the browser owns.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

export const Model = Schema.Struct({
  post: Schema.Struct({ title: Schema.String, body: Schema.String }),
  likes: Schema.Number,
  extra: Schema.Boolean,
})
export type Model = typeof Model.Type
export const Message = defineMessageUnion({ Liked: {}, ShowedExtra: {} })
export type Message = typeof Message.Type

export const initial: Model = { post: { title: '', body: '' }, likes: 0, extra: false }
export const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

/** How many times each static region's render has run, by id. */
export const calls = { copy: 0, extra: 0 }

export const config = {
  Model,
  init: () => ({
    model: { post: { title: 'Hello', body: 'A long server-only body' }, likes: 0, extra: false },
  }),
  update: (model: Model, message: Message) =>
    message._tag === 'Liked'
      ? { model: { ...model, likes: model.likes + 1 } }
      : { model: { ...model, extra: true } },
  view: (model: Model, h: HtmlBuilder<Message>) => ({
    title: 'Post',
    body: h.main(
      [],
      [
        SSR.static('post-copy', ih => {
          calls.copy++
          return [
            ih.h1([ih.Id('title')], [model.post.title]),
            ih.p([ih.Id('body')], [model.post.body]),
          ]
        }),
        h.button([h.Id('like'), h.OnClick(Message.Liked())], [String(model.likes)]),
        h.button([h.Id('more'), h.OnClick(Message.ShowedExtra())], ['More']),
        model.extra
          ? SSR.static('extra', ih => {
              calls.extra++
              return [ih.p([ih.Id('extra')], ['rendered in the browser'])]
            })
          : h.empty,
      ],
    ),
  }),
  container: null,
}

/** The post itself is not sent: only the region the server owns reads it. */
export const plan = SSR.plan(App, {
  id: 'post',
  state: Projection.pick(App.model.likes, App.model.extra),
})

export const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

export const load = (page: string) => {
  const parsed = new DOMParser().parseFromString(page, 'text/html')
  document.documentElement.innerHTML = parsed.documentElement.innerHTML
}
