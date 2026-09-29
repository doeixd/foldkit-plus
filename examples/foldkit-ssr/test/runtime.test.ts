// @vitest-environment jsdom
/**
 * `entry.ts` on the real runtime, over pages `entry.server.ts` rendered: it
 * takes one over in place, counts, and persists the count in the cookie the
 * next request is rendered from.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { COUNT_COOKIE } from '../src/cookie.js'
import { stylesheet } from '../src/style.js'
import { pageRequest, respond, template } from './helpers.js'

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  document.head.replaceChildren()
  document.body.replaceChildren()
  document.cookie = `${COUNT_COOKIE}=; path=/; max-age=0`
})

/**
 * The page rendered for `cookie`, put in the document as the browser loads
 * it, with `entry.ts` running as `buildId` saw it.
 */
const open = async (cookie: string, buildId: string): Promise<void> => {
  const html = await (await respond(pageRequest({ cookie }))).text()
  const page = new DOMParser().parseFromString(html, 'text/html')
  document.title = page.title
  document.head.replaceChildren(...Array.from(page.head.childNodes))
  document.body.replaceChildren(...Array.from(page.body.childNodes))
  vi.stubEnv('FOLDKIT_BUILD_ID', buildId)
  await import('../src/entry.js')
}

const waitFor = (assertion: () => void) => vi.waitFor(assertion, { timeout: 3_000 })

const count = (): string | null | undefined => document.getElementById('count')?.textContent

const button = (name: string): HTMLButtonElement => {
  const found = Array.from(document.querySelectorAll('button')).find(b => b.textContent === name)
  if (found === undefined) throw new Error(`no button named ${name}`)
  return found
}

/** The stylesheet `entry.ts` installs when it boots. */
const installed = () =>
  Array.from(document.head.querySelectorAll('style')).filter(
    style => style.textContent === stylesheet,
  )

test('takes the rendered page over in place, counts, and persists the count', async () => {
  const errors = vi.spyOn(console, 'error')
  await open(`${COUNT_COOKIE}=5`, 'test-build')
  const served = document.getElementById('count')
  const provenance = document.getElementById('provenance')?.textContent

  button('+').click()
  await waitFor(() => expect(count()).toBe('6'))
  button('+').click()
  button('-').click()
  button('+').click()
  await waitFor(() => expect(count()).toBe('7'))
  expect(document.title).toBe('Count 7')
  await waitFor(() => expect(document.cookie).toBe(`${COUNT_COOKIE}=7`))

  // The server's nodes were adopted, not drawn again, and it still says so.
  expect(document.getElementById('count')).toBe(served)
  expect(document.getElementById('provenance')?.textContent).toBe(provenance)
  expect(provenance).toMatch(/^Rendered on the Server at /)
  expect(errors).not.toHaveBeenCalled()
  expect(installed()).toHaveLength(1)
})

test('the count it persists is the one the next request renders', async () => {
  await open(`${COUNT_COOKIE}=1`, 'test-build')
  button('+').click()
  await waitFor(() => expect(document.cookie).toBe(`${COUNT_COOKIE}=2`))
  const next = await (await respond(pageRequest({ cookie: document.cookie }))).text()
  expect(
    new DOMParser().parseFromString(next, 'text/html').getElementById('count')?.textContent,
  ).toBe('2')
})

test('refuses a page rendered by another build', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await open(`${COUNT_COOKIE}=5`, 'other-build')
  await waitFor(() => expect(document.body.inert).toBe(true))
})

test('refuses to start on a page the server did not render', async () => {
  const page = new DOMParser().parseFromString(template, 'text/html')
  document.body.replaceChildren(...Array.from(page.body.childNodes))
  await expect(import('../src/entry.js')).rejects.toThrow('the page was not rendered by the server')
})
