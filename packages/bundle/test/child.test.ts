/**
 * One placement driving update and view: a `Link.child` folds its Messages
 * through the wrapper and draws through the same slot, stated once. A click
 * in the drawing reaches only that child, an absent child draws nothing, and
 * a Message the child ignores keeps the parent itself.
 */
import { Option, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Scene } from 'foldkit/test'
import * as Update from 'foldkit/update'
import { describe, expect, it } from 'vitest'
import { Link } from '../src/index.js'

const ChildModel = Schema.Struct({ count: Schema.Number })
type ChildModel = typeof ChildModel.Type
const ChildMessage = defineMessageUnion({ Incremented: {}, Ignored: {} })
type ChildMessage = typeof ChildMessage.Type

const childUpdate = (model: ChildModel, message: ChildMessage) =>
  ChildMessage.match(message, {
    Incremented: () => ({ model: { ...model, count: model.count + 1 } }),
    Ignored: () => ({ model }),
  })

const childView = (model: ChildModel, h: HtmlBuilder<ChildMessage>): Html =>
  h.button([h.Class('counter'), h.OnClick(ChildMessage.Incremented())], [String(model.count)])

const Model = Schema.Struct({
  page: ChildModel,
  maybe: Schema.Option(ChildModel),
})
type Model = typeof Model.Type
const GotPage = Link.wrapper('GotPageMessage', ChildMessage)
const GotMaybe = Link.wrapper('GotMaybeMessage', ChildMessage)
const Message = defineMessageUnion({ ...GotPage.cases, ...GotMaybe.cases })
type Message = typeof Message.Type

const page = Link.child(Link.field<Model>()('page', GotPage), childUpdate, childView, 'page')
const maybe = Link.child(Link.optional<Model>()('maybe', GotMaybe), childUpdate, childView, 'maybe')

// Pinned per arm: each fold speaks its own wrapper, and the match demands one
// output. The commands stay the child's own, widened to the parent's Message.
const update = (model: Model, message: Message): Update.Return<Model, Message, unknown> =>
  Message.match(message, {
    GotPageMessage: ({ message }): Update.Return<Model, Message, unknown> =>
      page.update(model, message),
    GotMaybeMessage: ({ message }): Update.Return<Model, Message, unknown> =>
      maybe.update(model, message),
  })

const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.main(
    [],
    [
      h.section([h.Id('page')], [page.view(model, h)]),
      h.section([h.Id('maybe')], [maybe.view(model, h)]),
    ],
  )

const scene = (model: Model, ...steps: Parameters<typeof Scene.scene<Model, Message>>[1][]) =>
  Scene.scene({ update, view }, Scene.given(model), ...steps)

describe('Link.child', () => {
  it('routes a click in the drawing through the wrapper into that field', () => {
    scene(
      { page: { count: 3 }, maybe: Option.some({ count: 7 }) },
      Scene.click('#page .counter'),
      Scene.expect(Scene.selector('#page .counter')).toHaveText('4'),
      Scene.expect(Scene.selector('#maybe .counter')).toHaveText('7'),
      Scene.click('#maybe .counter'),
      Scene.expect(Scene.selector('#maybe .counter')).toHaveText('8'),
    )
  })

  it('draws nothing while an optional child is absent', () => {
    scene(
      { page: { count: 0 }, maybe: Option.none() },
      Scene.expect(Scene.selector('#maybe .counter')).toBeAbsent(),
      Scene.expect(Scene.selector('#page .counter')).toHaveText('0'),
    )
  })

  it('keeps the parent itself for a Message the child ignores', () => {
    const model: Model = { page: { count: 1 }, maybe: Option.none() }
    expect(page.update(model, ChildMessage.Ignored()).model).toBe(model)
    expect(maybe.update(model, ChildMessage.Ignored()).model).toBe(model)
    // Not a blanket no-op: a Message the child answers still folds.
    expect(page.update(model, ChildMessage.Incremented()).model).not.toBe(model)
    expect(page.update(model, ChildMessage.Incremented()).model.page).toEqual({ count: 2 })
  })
})
