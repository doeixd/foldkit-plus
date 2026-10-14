// @vitest-environment jsdom
/**
 * Tab in the editor: taken as `Indent` or `Outdent` in code and table cells, and left to move
 * focus anywhere else. And an adornment's `action`, reported with its block.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { attach, restoreSelection } from '../src/events.js'
import { mount } from '../src/index.js'
import { placeAbove } from '../src/floating.js'

const id = RichText.NodeId.make
const content = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p',
      children: [{ type: 'Text', id: 'pt', text: 'prose', marks: [] }],
    },
    {
      type: 'Node',
      kind: 'CodeBlock',
      id: 'code',
      props: { language: 'ts' },
      children: [{ type: 'Text', id: 'ct', text: 'let x', marks: [] }],
    },
  ],
})
const rendering = RichText.renderingOver(RichText.standardRendering, {
  nodes: {
    CodeBlock: {
      tag: 'pre',
      attributes: {},
      adornments: [{ tag: 'button', attributes: {}, text: 'Copy', action: 'copy' }],
    },
  },
})
const caretIn = (run: string): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(run), offset: 1, affinity: 'after' },
  focus: { node: id(run), offset: 1, affinity: 'after' },
})

const attached = (nodes?: RichText.NodeRegistry) => {
  const dom = mount(document, content, rendering)
  document.body.replaceChildren(dom.root)
  const intents: Array<RichText.Command> = []
  const actions: Array<readonly [string, string]> = []
  const attachment = attach(dom, {
    onIntent: command => intents.push(command),
    onAction: (node, action) => actions.push([node, action]),
    nodes,
  })
  return { dom, intents, actions, attachment }
}
const tab = (target: Element, shiftKey = false) => {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

describe('Tab', () => {
  const nodes = RichText.nodeRegistry(RichText.standardNodes)

  it.each([
    ['indents in code', false, { type: 'Indent' }],
    ['outdents in code with Shift', true, { type: 'Outdent' }],
  ] as const)('%s, and keeps the browser from moving focus', (_, shift, expected) => {
    const { dom, intents, attachment } = attached(nodes)
    restoreSelection(dom, caretIn('ct'))
    expect(tab(dom.root, shift)).toBe(true)
    expect(intents).toEqual([expected])
    attachment.detach()
  })

  it('in prose is left to move focus', () => {
    const { dom, intents, attachment } = attached(nodes)
    restoreSelection(dom, caretIn('pt'))
    expect(tab(dom.root)).toBe(false)
    expect(intents).toEqual([])
    attachment.detach()
  })

  it('without a vocabulary to say where it applies, is left alone', () => {
    const { dom, intents, attachment } = attached()
    restoreSelection(dom, caretIn('ct'))
    expect(tab(dom.root)).toBe(false)
    expect(intents).toEqual([])
    attachment.detach()
  })
})

describe('an adornment’s action', () => {
  it('is reported with its block, and is no edit', () => {
    const { dom, intents, actions, attachment } = attached()
    const copy = dom.elements.get(id('code'))!.querySelector('[data-action]')!
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    copy.dispatchEvent(click)
    expect(actions).toEqual([['code', 'copy']])
    expect(intents).toEqual([])
    expect(click.defaultPrevented).toBe(true)
    attachment.detach()
  })
})

describe('placeAbove', () => {
  const target = { top: 100, left: 200, width: 300, height: 40 }
  it.each([
    ['above, at the block’s left edge', target, { top: 62, left: 200, placement: 'top' }],
    [
      'inside the top with no room above',
      { ...target, top: 10 },
      { top: 18, left: 200, placement: 'inside' },
    ],
    ['inside the right edge', { ...target, left: 980 }, { top: 62, left: 900, placement: 'top' }],
  ] as const)('%s', (_, box, expected) => {
    expect(placeAbove(box, { width: 100, height: 30 }, { width: 1000 }, 8)).toEqual(expected)
  })
})
