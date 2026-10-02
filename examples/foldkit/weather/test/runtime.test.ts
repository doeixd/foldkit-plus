// @vitest-environment jsdom
/**
 * The whole application on the real runtime, with the stylesheet installed as
 * `entry.ts` installs it. `FetchWeather` provides Foldkit's fetch-backed
 * `Http.layer` itself, so the fake server stands in for `fetch`: nothing
 * reaches the network, and the requests are the ones the browser would send.
 */
import { Runtime } from 'foldkit'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'

import { Model, init, update, view } from '../src/main.js'
import { stylesheet } from '../src/style.js'
import { mockGeocodingResponse, mockWeatherResponse } from './main.fixture.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.head.replaceChildren()
  document.body.replaceChildren()
})

/** Open-Meteo, answering each request once `release` is called, so the loading state can be seen. */
const fakeOpenMeteo = () => {
  const requested: Array<string> = []
  const pending: Array<() => void> = []
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : input.toString()
    requested.push(url)
    const body = url.includes('geocoding') ? mockGeocodingResponse : mockWeatherResponse
    return new Promise<Response>(resolve =>
      pending.push(() => resolve(new Response(JSON.stringify(body), { status: 200 }))),
    )
  })
  const release = () => pending.splice(0).forEach(answer => answer())
  return { requested, release }
}

const run = () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  Style.install(stylesheet)
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
  Runtime.run(Runtime.makeApplication({ Model, init, update, view, container }))
}

const zipCodeInput = (): HTMLInputElement => {
  const found = document.querySelector<HTMLInputElement>('input[aria-label="Zip code"]')
  if (found === null) throw new Error('no zip code input')
  return found
}

const submitButton = (): HTMLButtonElement => {
  const found = document.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (found === null) throw new Error('no submit button')
  return found
}

const text = (): string => document.body.textContent ?? ''

test('fetches the weather for a typed zip code, shows the loading state until it arrives, and injects the CSS of every class it draws', async () => {
  const server = fakeOpenMeteo()
  run()

  await vi.waitFor(zipCodeInput)
  zipCodeInput().value = '90210'
  zipCodeInput().dispatchEvent(new Event('input', { bubbles: true }))
  submitButton().click()

  await vi.waitFor(() => expect(server.requested).toHaveLength(1))
  expect(submitButton().textContent).toBe('Loading...')
  expect(submitButton().getAttribute('aria-disabled')).toBe('true')
  expect(text()).toContain('Fetching weather...')

  server.release()
  await vi.waitFor(() => expect(server.requested).toHaveLength(2))
  server.release()

  await vi.waitFor(() => expect(document.querySelector('article')).not.toBeNull())
  expect(document.querySelector('article')?.textContent).toBe(
    '90210Beverly Hills, California72°FClear skyHumidity45%Wind Speed10 mph',
  )
  expect(submitButton().textContent).toBe('Get Weather')

  const css = Array.from(document.querySelectorAll('style'))
    .map(style => style.textContent)
    .join('')
  const drawn = Array.from(document.querySelectorAll('[class]')).flatMap(element =>
    Array.from(element.classList),
  )
  expect(drawn.length).toBeGreaterThan(0)
  expect(drawn.filter(className => !css.includes(`.${className}`))).toEqual([])
})

test('shows the error in place of the card for an empty zip code, without a request', async () => {
  const server = fakeOpenMeteo()
  run()

  await vi.waitFor(submitButton)
  submitButton().click()

  await vi.waitFor(() => expect(text()).toContain('Zip code required'))
  expect(document.querySelector('article')).toBeNull()
  expect(server.requested).toEqual([])
})
