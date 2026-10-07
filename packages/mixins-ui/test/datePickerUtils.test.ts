import { describe, expect, it } from 'vitest'
import { attributeSelector, idSelector } from '../src/datePickerUtils.js'

describe('idSelector', () => {
  it('prefixes a plain id', () => {
    expect(idSelector('picker-popover-button')).toBe('#picker-popover-button')
  })

  it('escapes a digit-leading id', () => {
    expect(idSelector('9lives')).toBe('#\\39 lives')
  })

  it('escapes spaces and brackets', () => {
    expect(idSelector('a b[c]')).toBe('#a\\ b\\[c\\]')
  })
})

describe('attributeSelector', () => {
  it('quotes the escaped value', () => {
    expect(attributeSelector('data-state', 'open')).toBe('[data-state="open"]')
  })

  it('keeps the quotes for a digit-leading value', () => {
    expect(attributeSelector('aria-controls', '9panel')).toBe('[aria-controls="\\39 panel"]')
  })
})
