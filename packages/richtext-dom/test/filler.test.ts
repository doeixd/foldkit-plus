// @vitest-environment jsdom
/**
 * An empty line's `<br>`: drawn while a line has no text and gone once it has some, where the
 * caret goes on such a line, and that it is no content.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { restoreSelection } from '../src/events.js'
import { parseHtml } from '../src/html.js'
import { mount, patch, positionToRange, rangeToPosition, toText } from '../src/index.js'
import { replaceChangeSet } from '../src/editor-bundle.js'

const id = RichText.NodeId.make
const lines = (...texts: ReadonlyArray<string>) =>
  RichText.decodeDocument({
    version: 1,
    children: texts.map((text, index) => ({
      type: 'Paragraph',
      id: `p${index}`,
      children: [{ type: 'Text', id: `t${index}`, text, marks: [] }],
    })),
  })
const fillers = (dom: ReturnType<typeof mount>) =>
  Array.from(dom.root.children).map(line => line.querySelector('br[data-richtext-filler]') !== null)

describe('an empty line’s <br>', () => {
  it('is drawn on an empty line only, after its run', () => {
    const dom = mount(document, lines('a', ''))
    expect(fillers(dom)).toEqual([false, true])
    expect(dom.root.children[1]!.lastElementChild?.tagName).toBe('BR')
  })

  it('goes when the line gets text, and comes back when it is emptied', () => {
    const dom = mount(document, lines('a', ''))
    const typed = lines('a', 'b')
    const filled = patch(dom, typed, replaceChangeSet(dom.content, typed))
    expect(fillers(filled)).toEqual([false, false])
    // The run stays before where the filler was: the line reads as its text.
    expect(filled.root.children[1]!.textContent).toBe('b')
    const emptied = lines('a', '')
    const again = patch(filled, emptied, replaceChangeSet(filled.content, emptied))
    expect(fillers(again)).toEqual([false, true])
  })

  it('stays last when an empty line is drawn again and stays empty', () => {
    const dom = mount(document, lines('a', ''))
    // The empty run takes a mark: it is redrawn, and the line is still empty.
    const bold = RichText.decodeDocument({
      ...lines('a', ''),
      children: [
        lines('a', '').children[0]!,
        {
          type: 'Paragraph',
          id: 'p1',
          children: [{ type: 'Text', id: 't1', text: '', marks: ['Bold'] }],
        },
      ],
    })
    const next = patch(dom, bold, replaceChangeSet(dom.content, bold))
    expect(Array.from(next.root.children[1]!.children).map(child => child.tagName)).toEqual([
      'SPAN',
      'BR',
    ])
  })

  it('is where the caret goes on an empty line, which reads back as the line’s start', () => {
    const dom = mount(document, lines('a', ''))
    document.body.replaceChildren(dom.root)
    const at: RichText.Position = { node: id('t1'), offset: 0, affinity: 'after' }
    const range = positionToRange(dom, at)!
    const line = dom.root.children[1]!
    expect([range.startContainer, range.startOffset]).toEqual([line, 1])
    expect(rangeToPosition(dom, line, 1)).toEqual({ ...at, affinity: 'after' })
    restoreSelection(dom, { type: 'Range', anchor: at, focus: at })
    const selection = document.getSelection()!
    expect([selection.anchorNode, selection.anchorOffset]).toEqual([line, 1])
  })

  it('is no content: not text, and not imported', () => {
    expect(toText(mount(document, lines('a', '', 'b')))).toBe('a\nb')
    let next = 0
    // A `<br>` of any other kind would be a line break here.
    const { blocks } = parseHtml('<p>a<br data-richtext-filler="">b</p>', {
      mint: () => `m${next++}`,
    })
    expect(RichText.toText(blocks)).toBe('ab')
  })
})
