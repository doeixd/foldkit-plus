// @vitest-environment jsdom
/**
 * The showcase on the real Foldkit runtime, with the browser's URL: the nav
 * links, a component page's own state, and the Styles Mixins inject for the
 * Slots a page draws.
 */
import { Runtime } from 'foldkit'
import { afterEach, expect, test, vi } from 'vitest'

import { Flags, Message, Model, flags, init, subscriptions, update, view } from '../src/main.js'

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
      Flags,
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
    { flags },
  )
}

const waitFor = (assertion: () => void) => vi.waitFor(assertion, { timeout: 3_000 })

const byText = <E extends Element>(selector: string, text: string): E => {
  const found = Array.from(document.querySelectorAll<E>(selector)).find(
    element => element.textContent === text,
  )
  if (found === undefined) throw new Error(`no ${selector} with the text ${text}`)
  return found
}

const currentNavLinks = (): ReadonlyArray<string | null> =>
  Array.from(document.querySelectorAll('nav a[aria-current="page"]')).map(link => link.textContent)

test('a nav link opens its component page and marks itself current', async () => {
  start('/')
  await waitFor(() => expect(document.title).toBe('Foldkit UI Showcase'))
  expect(currentNavLinks()).toEqual([])

  byText<HTMLAnchorElement>('nav a', 'Checkbox').click()
  await waitFor(() => expect(document.title).toBe('Checkbox | Foldkit UI Showcase'))
  expect(window.location.pathname).toBe('/checkbox')
  expect(currentNavLinks()).toEqual(['Checkbox'])
  expect(document.querySelector('main h2')?.textContent).toBe('Checkbox')
})

test('the Button page counts clicks through the @foldkit/ui Button', async () => {
  start('/button')
  await waitFor(() => expect(document.body.textContent).toContain('Clicked 0 times'))

  byText<HTMLButtonElement>('button', 'Click me').click()
  await waitFor(() => expect(document.body.textContent).toContain('Clicked 1 time'))
  expect(document.body.textContent).not.toContain('Clicked 1 times')
})

test('the Styles of the Slots a page draws reach the document', async () => {
  start('/button')
  await waitFor(() => byText('button', 'Click me'))

  const css = Array.from(document.querySelectorAll('style'))
    .map(style => style.textContent)
    .join('')
  const button = byText<HTMLButtonElement>('button', 'Click me')
  expect(button.classList.length).toBeGreaterThan(0)
  expect(Array.from(button.classList).filter(name => !css.includes(`.${name}`))).toEqual([])
})
