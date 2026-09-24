/**
 * The top-level block scanner `Layers.in` and `Style.stylesheet` read
 * compiled CSS with: strings, comments, nesting, and statements.
 */
import { describe, expect, it } from 'vitest'
import {
  declaredNames,
  isLayerStatement,
  isUnordered,
  layerOf,
  topLevelBlocks,
} from '../src/cssBlocks.js'

describe('topLevelBlocks', () => {
  it('splits rules, at-rules with nested bodies, and statements', () => {
    const css = '@layer a, b;.x{color:red}@media (min-width:1px){.y{a:b}}'
    const blocks = topLevelBlocks(css)
    expect(blocks.map(block => block.prelude)).toEqual([
      '@layer a, b;',
      '.x',
      '@media (min-width:1px)',
    ])
    expect(blocks.map(block => block.text).join('')).toBe(css)
  })

  it('does not split on braces or semicolons inside strings and comments', () => {
    const blocks = topLevelBlocks(`/* } ; */.x::before{content:"};{"}.y{content:'\\'}'}`)
    expect(blocks.map(block => block.prelude)).toEqual(['.x::before', '.y'])
  })

  it('keeps trailing text that has no body', () => {
    expect(topLevelBlocks('.x{a:b} stray').map(block => block.prelude)).toEqual(['.x', 'stray'])
  })
})

describe('classifying blocks', () => {
  const [statement, layered, rule, frames] = topLevelBlocks(
    '@layer a, b;@layer app{.x{a:b}}.y{a:b}@keyframes kf{to{a:b}}',
  )

  it('reads the layer of a layer block only', () => {
    expect(statement && layerOf(statement)).toBeUndefined()
    expect(layered && layerOf(layered)).toBe('app')
    expect(rule && layerOf(rule)).toBeUndefined()
  })

  it('knows a statement and the blocks the cascade does not order', () => {
    expect(statement && isLayerStatement(statement)).toBe(true)
    expect(statement && isUnordered(statement)).toBe(true)
    expect(frames && isUnordered(frames)).toBe(true)
    expect(rule && isUnordered(rule)).toBe(false)
  })

  it('reads the names a statement declares', () => {
    expect(declaredNames('@layer reset, tokens,app;')).toEqual(['reset', 'tokens', 'app'])
  })
})
