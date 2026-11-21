/// <reference types="@vitest/browser-playwright" />
/**
 * On a real page: a Message declared to write only the count leaves the
 * header's elements as they were (the same nodes, no mutation recorded), and
 * changes the tally's. Without the writes the header is drawn again, which
 * its `data-drawn` attribute shows.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { initial, make, Message, Model, update } from './writesFixture.js'

afterEach(() => document.body.replaceChildren())

const byId = (id: string) => document.getElementById(id)!

/** Every change to `element` or below it, from now on. */
const watch = (element: Element) => {
  const records: Array<MutationRecord> = []
  const observer = new MutationObserver(list => records.push(...list))
  observer.observe(element, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  })
  return () => [...records, ...observer.takeRecords()].map(record => record.type)
}

const mount = async (skip: boolean) => {
  const app = make({ skip })
  const container = document.createElement('div')
  container.id = 'writes-page'
  document.body.append(container)
  const tracked = app.writes.track(update)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initial }),
      update: (model: Model, message: Message) => ({
        model: tracked(model, message).model,
        commands: [],
      }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [
            app.view(model, h),
            h.button(
              [h.Id('rename'), h.OnClick(Message.Renamed({ title: 'Renamed' }))],
              ['Rename'],
            ),
          ],
        ),
    }),
  )
  await vi.waitFor(() => expect(document.getElementById('header')).not.toBeNull())
  return handle
}

it('leaves the DOM of a Surface no declared write reaches untouched, and updates the one it reaches', async () => {
  const handle = await mount(true)
  try {
    const header = byId('header')
    const tally = byId('tally')
    const headerChanges = watch(header)
    const tallyChanges = watch(tally)

    tally.click()
    await vi.waitFor(() => expect(tally.textContent).toBe('1'))
    tally.click()
    await vi.waitFor(() => expect(tally.textContent).toBe('2'))

    // The tally was drawn for each count and patched in place.
    expect(byId('tally')).toBe(tally)
    expect(tally.dataset['drawn']).toBe('3')
    expect(tallyChanges()).toContain('characterData')
    // The header is the first drawing's, and nothing wrote to it.
    expect(byId('header')).toBe(header)
    expect(header.dataset['drawn']).toBe('1')
    expect(headerChanges()).toEqual([])

    // A write the header reads reaches it, and now the tally is the one left alone.
    const tallyAfter = watch(tally)
    byId('rename').click()
    await vi.waitFor(() => expect(header.textContent).toBe('Renamed'))
    expect(header.dataset['drawn']).toBe('2')
    expect(tally.dataset['drawn']).toBe('3')
    expect(tallyAfter()).toEqual([])
  } finally {
    handle.dispose()
  }
})

it('draws the header again on a count when the views are given no writes', async () => {
  const handle = await mount(false)
  try {
    const header = byId('header')
    const headerChanges = watch(header)
    byId('tally').click()
    await vi.waitFor(() => expect(byId('tally').textContent).toBe('1'))
    expect(header.dataset['drawn']).toBe('2')
    expect(headerChanges()).toContain('attributes')
  } finally {
    handle.dispose()
  }
})
