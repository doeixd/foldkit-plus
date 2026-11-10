/// <reference types="@vitest/browser-playwright" />
/**
 * The file control drawn in a form on the real runtime, a file chosen through
 * its own input, and the route's answers given by the browser (CDP `Fetch`):
 * the progress, a cancel that aborts the request, a refusal and its retry.
 */
import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import { FormView } from 'foldkit-mixins-form'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { FileAsset } from 'foldkit-media'
import { file } from '../src/file.js'

const key = 'c'.repeat(32)
const facts = { key, name: 'report.pdf', type: 'application/pdf', size: 64 }

const DocForm = Form.make(
  'DocForm',
  Form.input(Schema.Struct({ attachment: FileAsset.annotate({ title: 'Attachment' }) })),
  { inputs: { attachment: file({ id: 'attachment' }).control } },
)
type Model = typeof DocForm.initial
type Message = typeof DocForm.Message.Type
const View = FormView.define(DocForm)

interface Paused {
  readonly requestId: string
  readonly request: { readonly url: string }
}
const probe = '/_media/files?probe'
const isProbe = (url: string) => new URL(url).search === '?probe'

// A request held before `next` asks waits in `paused`; a `next` asking first
// waits in `waiting` until the request arrives, however late a loaded run makes
// it, bounded only by the test's own timeout.
let paused: Array<Paused> = []
let waiting: Array<(event: Paused) => void> = []
const hold = (event: Paused) => {
  if (isProbe(event.request.url)) return void answer(event.requestId, 204, '')
  const waiter = waiting.shift()
  if (waiter) waiter(event)
  else paused.push(event)
}
/**
 * The URL of the next request to the route that is answered. A held request is
 * answered only by the test, so armed before a send, it ends the wait for one
 * that went to the dev server unheld.
 */
const answered = (): Promise<string> =>
  new Promise(resolve => {
    const observer = new PerformanceObserver(list => {
      const entry = list
        .getEntries()
        .find(entry => entry.name.includes('/_media/files') && !isProbe(entry.name))
      if (!entry) return
      observer.disconnect()
      resolve(entry.name)
    })
    observer.observe({ type: 'resource' })
  })
/** The next held request's id, or a failure naming the request answered unheld. */
const next = (ended: Promise<string>): Promise<string> => {
  const event = paused.shift()
  if (event) return Promise.resolve(event.requestId)
  return Promise.race([
    new Promise<Paused>(resolve => waiting.push(resolve)).then(event => event.requestId),
    ended.then(url => {
      throw new Error(`${url} was answered before it was held`)
    }),
  ])
}
const answer = (requestId: string, status: number, body: string) =>
  cdp().send('Fetch.fulfillRequest', {
    requestId,
    responseCode: status,
    responseHeaders: [{ name: 'content-type', value: 'application/json' }],
    body: btoa(body),
  })

beforeEach(async () => {
  paused = []
  waiting = []
  cdp().on('Fetch.requestPaused', hold)
  await cdp().send('Fetch.enable', { patterns: [{ urlPattern: '*/_media/files*' }] })
  // Chromium holds the page's requests some time after `Fetch.enable` answers,
  // and one sent before then goes to the dev server unheld (Vitest probes its own
  // interception for the same reason), so ask until a probe is held.
  while ((await fetch(probe, { method: 'POST' })).status !== 204);
})
afterEach(async () => {
  cdp().off('Fetch.requestPaused', hold)
  await cdp().send('Fetch.disable')
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

let latest: Model = DocForm.initial
const mount = async () => {
  const container = document.createElement('div')
  container.id = 'file-form'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: DocForm.bundle.Model,
      container,
      init: () => ({ model: DocForm.initial }),
      update: (model: Model, message: Message) => {
        const next = DocForm.bundle.update(model, message, undefined)
        latest = next.model
        return { model: next.model, commands: next.commands ?? [] }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        View({ model, errors: [], canSubmit: true }, h),
      subscriptions: DocForm.bundle.subscriptions!(undefined),
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('#attachment')).not.toBeNull())
  return handle
}
const choose = () =>
  userEvent.upload(
    document.querySelector<HTMLInputElement>('#attachment')!,
    new File([new Uint8Array(64)], 'report.pdf', { type: 'application/pdf' }),
  )
const status = () => document.querySelector('[role="status"]')?.textContent
const press = (words: string) =>
  Array.from(document.querySelectorAll('button'))
    .find(button => button.textContent === words)!
    .click()

it('shows the send on its way, then the kept file as a download link and the key’s value', async () => {
  const handle = await mount()
  try {
    const ended = answered()
    await choose()
    const requestId = await next(ended)
    await vi.waitFor(() => expect(status()).toBe('Sending report.pdf'))
    const progress = document.querySelector('progress')!
    expect([progress.max, progress.getAttribute('aria-labelledby')]).toEqual([
      100,
      'attachment-status',
    ])
    await answer(requestId, 201, JSON.stringify(facts))
    await vi.waitFor(() => expect(status()).toBe('report.pdf, 64 B'))
    const link = document.querySelector<HTMLAnchorElement>('a[download]')!
    expect([link.getAttribute('href'), link.getAttribute('download'), link.textContent]).toEqual([
      `/_media/files/${key}`,
      'report.pdf',
      'report.pdf (64 B)',
    ])
    expect(DocForm.partial(latest).attachment?.key).toBe(key)
  } finally {
    handle.dispose()
  }
})

it('sends the file as an octet-stream with its name and type in headers', async () => {
  const handle = await mount()
  try {
    const sent: Array<Record<string, string>> = []
    const watch = (event: { request: { url: string; headers: Record<string, string> } }) => {
      if (!isProbe(event.request.url)) sent.push(event.request.headers)
    }
    cdp().on('Fetch.requestPaused', watch)
    const ended = answered()
    await choose()
    await answer(await next(ended), 201, JSON.stringify(facts))
    cdp().off('Fetch.requestPaused', watch)
    expect(sent[0]).toMatchObject({
      'content-type': 'application/octet-stream',
      'x-foldkit-file-name': 'report.pdf',
      'x-foldkit-file-type': 'application/pdf',
    })
  } finally {
    handle.dispose()
  }
})

it('cancels a send by aborting its request, and leaves the key empty', async () => {
  const states: Array<number> = []
  const abort = XMLHttpRequest.prototype.abort
  vi.spyOn(XMLHttpRequest.prototype, 'abort').mockImplementation(function (this: XMLHttpRequest) {
    states.push(this.readyState)
    abort.call(this)
  })
  const handle = await mount()
  try {
    const ended = answered()
    await choose()
    const requestId = await next(ended)
    await vi.waitFor(() => expect(status()).toMatch(/^Sending/))
    press('Cancel')
    await vi.waitFor(() => expect(states).toEqual([XMLHttpRequest.OPENED]))
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('attachment'))
    expect(DocForm.partial(latest)).toEqual({})
    await cdp()
      .send('Fetch.continueRequest', { requestId })
      .catch(() => {})
  } finally {
    handle.dispose()
  }
})

it.each([
  [413, 'report.pdf is too large.'],
  [429, 'Too many uploads lately. Try report.pdf again soon.'],
  [503, 'The server is busy. Try report.pdf again soon.'],
  [408, 'The upload of report.pdf was too slow.'],
])('says why a %i was refused, and sends the same file again on retry', async (code, words) => {
  const handle = await mount()
  try {
    const first = answered()
    await choose()
    await answer(await next(first), code, '{"error":"x"}')
    await vi.waitFor(() => expect(status()).toBe(words))
    expect(DocForm.partial(latest)).toEqual({})
    const again = answered()
    press('Try again')
    await answer(await next(again), 201, JSON.stringify(facts))
    await vi.waitFor(() => expect(status()).toBe('report.pdf, 64 B'))
  } finally {
    handle.dispose()
  }
})
