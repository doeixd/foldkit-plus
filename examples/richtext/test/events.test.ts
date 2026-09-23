// @vitest-environment jsdom
/**
 * Event wiring: the browser produces intent, the application commits state, and
 * the adapter patches. Composition is the sharp case — the browser owns text
 * the semantic document does not, until the IME commits.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { mount, repair, toText } from '../src/dom.js'
import {
  attach,
  intentFor,
  readSelection,
  restoreSelection,
  SLICE_CLIPBOARD_TYPE,
} from '../src/events.js'

const id = RichText.NodeId.make
const at = (node: string, offset: number): RichText.Position => ({
  node: id(node),
  offset,
  affinity: 'after',
})
const caretAt = ([node, offset]: readonly [string, number]): RichText.Selection => ({
  type: 'Range',
  anchor: at(node, offset),
  focus: at(node, offset),
})
const range = (
  anchor: readonly [string, number],
  focus: readonly [string, number],
): RichText.Selection => ({
  type: 'Range',
  anchor: at(anchor[0], anchor[1]),
  focus: at(focus[0], focus[1]),
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
          { type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] },
        ],
      },
      { type: 'Paragraph', id: 'q', children: [{ type: 'Text', id: 'c', text: 'ef', marks: [] }] },
    ],
  })
const success = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result
}

const beforeInput = (inputType: string, data?: string): Event => {
  const event = new Event('beforeinput', { cancelable: true, bubbles: true })
  Object.defineProperties(event, {
    inputType: { value: inputType },
    data: { value: data ?? null },
  })
  return event
}
const key = (
  value: string,
  modifiers: { meta?: boolean; ctrl?: boolean; shift?: boolean } = {},
): KeyboardEvent =>
  new KeyboardEvent('keydown', {
    key: value,
    bubbles: true,
    cancelable: true,
    metaKey: modifiers.meta ?? false,
    ctrlKey: modifiers.ctrl ?? false,
    shiftKey: modifiers.shift ?? false,
  })
const composition = (type: 'compositionstart' | 'compositionend', data?: string): Event => {
  const event = new Event(type, { bubbles: true })
  if (data !== undefined) Object.defineProperty(event, 'data', { value: data })
  return event
}

/** A clipboard stub, so the adapter's payloads are what the test inspects. */
const fakeClipboard = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial))
  return {
    getData: (type: string) => data.get(type) ?? '',
    setData: (type: string, value: string) => void data.set(type, value),
    contents: () => Object.fromEntries(data),
  }
}
const clipboardEvent = (
  type: 'copy' | 'cut' | 'paste',
  clipboard: ReturnType<typeof fakeClipboard>,
): Event => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: clipboard })
  return event
}

describe('translating events into intent', () => {
  it.each([
    ['insertText', 'X', { type: 'InsertText', text: 'X' }],
    ['insertParagraph', undefined, { type: 'SplitBlock' }],
    ['insertLineBreak', undefined, { type: 'SplitBlock' }],
    ['deleteContentBackward', undefined, { type: 'DeleteBackward' }],
    ['deleteContentForward', undefined, { type: 'DeleteForward' }],
    ['formatBold', undefined, { type: 'ToggleMark', mark: 'Bold' }],
    ['formatItalic', undefined, { type: 'ToggleMark', mark: 'Italic' }],
  ])('maps beforeinput %s to a command', (inputType, data, command) => {
    expect(intentFor(beforeInput(inputType, data))).toEqual({ preventDefault: true, command })
  })

  it('prevents input it cannot honor yet instead of letting the DOM drift', () => {
    expect(intentFor(beforeInput('insertFromPaste'))).toEqual({ preventDefault: true })
    expect(intentFor(beforeInput('deleteWordBackward'))).toEqual({ preventDefault: true })
    expect(intentFor(beforeInput('insertText', ''))).toEqual({ preventDefault: true })
    expect(intentFor(new Event('click'))).toBeUndefined()
  })

  it.each([
    ['Enter', undefined, { type: 'SplitBlock' }],
    ['Backspace', undefined, { type: 'DeleteBackward' }],
    ['Delete', undefined, { type: 'DeleteForward' }],
    ['b', { meta: true }, { type: 'ToggleMark', mark: 'Bold' }],
    ['i', { ctrl: true }, { type: 'ToggleMark', mark: 'Italic' }],
    ['e', { meta: true }, { type: 'ToggleMark', mark: 'Code' }],
  ] as const)('maps keydown %s to a command', (value, modifiers, command) => {
    expect(intentFor(key(value, modifiers ?? {}))).toEqual({ preventDefault: true, command })
  })

  it('maps the history chords to history intents, not commands', () => {
    expect(intentFor(key('z', { meta: true }))).toEqual({ preventDefault: true, history: 'undo' })
    expect(intentFor(key('z', { ctrl: true }))).toEqual({ preventDefault: true, history: 'undo' })
    expect(intentFor(key('Z', { meta: true, shift: true }))).toEqual({
      preventDefault: true,
      history: 'redo',
    })
    expect(intentFor(key('y', { ctrl: true }))).toEqual({ preventDefault: true, history: 'redo' })
    expect(intentFor(key('z'))).toBeUndefined()
  })

  it('leaves ordinary typing to beforeinput and unknown keys alone', () => {
    expect(intentFor(key('a'))).toBeUndefined()
    expect(intentFor(key('b'))).toBeUndefined()
    expect(intentFor(key('ArrowLeft'))).toBeUndefined()
  })

  it('hands the interaction to the IME while composing', () => {
    expect(intentFor(beforeInput('insertCompositionText', 'に'), true)).toEqual({
      preventDefault: false,
    })
    expect(intentFor(key('Enter'), true)).toEqual({ preventDefault: false })
    expect(intentFor(beforeInput('insertCompositionText', 'に'))).toEqual({
      preventDefault: false,
    })
  })
})

describe('the wired editing loop', () => {
  const setup = () => {
    const dom = mount(document, content())
    document.body.append(dom.root)
    restoreSelection(dom, { type: 'Range', anchor: at('a', 2), focus: at('a', 2) })
    const intents: RichText.Command[] = []
    const attachment = attach(dom, { onIntent: command => intents.push(command) })
    let minted = 0
    const run = (command: RichText.Command) => {
      const state = {
        document: attachment.current().content,
        selection: readSelection(attachment.current()),
      }
      const result = success(RichText.run(state, command, { mint: () => `e${++minted}` }))
      attachment.sync(result.state, result.changeSet)
    }
    return { attachment, intents, run }
  }

  it('reads the browser selection back as a semantic selection', () => {
    const { attachment } = setup()
    expect(readSelection(attachment.current())).toEqual({
      type: 'Range',
      anchor: { ...at('a', 2), affinity: 'after' },
      focus: { ...at('a', 2), affinity: 'after' },
    })
    attachment.detach()
  })

  it('types through beforeinput, patches, and restores the caret', () => {
    const { attachment, intents, run } = setup()
    const event = beforeInput('insertText', 'X')
    attachment.current().root.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(intents).toEqual([{ type: 'InsertText', text: 'X' }])
    run(intents[0]!)
    expect(toText(attachment.current())).toBe('abXcd\nef')
    const window = document.defaultView!
    expect(window.getSelection()!.anchorOffset).toBe(3)
    attachment.detach()
  })

  it('splits on Enter and joins on Backspace through the same loop', () => {
    const { attachment, intents, run } = setup()
    attachment.current().root.dispatchEvent(key('Enter'))
    run(intents[0]!)
    const split = attachment.current().content.children
    expect(split).toHaveLength(3)
    expect(split[1]!.id).not.toBe(split[1]!.children[0]!.id)
    expect(toText(attachment.current())).toBe('ab\ncd\nef')

    attachment.current().root.dispatchEvent(key('Backspace'))
    run(intents[1]!)
    expect(attachment.current().content.children.map(block => block.id)).toEqual(['p', 'q'])
    expect(toText(attachment.current())).toBe('abcd\nef')
    attachment.detach()
  })

  it('commits a composition as one edit at the semantic caret', () => {
    const { attachment, intents, run } = setup()
    attachment.current().root.dispatchEvent(composition('compositionstart'))
    expect(attachment.composing()).toBe(true)
    // The browser may put temporary text in the DOM; nothing semantic happens.
    const temporary = document.createTextNode('にほ')
    attachment.current().root.children[0]!.append(temporary)
    expect(intents).toEqual([])
    attachment.current().root.dispatchEvent(composition('compositionend', 'にほ'))
    expect(attachment.composing()).toBe(false)
    expect(intents).toEqual([{ type: 'InsertText', text: 'にほ' }])

    // Committing patches from the semantic document, which never held the
    // temporary text, so the DOM is corrected rather than trusted.
    run(intents[0]!)
    expect(toText(attachment.current())).toBe('abにほcd\nef')
    expect(attachment.current().elements.has(id('a'))).toBe(true)
    attachment.detach()
  })

  it('repairs the subtree when a composition is cancelled', () => {
    const { attachment, intents } = setup()
    const root = attachment.current().root
    attachment.current().root.dispatchEvent(composition('compositionstart'))
    // A cancelled IME (Escape, a lost focus) leaves text the document never had.
    attachment.current().elements.get(id('a'))!.append(document.createTextNode('にほ'))
    expect(toText(attachment.current())).toBe('abにほcd\nef')

    attachment.current().root.dispatchEvent(composition('compositionend', ''))
    expect(intents).toEqual([])
    expect(toText(attachment.current())).toBe('abcd\nef')
    // The block was re-rendered from the document, so the stray text is gone.
    expect(attachment.current().content.children[0]?.children[0]?.text).toBe('ab')
    attachment.detach()
  })

  it('leaves a matching subtree alone', () => {
    const { attachment } = setup()
    const before = attachment.current()
    expect(repair(before, before.content)).toBe(before)
    attachment.detach()
  })

  it('routes undo and redo chords to the history channel', () => {
    const dom = mount(document, content())
    document.body.append(dom.root)
    restoreSelection(dom, { type: 'Range', anchor: at('a', 2), focus: at('a', 2) })
    const intents: RichText.Command[] = []
    const history: Array<'undo' | 'redo'> = []
    const attachment = attach(dom, {
      onIntent: command => intents.push(command),
      onHistory: direction => history.push(direction),
    })
    const event = key('z', { meta: true })
    attachment.current().root.dispatchEvent(event)
    attachment.current().root.dispatchEvent(key('Z', { meta: true, shift: true }))
    expect(event.defaultPrevented).toBe(true)
    expect(intents).toEqual([])
    expect(history).toEqual(['undo', 'redo'])
    attachment.detach()
    dom.root.remove()
  })

  it('stops listening once detached', () => {
    const { attachment, intents } = setup()
    const root = attachment.current().root
    attachment.detach()
    root.dispatchEvent(beforeInput('insertText', 'X'))
    expect(intents).toEqual([])
  })
})

describe('clipboard events', () => {
  const setup = (
    selection:
      | readonly [string, number]
      | readonly [readonly [string, number], readonly [string, number]] = ['a', 2],
  ) => {
    const dom = mount(document, content())
    document.body.append(dom.root)
    const semantic =
      Array.isArray(selection) && Array.isArray(selection[0])
        ? range(
            selection[0] as readonly [string, number],
            selection[1] as readonly [string, number],
          )
        : caretAt(selection as readonly [string, number])
    restoreSelection(dom, semantic)
    const intents: RichText.Command[] = []
    const attachment = attach(dom, { onIntent: command => intents.push(command) })
    return { attachment, intents }
  }

  it('copies a semantic slice plus plain text, and no command', () => {
    const { attachment, intents } = setup([
      ['a', 0],
      ['a', 2],
    ])
    const clipboard = fakeClipboard()
    const event = clipboardEvent('copy', clipboard)
    attachment.current().root.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(intents).toEqual([])
    const contents = clipboard.contents()
    expect(contents['text/plain']).toBe('ab')
    expect(contents['text/html']).toBe('<p>ab</p>')
    const slice = RichText.deserializeSlice(contents[SLICE_CLIPBOARD_TYPE]!)!
    expect(RichText.plainTextOf(slice)).toBe('ab')
    expect(slice.blocks[0]?.id).toBe('p')
    attachment.detach()
    document.body.removeChild(attachment.current().root)
  })

  it('cuts by copying and deleting the range', () => {
    const { attachment, intents } = setup([
      ['a', 1],
      ['b', 1],
    ])
    const clipboard = fakeClipboard()
    attachment.current().root.dispatchEvent(clipboardEvent('cut', clipboard))
    expect(
      RichText.deserializeSlice(clipboard.contents()[SLICE_CLIPBOARD_TYPE]!)?.blocks[0]?.children,
    ).toEqual([
      { type: 'Text', id: 'a', text: 'b', marks: [] },
      { type: 'Text', id: 'b', text: 'c', marks: ['Bold'] },
    ])
    expect(intents).toEqual([{ type: 'DeleteBackward' }])
    attachment.detach()
    document.body.removeChild(attachment.current().root)
  })

  it('cuts nothing at a collapsed caret', () => {
    const { attachment, intents } = setup(['a', 1])
    const clipboard = fakeClipboard()
    attachment.current().root.dispatchEvent(clipboardEvent('cut', clipboard))
    expect(clipboard.contents()['text/plain']).toBe('')
    expect(intents).toEqual([])
    attachment.detach()
    document.body.removeChild(attachment.current().root)
  })

  it('prefers a slice payload over plain text', () => {
    const { attachment, intents } = setup(['a', 2])
    const source = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'x',
          children: [{ type: 'Text', id: 'y', text: 'from slice', marks: ['Italic'] }],
        },
      ],
    })
    const clipboard = fakeClipboard({
      [SLICE_CLIPBOARD_TYPE]: RichText.serializeSlice(
        RichText.sliceOf(source, { type: 'Node', node: RichText.NodeId.make('x') })!,
      ),
      'text/html': '<p>from html</p>',
      'text/plain': 'from text',
    })
    attachment.current().root.dispatchEvent(clipboardEvent('paste', clipboard))
    expect(intents).toHaveLength(1)
    expect(RichText.plainTextOf((intents[0] as { slice: RichText.Slice }).slice)).toBe('from slice')
    attachment.detach()
    document.body.removeChild(attachment.current().root)
  })

  it('imports HTML when there is no slice payload, before falling back to text', () => {
    const { attachment, intents } = setup(['a', 2])
    const clipboard = fakeClipboard({
      'text/html': '<p>rich <strong>markup</strong></p><script>alert(1)</script>',
      'text/plain': 'plain fallback',
    })
    attachment.current().root.dispatchEvent(clipboardEvent('paste', clipboard))
    const slice = (intents[0] as { slice: RichText.Slice }).slice
    expect(RichText.toText(slice.blocks)).toBe('rich markup')
    expect(slice.blocks[0]?.children[1]?.marks).toEqual(['Bold'])
    attachment.detach()
    document.body.removeChild(attachment.current().root)
  })

  it('constrains imported HTML to the Kit when one is given', () => {
    const dom = mount(document, content())
    document.body.append(dom.root)
    restoreSelection(dom, caretAt(['a', 2]))
    const intents: RichText.Command[] = []
    const attachment = attach(dom, {
      onIntent: command => intents.push(command),
      kit: RichText.kit({ nodes: [RichText.block('Paragraph')], marks: ['Bold'] }),
    })
    attachment
      .current()
      .root.dispatchEvent(clipboardEvent('paste', fakeClipboard({ 'text/html': '<h1>Title</h1>' })))
    const slice = (intents[0] as { slice: RichText.Slice }).slice
    expect(slice.blocks.map(block => block.type)).toEqual(['Paragraph'])
    attachment.detach()
    document.body.removeChild(attachment.current().root)
  })

  it('falls back to plain text when the slice payload is absent or unreadable', () => {
    for (const payload of [undefined, 'not a slice', JSON.stringify({ version: 9, blocks: [] })]) {
      const { attachment, intents } = setup(['a', 2])
      const clipboard = fakeClipboard({
        ...(payload === undefined ? {} : { [SLICE_CLIPBOARD_TYPE]: payload }),
        'text/plain': 'one\ntwo',
      })
      attachment.current().root.dispatchEvent(clipboardEvent('paste', clipboard))
      const slice = (intents[0] as { slice: RichText.Slice }).slice
      expect(RichText.plainTextOf(slice)).toBe('one\ntwo')
      expect(slice.blocks.map(block => block.type)).toEqual(['Paragraph', 'Paragraph'])
      attachment.detach()
      document.body.removeChild(attachment.current().root)
    }
  })

  it('leaves an empty clipboard alone', () => {
    const { attachment, intents } = setup(['a', 2])
    const event = clipboardEvent('paste', fakeClipboard())
    attachment.current().root.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(intents).toEqual([])
    attachment.detach()
    document.body.removeChild(attachment.current().root)
  })
})
