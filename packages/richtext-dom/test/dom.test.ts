// @vitest-environment jsdom
/**
 * The DOM half of the Phase 3 slice: the semantic document renders into an
 * owned subtree, positions map both ways, and a ChangeSet patches only what it
 * names. The browser is a projection, never the source of truth.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { mount, patch, positionToRange, rangeToPosition, repair, toText } from '../src/index.js'

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

/** The chain of elements a run's text sits under, innermost last. */
const tagsWithin = (element: HTMLElement): ReadonlyArray<string> => {
  const tags: Array<string> = []
  let node: Node | null = element.firstChild
  while (node instanceof Element) {
    tags.push(node.tagName.toLowerCase())
    node = node.firstChild
  }
  return tags
}

const links = RichText.rendering({
  marks: {
    Link: mark => ({
      tag: 'a',
      attributes: { href: String(RichText.markProps(mark)?.href ?? '') },
    }),
  },
})

const linked = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'see ', marks: [] },
          {
            type: 'Text',
            id: 'b',
            text: 'docs',
            marks: [{ name: 'Link', props: { href: '/x' } }, 'Bold'],
          },
          { type: 'Text', id: 'c', text: ' now', marks: [] },
        ],
      },
    ],
  })

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
    // A shipped mark nests as an element inside the run, as the read-only view
    // renders it; the run element itself keeps `data-run` so a selection maps.
    expect(tagsWithin(paragraph.children[1] as HTMLElement)).toEqual(['em', 'strong'])
    expect((paragraph.children[1] as HTMLElement).hasAttribute('data-marks')).toBe(false)
    expect(tagsWithin(paragraph.children[0] as HTMLElement)).toEqual([])
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

  it('keeps sibling runs in an edited block, and re-renders only the edited run', () => {
    const before = mount(document, content())
    const untouchedSibling = before.elements.get(id('b'))
    const result = success(
      RichText.apply(state(null), [
        RichText.Edit.insertText(RichText.Node.make('a').at(2, 'after'), '!'),
      ]),
    )
    const after = patch(before, result.state.document, result.changeSet)
    // The review's case: the block is dirty, but its run list is unchanged, so
    // a long paragraph does not rebuild every formatting run on each keystroke.
    expect(after.elements.get(id('b'))).toBe(untouchedSibling)
    expect(after.elements.get(id('a'))).not.toBe(before.elements.get(id('a')))
    expect(after.elements.get(id('a'))?.textContent).toBe('ab!')
    expect(after.elements.get(id('p'))).toBe(before.elements.get(id('p')))
  })

  it('applies a block move to the DOM, not only to the model', () => {
    const before = mount(document, content())
    const result = success(
      RichText.apply(state(null), [RichText.Edit.moveBlock(RichText.Node.make('h'), 0)]),
    )
    const after = patch(before, result.state.document, result.changeSet)
    expect(after.content.children.map(block => block.id)).toEqual(['h', 'p'])
    expect(Array.from(after.root.children).map(child => child.getAttribute('data-block'))).toEqual([
      'h',
      'p',
    ])
    // A move is a move: the block's own element survives.
    expect(after.elements.get(id('h'))).toBe(before.elements.get(id('h')))
    expect(toText(after)).toBe('Title\nabcd')
  })

  it('reorders surviving blocks when the whole document is replaced', () => {
    const before = mount(document, content())
    const reversed = RichText.decodeDocument({
      version: 1,
      children: [...content().children].reverse(),
    })
    const after = patch(before, reversed, {
      dirtyNodes: new Set([id('p'), id('h'), id('a'), id('b'), id('c')]),
      insertedNodes: new Set(),
      removedNodes: new Set(),
      textChanged: new Set(),
      structureChanged: true,
      selectionChanged: false,
    })
    expect(Array.from(after.root.children).map(child => child.getAttribute('data-block'))).toEqual([
      'h',
      'p',
    ])
    expect(toText(after)).toBe('Title\nabcd')
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

describe('rendering and patching nested blocks', () => {
  const nested = () =>
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
              children: [
                { type: 'Text', id: 'a', text: 'one', marks: [] },
                { type: 'Text', id: 'b', text: 'bold', marks: ['Bold'] },
              ],
            },
            {
              type: 'Paragraph',
              id: 'li2',
              children: [{ type: 'Text', id: 'c', text: 'two', marks: [] }],
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

  it('renders the items inside their container, each addressable', () => {
    const dom = mount(document, nested())
    const container = dom.root.children[0] as HTMLElement
    expect(container.getAttribute('data-block')).toBe('list')
    expect(Array.from(container.children).map(child => child.getAttribute('data-block'))).toEqual([
      'li1',
      'li2',
    ])
    expect(
      Array.from(container.children[0]!.children).map(child => child.getAttribute('data-run')),
    ).toEqual(['a', 'b'])
    // Every nested identity is in the index, so positions resolve at depth.
    expect(dom.elements.get(id('li2'))).toBe(container.children[1])
    expect(dom.elements.get(id('c'))).toBe(container.children[1]!.children[0])
    expect(toText(dom)).toBe('onebold\ntwo\ntail')
  })

  it('keeps the container and sibling runs when a nested run is edited', () => {
    const before = mount(document, nested())
    const container = before.elements.get(id('list'))
    const untouchedRun = before.elements.get(id('b'))
    const result = success(
      RichText.apply({ document: nested(), selection: null }, [
        RichText.Edit.insertText(RichText.Node.make('a').at(3, 'after'), '!'),
      ]),
    )
    const after = patch(before, result.state.document, result.changeSet)
    expect(after.elements.get(id('list'))).toBe(container)
    expect(after.elements.get(id('li1'))).toBe(before.elements.get(id('li1')))
    expect(after.elements.get(id('b'))).toBe(untouchedRun)
    expect(after.elements.get(id('a'))?.textContent).toBe('one!')
    expect(toText(after)).toBe('one!bold\ntwo\ntail')
  })

  it('places nested items in order when the document is replaced', () => {
    const before = mount(document, nested())
    const list = nested().children[0]
    if (list?.type !== 'Node') throw new Error('expected a container')
    const reversed = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'List',
          id: 'list',
          props: {},
          children: [],
          blocks: [...(list.blocks ?? [])].reverse(),
        },
        nested().children[1]!,
      ],
    })
    const after = patch(before, reversed, {
      dirtyNodes: new Set([
        id('list'),
        id('li1'),
        id('li2'),
        id('a'),
        id('b'),
        id('c'),
        id('tail'),
        id('t'),
      ]),
      insertedNodes: new Set(),
      removedNodes: new Set(),
      textChanged: new Set(),
      structureChanged: true,
      selectionChanged: false,
    })
    const container = after.root.children[0] as HTMLElement
    expect(Array.from(container.children).map(child => child.getAttribute('data-block'))).toEqual([
      'li2',
      'li1',
    ])
    expect(toText(after)).toBe('two\nonebold\ntail')
  })

  it('rebuilds a container whose items changed, and patches it in place', () => {
    const before = mount(document, nested())
    const result = success(
      RichText.apply({ document: nested(), selection: null }, [
        RichText.Edit.moveBlock(RichText.Node.make('li2'), 0, RichText.Node.make('list')),
      ]),
    )
    const after = patch(before, result.state.document, result.changeSet)
    // The item order changed, so the container is re-rendered where it stood.
    expect(after.root.children[0]).toBe(after.elements.get(id('list')))
    const container = after.elements.get(id('list')) as HTMLElement
    expect(Array.from(container.children).map(child => child.getAttribute('data-block'))).toEqual([
      'li2',
      'li1',
    ])
    expect(toText(after)).toBe('two\nonebold\ntail')
    // The top-level sibling is untouched, and every nested id is addressable.
    expect(after.elements.get(id('tail'))).toBe(before.elements.get(id('tail')))
    expect(after.elements.get(id('a'))?.textContent).toBe('one')
  })

  it('repairs a nested run the browser touched, and nothing else', () => {
    const before = mount(document, nested())
    expect(repair(before, before.content)).toBe(before)
    const drifted = before.elements.get(id('c'))!
    drifted.append(document.createTextNode('drift'))
    const after = repair(before, before.content)
    expect(after).not.toBe(before)
    expect(toText(after)).toBe('onebold\ntwo\ntail')
    expect(after.elements.get(id('tail'))).toBe(before.elements.get(id('tail')))
    expect(after.elements.get(id('c'))).not.toBe(drifted)
  })

  it('maps a position inside a nested run both ways', () => {
    const dom = mount(document, nested())
    const range = positionToRange(dom, at('b', 4))
    expect(range).toBeDefined()
    expect(rangeToPosition(dom, range!.startContainer, range!.startOffset)).toEqual(
      at('b', 4, 'after'),
    )
    expect(rangeToPosition(dom, range!.startContainer, 2)).toEqual(at('b', 2, 'before'))
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

describe('the editable subtree with a rendering registry', () => {
  it('nests a declared mark inside the run element, keeping the run addressable', () => {
    const dom = mount(document, linked(), links)
    const run = dom.elements.get(id('b')) as HTMLElement
    expect(run.getAttribute('data-run')).toBe('b')
    // The shipped mark is inside the declared one, exactly as the serializer and
    // the read-only view nest them, and the run element stays outermost.
    expect(tagsWithin(run)).toEqual(['a', 'strong'])
    expect((run.firstChild as HTMLElement).getAttribute('href')).toBe('/x')
    expect(run.textContent).toBe('docs')
    expect(run.hasAttribute('data-marks')).toBe(false)
    expect(toText(dom)).toBe('see docs now')
  })

  it('maps a position inside a nested mark both ways', () => {
    const dom = mount(document, linked(), links)
    const range = positionToRange(dom, at('b', 2))
    expect(range?.startContainer).toBeInstanceOf(Text)
    expect(range?.startContainer.textContent).toBe('docs')
    expect(range?.startOffset).toBe(2)
    expect(rangeToPosition(dom, range!.startContainer, range!.startOffset)).toEqual(
      at('b', 2, 'before'),
    )
  })

  it('patches an edit inside a marked run and keeps the mark rendered', () => {
    const before = mount(document, linked(), links)
    const result = success(
      RichText.run(
        {
          document: before.content,
          selection: { type: 'Range', anchor: at('b', 2), focus: at('b', 2) },
        },
        { type: 'InsertText', text: 'X' },
        { mint: () => 'x' },
      ),
    )
    const after = patch(before, result.state.document, result.changeSet)
    const run = after.elements.get(id('b')) as HTMLElement
    expect(run.textContent).toBe('doXcs')
    expect(tagsWithin(run)).toEqual(['a', 'strong'])
    expect((run.firstChild as HTMLElement).getAttribute('href')).toBe('/x')
    expect(positionToRange(after, at('b', 3))?.startOffset).toBe(3)
  })

  it('restores a mark structure the browser mangled', () => {
    const before = mount(document, linked(), links)
    const run = before.elements.get(id('b')) as HTMLElement
    // What an outside mutation can leave: the text is there, the marks are not.
    run.replaceChildren(before.root.ownerDocument.createTextNode('docs'))
    expect(tagsWithin(run)).toEqual([])
    const after = repair(before, linked())
    const restored = after.elements.get(id('b')) as HTMLElement
    expect(tagsWithin(restored)).toEqual(['a', 'strong'])
    expect((restored.firstChild as HTMLElement).getAttribute('href')).toBe('/x')
    expect(toText(after)).toBe('see docs now')
  })

  it('keeps a name no entry renders on the run element', () => {
    const future = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 'a', text: 'x', marks: [{ name: 'Highlight' }, 'Bold'] }],
        },
      ],
    })
    const dom = mount(document, future, links)
    const run = dom.elements.get(id('a')) as HTMLElement
    expect(run.getAttribute('data-marks')).toBe('Highlight')
    expect(tagsWithin(run)).toEqual(['strong'])
    // A browser can drop the attribute without touching the text; recovery puts
    // it back, because the document is the authority on what the run carries.
    run.removeAttribute('data-marks')
    const repaired = repair(dom, future)
    const restored = repaired.elements.get(id('a')) as HTMLElement
    expect(restored.getAttribute('data-marks')).toBe('Highlight')
    expect(tagsWithin(restored)).toEqual(['strong'])
  })
})
