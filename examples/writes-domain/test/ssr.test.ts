// @vitest-environment jsdom
/**
 * First paint from a server render (A-WP9): the server reads the shop's Domain
 * model through `pageReader`, as the principal the request's cookie names, and
 * renders; the browser adopts the served markup, reads nothing it was handed,
 * and a change made between render and hydration reaches it through `live`.
 */
import { Effect, Exit, Layer, Option, Schema, Scope, Stream } from 'effect'
import { handleRequest } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Product } from 'foldkit-example-writes/domain'
import { Remote, RemoteClient, type LiveEvent } from 'foldkit-remote'
import { DomainRemote } from 'foldkit-remote-domain'
import { pageReader } from 'foldkit-remote-domain/server'
import { live } from 'foldkit-remote/live'
import { SSR } from 'foldkit-ssr'
import { Projection, Surface } from 'foldkit-surface'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CurrentUser,
  ProductReads,
  ProductRowLive,
  Session,
  SessionLive,
  Shop,
  ShopApi,
} from '../src/model.js'
import { bindings } from '../src/shop.js'
import * as InMemory from '@alchemy.run/domain/InMemory'

// Remote's store crosses in its own part; the slice is what else the page holds.
const Model = Schema.Struct({ route: Schema.String, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
type Message = typeof Message.Type
const initial: Model = { route: 'product', remote: Remote.initial }
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })
const Data = Remote.make({ model: App.model.remote, entities: [Product] })
const product = live(
  Data,
  Entity.select(Product, { name: true, reserved: true, revision: true }),
  'p1',
)
const ProductPage = App.surface('ProductPage', { model: () => ({ product }) })
const actives = { page: Surface.at(ProductPage, undefined) }

const plan = SSR.plan(App, {
  id: 'product',
  state: Projection.pick(App.model.route),
  surfaces: [actives.page],
  parts: [Remote.resume(Data)],
})

const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

const view = (model: Model, h: HtmlBuilder<Message>) => {
  const read = product.read(model)
  return {
    title: 'Product',
    body: h.p(
      [h.Id('product')],
      ['value' in read ? `${read.value.name}: ${read.value.reserved} reserved` : read._tag],
    ),
  }
}

/** The session a call trusts: who the server decided, never a header of the call. */
const trusting = (user: Option.Option<string>) =>
  Layer.succeed(Session, effect =>
    Effect.provideService(
      effect,
      CurrentUser,
      Option.map(user, id => ({ id })),
    ),
  )

/** The shop's model, hosted once for the server and the browser alike, with p1 listed for ada. */
const hosted = async () => {
  const { layer: platform, control } = InMemory.make({ manual: true })
  const scope = Effect.runSync(Scope.make())
  const context = await Effect.runPromise(
    Layer.buildWithScope(Shop.layer(ProductRowLive).pipe(Layer.provide(platform)), scope),
  )
  const call = <A, E>(
    body: (client: Effect.Success<typeof ShopApi.clientInProcess>) => Effect.Effect<A, E>,
  ) =>
    Effect.runPromise(
      Effect.scoped(Effect.flatMap(ShopApi.clientInProcess, body)).pipe(
        Effect.provide(SessionLive),
        Effect.provide(context),
      ),
    )
  await call(client =>
    client.ListProduct('p1', {
      row: {
        id: 'p1',
        ownerId: 'ada',
        name: 'Lamp',
        status: 'published',
        stock: 10,
        reserved: 0,
        revision: 1,
      },
    }),
  )
  await Effect.runPromise(control.drain)
  const reserve = async (revision: number) => {
    await call(client =>
      client.ReserveStock('p1', { revision, quantity: 2 }, { headers: { 'x-user': 'ada' } }),
    )
    await Effect.runPromise(control.drain)
  }
  return { context, scope, reserve }
}

let closing: Scope.Closeable | undefined
afterEach(async () => {
  if (closing !== undefined) await Effect.runPromise(Scope.close(closing, Exit.void))
  closing = undefined
})

/** A shop: the server's entry and the browser's resources over one hosted model, and what the browser asked. */
const shop = async () => {
  const model = await hosted()
  closing = model.scope
  const hostedLayer = Layer.succeedContext(model.context)
  const reader = pageReader(ShopApi, {
    views: [ProductReads],
    resolvePrincipal: (request: Request) =>
      Effect.succeed(
        Option.fromNullishOr(/session=(\w+)/.exec(request.headers.get('cookie') ?? '')?.[1]),
      ),
    middleware: trusting,
  })
  const config = {
    Model,
    init: () => ({ model: initial }),
    update: (current: Model, message: Message) => ({ model: Data.reduce(current, message) }),
    subscriptions: Data.subscriptions(actives),
    view,
    container: null,
  }
  const entry = SSR.entry(config, plan, {
    buildId: 'b',
    prepare: (unread, request) =>
      Data.satisfy(unread, actives).pipe(
        Effect.provide(reader(request, undefined)),
        Effect.provide(hostedLayer),
        Effect.orDie,
      ),
  })

  const reads: Array<unknown> = []
  const frames: Array<LiveEvent> = []
  const opened: Array<unknown> = []
  const browser = Layer.effect(
    RemoteClient,
    Effect.map(RemoteClient, inner =>
      RemoteClient.of({
        ...inner,
        read: batch => (reads.push(batch.requests), inner.read(batch)),
        live: request => (
          opened.push(request.revisions),
          inner.live(request).pipe(Stream.tap(frame => Effect.sync(() => frames.push(frame))))
        ),
      }),
    ),
  ).pipe(
    Layer.provide(
      DomainRemote.layer(ShopApi, { ...bindings(), principal: Effect.succeed(Option.some('ada')) }),
    ),
    Layer.provide(Layer.effect(ShopApi.Client, ShopApi.clientInProcess)),
    Layer.provide(trusting(Option.some('ada'))),
    Layer.provide(hostedLayer),
  )

  const serve = async () => {
    const response = await handleRequest(
      new Request('https://shop.test/', {
        headers: { accept: 'text/html', cookie: 'session=ada' },
      }),
      { renderPage: entry.renderPage, template },
    )
    return response.text()
  }
  const hydrate = () => SSR.hydrate({ ...config, resources: browser }, plan, { buildId: 'b' })
  return { serve, hydrate, reads, frames, opened, reserve: model.reserve }
}

/** Loads a served page as the document, as a browser would. */
const load = (page: string) => {
  const parsed = new DOMParser().parseFromString(page, 'text/html')
  document.documentElement.innerHTML = parsed.documentElement.innerHTML
}

/** Waits until `until` holds, on evidence rather than a fixed sleep. */
const poll = async (until: () => boolean, what: string) => {
  for (let tries = 0; tries < 200; tries++) {
    if (until()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`waited for ${what}`)
}

/** Every text the page showed while observed. */
const watchTexts = () => {
  const texts: Array<string> = []
  const observer = new MutationObserver(() => texts.push(document.body.textContent ?? ''))
  observer.observe(document.body, { subtree: true, childList: true, characterData: true })
  return { texts, stop: () => observer.disconnect() }
}

describe('a page rendered from a Domain model on the server', () => {
  it('serves the row the request’s principal reads, as markup a parser keeps', async () => {
    const { serve } = await shop()
    const served = await serve()
    const parsed = new DOMParser().parseFromString(served, 'text/html')
    expect(parsed.getElementById('product')?.textContent).toBe('Lamp: 0 reserved')
  })

  it('hydrates onto the served element, reading nothing and never showing Loading', async () => {
    const { serve, hydrate, reads, frames, opened } = await shop()
    load(await serve())
    const shown = document.getElementById('product')
    const watched = watchTexts()
    hydrate()
    await poll(() => opened.length > 0, 'the live stream to open')
    await new Promise(resolve => setTimeout(resolve, 100))
    watched.stop()

    expect(document.getElementById('product')).toBe(shown)
    expect(shown?.textContent).toBe('Lamp: 0 reserved')
    expect(watched.texts.filter(text => text.includes('Loading'))).toEqual([])
    expect(reads).toEqual([])
    // The stream names the revision it was handed, and the adapter sends no frame of it.
    expect(opened).toEqual([[{ entity: 'Product', id: 'p1', revision: 1 }]])
    expect(frames).toEqual([])
  })

  it('takes a change made between render and hydration through live', async () => {
    const { serve, hydrate, reads, frames, reserve } = await shop()
    load(await serve())
    await reserve(1)
    hydrate()
    await poll(
      () => document.getElementById('product')?.textContent === 'Lamp: 2 reserved',
      'the reservation to show',
    )
    expect(reads).toEqual([])
    expect(frames).toEqual([expect.objectContaining({ _tag: 'EntityPatched', revision: 2 })])
  })
})
