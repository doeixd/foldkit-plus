// @vitest-environment jsdom
/**
 * The host-element mount: a view renders a host element, the interpreter goes
 * inside it, and a patch Command finds the attachment through that element.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { attachmentIn, mountInto, releaseMount } from '../src/host.js'

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
      {
        type: 'Paragraph',
        id: 'q',
        children: [{ type: 'Text', id: 'c', text: 'ef', marks: [] }],
      },
    ],
  })

const host = (): HTMLElement => {
  const element = document.createElement('div')
  document.body.append(element)
  return element
}

const beforeInput = (inputType: string, data: string): Event => {
  const event = new Event('beforeinput', { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    inputType: { value: inputType },
    data: { value: data },
  })
  return event
}

describe('mounting into a host element', () => {
  it('renders into the host and records the attachment there', () => {
    const element = host()
    const attachment = mountInto(element, content(), { onIntent: () => {} })
    expect(element.querySelector('[data-block]')?.getAttribute('data-block')).toBe('p')
    expect(attachmentIn(element)).toBe(attachment)
    expect(attachmentIn(document.createElement('div'))).toBeUndefined()
    releaseMount(element)
  })

  it('patches through the attachment the element holds, touching only the dirty block', () => {
    const element = host()
    mountInto(element, content(), { onIntent: () => {} })
    const untouched = element.querySelector('[data-block="q"]')
    const attachment = attachmentIn(element)
    if (attachment === undefined) throw new Error('expected an attachment')
    const result = RichText.run(
      { document: content(), selection: { type: 'Range', anchor: at('a', 1), focus: at('a', 1) } },
      { type: 'InsertText', text: 'X' },
      { mint: () => 'm1' },
    )
    if (!result.ok) throw new Error(result.error)
    attachment.sync(result.state, result.changeSet)
    expect(attachment.current().content).toBe(result.state.document)
    expect(element.textContent).toContain('aXb')
    expect(element.querySelector('[data-block="q"]')).toBe(untouched)
    releaseMount(element)
  })

  it('detaches and removes the subtree, and releasing twice is harmless', () => {
    const element = host()
    const intents: Array<RichText.Command> = []
    mountInto(element, content(), { onIntent: command => intents.push(command) })
    const root = element.firstElementChild
    if (root === null) throw new Error('expected a root')
    releaseMount(element)
    expect(attachmentIn(element)).toBeUndefined()
    expect(element.children.length).toBe(0)
    // The listeners went with it: the detached subtree reports nothing.
    root.dispatchEvent(beforeInput('insertText', 'X'))
    expect(intents).toEqual([])
    expect(() => releaseMount(element)).not.toThrow()
  })

  it('replaces rather than duplicates when a host is mounted twice', () => {
    const element = host()
    mountInto(element, content(), { onIntent: () => {} })
    mountInto(element, content(), { onIntent: () => {} })
    expect(element.children.length).toBe(1)
    releaseMount(element)
  })
})
