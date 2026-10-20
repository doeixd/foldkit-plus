/**
 * A pack of the components' own icons, as tokens an application passes with
 * its own: each name's mask in the page's sheet in place of the shipped one,
 * its strokes redrawn as asked.
 */
import { parse } from 'foldkit-media/icons'
import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'
import { describe, expect, it } from 'vitest'
import { Icons } from '../src/index.js'

const drawing = (d: string) =>
  parse(
    `<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.5" d="${d}"/></svg>`,
    d,
  )

const names = Object.keys(Theme.tokens.icon)
const pack = {
  search: drawing('M0 0h9'),
  eye: drawing('M1 1h9'),
  'eye-off': drawing('M2 2h9'),
  pipette: drawing('M3 3h9'),
  'rotate-ccw': drawing('M4 4h9'),
  'rotate-cw': drawing('M5 5h9'),
  success: drawing('M6 6h9'),
  warning: drawing('M7 7h9'),
  error: drawing('M8 8h9'),
  info: drawing('M9 9h9'),
  lock: drawing('M10 10h9'),
}

describe('Icons.tokens', () => {
  it('puts each mask of the pack in the page’s sheet, in place of the shipped one', () => {
    const { stylesheet } = AppStyle.make({ theme: Theme.make({}), tokens: Icons.tokens(pack) })
    const search = /--fk-icon-search:\s*([^;]+);/.exec(stylesheet)?.[1] ?? ''
    expect(decodeURIComponent(search)).toContain('d="M0 0h9"')
    expect(search).not.toBe(Theme.tokens.icon.search)
  })

  it('redraws every stroke as asked', () => {
    const { icon } = Icons.tokens(pack, { width: 3 })
    expect(Object.keys(icon)).toEqual(names)
    for (const mask of Object.values(icon)) {
      expect(decodeURIComponent(mask)).toContain('stroke-width="3"')
      expect(decodeURIComponent(mask)).not.toContain('stroke-width="1.5"')
    }
  })
})
