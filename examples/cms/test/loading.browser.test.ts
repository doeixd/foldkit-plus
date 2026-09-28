/**
 * The studio while its first answers are awaited, in a real runtime over the
 * in-page sandbox with its answers held back: nothing it says then is a fact
 * it has not read, and what stands for the wait is marked busy.
 */
import { Option } from 'effect'
import { Remote } from 'foldkit-remote'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import type { Url } from 'foldkit/url'
import { afterEach, expect, it } from 'vitest'
import * as Posts from '../src/app.js'
import { openSandbox } from '../src/browser.js'
import * as Pages from '../src/pageApp.js'
import { view as pagesView } from '../src/pagesView.js'
import { remoteClient, type Send } from '../src/transport.js'
import { view as postsView } from '../src/view.js'

const urlOf = (search: string): Url => ({
  protocol: 'http:',
  host: 'studio',
  port: Option.none(),
  pathname: '/',
  search: Option.some(search),
  hash: Option.none(),
})

/** The sandbox, answering only once `release` is called. */
const held = async () => {
  const send = await openSandbox({ fresh: true })
  let release = () => {}
  const released = new Promise<void>(resolve => {
    release = resolve
  })
  const heldSend: Send = async (chair, body) => {
    await released
    return send(chair, body)
  }
  return { remote: Remote.clientLayer(remoteClient(heldSend, 'edda')), release }
}

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

it('shows an entry being read with no state, not as New, until its state is read', async () => {
  const { remote, release } = await held()
  const handle = Runtime.embed(
    Runtime.makeElement(
      Posts.placements.complete({
        Model: Posts.Model,
        container: container(),
        init: () => Posts.init(urlOf('as=edda&post=entry-post-drafts')),
        update: Posts.update,
        view: (model: Posts.Model, h: HtmlBuilder<Posts.Message>) => postsView(model, h).body,
        subscriptions: Posts.placements.subscriptions(),
        resources: remote,
      }),
    ),
  )
  dispose = () => handle.dispose()
  await expect.poll(() => document.querySelector('#status')?.getAttribute('aria-busy')).toBe('true')
  expect(document.querySelector('#editor [data-state]')).toBeNull()
  release()
  await expect.poll(() => text('#editor [data-state]')).toBe('Published')
  expect(document.querySelector('#status')?.hasAttribute('aria-busy')).toBe(false)
})

it('says the pages are loading, busy, and never that there are none, until they are read', async () => {
  const { remote, release } = await held()
  const handle = Runtime.embed(
    Runtime.makeElement(
      Pages.placements.complete({
        Model: Pages.Model,
        container: container(),
        init: () =>
          Pages.update(Pages.initial, Pages.Message.UrlChanged({ url: urlOf('as=edda') })),
        update: Pages.update,
        view: (model: Pages.Model, h: HtmlBuilder<Pages.Message>) => pagesView(model, h).body,
        subscriptions: Pages.placements.subscriptions(),
        resources: remote,
      }),
    ),
  )
  dispose = () => handle.dispose()
  const said: Array<string> = []
  const observer = new MutationObserver(() => said.push(text('#pages')))
  observer.observe(document.body, { subtree: true, childList: true, characterData: true })
  await expect
    .poll(() => document.querySelector('#pages [aria-busy="true"]')?.textContent)
    .toBe('Loading…')
  release()
  await expect.poll(() => document.querySelectorAll('#pages li').length).toBe(2)
  observer.disconnect()
  expect(said.some(each => each.includes('Nothing yet.'))).toBe(false)
})

it('opens a post previewed when its address says so, once the post has loaded', async () => {
  const { remote, release } = await held()
  const handle = Runtime.embed(
    Runtime.makeElement(
      Posts.placements.complete({
        Model: Posts.Model,
        container: container(),
        init: () => Posts.init(urlOf('as=edda&post=entry-post-drafts&preview=1')),
        update: Posts.update,
        view: (model: Posts.Model, h: HtmlBuilder<Posts.Message>) => postsView(model, h).body,
        subscriptions: Posts.placements.subscriptions(),
        resources: remote,
      }),
    ),
  )
  dispose = () => handle.dispose()
  release()
  await expect.poll(() => text('#editor [data-state]')).toBe('Published')
  await expect
    .poll(() => document.querySelector('#preview')?.getAttribute('aria-pressed'))
    .toBe('true')
})

/** The posts, opened at `search` over the sandbox, answering at once. */
const postsAt = async (search: string) => {
  const { remote, release } = await held()
  release()
  let model = Posts.initial
  const handle = Runtime.embed(
    Runtime.makeElement(
      Posts.placements.complete({
        Model: Posts.Model,
        container: container(),
        init: () => Posts.init(urlOf(search)),
        update: (current: Posts.Model, message: Posts.Message) => {
          const next = Posts.update(current, message)
          model = next.model
          return next
        },
        view: (current: Posts.Model, h: HtmlBuilder<Posts.Message>) => postsView(current, h).body,
        subscriptions: Posts.placements.subscriptions(),
        resources: remote,
      }),
    ),
  )
  dispose = () => handle.dispose()
  return () => model
}

it('comes back to something new on a reload, under the id its address names', async () => {
  const model = await postsAt('as=edda&new=entry-never-saved')
  await expect.poll(() => text('#editor [data-state]')).toBe('New')
  expect(Posts.PostEditor.entry(model())).toEqual(Option.some('entry-never-saved'))
  // Still new: the address goes on naming it `new` until its first save.
  expect(Posts.PostEditor.storedEntry(model())).toEqual(Option.none())
})

it('opens what a first save already made, rather than beginning it again', async () => {
  await postsAt('as=edda&new=entry-post-drafts')
  await expect.poll(() => text('#editor [data-state]')).toBe('Published')
  expect(document.querySelector<HTMLTextAreaElement>('#editor textarea')?.value).toBe(
    'Saving is not publishing',
  )
})
