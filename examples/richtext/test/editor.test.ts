// @vitest-environment jsdom
/**
 * The editor's Message vocabulary and the mount that produces it: a browser
 * event becomes the Message an editor's `update` already knows how to handle.
 */
import { Effect, Stream } from 'effect'
import { liveViewStateChanges } from 'foldkit/mount'
import * as RichText from 'foldkit-richtext'
import { positionToRange } from 'foldkit-richtext-dom'
import { attachmentIn, releaseMount } from 'foldkit-richtext-dom/host'
import { describe, expect, it } from 'vitest'
import { attachEditor, events, toMessage, Message } from '../src/editor.js'

const at = (node: string, offset: number): RichText.Position => ({
  node: RichText.NodeId.make(node),
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
        children: [{ type: 'Text', id: 'a', text: 'ab', marks: [] }],
      },
    ],
  })

const host = (): HTMLElement => {
  const element = document.createElement('div')
  document.body.append(element)
  return element
}

const beforeInput = (inputType: string, data?: string): Event => {
  const event = new Event('beforeinput', { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    inputType: { value: inputType },
    data: { value: data ?? null },
  })
  return event
}

const key = (value: string, modifiers: { meta?: boolean } = {}): KeyboardEvent =>
  new KeyboardEvent('keydown', {
    key: value,
    bubbles: true,
    cancelable: true,
    metaKey: modifiers.meta ?? false,
  })

const composition = (type: 'compositionstart' | 'compositionend', data?: string): Event => {
  const event = new Event(type, { bubbles: true })
  if (data !== undefined) Object.defineProperty(event, 'data', { value: data })
  return event
}

const waitFor = async (condition: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (condition()) return
    await new Promise(resolve => setTimeout(resolve, 1))
  }
  throw new Error('the condition never held')
}

const slice = () => {
  let minted = 0
  return RichText.sliceFromText('hi', () => `s${++minted}`)
}

describe('what a browser intent means to an editor', () => {
  it.each([
    [{ type: 'InsertText', text: 'X' }, Message.Typed({ text: 'X' })],
    [{ type: 'DeleteBackward' }, Message.Backspace()],
    [{ type: 'DeleteForward' }, Message.DeletedForward()],
    [{ type: 'SplitBlock' }, Message.Entered()],
    [{ type: 'ToggleMark', mark: 'Bold' }, Message.ToggledMark({ mark: 'Bold' })],
  ] as const)('maps %o', (command, message) => {
    expect(toMessage(command as RichText.Command)).toEqual(message)
  })

  it('maps a paste to the slice it carries', () => {
    const pasted = slice()
    expect(toMessage({ type: 'Paste', slice: pasted })).toEqual(Message.Pasted({ slice: pasted }))
  })

  it('refuses an intent the vocabulary cannot carry instead of dropping a detail', () => {
    expect(toMessage({ type: 'InsertText', text: 'X', marks: ['Bold'] })).toBeUndefined()
    expect(
      toMessage({ type: 'ToggleMark', mark: { name: 'Link', props: { href: '/x' } } }),
    ).toBeUndefined()
    // A caret is reported by `onSelection`, not as a command.
    expect(toMessage({ type: 'SetSelection', selection: null })).toBeUndefined()
  })
})

describe('the mount that produces them', () => {
  const driven = (element: HTMLElement) => {
    const messages: Array<Message> = []
    const attachment = attachEditor(element, content(), message => messages.push(message))
    // The listeners live on the owned root inside the host, as in a view.
    return { messages, attachment, root: attachment.current().root }
  }

  it('turns typing, Enter, and a history chord into Messages', () => {
    const element = host()
    const { messages, root } = driven(element)
    root.dispatchEvent(beforeInput('insertText', 'X'))
    root.dispatchEvent(key('Enter'))
    root.dispatchEvent(key('z', { meta: true }))
    expect(messages).toEqual([Message.Typed({ text: 'X' }), Message.Entered(), Message.Undone()])
    releaseMount(element)
  })

  it('turns a committed composition into one insertion', () => {
    const element = host()
    const { messages, root } = driven(element)
    root.dispatchEvent(composition('compositionstart'))
    root.dispatchEvent(composition('compositionend', 'に'))
    expect(messages).toEqual([Message.Typed({ text: 'に' })])
    releaseMount(element)
  })

  it('reports a caret the application did not place', () => {
    const element = host()
    const { messages, attachment } = driven(element)
    const range = positionToRange(attachment.current(), at('a', 1))
    if (range === undefined) throw new Error('expected a range')
    const live = window.getSelection()
    if (live === null) throw new Error('expected a selection')
    live.removeAllRanges()
    live.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    expect(messages).toHaveLength(1)
    expect(messages[0]?._tag).toBe('Selected')
    releaseMount(element)
  })

  it('attaches on subscribe and releases when its stream ends', async () => {
    const element = host()
    const action = events({ content: content() })
    const collected = Effect.runPromise(
      Stream.runCollect(action.f(element, liveViewStateChanges).pipe(Stream.take(1))),
    )
    await waitFor(() => attachmentIn(element) !== undefined)
    const attachment = attachmentIn(element)
    if (attachment === undefined) throw new Error('expected an attachment')
    attachment.current().root.dispatchEvent(beforeInput('insertText', 'X'))
    expect(Array.from(await collected)).toEqual([Message.Typed({ text: 'X' })])
    await waitFor(() => attachmentIn(element) === undefined)
  })
})
