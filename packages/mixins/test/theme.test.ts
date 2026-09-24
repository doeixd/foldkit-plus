import { describe, expect, it } from 'vitest'
import { Theme } from '../src/index.js'

const Brand = Theme.define({
  color: { text: '#161616', accent: '#625cff' },
  spacing: { sm: '0.5rem', md: '1rem' },
})

describe('Theme', () => {
  it('exposes token values by path', () => {
    expect(Brand.color.text).toBe('#161616')
    expect(Brand.spacing.md).toBe('1rem')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(Brand)).toBe(true)
    expect(Object.isFrozen(Brand.color)).toBe(true)
  })

  it('references every token by path, frozen and built once', () => {
    const ref = Theme.ref(Brand)
    expect(ref).toEqual({
      color: { text: 'var(--fk-color-text)', accent: 'var(--fk-color-accent)' },
      spacing: { sm: 'var(--fk-spacing-sm)', md: 'var(--fk-spacing-md)' },
    })
    expect(Object.isFrozen(ref)).toBe(true)
    expect(Object.isFrozen(ref.color)).toBe(true)
    expect(Theme.ref(Brand)).toBe(ref)
  })

  it('compiles all tokens to one inline StyleValue', () => {
    const variables = Theme.variables(Brand)
    expect(variables.style).toEqual({
      '--fk-color-text': '#161616',
      '--fk-color-accent': '#625cff',
      '--fk-spacing-sm': '0.5rem',
      '--fk-spacing-md': '1rem',
    })
    expect(variables.classes).toEqual([])
  })
})

describe('Theme.lightDark and compose', () => {
  it('lightDark is a CSS light-dark() value', () => {
    expect(Theme.lightDark('#fff', '#000')).toBe('light-dark(#fff, #000)')
  })

  it('compose merges groups, later tokens winning', () => {
    const base = Theme.define({ color: { text: '#111', bg: '#fff' }, space: { sm: '4px' } })
    const brand = Theme.define({ color: { text: '#222' }, radius: { md: '8px' } })
    const merged = Theme.compose(base, brand)
    expect(merged).toEqual({
      color: { text: '#222', bg: '#fff' },
      space: { sm: '4px' },
      radius: { md: '8px' },
    })
    expect(Theme.ref(merged).radius.md).toBe('var(--fk-radius-md)')
    expect(Theme.ref(merged).color.bg).toBe('var(--fk-color-bg)')
  })
})
