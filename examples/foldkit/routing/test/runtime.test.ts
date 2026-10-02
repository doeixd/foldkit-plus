// @vitest-environment jsdom
/**
 * The application on the real Foldkit runtime, with the browser's URL and
 * history: links, the search form, back and forward, and the key bindings.
 */
import { Runtime } from 'foldkit'
import { afterEach, expect, test, vi } from 'vitest'

import { Message, Model, init, subscriptions, update, view } from '../src/main.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

const start = (path: string) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  window.history.replaceState(null, '', path)
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)

  Runtime.run(
    Runtime.makeApplication({
      Model,
      init,
      update,
      view,
      subscriptions,
      container,
      routing: {
        onUrlRequest: request => Message.ClickedLink({ request }),
        onUrlChange: url => Message.ChangedUrl({ url }),
      },
    }),
  )
}

const text = (): string => document.body.textContent ?? ''

const link = (name: string): HTMLAnchorElement => {
  const found = Array.from(document.querySelectorAll('a')).find(a => a.textContent === name)
  if (found === undefined) throw new Error(`no link named ${name}`)
  return found
}

const currentNavLink = (): string | null | undefined =>
  document.querySelector('nav a[aria-current="page"]')?.textContent

const searchInput = (): HTMLInputElement => {
  const input = document.querySelector<HTMLInputElement>('#people-search')
  if (input === null) throw new Error('no search input')
  return input
}

const typeSearch = (value: string): void => {
  searchInput().value = value
  searchInput().dispatchEvent(new Event('input', { bubbles: true }))
}

const submitSearch = (): void => {
  document
    .querySelector('button[type="submit"]')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

const waitFor = (assertion: () => void) => vi.waitFor(assertion, { timeout: 3_000 })

test('links navigate, and back and forward return to each page', async () => {
  start('/')
  await waitFor(() => expect(document.title).toBe('Routing'))
  expect(currentNavLink()).toBe('Home')

  link('Files').click()
  await waitFor(() => expect(document.title).toBe('Files | Routing'))
  expect(window.location.pathname).toBe('/files')
  expect(currentNavLink()).toBe('Files')

  link('documents').click()
  await waitFor(() => expect(link('resume.pdf')).toBeDefined())
  link('taxes').click()
  await waitFor(() => expect(document.title).toBe('taxes | Files | Routing'))
  expect(window.location.pathname).toBe('/files/documents/taxes')

  window.history.back()
  await waitFor(() => expect(document.title).toBe('documents | Files | Routing'))
  window.history.back()
  await waitFor(() => expect(document.title).toBe('Files | Routing'))
  window.history.forward()
  await waitFor(() => expect(document.title).toBe('documents | Files | Routing'))

  link('Nested').click()
  await waitFor(() => expect(text()).toContain('Very Nested Route!'))
  expect(window.location.pathname).toBe('/nested/route/is/very/nested')
  expect(currentNavLink()).toBe('Nested')
})

test('a search is kept in the URL, and back restores the page before it', async () => {
  start('/people')
  await waitFor(() => expect(text()).toContain('Click on any person to view their details:'))
  expect(currentNavLink()).toBe('People')

  typeSearch('designer')
  submitSearch()
  await waitFor(() => expect(text()).toContain('2 results for “designer”'))
  expect(window.location.search).toBe('?searchText=designer')
  expect(text()).not.toContain('Bob Smith')
  expect(text()).toContain('Recent searches:')

  window.history.back()
  await waitFor(() => expect(text()).toContain('Bob Smith'))
  expect(window.location.search).toBe('')
  expect(searchInput().value).toBe('')
  // The history outlives the search it recorded.
  expect(text()).toContain('Recent searches:designer')

  document.querySelector<HTMLAnchorElement>('a[href="/people/5"]')?.click()
  await waitFor(() => expect(document.title).toBe('Person 5 | Routing'))
  expect(text()).toContain('Designer')
  expect(currentNavLink()).toBe('People')
})

test('the People route shown again searches again and drops unsubmitted text', async () => {
  start('/people?searchText=designer')
  await waitFor(() => expect(text()).toContain('2 results for “designer”'))

  submitSearch()
  await waitFor(() => expect(text()).toContain('Searching…'))
  await waitFor(() => expect(text()).toContain('2 results for “designer”'))
  expect(window.location.search).toBe('?searchText=designer')

  typeSearch('bo')
  link('People').click()
  await waitFor(() => expect(searchInput().value).toBe(''))
  await waitFor(() => expect(text()).toContain('Click on any person to view their details:'))
})

test('G then a letter goes to that section', async () => {
  start('/')
  await waitFor(() => expect(document.title).toBe('Routing'))
  const press = (key: string) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

  press('g')
  press('f')
  await waitFor(() => expect(document.title).toBe('Files | Routing'))
  press('g')
  press('n')
  await waitFor(() => expect(document.title).toBe('Nested | Routing'))
  press('g')
  press('p')
  await waitFor(() => expect(document.title).toBe('People | Routing'))
  press('g')
  press('h')
  await waitFor(() => expect(document.title).toBe('Routing'))
})
