// @vitest-environment jsdom
/**
 * Event wiring: the browser produces intent, the application commits state, and
 * the adapter patches. Composition is the sharp case — the browser owns text
 * the semantic document does not, until the IME commits.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { mount, toText } from '../src/dom.js'
import { attach, intentFor, readSelection, restoreSelection } from '../src/events.js'

const id = RichText.NodeId.make
const at = (node: string, offset: number): RichText.Position => ({
  node: id(node),
  offset,
  affinity: 'after',
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
const key = (value: string, modifiers: { meta?: boolean; ctrl?: boolean } = {}): KeyboardEvent =>
  new KeyboardEvent('keydown', {
    key: value,
    bubbles: true,
    cancelable: true,
    metaKey: modifiers.meta ?? false,
    ctrlKey: modifiers.ctrl ?? false,
  })
const composition = (type: 'compositionstart' | 'compositionend', data?: string): Event => {
  const event = new Event(type, { bubbles: true })
  if (data !== undefined) Object.defineProperty(event, 'data', { value: data })
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

  it('stops listening once detached', () => {
    const { attachment, intents } = setup()
    const root = attachment.current().root
    attachment.detach()
    root.dispatchEvent(beforeInput('insertText', 'X'))
    expect(intents).toEqual([])
  })
})
