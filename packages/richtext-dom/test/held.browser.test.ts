/**
 * Keys pressed after an edit is asked and before it is drawn, in a real browser, which alone
 * moves a caret by a line: the caret key is held and made once the editor answers the edit,
 * an edit asked behind it waits for it, and with nothing unanswered the key is the browser's.
 */
import { afterEach, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { attach, readSelection, restoreSelection } from '../src/events.js'
import { mount } from '../src/index.js'

const id = RichText.NodeId.make
const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})
const paragraph = (block: string) => ({
  type: 'Paragraph',
  id: block,
  children: [{ type: 'Text', id: `${block}-t`, text: block, marks: [] }],
})

/** What the editor told its host, in order: each edit asked, and each caret reported. */
const setup = () => {
  const dom = mount(
    document,
    RichText.decodeDocument({
      version: 1,
      children: [paragraph('one'), paragraph('two'), paragraph('three')],
    }),
  )
  document.body.append(dom.root)
  const told: Array<string> = []
  const attachment = attach(dom, {
    onIntent: command =>
      told.push(command.type === 'InsertText' ? `typed ${command.text}` : command.type),
    onSelection: selection =>
      told.push(selection?.type === 'Range' ? `caret ${selection.focus.node}` : 'caret none'),
  })
  dom.root.focus()
  restoreSelection(dom, caret('three-t', 2))
  const type = (text: string) =>
    dom.root.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: text,
        bubbles: true,
        cancelable: true,
      }),
    )
  const press = (key: string) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    dom.root.dispatchEvent(event)
    return event.defaultPrevented
  }
  const at = () => {
    const selection = readSelection(dom)
    return selection?.type === 'Range' ? selection.focus.node : undefined
  }
  return { attachment, told, type, press, at }
}

afterEach(() => document.body.replaceChildren())

it('holds a caret key until the edit before it is answered, then makes it', () => {
  const { attachment, told, type, press, at } = setup()
  type('x')
  expect(press('ArrowUp')).toBe(true)
  // Not moved yet: what is drawn may not hold the edit.
  expect(at()).toBe('three-t')
  // Typed behind the held key, so it waits for the key: it lands where the move took the caret.
  type('y')
  expect(told).toEqual(['caret three-t', 'typed x'])
  attachment.answered()
  expect(at()).toBe('two-t')
  expect(told).toEqual(['caret three-t', 'typed x', 'caret two-t', 'typed y'])
})

it('leaves a caret key to the browser when no edit is unanswered', () => {
  const { attachment, type, press } = setup()
  expect(press('ArrowUp')).toBe(false)
  type('x')
  attachment.answered()
  expect(press('ArrowDown')).toBe(false)
  // A key with Control is the browser's even then.
  type('y')
  const event = new KeyboardEvent('keydown', {
    key: 'ArrowUp',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  })
  document.activeElement?.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
})

it('lets a held key go when nothing answers the edit', async () => {
  const { told, type, press, at } = setup()
  type('x')
  expect(press('ArrowUp')).toBe(true)
  await new Promise(resolve => setTimeout(resolve, 1100))
  expect(at()).toBe('two-t')
  expect(told).toEqual(['caret three-t', 'typed x', 'caret two-t'])
})
