/**
 * Sheet and Drawer by their CSS: each side pins the panel to its edge, waits
 * past that edge while closed, and borders only the edge facing the page; the
 * Drawer adds a handle on that edge from the top or bottom alone.
 */
import { describe, expect, it } from 'vitest'
import { Style } from 'foldkit-mixins'
import { DialogSlots } from '../src/dialog.js'
import { Drawer, Sheet } from '../src/recipes/sheet.js'

const css = (pieces: ReturnType<typeof Sheet>): string => Style.forSlots(DialogSlots)(pieces).css

describe('Sheet', () => {
  it.each([
    { side: 'top', placed: 'start stretch', offstage: '0 -100%', facing: 'bottom' },
    { side: 'right', placed: 'stretch right', offstage: '100% 0', facing: 'left' },
    { side: 'bottom', placed: 'end stretch', offstage: '0 100%', facing: 'top' },
    { side: 'left', placed: 'stretch left', offstage: '-100% 0', facing: 'right' },
  ] as const)('pins the panel to the $side edge', ({ side, placed, offstage, facing }) => {
    const sheet = css(Sheet({ side }))
    expect(sheet).toContain(`place-items:${placed}`)
    expect(sheet).toContain(`[data-closed]{scale:none;translate:${offstage}}`)
    expect(sheet).toContain(`border-${facing}-width:var(--fk-border-thin)`)
    for (const other of ['top', 'right', 'bottom', 'left'].filter(each => each !== facing)) {
      expect(sheet).toContain(`border-${other}-width:0`)
    }
  })

  it('writes no shorthand that the sorted rule would put after its longhands', () => {
    const sheet = css(Sheet({ side: 'right' }))
    expect(sheet).not.toMatch(/@layer variants\{[^}]*(border-width|border-radius):/)
  })

  it('slides on the Dialog transition, which the travel knob stills', () => {
    expect(css(Sheet({}))).toContain('calc(var(--fk-motion-slow) * var(--fk-knob-travel))')
  })

  it('squares the inner corners, which only the Drawer rounds', () => {
    expect(css(Sheet({ side: 'bottom' }))).not.toContain('--_fk-sheet-radius:')
    expect(css(Drawer({ side: 'bottom' }))).toContain('--_fk-sheet-radius:var(--fk-radius-lg)')
    expect(css(Drawer({ side: 'bottom' }))).toContain(
      'border-top-left-radius:var(--_fk-sheet-radius, 0)',
    )
  })
})

describe('Drawer', () => {
  it('comes from the bottom, its handle on the top edge', () => {
    const drawer = css(Drawer({}))
    expect(drawer).toContain('place-items:end stretch')
    expect(drawer).toMatch(/::before\{[^}]*content:""/)
  })

  it('puts the handle on the bottom edge from the top', () => {
    const drawer = css(Drawer({ side: 'top' }))
    expect(drawer).toMatch(/::after\{[^}]*content:""/)
    expect(drawer).not.toContain('::before')
  })

  it('draws no handle from the left or right', () => {
    expect(css(Drawer({ side: 'left' }))).not.toMatch(/::(before|after)/)
    expect(css(Drawer({ side: 'right' }))).not.toMatch(/::(before|after)/)
  })
})
