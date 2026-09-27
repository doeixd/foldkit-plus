// @vitest-environment jsdom
/**
 * The editable subtree as server markup (§145): what `renderEditable` renders, sent the way a
 * server sends it, is exactly what `mount` builds, so the browser's editor adopts it.
 */
import { Effect } from 'effect'
import { renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { adopt } from '../src/index.js'
import { renderDocument, renderEditable } from '../src/view.js'

const run = (id: string, text: string, marks: ReadonlyArray<unknown> = []) => ({
  type: 'Text',
  id,
  text,
  marks,
})
const node = (kind: string, id: string, props: object, blocks: ReadonlyArray<unknown>) => ({
  type: 'Node',
  kind,
  id,
  props,
  children: [],
  blocks,
})
const content = RichText.decodeDocument({
  version: 1,
  children: [
    { type: 'Heading', id: 'h', level: 2, children: [run('h-t', 'Tending')] },
    {
      type: 'Paragraph',
      id: 'p',
      children: [
        run('a', 'Water '),
        run('b', 'early', ['Bold', 'Highlight']),
        run('c', ' and ', []),
        run('d', 'often', [{ name: 'Link', props: { href: '/care' } }]),
      ],
    },
    // An empty run: markup cannot carry its text node.
    { type: 'Paragraph', id: 'e', children: [run('z', '', ['Italic'])] },
    node('List', 'l', { ordered: true }, [
      node('ListItem', 'i', {}, [{ type: 'Paragraph', id: 'ip', children: [run('it', 'one')] }]),
    ]),
    {
      type: 'Node',
      kind: 'CodeBlock',
      id: 'code',
      props: { language: 'ts' },
      children: [run('ct', 'x < 1')],
    },
    node('Table', 't', {}, [
      node('TableRow', 'r', { header: true }, [
        node('TableCell', 'cell', {}, [
          { type: 'Paragraph', id: 'cp', children: [run('ctt', 'c')] },
        ]),
      ]),
    ]),
    { type: 'Retired', id: 'u', payload: 1 },
  ],
} as never)
const decorations: RichText.DecorationSet = [
  {
    from: { node: RichText.NodeId.make('a'), offset: 2, affinity: 'after' },
    to: { node: RichText.NodeId.make('d'), offset: 3, affinity: 'after' },
    kind: 'search',
  },
]

/** The markup as a server sends it: rendered to a string, then read by the browser. */
const served = async (html: (h: HtmlBuilder<never>) => ReturnType<typeof renderEditable>) => {
  const rendered = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: {} }),
        view: (_: {}, h: HtmlBuilder<never>) => ({
          title: 'x',
          body: h.div([h.Id('host')], [html(h)]),
        }),
      },
      { isHydratable: false },
    ),
  )
  const page = new DOMParser().parseFromString(rendered.html, 'text/html')
  return window.document.importNode(page.getElementById('host')!.firstElementChild!, true)
}

describe('the editable subtree as server markup', () => {
  it('is what mount builds, so it is adopted', async () => {
    const element = await served(() =>
      renderEditable(content, RichText.standardRendering, decorations),
    )
    const dom = adopt(element, content, RichText.standardRendering, decorations)
    expect(dom?.root).toBe(element)
    expect(dom?.elements.get(RichText.NodeId.make('it'))?.textContent).toBe('one')
  })

  it.each([
    ['another rendering registry', RichText.noRendering, decorations],
    ['other decorations', RichText.standardRendering, []],
  ] as const)('is not adopted when mounted with %s', async (_, rendering, decorated) => {
    const element = await served(() =>
      renderEditable(content, RichText.standardRendering, decorations),
    )
    expect(adopt(element, content, rendering, decorated)).toBeUndefined()
  })
})

describe('a table on a server-rendered page', () => {
  const table = RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Node',
        kind: 'Table',
        id: 't',
        props: {},
        children: [],
        blocks: [
          {
            type: 'Node',
            kind: 'TableRow',
            id: 'r',
            props: {},
            children: [],
            blocks: ['a', 'b'].map(cell => ({
              type: 'Node',
              kind: 'TableCell',
              id: cell,
              props: {},
              children: [],
              blocks: [
                {
                  type: 'Paragraph',
                  id: `${cell}-p`,
                  children: [{ type: 'Text', id: `${cell}-t`, text: cell, marks: [] }],
                },
              ],
            })),
          },
        ],
      },
    ],
  } as never)
  it('renders through the read-only renderer, rows in a tbody', async () => {
    const element = await served(() => renderDocument(table, RichText.standardRendering))
    expect(element.querySelector('table > tbody > tr > td')?.textContent).toBe('a')
  })
})
