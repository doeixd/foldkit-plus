/**
 * A page for the Phase 3 slice, so the adapter can be exercised in a real
 * browser: real typing, real `beforeinput`, real selection, real Enter. The
 * jsdom tests cover the logic; this covers what jsdom cannot (§115).
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

/** A list with two items and a paragraph after it (§116). */
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
        type: 'Paragraph',
        id: 'tail',
        children: [{ type: 'Text', id: 't', text: 'tail', marks: [] }],
      },
    ],
  })

const host = window.document.getElementById('editor')!
const readout = window.document.getElementById('state')!

let minted = 0
let dom = mount(window.document, content())
host.append(dom.root)

const report = (label: string): void => {
  readout.textContent = JSON.stringify(
    {
      label,
      text: toText(dom),
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
    }
  }
}

window.harness = {
  state: () => dom.content,
  selection: () => readSelection(dom),
  caret: (node, offset) =>
    restoreSelection(dom, { type: 'Range', anchor: at(node, offset), focus: at(node, offset) }),
}
