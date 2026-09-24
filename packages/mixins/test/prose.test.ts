/**
 * Prose is one class for every caller; options only write variables. Its
 * rules reference declared tokens with fallbacks and belong in the
 * components layer.
 */
import { describe, expect, it } from 'vitest'
import { Layers } from '../src/layers.js'
import { Prose } from '../src/prose.js'
import { Style } from '../src/style.js'
import { declaredTokens, tokenReferences } from './tokens.js'

describe('Prose.style', () => {
  it('shares one class across options and carries them as variables', () => {
    const plain = Prose.style()
    const narrow = Prose.style({ measure: '50ch', rhythm: { heading: '2.5em', list: '0' } })
    expect(Style.stylesheet(plain)).toBe(Style.stylesheet(narrow))
    expect(plain.style).toEqual({
      maxInlineSize: 'var(--fk-prose-measure, 65ch)',
      lineHeight: 'var(--fk-leading-relaxed, 1.6)',
    })
    expect(narrow.style).toEqual({
      ...plain.style,
      '--fk-prose-measure': '50ch',
      '--fk-prose-heading': '2.5em',
      '--fk-prose-list': '0',
    })
  })

  it('writes the rhythm between unlike elements as rules with token fallbacks', () => {
    const css = Style.stylesheet(Prose.style())
    expect(css).toMatch(
      /\.style-[a-z0-9]+ > \* \+ \*\{margin-block-start:var\(--fk-prose-paragraph/,
    )
    expect(css).toContain('> :is(h2, h3, h4, h5, h6){margin-block-start:var(--fk-prose-heading')
    expect(css).toContain('> :is(h1, h2, h3, h4, h5, h6) + *{')
    expect(css).toContain('blockquote{')
    expect(css).toContain('figcaption{')
    expect(css).toContain(':is(th, td){')
    expect(css).toContain('mark{')
    expect(css).toContain('abbr[title]{')
    for (const reference of tokenReferences(css)) {
      if (!reference.startsWith('prose-')) expect(declaredTokens).toContain(reference)
    }
    expect(css).not.toMatch(/var\(--fk-[a-z0-9-]+\)/)
  })

  it('layers into components', () => {
    const css = Style.stylesheet(Layers.standard.in('components', Prose.style()))
    expect(css.startsWith('@layer components{')).toBe(true)
    expect(css).not.toMatch(/\}\.style-/)
  })
})
