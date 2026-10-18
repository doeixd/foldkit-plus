// @vitest-environment jsdom
/**
 * Every preview `/create` offers draws, on the real runtime: each screen is
 * made of showcase examples by name, so a renamed example fails here, not on
 * a reader's page.
 */
import { modifyFields } from 'foldkit/struct'
import * as Runtime from 'foldkit/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { library } from '../src/content/load.js'
import { Canvas } from '../src/gallery/studio.js'
import { Model, modelAt, update } from '../src/main.js'
import { Body } from '../src/view/layout.js'

const content = await library()

const marks: Readonly<Record<Canvas, string>> = {
  components: 'Invite your team',
  typography: 'Interface roles',
  palette: '--fk-surface-base',
  dashboard: 'Analytics',
  assistant: 'it shows its work',
  booking: 'Book a stay',
  settings: 'Workspace settings',
}

afterEach(() => document.body.replaceChildren())

describe("/create's previews", () => {
  it.each(Canvas.literals)('draws %s', async canvas => {
    const container = document.createElement('div')
    container.id = `screens-${canvas}`
    document.body.append(container)
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model,
        container,
        init: () => ({
          model: modifyFields(modelAt(content, '/create'), { canvas: () => canvas }),
        }),
        update,
        view: (model, h) => Body({ model, library: content }, h),
      }),
    )
    try {
      await vi.waitFor(() => expect(document.body.textContent).toContain(marks[canvas]), {
        timeout: 5000,
      })
    } finally {
      handle.dispose()
    }
  })
})
