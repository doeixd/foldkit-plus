// @vitest-environment jsdom
/**
 * Dragging a block by its handle (§148): where the pointer drops it among its container's
 * blocks, the line that shows it, and what ends a drag without a drop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { dragBlock, dropBeside, type Placed } from '../src/drag.js'
import { mountInto, placeVocabulary, releaseMount } from '../src/host.js'

const id = RichText.NodeId.make
/** Blocks 20px tall, 10px apart: a at 0–20, b at 30–50, c at 60–80. */
const placed: ReadonlyArray<Placed> = ['a', 'b', 'c'].map((name, index) => ({
  id: id(name),
  container: '',
  index,
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

  // Items of two lists: `l` holds i1 and i2, `m` holds j1 and j2, and the list
  // `m` is a target too, its edges its first item's top and its last item's bottom.
  const lists: ReadonlyArray<Placed> = [
    { id: id('i1'), container: 'l', index: 0, top: 0, bottom: 20 },
    { id: id('i2'), container: 'l', index: 1, top: 30, bottom: 50 },
    { id: id('m'), container: '', index: 1, top: 80, bottom: 130 },
    { id: id('j1'), container: 'm', index: 0, top: 80, bottom: 100 },
    { id: id('j2'), container: 'm', index: 1, top: 110, bottom: 130 },
  ]

  it.each([
    ['into another container, before its block', 'i1', 83, { before: 'j1' }],
    ['into another container, after its block', 'i1', 97, { after: 'j1' }],
    // An edge in the same container as the block, but not beside it, is a move.
    ['past its neighbour in its own container', 'i1', 48, { after: 'i2' }],
    ['after another container’s last block', 'i1', 128, { after: 'j2' }],
  ])('drops %s, by the nearest edge whatever its container', (_, moving, y, expected) => {
    expect(dropBeside(lists, id(moving), y)).toEqual(expected)
  })

  it.each([
    ['after the container, below its last block', 132, { after: 'm' }],
    ['before the container, above its first block', 78, { before: 'm' }],
  ])('drops %s, where the two share an edge', (_, y, expected) => {
    expect(dropBeside(lists, id('i1'), y)).toEqual(expected)
  })

  it('treats an edge in another container as a move, whatever its index', () => {
    // j2 is at index 1, right after where i1 sits in its own list; in `m`, it is a move.
    expect(dropBeside(lists, id('i1'), 110)).toEqual({ before: id('j2') })
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
  // A move during a drag reports the pressed button, as a real one does.
  const at = (type: string, init: MouseEventInit & { key?: string } = {}) =>
    init.key === undefined
      ? new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          ...(type === 'pointermove' ? { buttons: 1 } : {}),
          ...init,
        })
      : new KeyboardEvent(type, { bubbles: true, cancelable: true, key: init.key })
  let dropped: Array<RichText.Beside>
  let release: () => void
  // How far the page has scrolled the blocks up since the drag began.
  let scrolled = 0

  beforeEach(() => {
    scrolled = 0
    document.body.innerHTML = '<div id="host"></div><button id="handle"></button>'
    mountInto(document.getElementById('host')!, content, { onIntent: () => {} })
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const box = placed.find(block => block.id === this.getAttribute('data-block'))
      return {
        top: (box?.top ?? 0) - scrolled,
        bottom: (box?.bottom ?? 0) - scrolled,
        left: 10,
        width: 300,
      } as DOMRect
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
    document.dispatchEvent(at('pointerup', { clientY: 55 }))
    expect(dropped).toEqual([{ before: id('c') }])
    expect(line()).toBeNull()
  })

  it('shows no line, and drops nothing, where the block already is', () => {
    handle().dispatchEvent(at('pointerdown'))
    document.dispatchEvent(at('pointermove', { clientY: 75 }))
    document.dispatchEvent(at('pointermove', { clientY: 15 }))
    expect(line()).toBeNull()
    document.dispatchEvent(at('pointerup', { clientY: 15 }))
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
    // Another pointer lifting or cancelling ends nothing; the pressing one's release drops.
    document.dispatchEvent(pointed('pointercancel', 2))
    document.dispatchEvent(pointed('pointerup', 2, 75))
    expect([line()?.style.top, dropped]).toEqual(['80px', []])
    document.dispatchEvent(pointed('pointerup', 1, 75))
    expect(dropped).toEqual([{ after: id('c') }])
  })

  it('reads the page again on a scroll and on release, where the blocks are then', () => {
    handle().dispatchEvent(at('pointerdown'))
    document.dispatchEvent(at('pointermove', { clientY: 55 }))
    expect(line()?.style.top).toBe('60px')
    // The page scrolls under a still pointer: the line follows the block's edge.
    scrolled = 10
    document.dispatchEvent(new Event('scroll'))
    expect(line()?.style.top).toBe('50px')
    // Further, with no move before the release: the release's own place is the drop.
    scrolled = 20
    document.dispatchEvent(at('pointerup', { clientY: 55 }))
    expect(dropped).toEqual([{ after: id('c') }])
  })

  it('ends without a drop on a move with the button up, whose release it never heard', () => {
    handle().dispatchEvent(at('pointerdown'))
    document.dispatchEvent(at('pointermove', { clientY: 75 }))
    document.dispatchEvent(at('pointermove', { clientY: 75, buttons: 0 }))
    expect(line()).toBeNull()
    document.dispatchEvent(at('pointerup', { clientY: 75 }))
    expect(dropped).toEqual([])
  })

  it('hears a release a handler below the page stops', () => {
    document.body.addEventListener('pointerup', event => event.stopPropagation())
    handle().dispatchEvent(at('pointerdown'))
    document.dispatchEvent(at('pointermove', { clientY: 75 }))
    document.body.dispatchEvent(at('pointerup', { clientY: 75 }))
    expect(dropped).toEqual([{ after: id('c') }])
  })

  it('keeps the drag of the pointer that pressed first through a second press', () => {
    const pointed = (type: string, pointerId: number, clientY = 0) => {
      const event = at(type, { clientY })
      Object.defineProperty(event, 'pointerId', { value: pointerId })
      return event
    }
    handle().dispatchEvent(pointed('pointerdown', 1))
    document.dispatchEvent(pointed('pointermove', 1, 75))
    handle().dispatchEvent(pointed('pointerdown', 2))
    document.dispatchEvent(pointed('pointerup', 1, 75))
    expect(dropped).toEqual([{ after: id('c') }])
  })

  it('offers nothing to a press once the editor is gone, not the last drag’s blocks', () => {
    handle().dispatchEvent(at('pointerdown'))
    document.dispatchEvent(at('pointermove', { clientY: 75 }))
    document.dispatchEvent(at('pointerup', { clientY: 75 }))
    document.getElementById('host')!.id = 'elsewhere'
    handle().dispatchEvent(at('pointerdown'))
    document.dispatchEvent(at('pointermove', { clientY: 75 }))
    document.dispatchEvent(at('pointerup', { clientY: 75 }))
    expect(dropped).toEqual([{ after: id('c') }])
    document.getElementById('elsewhere')!.id = 'host'
  })

  it('keeps a touch on the handle from panning the page while it can drag', () => {
    // jsdom drops a `touch-action` it does not know, so the calls are what can be seen here.
    const grip = document.createElement('span')
    const set = vi.spyOn(grip.style, 'setProperty')
    const removed = vi.spyOn(grip.style, 'removeProperty')
    const stop = dragBlock(grip, 'host', id('a'), () => {})
    expect(set).toHaveBeenCalledWith('touch-action', 'none')
    stop()
    expect(removed).toHaveBeenCalledWith('touch-action')
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

describe('dragging a block into another container (§149)', () => {
  it('drags an item into another list, as the placed vocabulary allows', () => {
    const item = (name: string) => ({
      type: 'Node',
      kind: 'ListItem',
      id: name,
      props: {},
      children: [],
      blocks: [
        {
          type: 'Paragraph',
          id: `${name}-p`,
          children: [{ type: 'Text', id: `${name}-t`, text: name, marks: [] }],
        },
      ],
    })
    const list = (name: string, items: ReadonlyArray<string>) => ({
      type: 'Node',
      kind: 'List',
      id: name,
      props: {},
      children: [],
      blocks: items.map(item),
    })
    const content = RichText.decodeDocument({
      version: 1,
      children: [list('l', ['i1', 'i2']), list('m', ['j1'])],
    } as never)
    document.body.innerHTML = '<div id="lists"></div><button id="grip"></button>'
    placeVocabulary('lists', { nodes: RichText.nodeRegistry(RichText.standardNodes) })
    mountInto(document.getElementById('lists')!, content, { onIntent: () => {} })
    const boxes: Record<string, number> = {
      l: 0,
      i1: 0,
      'i1-p': 0,
      i2: 30,
      'i2-p': 30,
      m: 80,
      j1: 80,
      'j1-p': 80,
    }
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const top = boxes[this.getAttribute('data-block') ?? ''] ?? 0
      return { top, bottom: top + 20, left: 0, width: 100 } as DOMRect
    })
    const dropped: Array<RichText.Beside> = []
    const release = dragBlock(document.getElementById('grip')!, 'lists', id('i1'), to =>
      dropped.push(to),
    )
    document
      .getElementById('grip')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    document.dispatchEvent(new MouseEvent('pointermove', { clientY: 97, buttons: 1 }))
    document.dispatchEvent(new MouseEvent('pointerup', { clientY: 97 }))
    // The item's own paragraph and the lists are no targets for an item: it lands after j1.
    expect(dropped).toEqual([{ after: id('j1') }])
    release()
    spy.mockRestore()
    releaseMount(document.getElementById('lists')!)
  })
})
