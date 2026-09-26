// @vitest-environment jsdom
/**
 * The placeholder: a blank document's lone block carries `data-placeholder` for a stylesheet
 * to draw, and it follows the document through patches and a composition repair.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { attach, restoreSelection } from '../src/events.js'
import { mount } from '../src/index.js'

const id = RichText.NodeId.make
const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})
const paragraph = (block: string, text: string) => ({
  type: 'Paragraph' as const,
  id: block,
  children: [{ type: 'Text' as const, id: `${block}-t`, text, marks: [] }],
})
const decode = (children: ReadonlyArray<unknown>) =>
  RichText.decodeDocument({ version: 1, children })

describe('whether a document is blank', () => {
  it.each<[string, ReadonlyArray<unknown>, boolean]>([
    ['no blocks', [], true],
    ['one empty paragraph', [paragraph('p', '')], true],
    [
      'one heading whose runs are all empty',
      [
        {
          type: 'Heading',
          id: 'h',
          level: 1,
          children: [
            { type: 'Text', id: 'h1', text: '', marks: [] },
            { type: 'Text', id: 'h2', text: '', marks: ['Bold'] },
          ],
        },
      ],
      true,
    ],
    ['one paragraph with text', [paragraph('p', 'x')], false],
    [
      'an empty run beside one with text',
      [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            { type: 'Text', id: 'p1', text: '', marks: ['Bold'] },
            { type: 'Text', id: 'p2', text: 'x', marks: [] },
          ],
        },
      ],
      false,
    ],
    ['two empty paragraphs', [paragraph('p', ''), paragraph('q', '')], false],
    [
      'a lone empty code block, which a writer made',
      [{ type: 'Node', kind: 'CodeBlock', id: 'c', props: {}, children: [] }],
      false,
    ],
  ])('%s: %s', (_, children, blank) => {
    expect(RichText.isBlank(decode(children))).toBe(blank)
  })
})

describe('the placeholder an editor draws', () => {
  const setup = (placeholder: string | undefined, text = '') => {
    const dom = mount(document, decode([paragraph('p', text)]))
    document.body.append(dom.root)
    restoreSelection(dom, caret('p-t', 0))
    const attachment = attach(dom, { onIntent: () => {}, placeholder })
    return attachment
  }
  const marked = (attachment: ReturnType<typeof setup>) =>
    Array.from(attachment.current().root.querySelectorAll('[data-placeholder]')).map(element => [
      element.getAttribute('data-block'),
      element.getAttribute('data-placeholder'),
    ])

  it('marks the blank document’s block and names itself a textbox with that hint', () => {
    const attachment = setup('Write something…')
    expect(marked(attachment)).toEqual([['p', 'Write something…']])
    const root = attachment.current().root
    expect(root.getAttribute('role')).toBe('textbox')
    expect(root.getAttribute('aria-placeholder')).toBe('Write something…')
    attachment.detach()
  })

  it('clears the mark once there is text, and puts it back when the text is gone', () => {
    const attachment = setup('Write something…')
    const typed = RichText.run(
      { document: attachment.current().content, selection: caret('p-t', 0) },
      { type: 'InsertText', text: 'x' },
      { mint: () => 'unused' },
    )
    if (!typed.ok) throw new Error(typed.error)
    attachment.sync(typed.state, typed.changeSet)
    expect(marked(attachment)).toEqual([])

    const erased = RichText.run(typed.state, { type: 'DeleteBackward' }, { mint: () => 'unused' })
    if (!erased.ok) throw new Error(erased.error)
    attachment.sync(erased.state, erased.changeSet)
    expect(marked(attachment)).toEqual([['p', 'Write something…']])
    attachment.detach()
  })

  it('draws it again after a composition repair re-renders the block', () => {
    const attachment = setup('Write something…')
    const root = attachment.current().root
    root.dispatchEvent(new Event('compositionstart'))
    // The IME's temporary text, which the repair throws away along with the element.
    attachment.current().elements.get(id('p-t'))!.append(document.createTextNode('に'))
    root.dispatchEvent(new Event('compositionend'))
    expect(marked(attachment)).toEqual([['p', 'Write something…']])
    attachment.detach()
  })

  it('draws nothing when none was placed, or when the document has text', () => {
    const none = setup(undefined)
    expect(marked(none)).toEqual([])
    expect(none.current().root.hasAttribute('aria-placeholder')).toBe(false)
    none.detach()
    const written = setup('Write something…', 'hello')
    expect(marked(written)).toEqual([])
    written.detach()
  })
})
