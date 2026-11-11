/**
 * A static region binds no Message: its `ih` is `HtmlBuilder<never>`. A Slot's
 * attributes are typed with the page's Message whatever they hold, so they
 * enter a region through `SSR.unbound`, which checks them when called.
 */
import type { Attribute, ChildAttribute, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { SSR as Server } from 'foldkit-ssr'
import { SSR } from 'foldkit-ssr/client'

const Message = defineMessageUnion({ Liked: {} })
type Message = typeof Message.Type

/** What a Slot's `attrs()` gives: `foldkit-mixins`' `SlotAttributes<Message>`. */
declare const slot: ReadonlyArray<Attribute<Message> | ChildAttribute>

export const view = (h: HtmlBuilder<Message>) => [
  SSR.static('copy', ih => [ih.h1(SSR.unbound(slot), ['Title'])]),
  Server.static('copy', ih => [ih.p([...SSR.unbound(slot), ih.Id('body')], [])]),

  // @ts-expect-error: a Slot's attributes may hold a handler, which a region cannot run
  SSR.static('copy', ih => [ih.h1(slot, ['Title'])]),
  // @ts-expect-error: a Message bound by the page's builder
  SSR.static('copy', ih => [ih.button([h.OnClick(Message.Liked())], ['Like'])]),
  // @ts-expect-error: the region's own builder binds no Message
  SSR.static('copy', ih => [ih.button([ih.OnClick(Message.Liked())], ['Like'])]),
]

/** A drawing shared by a region and the live page: unbound attributes fit any builder. */
const heading = <M>(h: HtmlBuilder<M>) => h.h2(SSR.unbound(slot), ['Shared'])

export const shared = (h: HtmlBuilder<Message>) => [
  heading(h),
  SSR.static('shared', ih => [heading(ih)]),
]
