// @vitest-environment jsdom
/**
 * Remote's transport end to end: a page on the Foldkit runtime whose rows each
 * read one `Price`, over `Remote.http` and `serveFetch`, with a `fetch` that
 * counts the requests, their sizes and their aborts. One plan is one batch,
 * cut to the limits the client knows (#354, #359); a read nobody waits on
 * any more is aborted (#355); a read that outlives its deadline fails and is
 * aborted (#353).
 */
import { Effect, Layer, Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Entity } from 'foldkit-entity'
import { Remote, RemoteClient, isRemoteMessage, type ClientOptions } from 'foldkit-remote'
import { Projection, Surface } from 'foldkit-surface'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serveFetch } from '../src/fetch.js'
import { RemoteServer } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const Price = Entity.define('Price', Schema.Struct({ id: Schema.String, cents: Schema.Number }))
const Model = Schema.Struct({ remote: Remote.Model, names: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Remote.messages,
  Shown: { names: Schema.Array(Schema.String) },
})
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Price] })
const Cents = Entity.select(Price, { cents: true })
/** One read per row, as a results page draws them. */
const Prices = App.surface('Prices', {
  params: { names: Schema.Array(Schema.String) },
  model: ({ params }) => ({
    rows: Projection.struct(
      Object.fromEntries(params.names.map(name => [name, Data.get(Cents, name)])),
    ),
  }),
})

const catalog = Array.from({ length: 2500 }, (_, index) => `name${index}`)
const backend = RemoteServer.memory({
  domain: Data,
  rows: { Price: catalog.map((id, index) => ({ id, cents: index })) },
  principal: {},
})
const served = serveFetch({
  server: backend.server,
  resolvePrincipal: () => Effect.succeed({}),
  layer: () => Layer.empty as Layer.Layer<never>,
})

interface Sent {
  readonly bytes: number
  readonly signal: AbortSignal | undefined
}

/**
 * A `fetch` to `serveFetch` that records each request and, while `held`, waits
 * until it is released or aborted before answering.
 */
const network = () => {
  const sent: Sent[] = []
  const held = { on: false, release: [] as Array<() => void> }
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const signal = init?.signal ?? undefined
    sent.push({ bytes: new TextEncoder().encode(String(init?.body)).length, signal })
    if (held.on) {
      await new Promise<void>((resolve, reject) => {
        held.release.push(resolve)
        signal?.addEventListener('abort', () => reject(signal.reason))
      })
    }
    return served(new Request(String(input), init), {})
  }
  return { sent, held, fetch }
}

const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> =>
  isRemoteMessage(message)
    ? { model: Data.reduce(model, message) }
    : { model: { ...model, names: message.names } }

const tagsOf = (model: Model) => model.names.map(name => Data.get(Cents, name).read(model)._tag)
const view = (model: Model, h: HtmlBuilder<Message>) => {
  const tags = tagsOf(model)
  return h.main(
    [],
    [
      h.p([h.Id('ready')], [String(tags.filter(tag => tag === 'Ready').length)]),
      h.p([h.Id('failed')], [String(tags.filter(tag => tag === 'Failed').length)]),
      h.input([h.Id('names'), h.OnInput(value => Message.Shown({ names: value.split(',') }))]),
    ],
  )
}

const text = (id: string) => document.getElementById(id)?.textContent

/** Shows `names` instead, as typing a search would. */
const show = (names: ReadonlyArray<string>) => {
  const input = document.getElementById('names') as HTMLInputElement
  input.value = names.join(',')
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

/** The page over `fetch`, showing `names`. */
const open = (
  names: ReadonlyArray<string>,
  fetch: typeof globalThis.fetch,
  options: ClientOptions = {},
) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = `page-${Math.random().toString(36).slice(2)}`
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      init: () => ({ model: { remote: Remote.initial, names } }),
      update,
      view,
      subscriptions: Subscription.make<Model, Message, RemoteClient>()(() =>
        Data.subscriptions({
          prices: Surface.at(Prices, model => Option.some({ names: model.names })),
        }),
      ),
      container,
      resources: Remote.clientLayer(Remote.http('http://worker.test/remote', { fetch }), options),
    }),
  )
}

describe('many rows from one view (#354)', () => {
  it('reads 556 rows in one request', async () => {
    const net = network()
    const page = open(catalog.slice(0, 556), net.fetch)
    try {
      await vi.waitFor(() => expect(text('ready')).toBe('556'), { timeout: 5000 })
      expect(net.sent).toHaveLength(1)
    } finally {
      page.dispose()
    }
  })

  it('cuts 2,500 rows into reads the server takes, and every row is answered', async () => {
    const net = network()
    const page = open(catalog, net.fetch)
    try {
      await vi.waitFor(() => expect(text('ready')).toBe('2500'), { timeout: 10000 })
      expect(text('failed')).toBe('0')
      expect(net.sent).toHaveLength(3)
    } finally {
      page.dispose()
    }
  })
})

describe('a read nobody waits on is aborted (#355)', () => {
  it('a narrower list joins the read in flight: one request, nothing aborted', async () => {
    const net = network()
    net.held.on = true
    const page = open(catalog.slice(0, 556), net.fetch)
    try {
      await vi.waitFor(() => expect(net.sent).toHaveLength(1))
      show(catalog.slice(0, 111))
      await new Promise(resolve => setTimeout(resolve, 100))
      net.held.release.forEach(release => release())
      await vi.waitFor(() => expect(text('ready')).toBe('111'))
      expect(net.sent).toHaveLength(1)
      expect(net.sent[0]!.signal?.aborted).toBe(false)
    } finally {
      page.dispose()
    }
  })

  it('a disjoint list aborts the read in flight and reads its own', async () => {
    const net = network()
    net.held.on = true
    const page = open(catalog.slice(0, 100), net.fetch)
    try {
      await vi.waitFor(() => expect(net.sent).toHaveLength(1))
      show(catalog.slice(100, 200))
      await vi.waitFor(() => expect(net.sent[0]!.signal?.aborted).toBe(true))
      await vi.waitFor(() => expect(net.sent).toHaveLength(2))
      net.held.release.forEach(release => release())
      await vi.waitFor(() => expect(text('ready')).toBe('100'))
      expect(net.sent[1]!.signal?.aborted).toBe(false)
    } finally {
      page.dispose()
    }
  })
})

describe('a deadline (#353)', () => {
  it('a read past the client’s timeout fails, and its request is aborted', async () => {
    const net = network()
    net.held.on = true
    const page = open(catalog.slice(0, 3), net.fetch, { timeout: '50 millis' })
    try {
      await vi.waitFor(() => expect(text('failed')).toBe('3'))
      expect(net.sent[0]!.signal?.aborted).toBe(true)
    } finally {
      page.dispose()
    }
  })
})
