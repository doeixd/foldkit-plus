// @vitest-environment jsdom
/**
 * A Mermaid fence rendered on a server, as a browser parses the page: the
 * diagram is SVG in the markup, its words readable, its source folded beneath
 * it; a fence Pele cannot read stays the code it is.
 */
import { Effect, Option } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, test } from 'vitest'

import { block, type Context } from '../src/content/render.js'

const context: Context = {
  highlight: () => [],
  href: url => url,
  idOf: () => 'heading',
  codeLink: () => Option.none(),
}

/** The page a server writes for one fence, read back as a browser reads it. */
const served = async (fence: string) => {
  const rendered = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: {} }),
        view: (_: unknown, h: HtmlBuilder<never>) => ({
          title: 'Fence',
          body: h.article([], [block(h, context, { type: 'code', lang: 'mermaid', value: fence })]),
        }),
      },
      { buildId: 'b' },
    ),
  )
  return new DOMParser().parseFromString(
    injectIntoTemplate(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      rendered,
    ),
    'text/html',
  )
}

test('a Mermaid fence is an SVG diagram in the markup, its source beneath it', async () => {
  const page = await served('sequenceDiagram\n  Reader->>Server: Asks')
  const figure = page.querySelector('article figure.diagram')
  const svg = figure?.querySelector(':scope > svg')
  expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg')
  expect(Array.from(svg?.querySelectorAll('text') ?? [], text => text.textContent)).toEqual(
    expect.arrayContaining(['Reader', 'Server', 'Asks']),
  )
  expect(figure?.getAttribute('style')).toMatch(/^--diagram-width: \d+(\.\d+)?px$/)
  expect(figure?.querySelector('details summary')?.textContent).toBe('Diagram source')
  expect(figure?.querySelector('details pre code')?.textContent).toContain('Reader->>Server')
})

test('a fence Pele cannot read stays a code block', async () => {
  const page = await served('not a diagram')
  expect(page.querySelector('figure.diagram')).toBeNull()
  expect(page.querySelector('svg')).toBeNull()
  expect(page.querySelector('article pre code')?.textContent).toBe('not a diagram')
})
