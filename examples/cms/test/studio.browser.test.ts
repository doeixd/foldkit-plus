/**
 * The studio as one application in a real browser: its sections share one
 * runtime, so moving between them swaps no application — the address, the
 * narrowing and each section's Model stay as they were.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import type { Url } from 'foldkit/url'
import { afterEach, expect, it } from 'vitest'
import * as Studio from '../src/apps/studioApp.js'
import { openHost } from '../src/server/host.js'
import { hostedRemote } from './hosted.js'

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
  localStorage.clear()
})

const container = () => {
  const element = document.createElement('div')
  element.id = 'studio-test'
  document.body.appendChild(element)
  return element
}

const text = (selector: string) => document.querySelector(selector)?.textContent ?? ''

/** Mounts the studio at `path`, answering Remote from a fresh seed. */
const mount = async (path: string, search: string) => {
  window.history.replaceState(null, '', `${path}?${search}`)
  const host = await openHost()
  const handle = Runtime.embed(
    Runtime.makeApplication({
      Model: Studio.Model,
      container: container(),
      init: (url: Url) => Studio.init(url),
      update: Studio.update,
      view: (model: Studio.Model, h: HtmlBuilder<Studio.Message>) => Studio.view(model, h),
      routing: {
        onUrlChange: (url: Url) => Studio.Message.UrlChanged({ url }),
        onUrlRequest: request => Studio.Message.UrlRequested({ request }),
      },
      subscriptions: Studio.subscriptions,
      resources: hostedRemote(host, 'edda', { fresh: true }),
    }),
  )
  dispose = () => handle.dispose()
}

const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click()

const type = (selector: string, value: string) => {
  const input = document.querySelector(selector) as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

it('moves between sections in place, keeping the address and each section’s state', async () => {
  // The shell reads its chair when its module loads, so the test sits in one chair throughout.
  await mount('/', 'as=wren')
  await expect.poll(() => text('nav[aria-label="Sections"] a[aria-current="page"]')).toBe('Posts')
  // Narrowing the worklist writes the address, as one application would.
  type('input[aria-label="Search posts"]', 'milk')
  await expect.poll(() => window.location.search).toContain('q=milk')

  click('a[href="/pages?as=wren"]')
  await expect.poll(() => text('nav[aria-label="Sections"] a[aria-current="page"]')).toBe('Pages')
  await expect.poll(() => text('#new')).toContain('New page')
  // The posts section is hidden, not gone: its narrowing stays in the address.
  expect(window.location.search).toContain('q=milk')

  click('a[href="/?as=wren"]')
  await expect.poll(() => text('nav[aria-label="Sections"] a[aria-current="page"]')).toBe('Posts')
  expect(
    (document.querySelector('input[aria-label="Search posts"]') as HTMLInputElement).value,
  ).toBe('milk')
})
