// @vitest-environment jsdom
/**
 * A component page's previews are drawn busy and inert as the server serves them, and live once
 * the page has read its address, which only the browser's code does: a press on served markup has
 * no handler to hear it.
 */
import { modifyFields } from 'foldkit/struct'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'

import { library } from '../src/content/load.js'
import { Model, modelAt, update } from '../src/main.js'
import { Body } from '../src/view/layout.js'

const content = await library()

afterEach(() => document.body.replaceChildren())

const previewOf = async (addressRead: boolean) => {
  const container = document.createElement('div')
  container.id = `busy-${addressRead}`
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: modifyFields(modelAt(content, '/components/switch'), {
          addressRead: () => addressRead,
        }),
      }),
      update,
      view: (model, h) => Body({ model, library: content }, h),
    }),
  )
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-size="page"]')).not.toBeNull(), {
      timeout: 5000,
    })
    const preview = document.querySelector('[data-size="page"]')!
    return { busy: preview.getAttribute('aria-busy'), inert: preview.hasAttribute('inert') }
  } finally {
    handle.dispose()
  }
}

it('draws a preview busy and inert until the page has read its address', async () => {
  expect(await previewOf(false)).toEqual({ busy: 'true', inert: true })
})

it('draws it live once the page has', async () => {
  expect(await previewOf(true)).toEqual({ busy: null, inert: false })
})
