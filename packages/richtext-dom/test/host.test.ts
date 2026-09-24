// @vitest-environment jsdom
/**
 * The host-element mount: a view renders a host element, the interpreter goes
 * inside it, and a patch Command finds the attachment through that element.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { attachmentIn, mountInto, placeRendering, releaseMount, renderingFor } from '../src/host.js'

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

  it('renders declared marks through a registry the caller supplies', () => {
    const element = host()
    const linked = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            {
              type: 'Text',
              id: 'a',
              text: 'docs',
              marks: [{ name: 'Link', props: { href: '/x' } }],
            },
          ],
        },
      ],
    })
    mountInto(
      element,
      linked,
      { onIntent: () => {} },
      RichText.rendering({
        marks: {
          Link: mark => ({
            tag: 'a',
            attributes: { href: String(RichText.markProps(mark)?.href ?? '') },
          }),
        },
      }),
    )
    const run = element.querySelector('[data-run]') as HTMLElement
    expect(run.getAttribute('data-run')).toBe('a')
    expect(run.firstChild).toBeInstanceOf(HTMLAnchorElement)
    expect((run.firstChild as HTMLAnchorElement).getAttribute('href')).toBe('/x')
    expect(run.hasAttribute('data-marks')).toBe(false)
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

describe('a rendering registry placed for a host id (§122)', () => {
  const registry = (tag: string): RichText.Rendering =>
    RichText.rendering({ marks: { Link: { tag, attributes: {} } } })

  it('returns what was placed, and the default for an id nothing placed', () => {
    const placed = registry('a')
    placeRendering('registry-1', placed)
    expect(renderingFor('registry-1')).toBe(placed)
    expect(renderingFor('registry-not-placed')).toBe(RichText.noRendering)
  })

  it('replaces what an id had rather than accumulating', () => {
    placeRendering('registry-2', registry('a'))
    const second = registry('span')
    placeRendering('registry-2', second)
    expect(renderingFor('registry-2')).toBe(second)
  })

  it('forgets the registry when the host it belongs to is released', () => {
    const element = host()
    element.id = 'registry-3'
    const placed = registry('a')
    placeRendering('registry-3', placed)
    mountInto(element, content(), { onIntent: () => {} }, placed)
    expect(renderingFor('registry-3')).toBe(placed)
    releaseMount(element)
    expect(renderingFor('registry-3')).toBe(RichText.noRendering)
  })
})
