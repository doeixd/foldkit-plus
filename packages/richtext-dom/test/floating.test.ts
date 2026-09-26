// @vitest-environment jsdom
/**
 * The floating toolbar's position: where it goes relative to the selection, and that the anchor
 * follows the page's selection in the host only, and only while it is attached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { anchorToSelection, placeOver } from '../src/floating.js'

const target = { top: 100, left: 200, width: 60, height: 20 }

describe('placeOver', () => {
  it.each([
    ['above, centred', target, { width: 40, height: 30 }, { top: 62, left: 210, placement: 'top' }],
    // 30 tall and 8 of gap do not fit above a selection 20 from the top.
    [
      'above, with exactly room',
      { ...target, top: 38 },
      { width: 40, height: 30 },
      { top: 0, left: 210, placement: 'top' },
    ],
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
    vi.spyOn(floating(), 'getBoundingClientRect').mockReturnValue({
      width: 40,
      height: 30,
    } as DOMRect)
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
