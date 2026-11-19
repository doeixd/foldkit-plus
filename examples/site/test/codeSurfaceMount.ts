/** The site's code block mounted in a real page, for the browser tests of its surface. */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { expect, vi } from 'vitest'

import { codeBlock } from '../src/content/render.js'
import { stylesheet } from '../src/style.js'

export const mount = async (lang: 'ts' | 'text', code = 'const a = 1', label?: string) => {
  Style.install(stylesheet)
  document.body.style.margin = '0'
  document.body.style.background = 'var(--fk-surface-base)'
  const container = document.createElement('div')
  container.id = 'code-surface-page'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>): Html =>
    h.div([], [codeBlock(h, () => [], { code, lang, label, copy: true })])
  Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container,
      init: () => ({ model: {} }),
      update: (model: object) => ({ model }),
      view,
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('pre')).not.toBeNull())
  return document.querySelector('pre')!
}
