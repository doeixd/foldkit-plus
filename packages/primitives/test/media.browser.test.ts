/// <reference types="@vitest/browser-playwright" />
/**
 * `MediaQuery` in a real browser, on a narrow window: the first frame the runtime draws already
 * has the query's answer, where the stream's own first report comes after it.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { afterEach, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { MediaQuery } from '../src/media/index.js'

const NARROW = '(max-width: 40rem)'

afterEach(async () => {
  document.body.replaceChildren()
  await page.viewport(1440, 900)
})

/** A page that says which bar it draws, and records every drawing in order. */
const mount = (args: { readonly query: string; readonly initial?: boolean }) => {
  const Page = Bundle.compose({ title: Schema.String }).pipe(
    Bundle.withChild('narrow', MediaQuery, { args }),
  )
  type Model = typeof Page.Model.Type
  type Message = typeof Page.Message.Type
  const { placements } = Page
  const drawn: Array<boolean> = []
  const container = document.createElement('div')
  container.id = 'media-browser'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: Page.Model,
      container,
      ...placements.complete({
        init: () => placements.initial({ title: 'Page' }),
        update: placements.update(model => ({ model })),
        view: (model: Model, h: HtmlBuilder<Message>) => {
          drawn.push(model.narrow.matches)
          return h.p([h.Id('bar')], [model.narrow.matches ? 'compact' : 'wide'])
        },
        subscriptions: placements.subscriptions(),
      }),
    }),
  )
  return { drawn, handle }
}
const bar = () => document.querySelector('#bar')?.textContent

it('draws its first frame for a narrow window, and follows the window after', async () => {
  await page.viewport(390, 800)
  const { drawn, handle } = mount({ query: NARROW })
  try {
    await vi.waitFor(() => expect(bar()).toBe('compact'))
    expect(drawn[0]).toBe(true)
    expect(drawn).not.toContain(false)
    await page.viewport(1440, 900)
    await vi.waitFor(() => expect(bar()).toBe('wide'))
  } finally {
    await handle.dispose()
  }
})

it('draws its first frame as `initial` says, and is then corrected by the window', async () => {
  await page.viewport(390, 800)
  const { drawn, handle } = mount({ query: NARROW, initial: false })
  try {
    await vi.waitFor(() => expect(bar()).toBe('compact'))
    expect(drawn[0]).toBe(false)
  } finally {
    await handle.dispose()
  }
})
