import { describe, expect, it } from 'vitest'
import { inertHtml } from 'foldkit/html'
import { declarationName, overlaps } from '../src/styleNames.js'

/** Whether Foldkit itself reads two `Style` keys as one declaration: it refuses both at once. */
const foldkitJoins = (a: string, b: string): boolean => {
  try {
    inertHtml.div([inertHtml.Style({ [a]: '0', [b]: '0' })], [])
    return false
  } catch {
    return true
  }
}

describe('declarationName', () => {
  it.each([
    ['insetInlineEnd', 'inset-inline-end'],
    ['WebkitLineClamp', '-webkit-line-clamp'],
    ['webkitLineClamp', '-webkit-line-clamp'],
    ['cssFloat', 'float'],
    ['backgroundColor', 'background-color'],
    ['--fk-x', '--fk-x'],
  ])('reads %s as %s, as Foldkit does', (key, declaration) => {
    expect(declarationName(key)).toBe(declaration)
    if (key !== declaration) expect(foldkitJoins(key, declaration)).toBe(true)
  })

  it('keeps apart what Foldkit keeps apart', () => {
    expect(foldkitJoins('top', 'inset')).toBe(false)
    expect(declarationName('top')).not.toBe(declarationName('inset'))
  })
})

describe('overlaps', () => {
  it.each([
    ['insetInlineEnd', 'inset-inline-end'],
    ['inset', 'insetInlineEnd'],
    ['insetInline', 'insetInlineEnd'],
    ['right', 'insetInlineEnd'],
    ['left', 'insetInlineEnd'],
    ['top', 'insetBlockStart'],
    ['margin', 'marginBlockStart'],
    ['marginLeft', 'marginInline'],
    ['borderWidth', 'borderTopWidth'],
    ['borderRadius', 'borderTopLeftRadius'],
    ['gap', 'rowGap'],
    ['transform', 'translate'],
    ['overflow', 'overflowX'],
  ])('%s and %s write one thing', (a, b) => {
    expect(overlaps(a, b)).toBe(true)
    expect(overlaps(b, a)).toBe(true)
  })

  it.each([
    ['insetInlineStart', 'insetInlineEnd'],
    ['top', 'bottom'],
    ['top', 'insetInlineEnd'],
    ['overflow', 'overflowWrap'],
    ['position', 'positionAnchor'],
    ['transform', 'transformOrigin'],
    ['border', 'borderCollapse'],
    ['width', 'inlineSize'],
  ])('%s and %s stand apart', (a, b) => {
    expect(overlaps(a, b)).toBe(false)
    expect(overlaps(b, a)).toBe(false)
  })
})
