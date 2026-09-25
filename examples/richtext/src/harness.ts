/**
 * A page for the Phase 3 slice, so the adapter can be exercised in a real
 * browser: real typing, real `beforeinput`, real selection, real Enter. The
 * jsdom tests cover the logic; this covers what jsdom cannot (§115). It mounts
 * through a rendering registry (§121), so the browser also sees a declared mark
 * nested in its run and a declared node kind rendered as its element — including
 * in `patch`, which reuses the registry the mount recorded.
 */
import * as RichText from 'foldkit-richtext'
import { mount, toText } from 'foldkit-richtext-dom'
import { attach, readSelection, restoreSelection } from 'foldkit-richtext-dom/events'

const id = RichText.NodeId.make
const at = (node: string, offset: number): RichText.Position => ({
  node: id(node),
  offset,
  affinity: 'after',
})

/**
 * A list, a quote, and a paragraph carrying a Link. `List` deliberately has no
 * entry: it keeps the adapter's `div` fallback, so the page shows a declared node
 * kind beside an undeclared one.
 */
const content = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Node',
        kind: 'List',
        id: 'list',
        props: {},
        children: [],
        blocks: [
          {
            type: 'Paragraph',
            id: 'li1',
            children: [{ type: 'Text', id: 'a', text: 'one', marks: [] }],
          },
          {
            type: 'Paragraph',
            id: 'li2',
            children: [{ type: 'Text', id: 'b', text: 'two', marks: [] }],
          },
        ],
      },
      {
        type: 'Node',
        kind: 'Quote',
        id: 'quote',
        props: {},
        children: [],
        blocks: [
          {
            type: 'Paragraph',
            id: 'q1',
            children: [{ type: 'Text', id: 'q', text: 'quoted', marks: [] }],
          },
        ],
      },
      {
        type: 'Paragraph',
        id: 'tail',
        children: [
          { type: 'Text', id: 't', text: 'see ', marks: [] },
          {
            type: 'Text',
            id: 'u',
            text: 'docs',
            marks: [{ name: 'Link', props: { href: '/x' } }],
          },
          { type: 'Text', id: 'v', text: ' now', marks: [] },
        ],
      },
    ],
  })

/** The same registry the serializer and the read-only view take (§121). */
const renderer = RichText.rendering({
  marks: {
    Link: mark => ({
      tag: 'a',
      attributes: { href: String(RichText.markProps(mark)?.href ?? '') },
    }),
  },
  nodes: {
    Quote: { tag: 'blockquote', attributes: { cite: '/source' } },
  },
})

const host = window.document.getElementById('editor')!
const readout = window.document.getElementById('state')!

let minted = 0
let dom = mount(window.document, content(), renderer)
host.append(dom.root)

const renderedTags = (): ReadonlyArray<string> =>
  Array.from(dom.root.children).map(child => child.tagName.toLowerCase())
const renderedLinks = (): ReadonlyArray<string | null> =>
  Array.from(dom.root.querySelectorAll('a')).map(link => link.getAttribute('href'))

const report = (label: string): void => {
  readout.textContent = JSON.stringify(
    {
      label,
      text: toText(dom),
      // The tags are the registry's answer: `div` for the entry-less list,
      // `blockquote` for the declared quote, and a real `a` inside a run.
      rendered: renderedTags(),
      links: renderedLinks(),
      blocks: Array.from(dom.root.children).map(child => child.getAttribute('data-block')),
      selection: readSelection(dom),
    },
    null,
    2,
  )
}

const attachment = attach(dom, {
  onIntent: command => {
    const state = { document: dom.content, selection: readSelection(dom) }
    const result = RichText.run(state, command, { mint: () => `e${++minted}` })
    if (!result.ok) {
      report(`rejected: ${result.error}`)
      return
    }
    attachment.sync(result.state, result.changeSet)
    dom = attachment.current()
    report(command.type)
  },
})

// A caret inside the first list item, so typing and Enter start where a reader
// would put them.
restoreSelection(dom, { type: 'Range', anchor: at('a', 3), focus: at('a', 3) })
report('ready')

declare global {
  interface Window {
    /** Handy for the browser tool and for a person poking at the page. */
    harness: {
      state: () => RichText.Document
      selection: () => RichText.Selection | null
      caret: (node: string, offset: number) => void
      /** What the registry rendered, per block, and every `<a>` it made. */
      rendered: () => ReadonlyArray<string>
      links: () => ReadonlyArray<string | null>
    }
  }
}

window.harness = {
  state: () => dom.content,
  selection: () => readSelection(dom),
  caret: (node, offset) =>
    restoreSelection(dom, { type: 'Range', anchor: at(node, offset), focus: at(node, offset) }),
  rendered: renderedTags,
  links: renderedLinks,
}
