/**
 * Phase A: a Surface renderer uses the resumable builder through
 * `Resume.view`, with no change to `foldkit-surface`, and its bindings are
 * marked in the page like any other.
 */
import { Effect } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Surface } from 'foldkit-surface'
import { expect, it } from 'vitest'
import { BINDING_ATTRIBUTE, Resume, SSR } from 'foldkit-ssr'
import { App, Message, config, plan, type Model } from './bindingsFixture.js'

const Like = App.surface('Like', {
  model: ({ model }) => ({ id: model.id, likes: model.likes }),
  messages: [Message.Liked],
})

const LikeView = Surface.rootView(
  Like,
  undefined,
  Resume.view((like, rh) =>
    rh.button(
      [rh.Id('surface-like'), rh.OnClick(Message.Liked({ id: like.id }))],
      [String(like.likes)],
    ),
  ),
)

const page = {
  ...config,
  view: (model: Model, h: HtmlBuilder<Message>) => ({
    title: 'Post',
    body: h.main([], [LikeView(model, h)]),
  }),
}

it("marks a Surface renderer's bindings through Resume.view", async () => {
  const { rendered, envelope } = await Effect.runPromise(SSR.render(page, plan, { buildId: 'b' }))
  expect(rendered.html).toMatch(
    new RegExp(`<button[^>]*${BINDING_ATTRIBUTE}click="0"[^>]*id="surface-like"`),
  )
  expect(envelope).toContain(
    '"bindings":[{"attribute":"OnClick","message":{"_tag":"Liked","id":"p1"}}]',
  )
})
