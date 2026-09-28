// @vitest-environment jsdom
/**
 * The whole application on the real Foldkit runtime, against the fake server
 * and its real latency: what reaches the `RemoteClient` is what Remote
 * decided to fetch, so a cache hit and a deduplicated click show up as a call
 * that never happened.
 */
import { Effect, Layer } from 'effect'
import * as Runtime from 'foldkit/runtime'
import { RemoteClient } from 'foldkit-remote'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from '../src/data.js'
import { Model, Page, init, subscriptions, update } from '../src/main.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** `api`, recording each read (as `Entity:id[fields]`) and query it is asked for. */
const recorded = (calls: Array<string>) =>
  Layer.effect(
    RemoteClient,
    Effect.gen(function* () {
      const client = yield* RemoteClient
      return RemoteClient.of({
        ...client,
        read: batch => {
          calls.push(
            ...batch.requests.map(
              request => `${request.entity}:${request.id}[${request.fields.join(',')}]`,
            ),
          )
          return client.read(batch)
        },
        query: request => {
          calls.push(`query ${request.query}`)
          return client.query(request)
        },
      })
    }),
  ).pipe(Layer.provide(api))

const mount = () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'api-cache-runtime'
  document.body.appendChild(container)
  const calls: Array<string> = []
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      init,
      update,
      view: Page,
      subscriptions,
      container,
      resources: recorded(calls),
    }),
  )
  return { calls, dispose: () => handle.dispose() }
}

const text = (): string => document.body.textContent ?? ''

const button = (name: string): HTMLButtonElement => {
  const found = Array.from(document.querySelectorAll('button')).find(element =>
    element.textContent?.includes(name),
  )
  if (found === undefined) throw new Error(`No button named ${name}`)
  return found
}

const waitFor = (assertion: () => void) => vi.waitFor(assertion, { timeout: 4_000 })

test('a revisited post renders from the Model without a second read', async () => {
  const { calls, dispose } = mount()
  try {
    await waitFor(() => expect(text()).toContain('The Model Is the Cache'))
    // The page of posts, then the fields its rows select.
    expect(calls[0]).toBe('query Posts')
    expect(calls.slice(1)).toEqual(
      expect.arrayContaining(['Post:model-is-the-cache[id,title,excerpt]']),
    )
    expect(text()).not.toContain('Cached')

    button('The Model Is the Cache').click()
    await waitFor(() => expect(text()).toContain('By Maya Okafor'))
    // The title is already held from the list: only what the page adds is read.
    expect(calls.at(-1)).toBe('Post:model-is-the-cache[author,body]')

    button('Back to posts').click()
    await waitFor(() => expect(text()).toContain('Cached'))
    const before = calls.length

    button('The Model Is the Cache').click()
    await waitFor(() => expect(text()).toContain('By Maya Okafor'))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(calls.length).toBe(before)
  } finally {
    dispose()
  }
}, 10_000)

test('invalidating keeps the list on screen and asks once however often it is clicked', async () => {
  const { calls, dispose } = mount()
  try {
    await waitFor(() => expect(text()).toContain('The Model Is the Cache'))
    const before = calls.length

    button('Invalidate').click()
    await waitFor(() => expect(text()).toContain('Refreshing...'))
    expect(text()).toContain('The Model Is the Cache')
    button('Refreshing...').click()

    await waitFor(() => expect(text()).toContain('Invalidate'))
    expect(calls.slice(before).filter(call => call === 'query Posts')).toHaveLength(1)
  } finally {
    dispose()
  }
}, 10_000)
