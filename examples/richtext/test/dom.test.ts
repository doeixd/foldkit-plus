// @vitest-environment jsdom
/**
 * The DOM half of the Phase 3 slice: the semantic document renders into an
 * owned subtree, positions map both ways, and a ChangeSet patches only what it
 * names. The browser is a projection, never the source of truth.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { mount, patch, positionToRange, rangeToPosition, repair, toText } from '../src/dom.js'

const id = RichText.NodeId.make
const at = (
  node: string,
  offset: number,
  affinity: 'before' | 'after' = 'after',
): RichText.Position => ({
  node: id(node),
  offset,
  affinity,
})
const content = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'ab', marks: [] },
          { type: 'Text', id: 'b', text: 'cd', marks: ['Bold', 'Italic'] },
        ],
      },
      {
        type: 'Heading',
        id: 'h',
        level: 2,
        children: [{ type: 'Text', id: 'c', text: 'Title', marks: [] }],
      },
    ],
  })
const state = (selection: RichText.Selection | null): RichText.EditorState => ({
  document: content(),
  selection,
})
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('rendering the owned subtree', () => {
  it('renders blocks, runs, marks, and heading levels', () => {
    const dom = mount(document, content())
    expect(Array.from(dom.root.children).map(child => child.tagName)).toEqual(['P', 'H2'])
    expect(dom.root.getAttribute('contenteditable')).toBe('true')
    const paragraph = dom.root.children[0] as HTMLElement
    expect(Array.from(paragraph.children).map(child => child.getAttribute('data-run'))).toEqual([
      'a',
      'b',
    ])
    expect((paragraph.children[1] as HTMLElement).getAttribute('data-marks')).toBe('Bold Italic')
    expect((paragraph.children[0] as HTMLElement).hasAttribute('data-marks')).toBe(false)
    expect(toText(dom)).toBe('abcd\nTitle')
  })

  it('renders application node blocks as editable containers with their runs', () => {
    const dom = mount(
      document,
      RichText.decodeDocument({
        version: 1,
        children: [
          {
            type: 'Node',
            kind: 'Callout',
            id: 'c',
            props: { tone: 'info' },
            children: [{ type: 'Text', id: 't', text: 'Careful', marks: ['Bold'] }],
          },
        ],
      }),
    )
    const block = dom.root.children[0] as HTMLElement
    expect(block.tagName).toBe('DIV')
    expect(block.getAttribute('data-block')).toBe('c')
    expect((block.children[0] as HTMLElement).getAttribute('data-run')).toBe('t')
    expect(toText(dom)).toBe('Careful')
    // Its runs take positions like any other block's.
    expect(positionToRange(dom, at('t', 3))?.startOffset).toBe(3)
  })

  it('shows preserved unknown blocks as read-only placeholders', () => {
    const dom = mount(
      document,
      RichText.decodeDocument({
        version: 1,
        children: [
          { type: 'Paragraph', id: 'p', children: [] },
          { type: 'Embed', id: 'e', src: 'https://example.test/x' },
        ],
      }),
    )
    const placeholder = dom.root.children[1] as HTMLElement
    expect(placeholder.getAttribute('data-unknown')).toBe('Embed')
    expect(placeholder.getAttribute('contenteditable')).toBe('false')
    expect(placeholder.textContent).toBe('[Embed]')
    expect(positionToRange(dom, at('e', 0))).toBeUndefined()
  })
})

describe('positions map both ways', () => {
  it('round-trips node and offset, deriving affinity from the run boundary', () => {
    const dom = mount(document, content())
    // A DOM caret carries no affinity, so mapping back yields `after` only at
    // the run end (where typing continues the run) and `before` elsewhere.
    for (const [node, offset, affinity] of [
      ['a', 0, 'before'],
      ['a', 2, 'after'],
      ['b', 0, 'before'],
      ['b', 2, 'after'],
      ['c', 5, 'after'],
    ] as const) {
      const range = positionToRange(dom, at(node, offset))
      expect(range).toBeDefined()
      expect(rangeToPosition(dom, range!.startContainer, range!.startOffset)).toEqual(
        at(node, offset, affinity),
      )
    }
  })

  it('refuses positions it cannot resolve instead of guessing', () => {
    const dom = mount(document, content())
    expect(positionToRange(dom, at('missing', 0))).toBeUndefined()
    expect(positionToRange(dom, at('a', 9))).toBeUndefined()
    const outside = document.createTextNode('elsewhere')
    document.body.append(outside)
    expect(rangeToPosition(dom, outside, 0)).toBeUndefined()
    outside.remove()
    expect(rangeToPosition(dom, dom.root.children[0] as HTMLElement, 0)).toBeUndefined()
  })
})

describe('patching only what changed', () => {
  it('keeps untouched elements and replaces dirty ones in place', () => {
    const before = mount(document, content())
    const untouchedRun = before.elements.get(id('c'))
    const untouchedBlock = before.elements.get(id('h'))
    const result = success(
      RichText.apply(state(null), [
        RichText.Edit.insertText(RichText.Node.make('a').at(2, 'after'), '!'),
      ]),
    )
    const after = patch(before, result.state.document, result.changeSet)
    expect(after.elements.get(id('c'))).toBe(untouchedRun)
    expect(after.elements.get(id('h'))).toBe(untouchedBlock)
    expect(after.elements.get(id('a'))).not.toBe(before.elements.get(id('a')))
    expect(after.elements.get(id('a'))?.textContent).toBe('ab!')
    expect(toText(after)).toBe('ab!cd\nTitle')
  })

  it('drops elements for identities normalization retires', () => {
    const mergeable = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            { type: 'Text', id: 'a', text: 'ab', marks: [] },
            { type: 'Text', id: 'b', text: 'cd', marks: [] },
          ],
        },
      ],
    })
    const before = mount(document, mergeable)
    const result = success(
      RichText.apply({ document: mergeable, selection: null }, [
        RichText.Edit.insertText(RichText.Node.make('a').at(2, 'after'), '!'),
      ]),
    )
    expect(result.changeSet.removedNodes).toEqual(new Set(['b']))
    const after = patch(before, result.state.document, result.changeSet)
    expect(after.elements.has(id('b'))).toBe(false)
    expect(Array.from((after.root.children[0] as HTMLElement).children)).toHaveLength(1)
    expect(toText(after)).toBe('ab!cd')
  })

  it('replaces a whole block when structure changes inside it', () => {
    const before = mount(document, content())
    const result = success(
      RichText.apply(state(null), [
        RichText.Edit.splitRun(RichText.Node.make('b'), 1, 'b2'),
        RichText.Edit.removeMark(RichText.Node.make('b2'), 'Bold'),
      ]),
    )
    const after = patch(before, result.state.document, result.changeSet)
    expect(after.elements.get(id('p'))).not.toBe(before.elements.get(id('p')))
    expect(
      Array.from((after.root.children[0] as HTMLElement).children).map(child => child.textContent),
    ).toEqual(['ab', 'c', 'd'])
    expect(after.elements.get(id('h'))).toBe(before.elements.get(id('h')))
  })
})

describe('repairing a subtree the browser touched', () => {
  it('re-renders only blocks whose text drifted, and returns the same dom otherwise', () => {
    const before = mount(document, content())
    expect(repair(before, before.content)).toBe(before)

    const run = before.elements.get(id('a'))!
    run.append(document.createTextNode('drift'))
    const after = repair(before, before.content)
    expect(after).not.toBe(before)
    expect(toText(after)).toBe('abcd\nTitle')
    expect(after.elements.get(id('h'))).toBe(before.elements.get(id('h')))
    expect(after.elements.get(id('a'))).not.toBe(run)
  })

  it('drops elements the document no longer knows', () => {
    const before = mount(document, content())
    const stray = document.createElement('p')
    stray.setAttribute('data-block', 'ghost')
    before.root.append(stray)
    const after = repair(before, before.content)
    expect(after.elements.has(id('ghost'))).toBe(false)
    expect(after.root.contains(stray)).toBe(false)
    expect(toText(after)).toBe('abcd\nTitle')
  })
})

describe('the editing loop', () => {
  it('drives one command from a DOM selection to a patched subtree', () => {
    const before = mount(document, content())
    document.body.append(before.root)
    const window = document.defaultView!
    const caretRange = positionToRange(before, at('a', 2))!
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(caretRange)

    // What a `beforeinput` handler does: read the browser selection, run the
    // intent, then patch and restore from the semantic result.
    const selection = window.getSelection()!
    const caret = rangeToPosition(before, selection.anchorNode!, selection.anchorOffset)
    expect(caret).toEqual(at('a', 2))
    const result = success(
      RichText.run(
        { document: before.content, selection: { type: 'Range', anchor: caret!, focus: caret! } },
        { type: 'InsertText', text: 'X' },
        { mint: () => 'x' },
      ),
    )
    const after = patch(before, result.state.document, result.changeSet)

    expect(toText(after)).toBe('abXcd\nTitle')
    const committed = result.state.selection
    if (committed?.type !== 'Range') throw new Error('expected a range selection')
    const restored = positionToRange(after, committed.anchor)
    expect(restored?.startOffset).toBe(3)
    expect(restored?.startContainer.textContent).toBe('abX')
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(restored!)
    expect(window.getSelection()!.anchorOffset).toBe(3)
    before.root.remove()
  })
})
