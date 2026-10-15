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
    expect(svg?.data?.attrs).toMatchObject({
      width: '20',
      stroke: 'currentColor',
      'aria-hidden': 'true',
    })
    expect(Inert.children(svg).map(node => node.sel)).toEqual(['path', 'path'])
  })

  it('draw the same paths as a mask URL', () => {
    const url = richTextIconUrl('divider')
    expect(decodeURIComponent(url)).toContain('<path d="M5 12h14"/>')
  })

  it('cover every entry the editor offers, and know no other name', () => {
    const missing = slashEntries.filter(
      entry => entry.icon === undefined || !isRichTextIcon(entry.icon),
    )
    expect(missing.map(entry => entry.id)).toEqual([])
    expect(isRichTextIcon('constructor')).toBe(false)
  })
})
