/**
 * The Sheet by its CSS: each side pins the panel to its edge, waits past that
 * edge while closed, and borders only the edge facing the page; `handle: 'bar'`
 * shows the handle on that edge and rounds the inner corners.
 */
import { describe, expect, it } from 'vitest'
import { Style } from 'foldkit-mixins'
import { DialogSlots } from '../src/dialog.js'
import { Sheet } from '../src/recipes/sheet.js'

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
})

describe('the handle', () => {
  it('is hidden and the inner corners square without a bar', () => {
    const sheet = css(Sheet({ side: 'bottom' }))
    expect(sheet).toContain('display:none')
    expect(sheet).not.toContain('display:block')
    expect(sheet).not.toContain('--_fk-sheet-radius:')
  })

  it('shows with a bar, which rounds the inner corners', () => {
    const sheet = css(Sheet({ side: 'bottom', handle: 'bar' }))
    expect(sheet).toMatch(/@layer variants\{[^}]*display:block/)
    expect(sheet).toContain('--_fk-sheet-radius:var(--fk-radius-lg)')
    expect(sheet).toContain('border-top-left-radius:var(--_fk-sheet-radius, 0)')
  })

  it.each([
    { side: 'bottom', order: '-1' },
    { side: 'top', order: '1' },
  ] as const)('is the first or last row of a $side sheet by order', ({ side, order }) => {
    expect(css(Sheet({ side, handle: 'bar' }))).toMatch(new RegExp(`[;{]order:${order}[;}]`))
  })

  it.each([
    { side: 'right', edge: 'left' },
    { side: 'left', edge: 'right' },
  ] as const)('stands on the $edge edge of a $side sheet', ({ side, edge }) => {
    expect(css(Sheet({ side, handle: 'bar' }))).toMatch(
      new RegExp(`[;{]${edge}:var\\(--fk-space-xs\\)`),
    )
  })
})
