/**
 * The chrome's icons: each a hidden SVG in the text's color, the same drawing as a mask URL, and
 * one for every entry the editor's slash catalogue names.
 */
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { slashEntries } from 'foldkit-richtext-dom/editor'
import { describe, expect, it } from 'vitest'
import { isRichTextIcon, richTextIcon, richTextIconUrl } from '../src/index.js'

describe('the icons', () => {
  it('draw as SVG hidden from assistive technology, stroked in the text’s color', () => {
    const svg = richTextIcon(SlotView.inertBuilder(), 'bold', { size: 20 })
    expect(svg?.sel).toBe('svg')
    expect(svg?.data?.attrs).toMatchObject({ width: '20px', height: '20px', 'aria-hidden': 'true' })
    const strokes = Inert.children(svg).map(node => node.data?.attrs?.['stroke'])
    expect(strokes.length).toBeGreaterThan(0)
    expect(new Set(strokes)).toEqual(new Set(['currentColor']))
  })

  it('draw the same paths as a mask URL', () => {
    const drawn = Inert.children(richTextIcon(SlotView.inertBuilder(), 'divider')).map(
      node => node.data?.attrs?.['d'],
    )
    const url = decodeURIComponent(richTextIconUrl('divider'))
    expect(drawn).toEqual(['M5 12h14'])
    for (const d of drawn) expect(url).toContain(`d="${d}"`)
  })

  it('cover every entry the editor offers, and know no other name', () => {
    const missing = slashEntries.filter(
      entry => entry.icon === undefined || !isRichTextIcon(entry.icon),
    )
    expect(missing.map(entry => entry.id)).toEqual([])
    expect(isRichTextIcon('constructor')).toBe(false)
  })
})
