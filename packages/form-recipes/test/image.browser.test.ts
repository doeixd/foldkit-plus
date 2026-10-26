/// <reference types="@vitest/browser-playwright" />
/**
 * The image control drawn in a form on the real runtime, a file chosen through
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
import { HashedAsset } from 'foldkit-media'
import { image } from '../src/image.js'

const hash = 'c'.repeat(64)
const facts = { key: hash, width: 640, height: 480, alpha: false, hash, placeholder: null }

const PostForm = Form.make(
  'PostForm',
  Form.input(Schema.Struct({ cover: HashedAsset.annotate({ title: 'Cover' }) })),
  { inputs: { cover: image({ id: 'cover' }).control } },
)
type Model = typeof PostForm.initial
type Message = typeof PostForm.Message.Type
const View = FormView.define(PostForm)

interface Paused {
  readonly requestId: string
}
let paused: Array<Paused> = []
const hold = (event: Paused) => {
  paused.push(event)
}
const next = async (): Promise<string> => {
  await vi.waitFor(() => expect(paused.length).toBeGreaterThan(0))
  return paused.shift()!.requestId
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
  cdp().on('Fetch.requestPaused', hold)
  await cdp().send('Fetch.enable', { patterns: [{ urlPattern: '*/_media/upload*' }] })
})
afterEach(async () => {
  cdp().off('Fetch.requestPaused', hold)
  await cdp().send('Fetch.disable')
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

let latest: Model = PostForm.initial
const mount = async () => {
  const container = document.createElement('div')
  container.id = 'image-form'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: PostForm.bundle.Model,
      container,
      init: () => ({ model: PostForm.initial }),
      update: (model: Model, message: Message) => {
        const next = PostForm.bundle.update(model, message, undefined)
        latest = next.model
        return { model: next.model, commands: next.commands ?? [] }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        View({ model, errors: [], canSubmit: true }, h),
      subscriptions: PostForm.bundle.subscriptions!(undefined),
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('#cover')).not.toBeNull())
  return handle
}
const choose = () =>
  userEvent.upload(
    document.querySelector<HTMLInputElement>('#cover')!,
    new File([new Uint8Array(64)], 'cover.png', { type: 'image/png' }),
  )
const status = () => document.querySelector('[role="status"]')?.textContent
const press = (words: string) =>
  Array.from(document.querySelectorAll('button'))
    .find(button => button.textContent === words)!
    .click()

it('shows the send on its way, then the kept image as the key’s value', async () => {
  const handle = await mount()
  try {
    await choose()
    const requestId = await next()
    await vi.waitFor(() => expect(status()).toBe('Sending cover.png'))
    // The progress is named by what the live region says, and the field's label
    // names the group the file input is drawn in.
    const progress = document.querySelector('progress')!
    expect([progress.max, progress.getAttribute('aria-labelledby')]).toEqual([100, 'cover-status'])
    const group = document.getElementById('PostForm-cover')!
    expect([group.getAttribute('role'), group.getAttribute('aria-labelledby')]).toEqual([
      'group',
      'PostForm-cover-label',
    ])
    expect(document.getElementById('PostForm-cover-label')?.textContent).toBe('Cover')
    await answer(requestId, 201, JSON.stringify(facts))
    await vi.waitFor(() => expect(status()).toBe('An image of 640 × 480'))
    expect(PostForm.partial(latest).cover?.key).toBe(hash)
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
    await choose()
    const requestId = await next()
    await vi.waitFor(() => expect(status()).toMatch(/^Sending/))
    press('Cancel')
    await vi.waitFor(() => expect(states).toEqual([XMLHttpRequest.OPENED]))
    // The button pressed is gone: focus is on the file input again.
    await vi.waitFor(() => expect(document.activeElement?.id).toBe('cover'))
    expect(PostForm.partial(latest)).toEqual({})
    await cdp()
      .send('Fetch.continueRequest', { requestId })
      .catch(() => {})
  } finally {
    handle.dispose()
  }
})

it('says why a send was refused, and sends the same file again on retry', async () => {
  const handle = await mount()
  try {
    await choose()
    await answer(await next(), 413, '{"error":"UploadTooLarge"}')
    await vi.waitFor(() => expect(status()).toBe('cover.png is too large.'))
    expect(PostForm.partial(latest)).toEqual({})
    press('Try again')
    await answer(await next(), 201, JSON.stringify(facts))
    await vi.waitFor(() => expect(status()).toBe('An image of 640 × 480'))
  } finally {
    handle.dispose()
  }
})
