// @vitest-environment jsdom
/**
 * The floating toolbar's position: where it goes relative to the selection, and that the anchor
 * follows the page's selection in the host only, and only while it is attached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { anchorToBlock, anchorToSelection, placeBeside, placeOver } from '../src/floating.js'
import { mountInto, releaseMount } from '../src/host.js'

const target = { top: 100, left: 200, width: 60, height: 20 }

describe('placeOver', () => {
  it.each([
    ['above, centred', target, { width: 40, height: 30 }, { top: 62, left: 210, placement: 'top' }],
    // 30 tall and 8 of gap fit exactly above a selection 38 from the top.
    [
      'above, with exactly room',
      { ...target, top: 38 },
      { width: 40, height: 30 },
      { top: 0, left: 210, placement: 'top' },
    ],
    // They do not fit above one 20 from the top.
    [
      'below with no room above',
      { ...target, top: 20 },
      { width: 40, height: 30 },
      { top: 48, left: 210, placement: 'bottom' },
    ],
    [
      'inside the left edge',
      { ...target, left: 0, width: 10 },
      { width: 40, height: 30 },
      { top: 62, left: 0, placement: 'top' },
    ],
    [
      'inside the right edge',
      { ...target, left: 990 },
      { width: 40, height: 30 },
      { top: 62, left: 960, placement: 'top' },
    ],
  ] as const)('%s', (_, box, floating, expected) => {
    expect(placeOver(box, floating, { width: 1000 }, 8)).toEqual(expected)
  })
})

describe('anchorToSelection', () => {
  let selectionBox = target
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="host"><p id="text">Water early</p></div>
      <p id="outside">elsewhere</p>
      <div id="scroller"></div>
      <div id="floating"></div>`
    selectionBox = target
    Range.prototype.getBoundingClientRect = () => selectionBox as DOMRect
    // In flow the element is as wide as the page; only fixed does it take its own width, so a
    // measurement taken before the anchor fixes it would centre the wrong box.
    vi.spyOn(floating(), 'getBoundingClientRect').mockImplementation(
      () => ({ width: floating().style.position === 'fixed' ? 40 : 1000, height: 30 }) as DOMRect,
    )
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true })
  })
  afterEach(() => vi.restoreAllMocks())

  const floating = () => document.getElementById('floating')!
  const select = (id: string, from: number, to: number) => {
    const text = document.getElementById(id)!.firstChild!
    document.getSelection()!.setBaseAndExtent(text, from, text, to)
  }
  const placed = () => [
    floating().style.top,
    floating().style.left,
    floating().dataset['placement'],
  ]

  it('places the element over a selection in the host, and again as it changes', () => {
    select('text', 0, 5)
    const release = anchorToSelection(floating(), 'host', 8)
    expect(floating().style.position).toBe('fixed')
    expect(placed()).toEqual(['62px', '210px', 'top'])

    selectionBox = { ...target, top: 300 }
    document.dispatchEvent(new Event('selectionchange'))
    expect(placed()).toEqual(['262px', '210px', 'top'])

    // A container's scroll does not bubble; the anchor hears it on the way down.
    selectionBox = { ...target, top: 400 }
    document.getElementById('scroller')!.dispatchEvent(new Event('scroll'))
    expect(placed()).toEqual(['362px', '210px', 'top'])

    selectionBox = { ...target, left: 500 }
    window.dispatchEvent(new Event('resize'))
    expect(placed()).toEqual(['62px', '510px', 'top'])
    release()
  })

  it.each([
    ['a selection outside the host', () => select('outside', 0, 4)],
    ['a caret in the host', () => select('text', 2, 2)],
  ])('leaves the element alone for %s', (_, arrange) => {
    arrange()
    const release = anchorToSelection(floating(), 'host', 8)
    expect(placed()).toEqual(['', '', undefined])
    release()
  })

  it('stops following once released', () => {
    select('text', 0, 5)
    anchorToSelection(floating(), 'host', 8)()
    selectionBox = { ...target, top: 300 }
    document.dispatchEvent(new Event('selectionchange'))
    document.getElementById('scroller')!.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    expect(placed()).toEqual(['62px', '210px', 'top'])
  })
})

describe('placeBeside', () => {
  it.each([
    ['to the left, tops aligned', target, { top: 100, left: 152, placement: 'left' }],
    ['inside the left edge', { ...target, left: 20 }, { top: 100, left: 0, placement: 'left' }],
  ] as const)('%s', (_, box, expected) => {
    expect(placeBeside(box, { width: 40 }, 8)).toEqual(expected)
  })
})

describe('anchorToBlock', () => {
  const content = RichText.decodeDocument({
    version: 1,
    children: ['a', 'b'].map(name => ({
      type: 'Paragraph',
      id: name,
      children: [{ type: 'Text', id: `${name}-t`, text: name, marks: [] }],
    })),
  })
  const boxes: Record<string, { top: number; left: number; width: number; height: number }> = {}
  const handle = () => document.getElementById('handle')!
  const flush = () => new Promise(resolve => setTimeout(resolve, 0))

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div><div id="handle"></div>'
    mountInto(document.getElementById('host')!, content, { onIntent: () => {} })
    boxes['a'] = { top: 100, left: 200, width: 300, height: 20 }
    boxes['b'] = { top: 140, left: 200, width: 300, height: 20 }
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.id === 'handle')
        return { width: handle().style.position === 'fixed' ? 40 : 1000, height: 20 } as DOMRect
      return (boxes[this.getAttribute('data-block') ?? ''] ?? {}) as DOMRect
    })
  })
  afterEach(() => {
    releaseMount(document.getElementById('host')!)
    vi.restoreAllMocks()
  })

  const placed = () => [handle().style.top, handle().style.left, handle().dataset['placement']]

  it('places the handle beside its block, and again when the editor redraws', async () => {
    const release = anchorToBlock(handle(), 'host', RichText.NodeId.make('b'), 8)
    expect(handle().style.position).toBe('fixed')
    expect(placed()).toEqual(['140px', '152px', 'left'])

    // A patch inside the host moves the block without moving the page.
    boxes['b'] = { ...boxes['b']!, top: 180 }
    document.querySelector('[data-run="a-t"]')!.append('!')
    await flush()
    expect(placed()).toEqual(['180px', '152px', 'left'])

    boxes['b'] = { ...boxes['b']!, top: 220 }
    window.dispatchEvent(new Event('resize'))
    expect(placed()).toEqual(['220px', '152px', 'left'])
    release()

    boxes['b'] = { ...boxes['b']!, top: 260 }
    document.querySelector('[data-run="a-t"]')!.append('!')
    window.dispatchEvent(new Event('resize'))
    await flush()
    expect(placed()).toEqual(['220px', '152px', 'left'])
  })

  it('finds an editor host drawn after it, and follows the one that replaces it', async () => {
    document.getElementById('host')!.remove()
    const release = anchorToBlock(handle(), 'host', RichText.NodeId.make('b'), 8)
    expect(placed()).toEqual(['', '', undefined])

    const drawHost = () => {
      document.getElementById('host')?.remove()
      const host = document.createElement('div')
      host.id = 'host'
      document.body.prepend(host)
      mountInto(host, content, { onIntent: () => {} })
      return host
    }
    // No scroll or resize here: drawing the host is what places the handle.
    drawHost()
    await flush()
    expect(placed()).toEqual(['140px', '152px', 'left'])

    boxes['b'] = { ...boxes['b']!, top: 180 }
    const replacement = drawHost()
    await flush()
    expect(placed()).toEqual(['180px', '152px', 'left'])

    // The replacement's redraws move the handle, down to a change in a text node's data.
    boxes['b'] = { ...boxes['b']!, top: 220 }
    replacement.querySelector('[data-run="a-t"]')!.firstChild!.textContent += '!'
    await flush()
    expect(placed()).toEqual(['220px', '152px', 'left'])
    release()
  })

  it('leaves the handle alone for a block the editor does not hold', () => {
    anchorToBlock(handle(), 'host', RichText.NodeId.make('x'), 8)()
    expect(placed()).toEqual(['', '', undefined])
  })
})
