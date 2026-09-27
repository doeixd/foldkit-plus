// @vitest-environment jsdom
/**
 * Dragging a block by its handle (§148): where the pointer drops it among its container's
 * blocks, the line that shows it, and what ends a drag without a drop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { dragBlock, dropBeside, type Placed } from '../src/drag.js'
import { mountInto, releaseMount } from '../src/host.js'

const id = RichText.NodeId.make
/** Blocks 20px tall, 10px apart: a at 0–20, b at 30–50, c at 60–80. */
const placed: ReadonlyArray<Placed> = ['a', 'b', 'c'].map((name, index) => ({
  id: id(name),
  top: index * 30,
  bottom: index * 30 + 20,
}))

describe('where a pointer drops a block', () => {
  it.each([
    ['above the first block’s middle', 'c', 5, { before: 'a' }],
    ['below the last block’s middle', 'a', 75, { after: 'c' }],
    ['between two blocks', 'a', 55, { before: 'c' }],
    ['on the lower half of the block before it, which is where it is', 'b', 15, undefined],
    ['on its own upper half, which is where it is', 'b', 35, undefined],
    ['on the upper half of the block after it, which is where it is', 'b', 65, undefined],
    ['for a block that is not there', 'x', 75, undefined],
  ])('%s', (_, moving, y, expected) => {
    expect(dropBeside(placed, id(moving), y)).toEqual(expected)
  })
})

describe('dragging a block by its handle', () => {
  const content = RichText.decodeDocument({
    version: 1,
    children: ['a', 'b', 'c'].map(name => ({
      type: 'Paragraph',
      id: name,
      children: [{ type: 'Text', id: `${name}-t`, text: name, marks: [] }],
    })),
  })
  const handle = () => document.getElementById('handle')!
  const line = () => document.querySelector<HTMLElement>('[data-richtext-drop]')
  const at = (type: string, init: MouseEventInit & { key?: string } = {}) =>
    init.key === undefined
      ? new MouseEvent(type, { bubbles: true, cancelable: true, ...init })
      : new KeyboardEvent(type, { bubbles: true, cancelable: true, key: init.key })
  let dropped: Array<RichText.Beside>
  let release: () => void

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div><button id="handle"></button>'
    mountInto(document.getElementById('host')!, content, { onIntent: () => {} })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const box = placed.find(block => block.id === this.getAttribute('data-block'))
      return { top: box?.top ?? 0, bottom: box?.bottom ?? 0, left: 10, width: 300 } as DOMRect
    })
    dropped = []
    release = dragBlock(handle(), 'host', id('a'), to => dropped.push(to))
  })
  afterEach(() => {
    release()
    releaseMount(document.getElementById('host')!)
    vi.restoreAllMocks()
  })

  it('shows where the block would land, and drops it there on release', () => {
    handle().dispatchEvent(at('pointerdown'))
    document.dispatchEvent(at('pointermove', { clientY: 75 }))
    expect(line()?.style.top).toBe('80px')
    expect([line()?.style.left, line()?.style.width]).toEqual(['10px', '300px'])
    document.dispatchEvent(at('pointermove', { clientY: 55 }))
    expect(line()?.style.top).toBe('60px')
    document.dispatchEvent(at('pointerup'))
    expect(dropped).toEqual([{ before: id('c') }])
    expect(line()).toBeNull()
  })

  it('shows no line, and drops nothing, where the block already is', () => {
    handle().dispatchEvent(at('pointerdown'))
    document.dispatchEvent(at('pointermove', { clientY: 75 }))
    document.dispatchEvent(at('pointermove', { clientY: 15 }))
    expect(line()).toBeNull()
    document.dispatchEvent(at('pointerup'))
    expect(dropped).toEqual([])
  })

  it.each([
    ['Escape', (target: EventTarget) => target.dispatchEvent(at('keydown', { key: 'Escape' }))],
    ['a cancelled pointer', (target: EventTarget) => target.dispatchEvent(at('pointercancel'))],
  ])('ends without a drop on %s', (_, cancel) => {
    handle().dispatchEvent(at('pointerdown'))
    document.dispatchEvent(at('pointermove', { clientY: 75 }))
    cancel(document)
    expect(line()).toBeNull()
    document.dispatchEvent(at('pointerup'))
    expect(dropped).toEqual([])
  })

  it('listens to the page only while pressed, and not to a button other than the first', () => {
    document.dispatchEvent(at('pointermove', { clientY: 75 }))
    expect(line()).toBeNull()
    handle().dispatchEvent(at('pointerdown', { button: 2 }))
    document.dispatchEvent(at('pointermove', { clientY: 75 }))
    document.dispatchEvent(at('pointerup'))
    expect([line(), dropped]).toEqual([null, []])
  })

  it('stops once released, ending a drag under way', () => {
    handle().dispatchEvent(at('pointerdown'))
    document.dispatchEvent(at('pointermove', { clientY: 75 }))
    release()
    expect(line()).toBeNull()
    document.dispatchEvent(at('pointerup'))
    handle().dispatchEvent(at('pointerdown'))
    document.dispatchEvent(at('pointermove', { clientY: 75 }))
    expect([line(), dropped]).toEqual([null, []])
  })

  it('follows only the pointer that pressed, and keeps the page from selecting text', () => {
    const pointed = (type: string, pointerId: number, clientY = 0) => {
      const event = at(type, { clientY })
      Object.defineProperty(event, 'pointerId', { value: pointerId })
      return event
    }
    const press = pointed('pointerdown', 1)
    handle().dispatchEvent(press)
    expect(press.defaultPrevented).toBe(true)
    document.dispatchEvent(pointed('pointermove', 2, 75))
    expect(line()).toBeNull()
    document.dispatchEvent(pointed('pointermove', 1, 75))
    expect(line()?.style.top).toBe('80px')
  })

  it('keeps dragging through other keys, and takes Escape for itself', () => {
    handle().dispatchEvent(at('pointerdown'))
    document.dispatchEvent(at('pointermove', { clientY: 75 }))
    document.dispatchEvent(at('keydown', { key: 'Shift' }))
    expect(line()).not.toBeNull()
    const escape = at('keydown', { key: 'Escape' })
    document.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
  })
})
