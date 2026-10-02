// @vitest-environment jsdom
/**
 * The application on the real Foldkit runtime, with the browser's URL and
 * history: the log as a reader sees it, the loads each entry fires, and the
 * save on leaving the Studio.
 */
import { Runtime } from 'foldkit'
import { afterEach, expect, test, vi } from 'vitest'

import { Message, Model, init, update, view } from '../src/main.js'

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

const linkTo = (href: string): HTMLAnchorElement => {
  const found = document.querySelector<HTMLAnchorElement>(`a[href="${href}"]:not(nav a)`)
  if (found === null) throw new Error(`no link to ${href}`)
  return found
}

/** Each log entry's summary and badges, newest first. */
const log = (): ReadonlyArray<string> =>
  Array.from(document.querySelectorAll('aside li')).map(entry =>
    Array.from(entry.querySelectorAll('p, span'))
      .map(node => node.textContent)
      .join(' | '),
  )

const waitFor = (assertion: () => void) => vi.waitFor(assertion, { timeout: 3_000 })

test('the log narrates each navigation, and each entry fires its load', async () => {
  start('/')
  await waitFor(() => expect(document.title).toBe('Route Transitions'))
  // Only the cold load: the runtime does not report the starting URL again.
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(log()).toEqual(['#1 Cold load → Home | Cold load | Entered Home'])

  link('Gallery').click()
  await waitFor(() => expect(text()).toContain('Hanging the paintings…'))
  expect(window.location.pathname).toBe('/gallery')
  await waitFor(() => expect(text()).toContain('Winter Circuit'))

  linkTo('/gallery/1').click()
  await waitFor(() => expect(text()).toContain('Unpacking the painting…'))
  await waitFor(() =>
    expect(document.querySelector('article')?.textContent).toContain('Mara Ellsworth'),
  )

  link('Next →').click()
  await waitFor(() => expect(document.title).toBe('Painting 2 | Route Transitions'))
  await waitFor(() => expect(document.querySelector('article')?.textContent).toContain('Jun Okabe'))

  link('Home').click()
  await waitFor(() => expect(document.title).toBe('Route Transitions'))
  link('Home').click()
  await waitFor(() => expect(log()).toHaveLength(6))

  expect(log()).toEqual([
    '#6 Home → Home | Stayed within route',
    '#5 Painting 2 → Home | Entered Home | Exited Painting',
    '#4 Painting 1 → Painting 2 | Stayed on Painting: 1 → 2',
    '#3 Gallery → Painting 1 | Entered Painting | Exited Gallery',
    '#2 Home → Gallery | Entered Gallery | Exited Home',
    '#1 Cold load → Home | Cold load | Entered Home',
  ])
})

test('leaving the Studio saves the draft, and back returns to it', async () => {
  start('/studio')
  await waitFor(() => expect(text()).toContain('Nothing saved yet.'))
  const draft = document.querySelector('textarea')
  if (draft === null) throw new Error('no draft')
  draft.value = 'half-finished thought'
  draft.dispatchEvent(new Event('input', { bubbles: true }))

  link('Home').click()
  await waitFor(() => expect(document.title).toBe('Route Transitions'))
  window.history.back()
  await waitFor(() => expect(text()).toContain('Last saved draft'))
  expect(text()).toContain('half-finished thought')
  expect(log()[0]).toBe('#3 Home → Studio | Entered Studio | Exited Home')
})
