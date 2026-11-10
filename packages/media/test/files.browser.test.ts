/// <reference types="@vitest/browser-playwright" />
/**
 * A downloaded file, even HTML written to run on the application's origin,
 * opens nothing and runs nothing: the browser is handed it with the headers
 * every download carries (CDP `Fetch` answers the route), and a page served
 * as HTML shows the probe can see a script run.
 */
import { Option } from 'effect'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { cdp } from 'vitest/browser'
import { fileHeaders } from '../src/server/fileRules.js'

declare global {
  interface Window {
    ran?: string | undefined
  }
}

const SCRIPT = '<!doctype html><script>parent.ran = location.pathname</script><p>hello</p>'

let headers: Readonly<Record<string, string>> = {}
const fulfil = (event: { requestId: string }) =>
  cdp().send('Fetch.fulfillRequest', {
    requestId: event.requestId,
    responseCode: 200,
    responseHeaders: Object.entries(headers).map(([name, value]) => ({ name, value })),
    body: btoa(SCRIPT),
  })

beforeEach(async () => {
  window.ran = undefined
  cdp().on('Fetch.requestPaused', fulfil)
  await cdp().send('Fetch.enable', {
    patterns: [{ urlPattern: '*/_media/files/*', requestStage: 'Request' }],
  })
})
afterEach(async () => {
  cdp().off('Fetch.requestPaused', fulfil)
  await cdp().send('Fetch.disable')
  document.querySelectorAll('iframe').forEach(frame => frame.remove())
})

/** Opens `path` in a frame, waits for it to settle, and answers what its script set, if it ran. */
const opened = async (path: string) => {
  const frame = document.createElement('iframe')
  frame.src = path
  document.body.append(frame)
  // A download fires no load in the frame, so wait out a time a page would have run in.
  await new Promise(resolve => setTimeout(resolve, 750))
  return window.ran
}

test('a page served as HTML runs, so the probe sees a script', async () => {
  headers = { 'content-type': 'text/html; charset=utf-8' }
  expect(await opened('/_media/files/control')).toBe('/_media/files/control')
})

test('a downloaded HTML file runs no script', async () => {
  headers = fileHeaders(Option.some('page.html'))
  expect(await opened(`/_media/files/${'a'.repeat(32)}`)).toBe(undefined)
})
