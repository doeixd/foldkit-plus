/**
 * The studio as one application in a real browser: its sections share one
 * runtime, so moving between them swaps no application — the address, the
 * narrowing and each section's Model stay as they were.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import type { Url } from 'foldkit/url'
import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
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

/** Text without its white space: a selection's string breaks lines where the runs do not. */
const spaceless = (text: string | undefined) => (text ?? '').replace(/\s+/g, '')

/** The open post's body editor and its bar, with the first line selected by hand. */
const bodyWithSelection = async () => {
  await mount('/', 'as=wren')
  await expect.poll(() => document.querySelector('#Worklist button') !== null, answered).toBe(true)
  click('#Worklist button')
  const editable = () => document.querySelector('#post-body [contenteditable]') as HTMLElement
  await expect.poll(() => editable() !== null, answered).toBe(true)
  const tools = () => [...document.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button')]
  const bold = () => tools().find(tool => tool.getAttribute('aria-label') === 'Bold')!
  await expect.poll(() => bold() !== undefined, answered).toBe(true)
  // As the writer does: a press in the first line, then keys to its ends.
  await userEvent.click(editable().querySelector('[data-run]')!)
  await userEvent.keyboard('{Home}{Shift>}{End}{/Shift}')
  const selected = spaceless(window.getSelection()!.toString())
  expect(selected.length).toBeGreaterThan(0)
  // Bold is offered once the Model has the selection.
  await expect.poll(() => bold().getAttribute('aria-disabled'), answered).toBe('false')
  return { editable, tools, bold, selected }
}
/** Shift+Tab from the body, past the fields between, to the bar's one stop. */
const backToBar = async (tools: () => ReadonlyArray<HTMLElement>) => {
  for (let step = 0; step < 6 && !tools().includes(document.activeElement as HTMLElement); step++) {
    await userEvent.tab({ shift: true })
  }
  expect(tools()).toContain(document.activeElement)
}
const inBody = (editable: () => HTMLElement) => editable().contains(document.activeElement)
/** The text the editor draws as selected while a tool has the focus. */
const drawnSelection = () =>
  spaceless(
    [...document.querySelectorAll('#post-body [data-decoration="selection"]')]
      .map(element => element.textContent)
      .join(''),
  )
const boldText = (editable: () => HTMLElement) =>
  spaceless([...editable().querySelectorAll('strong')].map(element => element.textContent).join(''))

it('a press on Bold formats the selection and leaves the focus and the selection in the body', async () => {
  const { editable, tools, bold, selected } = await bodyWithSelection()
  expect(tools().filter(tool => tool.tabIndex === 0)).toHaveLength(1)
  await userEvent.click(bold())
  await expect.poll(() => bold().getAttribute('aria-pressed'), answered).toBe('true')
  expect(boldText(editable)).toBe(selected)
  expect(inBody(editable)).toBe(true)
  expect(spaceless(window.getSelection()!.toString())).toBe(selected)
  expect(editable().getAttribute('tabindex')).toBeNull()
})

it('Bold from the keyboard leaves the focus on its tool, the bar one tab stop, and the selection shown', async () => {
  const { editable, tools, bold, selected } = await bodyWithSelection()
  await backToBar(tools)
  await expect.poll(drawnSelection, answered).toBe(selected)
  for (let step = 0; step < tools().length && document.activeElement !== bold(); step++) {
    await userEvent.keyboard('{ArrowRight}')
  }
  expect(document.activeElement).toBe(bold())
  // The tab stop follows focus.
  await expect.poll(() => tools().filter(tool => tool.tabIndex === 0), answered).toEqual([bold()])
  await userEvent.keyboard('{Enter}')
  await expect.poll(() => bold().getAttribute('aria-pressed'), answered).toBe('true')
  expect(boldText(editable)).toBe(selected)
  expect(document.activeElement).toBe(bold())
  await expect.poll(drawnSelection, answered).toBe(selected)
})

it('Escape on a tool returns to the body with the selection, and typing replaces it', async () => {
  const { editable, tools, bold, selected } = await bodyWithSelection()
  await backToBar(tools)
  for (let step = 0; step < tools().length && document.activeElement !== bold(); step++) {
    await userEvent.keyboard('{ArrowRight}')
  }
  await userEvent.keyboard('{Enter}')
  await expect.poll(() => bold().getAttribute('aria-pressed'), answered).toBe('true')
  await userEvent.keyboard('{Escape}')
  await expect.poll(() => inBody(editable), answered).toBe(true)
  await expect.poll(() => spaceless(window.getSelection()!.toString()), answered).toBe(selected)
  expect(drawnSelection()).toBe('')
  await userEvent.keyboard('Zed')
  await expect.poll(() => boldText(editable), answered).toBe('Zed')
  expect(spaceless(editable().textContent ?? undefined)).not.toContain(selected)
})
