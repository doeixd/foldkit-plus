// @vitest-environment jsdom
/**
 * The editor on a server-rendered page (§145): the server sends the document's markup in the
 * editor's host, hydration leaves the host's contents alone, and the editor adopts them.
 */
import { Effect } from 'effect'
import {
  injectIntoTemplate,
  renderToString,
  FOLDKIT_APP_ATTRIBUTE,
} from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { hydrate, makeApplication } from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import * as RichText from 'foldkit-richtext'
import { expect, it } from 'vitest'
import { editorAt, Model, type ParentMessage } from '../src/editor-bundle.js'
import { attachmentIn } from '../src/host.js'

const content = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Heading',
      id: 'h',
      level: 1,
      children: [{ type: 'Text', id: 'h-t', text: 'Tending', marks: [] }],
    },
    {
      type: 'Paragraph',
      id: 'p',
      children: [
        { type: 'Text', id: 'a', text: 'Water ', marks: [] },
        { type: 'Text', id: 'b', text: 'early', marks: ['Bold'] },
        // The standard rendering draws a link; with no rendering it rides in `data-marks`.
        {
          type: 'Text',
          id: 'c',
          text: ' daily',
          marks: [{ name: 'Link', props: { href: '/care' } }],
        },
      ],
    },
  ],
})

/** An application holding one editor at `hostId`, told whether it is the server's render. */
const page = (
  hostId: string,
  serving: { now: boolean } | undefined,
  document: RichText.Document = content,
  rendering: RichText.Rendering = RichText.standardRendering,
) => {
  const placed = editorAt(hostId, {
    rendering,
    // Drawn over the document on the server as in the browser, or adoption would refuse it.
    decorate: () => [
      {
        from: { node: RichText.NodeId.make('a'), offset: 0, affinity: 'after' },
        to: { node: RichText.NodeId.make('a'), offset: 5, affinity: 'after' },
        kind: 'search',
      },
    ],
    ...(serving === undefined ? {} : { serverRendered: () => serving.now }),
  })
  const application = Bundle.assemble<Model, ParentMessage>()([placed])
  return {
    Model,
    init: () => application.initial({ document }),
    update: application.update(),
    view: (model: Model, h: HtmlBuilder<ParentMessage>) => ({
      title: 'Editor',
      body: h.main([], [placed.view(model, h)]),
    }),
    container: null,
  }
}

const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'
const serve = async (config: ReturnType<typeof page>) => {
  const served = injectIntoTemplate(
    template,
    await Effect.runPromise(renderToString(config, { buildId: 'b' })),
  )
  const parsed = new DOMParser().parseFromString(served, 'text/html')
  document.documentElement.innerHTML = parsed.documentElement.innerHTML
}
const settle = () => new Promise(resolve => setTimeout(resolve, 20))

it('adopts the markup the server sent, keeping its nodes', async () => {
  const serving = { now: true }
  // A server renders many requests; an earlier one's document, an equal copy here, must not
  // leave this one's host drawn differently from the browser's first render.
  await serve(page('served-editor', serving, { ...content }))
  const config = page('served-editor', serving)
  await serve(config)
  const host = document.getElementById('served-editor')!
  expect(host.localName).toBe('foldkit-richtext')
  const root = host.firstElementChild
  const paragraph = document.querySelector('[data-block="p"]')
  expect(root?.getAttribute('contenteditable')).toBe('true')

  serving.now = false
  // The browser decodes its own copy, as a separate process would.
  hydrate(
    makeApplication({
      ...page('served-editor', serving, { ...content }),
      container: document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`),
    }),
    { buildId: 'b' },
  )
  await settle()

  const attachment = attachmentIn(document.getElementById('served-editor')!)
  expect(attachment?.current().root).toBe(root)
  expect(attachment?.current().elements.get(RichText.NodeId.make('p'))).toBe(paragraph)
  expect(document.getElementById('served-editor')?.children).toHaveLength(1)
})

it('sends an empty host when the placement does not say which render is the server’s', async () => {
  await serve(page('plain-editor', undefined))
  expect(document.getElementById('plain-editor')?.innerHTML).toBe('')
})

it('serves text holding a NUL, and a kind drawn as a custom element, where the browser could', async () => {
  const odd = RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 'a', text: `a${String.fromCharCode(0)}b`, marks: [] }],
      },
      {
        type: 'Node',
        kind: 'Callout',
        id: 'c',
        props: {},
        children: [{ type: 'Text', id: 'c-t', text: 'note', marks: [] }],
      },
    ],
  })
  const callouts = RichText.rendering({ nodes: { Callout: { tag: 'x-callout', attributes: {} } } })
  const serving = { now: true }
  await serve(page('odd-editor', serving, odd, callouts))
  const host = document.getElementById('odd-editor')!
  // Markup cannot carry a NUL; it is served as the U+FFFD a parser would make of it.
  expect(host.querySelector('[data-block="p"]')?.textContent).toBe(
    `a${String.fromCharCode(0xfffd)}b`,
  )
  expect(host.querySelector('x-callout')?.textContent).toBe('note')

  serving.now = false
  hydrate(
    makeApplication({
      ...page('odd-editor', serving, odd, callouts),
      container: document.querySelector<HTMLElement>(`[${FOLDKIT_APP_ATTRIBUTE}]`),
    }),
    { buildId: 'b' },
  )
  await settle()
  // The editor holds the document itself, NUL included, drawn by the browser.
  expect(attachmentIn(document.getElementById('odd-editor')!)?.current().content).toBe(odd)
  expect(document.getElementById('odd-editor')?.querySelector('x-callout')?.textContent).toBe(
    'note',
  )
})
