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
import { answered, hostedRemote } from './hosted.js'

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
  await expect
    .poll(() => text('nav[aria-label="Sections"] a[aria-current="page"]'), answered)
    .toBe('Posts')
  // Narrowing the worklist writes the address, as one application would.
  type('input[aria-label="Search posts"]', 'milk')
  await expect.poll(() => window.location.search).toContain('q=milk')

  click('a[href="/pages?as=wren"]')
  await expect
    .poll(() => text('nav[aria-label="Sections"] a[aria-current="page"]'), answered)
    .toBe('Pages')
  await expect.poll(() => text('#new'), answered).toContain('New page')
  // The posts section is hidden, not gone: its narrowing stays in the address.
  expect(window.location.search).toContain('q=milk')

  click('a[href="/?as=wren"]')
  await expect
    .poll(() => text('nav[aria-label="Sections"] a[aria-current="page"]'), answered)
    .toBe('Posts')
  expect(
    (document.querySelector('input[aria-label="Search posts"]') as HTMLInputElement).value,
  ).toBe('milk')
})

it('keeps focus in the page as a post opens and closes', async () => {
  await mount('/', 'as=wren')
  await expect.poll(() => document.querySelector('#Worklist button') !== null, answered).toBe(true)
  const row = document.querySelector('#Worklist button') as HTMLButtonElement
  const key = row.closest('[data-row-key]')?.getAttribute('data-row-key')
  row.focus()
  row.click()
  // The row that held focus is gone once the editor is drawn: writing starts at the title.
  await expect.poll(() => document.activeElement?.id, answered).toBe('PostForm-title')

  // Writing elsewhere in the form, and the draft saved under the writer's hands, leaves focus there.
  const excerpt = document.querySelector('#PostForm-excerpt') as HTMLTextAreaElement
  excerpt.focus()
  type('#PostForm-excerpt', 'Another line.')
  await expect.poll(() => text('#status'), answered).toBe('Draft saved.')
  expect(document.activeElement?.id).toBe('PostForm-excerpt')

  click('#close')
  // Back where the writer came from: the button of the row they opened.
  await expect
    .poll(
      () => document.activeElement?.closest('[data-row-key]')?.getAttribute('data-row-key'),
      answered,
    )
    .toBe(key)
  expect(document.activeElement?.tagName).toBe('BUTTON')
})

it('falls back to the list when the row a post was opened from is gone', async () => {
  await mount('/', 'as=wren')
  await expect.poll(() => document.querySelector('#Worklist button') !== null, answered).toBe(true)
  click('#Worklist button')
  await expect.poll(() => document.activeElement?.id, answered).toBe('PostForm-title')
  // The narrowing changes under the open post, as another tab's would: no row matches it.
  const url = new URL(window.location.href)
  url.searchParams.set('q', 'no post is called this')
  window.history.replaceState(null, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
  await expect.poll(() => window.location.search, answered).toContain('q=')

  click('#close')
  await expect.poll(() => document.activeElement?.id, answered).toBe('Worklist')
})

it('keeps focus in the page as a page opens and closes', async () => {
  await mount('/pages', 'as=wren')
  await expect.poll(() => document.querySelector('#sitePages button') !== null, answered).toBe(true)
  const row = document.querySelector('#sitePages button') as HTMLButtonElement
  const key = row.closest('[data-row-key]')?.getAttribute('data-row-key')
  row.focus()
  row.click()
  await expect.poll(() => document.activeElement?.id, answered).toBe('PageForm-title')

  click('#close')
  await expect
    .poll(
      () => document.activeElement?.closest('[data-row-key]')?.getAttribute('data-row-key'),
      answered,
    )
    .toBe(key)
})

it('formats the body from its toolbar, which is one tab stop, and leaves the writer in the editor', async () => {
  await mount('/', 'as=wren')
  await expect.poll(() => document.querySelector('#Worklist button') !== null, answered).toBe(true)
  click('#Worklist button')
  const editable = () => document.querySelector('#post-body [contenteditable]') as HTMLElement
  await expect.poll(() => editable() !== null, answered).toBe(true)

  const tools = () => [...document.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')]
  const bold = () => tools().find(tool => tool.textContent === 'Bold')!
  expect(bold()).toBeDefined()
  expect(tools().filter(tool => tool.tabIndex === 0)).toHaveLength(1)

  // Select the first run's words, as the writer does.
  const run = editable().querySelector('[data-run]') as HTMLElement
  const range = document.createRange()
  range.selectNodeContents(run)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))

  // The tab stop follows focus.
  bold().focus()
  await expect.poll(() => tools().filter(tool => tool.tabIndex === 0), answered).toEqual([bold()])
  tools()[1]!.focus()
  await expect
    .poll(() => tools().filter(tool => tool.tabIndex === 0), answered)
    .toEqual([tools()[1]])

  // Pressing a tool formats the selection, and gives focus back to the editor, still tabbable.
  bold().focus()
  bold().click()
  await expect.poll(() => editable().querySelector('strong') !== null, answered).toBe(true)
  await expect.poll(() => bold().getAttribute('aria-pressed'), answered).toBe('true')
  await expect.poll(() => document.activeElement === editable(), answered).toBe(true)
  expect(editable().getAttribute('tabindex')).toBeNull()
})
